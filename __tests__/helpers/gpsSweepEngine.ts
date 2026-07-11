// ─── 파라미터 스윕용 복제 엔진 (테스트 전용) ────────────────────────────────
// RunTracker 의 '거리 결정 경로'(Kalman → acceptSegment → 앵커/거리 누적 +
// 자동일시정지)를 파라미터(accelPsd, floorFactor) 주입 가능하게 복제한 것.
// 제품 코드는 아카이브/번들과 얽혀 있어 스윕 중 수정할 수 없으므로, 탐색은
// 이 복제로 하고 확정값은 제품 상수에 반영한 뒤 실제 RunTracker 로 재검증한다.
// ⚠️ 복제 신뢰성은 gpsDistanceAccuracy 테스트의 패리티 검증(기본값에서
// RunTracker 와 거리 완전 일치)이 보증한다 — 수식을 바꾸면 패리티가 깨진다.

import {calcDist, segmentSpeedMps} from '../../lib/geo';
import {DistanceSmoother} from '../../lib/distanceSmoother';
import {
  MAX_FIX_ACCURACY_M,
  WARMUP_FIXES,
  MAX_SEG_SPEED_MPS,
  MIN_SEG_DIST_KM,
  MAX_SEG_DIST_KM,
  PHANTOM_ACC_FLOOR_FACTOR,
  AUTO_RESUME_SPEED_MPS,
} from '../../lib/engineConstants';
import {ACCEL_PSD} from '../../lib/kalman';
import {decideAutoPause, initAutoPauseState, AutoPauseState} from '../../lib/autoPause';
import {RawFix} from '../../lib/runTracker';

// ── lib/kalman.ts 의 충실한 복제 + accelPsd 주입 ────────────────────────────
const M_PER_DEG_LAT = 111320;
const MIN_ACC_M = 3;
const NIS_GATE = 25;
const OUTLIER_INFLATE = 10;
const INIT_VEL_VAR = 100;
const GAP_REACQUIRE_S = 8;
const REACQUIRE_POS_VAR = 400;
/** 제품 기본값(lib/kalman.ts ACCEL_PSD 그대로) — 패리티 가드 대상. */
export const DEFAULT_ACCEL_PSD = ACCEL_PSD;

class Axis {
  p = 0;
  v = 0;
  P00 = 0;
  P01 = 0;
  P10 = 0;
  P11 = 0;

  init(p0: number, posVar: number) {
    this.p = p0;
    this.v = 0;
    this.P00 = posVar;
    this.P01 = 0;
    this.P10 = 0;
    this.P11 = INIT_VEL_VAR;
  }

  predict(dt: number, accelPsd: number) {
    this.p += this.v * dt;
    const {P00, P01, P10, P11} = this;
    const n00 = P00 + dt * (P01 + P10) + dt * dt * P11;
    const n01 = P01 + dt * P11;
    const n10 = P10 + dt * P11;
    const n11 = P11;
    const q00 = (accelPsd * dt * dt * dt) / 3;
    const q01 = (accelPsd * dt * dt) / 2;
    const q11 = accelPsd * dt;
    this.P00 = n00 + q00;
    this.P01 = n01 + q01;
    this.P10 = n10 + q01;
    this.P11 = n11 + q11;
  }

  update(z: number, r: number): number {
    const S = this.P00 + r;
    const innov = z - this.p;
    const K0 = this.P00 / S;
    const K1 = this.P10 / S;
    this.p += K0 * innov;
    this.v += K1 * innov;
    const P00 = this.P00,
      P01 = this.P01;
    this.P00 = (1 - K0) * P00;
    this.P01 = (1 - K0) * P01;
    this.P10 = this.P10 - K1 * P00;
    this.P11 = this.P11 - K1 * P01;
    return (innov * innov) / S;
  }
}

export class TunableKalman {
  private inited = false;
  private lat0 = 0;
  private lon0 = 0;
  private mPerDegLon = M_PER_DEG_LAT;
  private ts = 0;
  private x = new Axis();
  private y = new Axis();

  constructor(private accelPsd: number = DEFAULT_ACCEL_PSD) {}

