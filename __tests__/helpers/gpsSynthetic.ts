// ─── 합성 GPS 러닝 하네스 (테스트 전용) ─────────────────────────────────────
// GPS 거리 정확도를 '숫자로' 측정하기 위한 결정론적 시뮬레이터.
// 참(truth) 경로를 1Hz 로 샘플링하고, 실측 GPS 와 같은 성질의 잡음
// (시간상관 Gauss-Markov 바이어스 + fix 간 백색 지터)을 시드 RNG 로 입혀
// 실제 엔진(RunTracker: Kalman → acceptSegment → 거리 누적)에 먹인 뒤
// 참 거리 대비 오차(%)를 잰다.
//
// 배경: 2026-07-11 실측 비교런(폰 Keego vs NRC 동시)에서 Keego +9% 과대 확정.
// 이 하네스는 그 과대를 재현·수치화하고, 필터 파라미터 재튜닝의 근거와
// 회귀 가드를 제공한다. Math.random 미사용(전 구간 시드 RNG) — CI 결정론.

import {RunTracker, RawFix} from '../../lib/runTracker';

// ── 시드 RNG (mulberry32) + 가우시안(Box-Muller) ────────────────────────────
/* eslint-disable no-bitwise -- mulberry32 는 32비트 정수 연산이 알고리즘 자체다.
   비트 연산을 걷어내면 다른 난수가 되고, 그러면 시드 재현성이 깨진다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGaussian(rng: () => number): () => number {
  // Box-Muller — 한 번에 2개 생성, 하나는 캐시.
  let spare: number | null = null;
  return () => {
    if (spare != null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    // rng()가 정확히 0 이면 log(0) — 시드 RNG 라도 방어.
    do {
      u = rng();
    } while (u <= 1e-12);
    v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

// ── 참 경로: 레그(지속초·속도·헤딩) 목록 → 1Hz 로컬미터 샘플 ────────────────
export interface Leg {
  durS: number;
  speedMps: number;
  /** 진행 방위(도). 0=북(+y), 90=동(+x). */
  headingDeg: number;
}

export interface TruthSample {
  t: number; // 초 (0부터 1Hz)
  x: number; // 동쪽 미터
  y: number; // 북쪽 미터
}

export function sampleTruth(legs: Leg[]): TruthSample[] {
  const out: TruthSample[] = [{t: 0, x: 0, y: 0}];
  let x = 0;
  let y = 0;
  let t = 0;
  for (const leg of legs) {
    const rad = (leg.headingDeg * Math.PI) / 180;
    const vx = leg.speedMps * Math.sin(rad);
    const vy = leg.speedMps * Math.cos(rad);
    for (let i = 0; i < leg.durS; i++) {
      x += vx;
      y += vy;
      t += 1;
      out.push({t, x, y});
    }
  }
  return out;
}

/** 참 경로 길이(km) — fromIdx 샘플부터 끝까지. 엔진은 워밍업 3fix 를 버리고
 *  idx2 지점을 앵커로 idx3 부터 계상하므로, 공정 비교는 fromIdx=2 부터다. */
export function truthKm(samples: TruthSample[], fromIdx = 2): number {
  let m = 0;
  for (let i = fromIdx + 1; i < samples.length; i++) {
    m += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  }
  return m / 1000;
}

// ── 시나리오 (사용자 확정 4종) ──────────────────────────────────────────────
const PACE_6MIN_MPS = 1000 / 360; // 6'00"/km ≈ 2.778 m/s