  process(lat: number, lon: number, acc: number, ts: number): {lat: number; lon: number} {
    const a = Math.max(acc, MIN_ACC_M);
    if (!this.inited) {
      this.inited = true;
      this.lat0 = lat;
      this.lon0 = lon;
      this.mPerDegLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
      this.ts = ts;
      this.x.init(0, a * a);
      this.y.init(0, a * a);
      return {lat, lon};
    }
    const zx = (lon - this.lon0) * this.mPerDegLon;
    const zy = (lat - this.lat0) * M_PER_DEG_LAT;
    const dt = (ts - this.ts) / 1000;
    this.ts = ts;
    if (dt > GAP_REACQUIRE_S || dt < 0) {
      this.x.init(zx, REACQUIRE_POS_VAR);
      this.y.init(zy, REACQUIRE_POS_VAR);
      return {lat, lon};
    }
    this.x.predict(dt, this.accelPsd);
    this.y.predict(dt, this.accelPsd);

    let r = a * a;
    const Sx = this.x.P00 + r,
      Sy = this.y.P00 + r;
    const ix = zx - this.x.p,
      iy = zy - this.y.p;
    const nis = (ix * ix) / Sx + (iy * iy) / Sy;
    if (nis > NIS_GATE) r *= OUTLIER_INFLATE;

    this.x.update(zx, r);
    this.y.update(zy, r);

    return {
      lat: this.lat0 + this.y.p / M_PER_DEG_LAT,
      lon: this.lon0 + this.x.p / this.mPerDegLon,
    };
  }

  /** lib/kalman.ts speedMps() 와 동일 — 속도 상태 크기. */
  speedMps(): number | null {
    if (!this.inited) return null;
    return Math.hypot(this.x.v, this.y.v);
  }
}

// ── geo.acceptSegment 복제 + floorFactor 주입 ───────────────────────────────
export function acceptSegmentTunable(
  distKm: number,
  dtSec: number,
  accuracyM: number,
  fixIndex: number,
  floorFactor: number = PHANTOM_ACC_FLOOR_FACTOR,
): boolean {
  if (accuracyM > MAX_FIX_ACCURACY_M) return false;
  if (fixIndex < WARMUP_FIXES) return false;
  if (segmentSpeedMps(distKm, dtSec) > MAX_SEG_SPEED_MPS) return false;
  const noiseFloorKm = Math.max(MIN_SEG_DIST_KM, (accuracyM * floorFactor) / 1000);
  if (distKm < noiseFloorKm) return false;
  if (distKm > MAX_SEG_DIST_KM) return false;
  return true;
}

export interface TuneParams {
  accelPsd: number;
  floorFactor: number;
  /** 칼만 추정 속도가 이 값(m/s) 미만이면 거리 미적산(앵커 보존 = 무손실 유예).
   *  0 이면 게이트 없음(현행 동작). 정지 중 팬텀 드리프트 원천 차단용. */
  speedGateMps?: number;
  /** 거리 적산용 중심 이동평균 창(홀수). 0/1=끔(현행). 5면 채택점 5개의 중심
   *  평균 좌표 간 거리를 적산(지연 = (W-1)/2 fix ≈ 2s). 실측 궤적 재계산에서
   *  5점 평활 ≈ NRC 로 검증된 백색 지터 소거기. 일시정지/재앵커/종료 시 플러시. */
  smoothW?: number;
  /** 자동일시정지 '재개' 이중 확인: 앵커 속도 머신이 재개라고 해도 칼만 추정
   *  속도가 AUTO_RESUME_SPEED_MPS 미만이면 기각(머신을 정지 상태로 되돌림).
   *  정지 중 GPS 노이즈가 재개를 유발해 팬텀 거리가 새는 것을 막는다. */
  kfResumeGate?: boolean;
}

// 거리 평활기는 제품 구현(lib/distanceSmoother.DistanceSmoother)을 그대로 쓴다 —
// 스윕 결과와 제품 동작의 단일 소스. (초기 스윕의 자체 복제는 대칭-좁힘 교정과 함께 제거.)

// ── RunTracker.ingestFix 의 거리 결정 경로 복제 ─────────────────────────────
// (de-dupe·stall 회계·페이스/고도 시계열·영속화는 거리에 영향 없어 생략.
//  일시정지는 자동일시정지 경로만 — 시뮬레이션에 수동 조작은 없다.)
export function runTunableEngine(fixes: RawFix[], params: TuneParams): {distKm: number} {
  const kf = new TunableKalman(params.accelPsd);
  const smoother = new DistanceSmoother(params.smoothW ?? 1);
  let fixIndex = 0;
  let lastGood: {lat: number; lon: number} | null = null;
  let lastGoodMs = 0;
  let autoAnchor: {lat: number; lon: number} | null = null;
  let autoAnchorMs = 0;
  let autoPauseState: AutoPauseState = initAutoPauseState();
  let isPaused = false;
  let lastFixTs = 0;

  for (const fix of fixes) {
    const ts = fix.timestamp;
    if (ts > 0 && ts <= lastFixTs) continue;
    if (ts > 0) lastFixTs = ts;
    const {latitude: lat, longitude: lon, accuracy} = fix.coords;
    const acc = accuracy == null ? Infinity : accuracy;
    const f = kf.process(lat, lon, acc, ts);
    const idx = fixIndex;

    // 자동일시정지/재개 (RunTracker 와 동일한 앵커·판정 순서)
    if (idx >= WARMUP_FIXES && autoAnchor && (!isPaused || isPaused)) {
      const moved = calcDist(autoAnchor.lat, autoAnchor.lon, f.lat, f.lon);
      const dtA = Math.max((ts - autoAnchorMs) / 1000, 0);
      if (dtA > 0) {
        const decision = decideAutoPause(autoPauseState, segmentSpeedMps(moved, dtA), dtA);
        autoPauseState = decision.state;
        if (decision.justPaused && !isPaused) {
          isPaused = true;
        } else if (decision.justResumed && isPaused) {
          if (params.kfResumeGate && (kf.speedMps() ?? 0) < AUTO_RESUME_SPEED_MPS) {
            // 재개 기각 — 머신을 정지 상태로 되돌려 다음 fix 에서 재시도하게 한다.
            autoPauseState = {...decision.state, paused: true, fastSec: 0};
          } else {
            isPaused = false;
            autoPauseState = initAutoPauseState();
            // exitPause: 재개 첫 fix 가 새 앵커(정지 중 이동 거리 미계상 — C1)
            lastGood = null;
            smoother.flush(); // 일시정지 경계 — 정지 전/후 구간을 잇지 않는다
          }
        }
      }
    }
    autoAnchor = {lat: f.lat, lon: f.lon};
    autoAnchorMs = ts;

    if (isPaused) continue;
    fixIndex = idx + 1;

    // 속도 게이트: 필터 추정 속도 < 임계 → 이 fix 는 거리로 계상하지 않는다
    // (앵커 보존 — 진짜 이동이면 다음 통과 fix 에서 합산돼 무손실).
    const gated =
      (params.speedGateMps ?? 0) > 0 && (kf.speedMps() ?? 0) < (params.speedGateMps ?? 0);

    if (lastGood) {
      const d = calcDist(lastGood.lat, lastGood.lon, f.lat, f.lon);
      const dtSec = lastGoodMs ? Math.max((ts - lastGoodMs) / 1000, 0) : 0;
      if (!gated && acceptSegmentTunable(d, dtSec, acc, idx, params.floorFactor)) {
        smoother.push(f);
        lastGood = f;
        lastGoodMs = ts;
      } else if (idx < WARMUP_FIXES) {
        // 워밍업: 거리 미계상 앵커 전진 — 평활 체인도 새로 시작
        smoother.flush();
        smoother.push(f);
        lastGood = f;
        lastGoodMs = ts;
      } else if (
        acc <= MAX_FIX_ACCURACY_M &&
        d > MAX_SEG_DIST_KM &&
        segmentSpeedMps(d, dtSec) <= MAX_SEG_SPEED_MPS
      ) {
        // 공백 복구 re-anchor: 공백 구간 미계상 — 평활 체인 리셋 후 새 앵커부터
        smoother.flush();
        smoother.push(f);
        lastGood = f;
        lastGoodMs = ts;
      }
    } else {
      smoother.push(f);
      lastGood = f;
      lastGoodMs = ts;
    }
  }
  smoother.flush();
  return {distKm: smoother.distKm()};
}