export const SCENARIOS: {[name: string]: Leg[]} = {
  /** 직선 2km @ 6'00"/km — 기본 과대(지터 적산) 측정. */
  straight2k: [{durS: 720, speedMps: PACE_6MIN_MPS, headingDeg: 0}],
  /** 사각 루프 500m×4 — 코너에서 필터가 과하게 안쪽으로 깎으면 과소측정. */
  squareLoop: [
    {durS: 180, speedMps: PACE_6MIN_MPS, headingDeg: 0},
    {durS: 180, speedMps: PACE_6MIN_MPS, headingDeg: 90},
    {durS: 180, speedMps: PACE_6MIN_MPS, headingDeg: 180},
    {durS: 180, speedMps: PACE_6MIN_MPS, headingDeg: 270},
  ],
  /** 인터벌 — 페이스 급변(4'00"↔8'20")을 필터가 따라가는지. */
  intervals: Array.from({length: 6}, () => [
    {durS: 60, speedMps: 1000 / 240, headingDeg: 0},
    {durS: 60, speedMps: 2.0, headingDeg: 0},
  ]).flat(),
  /** 1km 주행 → 300s 정지(신호대기) → 1km 주행 — 정지 중 팬텀 드리프트 억제. */
  stopGo: [
    {durS: 360, speedMps: PACE_6MIN_MPS, headingDeg: 0},
    {durS: 300, speedMps: 0, headingDeg: 0},
    {durS: 360, speedMps: PACE_6MIN_MPS, headingDeg: 0},
  ],
  /** 반경 30m 원 8바퀴(≈1.5km) — 지속 곡선에서 평활/청킹의 과소측정(코너 깎기) 감시.
   *  1초 단위 헤딩 회전으로 근사(참 거리도 같은 폴리라인 기준이라 공정). */
  circle: (() => {
    const r = 30;
    const secPerLap = Math.round((2 * Math.PI * r) / PACE_6MIN_MPS); // ≈68s
    const legs: Leg[] = [];
    for (let lap = 0; lap < 8; lap++) {
      for (let s = 0; s < secPerLap; s++) {
        legs.push({durS: 1, speedMps: PACE_6MIN_MPS, headingDeg: (360 * s) / secPerLap});
      }
    }
    return legs;
  })(),
  /** 왕복(아웃앤백) 500m + 180° 턴 — 필터 지연이 턴어라운드에서 유발하는 오버슛/깎임 감시. */
  outback: [
    {durS: 180, speedMps: PACE_6MIN_MPS, headingDeg: 0},
    {durS: 180, speedMps: PACE_6MIN_MPS, headingDeg: 180},
  ],
  /** 걷뛰(run-walk): 러닝 → 걷기 1.0m/s 300m → 러닝. 걷기 거리 유실 금지 검증
   *  (속도게이트/노이즈 플로어가 걷기를 '유예'는 해도 '삭제'하면 안 된다). */
  runWalk: [
    {durS: 360, speedMps: PACE_6MIN_MPS, headingDeg: 0},
    {durS: 300, speedMps: 1.0, headingDeg: 0},
    {durS: 360, speedMps: PACE_6MIN_MPS, headingDeg: 0},
  ],
  /** 느린 러너 8'30"/km 직선 3km — 저속에서 플로어 청킹/게이트가 과소측정 안 하는지. */
  slowStraight: [{durS: 1530, speedMps: 1000 / 510, headingDeg: 0}],
};

// ── GPS 잡음 모델 ───────────────────────────────────────────────────────────
// 실측 GPS 오차의 두 성분을 나눠 모사한다:
//  • bias(σ, τ): 시간상관 Gauss-Markov — 멀티패스/전리층 등 수십 초 스케일의
//    '치우침'. 상관돼 있어 fix 간 차분(=거리)에는 √(2(1-ρ)) 만큼만 샌다.
//  • white(σw): fix 간 백색 지터 — 거리 과대 적산의 주범(매 fix 독립).
// 보고 정확도(acc)는 σ 수준에서 약간 출렁이게 준다(iOS 관측과 유사).
export interface NoiseProfile {
  name: string;
  sigmaM: number; // Gauss-Markov 정상 표준편차(m, 축별)
  tauS: number; // 상관 시간(s)
  whiteM: number; // 백색 지터 표준편차(m, 축별)
  accM: number; // 보고 정확도 중심값(m)
}

/** 공원/도심 혼합(실측 비교런과 유사 환경 목표) — 현행 엔진이 +5~10% 과대를
 *  재현하도록 실측(+9%)에 맞춰 보정한 기준 프로파일. */
export const NOISE_TYPICAL: NoiseProfile = {name: 'typical', sigmaM: 5, tauS: 25, whiteM: 1.6, accM: 6};
/** 탁 트인 하늘(강변/트랙) — 좋은 조건에서 과소측정으로 뒤집히지 않는지 가드. */
export const NOISE_OPEN: NoiseProfile = {name: 'open', sigmaM: 3, tauS: 40, whiteM: 0.8, accM: 5};
/** 빌딩 협곡/수풀 — 나쁜 조건 상한. */
export const NOISE_URBAN: NoiseProfile = {name: 'urban', sigmaM: 8, tauS: 15, whiteM: 2.4, accM: 10};

/**
 * 도플러 속도 잡음(축별 m/s) — 프로파일별. 위치 잡음(σ 수 m)과 **자릿수가 다르다**:
 * 수신기가 반송파 주파수 편이로 속도를 직접 재기 때문이다(위치 차분이 아니다).
 * GNSS 통상 0.05~0.15 m/s; 도심 반사까지 감안해 urban 은 넉넉히 잡았다.
 */
export const DOPPLER_SIGMA_MPS: Record<string, number> = {open: 0.06, typical: 0.12, urban: 0.25};

export const ORIGIN_LAT = 37.5;
export const ORIGIN_LON = 127.0;
const M_PER_DEG_LAT = 111320;

/** 참 샘플에 잡음을 입혀 RawFix 열을 만든다(1Hz, ts는 t0Ms 기준 ms). */
export function makeFixes(
  samples: TruthSample[],
  profile: NoiseProfile,
  seed: number,
  t0Ms = 1_700_000_000_000,
): RawFix[] {
  const rng = mulberry32(seed);
  const gauss = makeGaussian(rng);
  // 도플러 속도용 잡음(축별). **위치 잡음과 독립이다** — 수신기가 위성 반송파의 주파수
  // 편이로 직접 재는 값이라 위치 해와 오차원이 다르다(GNSS 통상 0.05~0.15 m/s).
  const vGauss = makeGaussian(mulberry32(seed ^ 0x5eed));
  const vSigma = DOPPLER_SIGMA_MPS[profile.name] ?? 0.12;
  const rho = Math.exp(-1 / profile.tauS);
  const c = Math.sqrt(1 - rho * rho) * profile.sigmaM;
  let bx = gauss() * profile.sigmaM;
  let by = gauss() * profile.sigmaM;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((ORIGIN_LAT * Math.PI) / 180);
  return samples.map((s, i) => {
    bx = rho * bx + c * gauss();
    by = rho * by + c * gauss();
    const ex = bx + gauss() * profile.whiteM;
    const ey = by + gauss() * profile.whiteM;
    const acc = Math.max(3, profile.accM + gauss() * 1.5);
    // ── OS 도플러 속도(m/s) ────────────────────────────────────────────────
    // 예전엔 `speed: null` — "OS 가 속도를 안 준다"는 **거짓 가정**이었고, 그래서
    // 이 하네스로는 속도를 쓰는 어떤 설계도 검증할 수 없었다(2026-08-10).
    // 참 속도 벡터에 축별 잡음을 얹고 **크기**를 취한다 — OS 가 주는 speed 와 같은
    // 성질이다(크기라서 정지 근처에서는 0 이 아니라 양으로 정류된다는 점까지 같다).
    const prev = i > 0 ? samples[i - 1] : s;
    const tvx = s.x - prev.x; // 1Hz 샘플이라 m/s
    const tvy = s.y - prev.y;
    const speed = Math.hypot(tvx + vGauss() * vSigma, tvy + vGauss() * vSigma);
    return {
      coords: {
        latitude: ORIGIN_LAT + (s.y + ey) / M_PER_DEG_LAT,
        longitude: ORIGIN_LON + (s.x + ex) / mPerDegLon,
        accuracy: acc,
        altitude: null,
        speed,
      },
      timestamp: t0Ms + s.t * 1000,
    };
  });
}

// ── OS 걸음 센서 모사(걸음 정지 게이트 검증용) ──────────────────────────────
/** 참 경로 속도로 누적 걸음수 표본(2.5s 폴링 — 앱과 정합, 2026-07-18 5s→2.5s)을 만든다:
 *  정지=증가 0, 걷기(<2m/s)=105spm, 러닝=170spm.
 *  App 의 Pedometer.getStepCountAsync 폴링과 동일한 형태(t초, 누적). */
export function makeStepSamples(
  samples: TruthSample[],
  intervalS = 2.5,
): {t: number; steps: number}[] {
  const out: {t: number; steps: number}[] = [];
  let cum = 0;
  let lastEmit = -Infinity;
  for (let i = 1; i < samples.length; i++) {
    const v = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    const spm = v < 0.1 ? 0 : v < 2 ? 105 : 170;
    cum += spm / 60; // 1Hz 샘플 → 초당 걸음
    if (samples[i].t - lastEmit >= intervalS) {
      out.push({t: samples[i].t, steps: Math.floor(cum)});
      lastEmit = samples[i].t;
    }
  }
  return out;
}

// ── 실제 엔진으로 주행 ─────────────────────────────────────────────────────
/** RunTracker(실제 제품 엔진)에 fix 열을 먹이고 최종 누적 거리(km)를 돌려준다.
 *  시계는 fix 타임스탬프를 따라간다(1s ticker 와 동일한 시간 흐름).
 *  steps 를 주면 App 의 5s 폴링처럼 fix 사이사이에 feedSteps 로 공급한다. */
export function runEngine(
  fixes: RawFix[],
  steps?: {t: number; steps: number}[],
  t0Ms = 1_700_000_000_000,
): {distKm: number} {
  const t = new RunTracker();
  let clock = fixes.length > 0 ? fixes[0].timestamp : 0;
  t.setNow(() => clock);
  t.start({goalKm: 10, shoe: {id: 'sim', name: 'sim'}, t0: clock});
  let si = 0;
  for (const f of fixes) {
    clock = f.timestamp;
    while (steps && si < steps.length && t0Ms + steps[si].t * 1000 <= f.timestamp) {
      t.feedSteps(steps[si].steps, t0Ms + steps[si].t * 1000);
      si++;
    }
    t.ingestFix(f);
  }
  t.stop(); // 평활 꼬리 flush 포함 — 최종 거리는 stop() 후 읽는다(제품 handleStop 동일)
  const distKm = t.getDistanceKm();
  return {distKm};
}

/** 한 시나리오×프로파일을 여러 시드로 돌려 평균 오차(%)를 낸다. */
export function measureError(
  legs: Leg[],
  profile: NoiseProfile,
  seeds: number[],
): {meanErrPct: number; errsPct: number[]; truthKm: number} {
  const samples = sampleTruth(legs);
  const truth = truthKm(samples);
  const errsPct = seeds.map(seed => {
    const {distKm} = runEngine(makeFixes(samples, profile, seed));
    return ((distKm - truth) / truth) * 100;
  });
  const meanErrPct = errsPct.reduce((a, b) => a + b, 0) / errsPct.length;
  return {meanErrPct, errsPct, truthKm: truth};
}
