// ─── runTracker — shared GPS distance engine (foreground + background) ────────
// The single source of truth for an active run's distance/time/pause state.
//
// WHY a module singleton (not React refs): real background tracking needs the
// engine to keep accumulating when the screen is off — including when expo's
// TaskManager wakes a *headless* JS context that has no React tree. So the
// fix-processing engine that used to live inline in App.tsx (Kalman → segment
// gate → distance, plus auto-pause) is extracted here. BOTH delivery paths feed
// the same engine via `ingestFix`:
//   • foreground: Location.watchPositionAsync(...) callback (live UI updates)
//   • background: the TaskManager location task (screen-off / suspended)
// Overlapping delivery (both subscriptions firing for one physical fix while the
// app is foregrounded) is made harmless by per-fix timestamp de-duplication —
// a fix whose timestamp is not newer than the last processed one is dropped, so
// distance can never be double-counted regardless of how many paths deliver it.
//
// The pure decision logic (acceptSegment / decideAutoPause / gpsStallStatus) and
// the KalmanFilter are reused UNCHANGED — this module only owns the stateful
// orchestration + persistence + a small subscribe() event bus the UI listens to.

import {KalmanFilter} from './kalman';
import {calcDist, acceptSegment, segmentSpeedMps} from './geo';
import {WARMUP_FIXES, MAX_FIX_ACCURACY_M, MAX_SEG_DIST_KM, MAX_SEG_SPEED_MPS, CURRENT_PACE_WINDOW_MS, CURRENT_PACE_MIN_DIST_KM, CURRENT_PACE_MIN_SPEED_MPS, PACE_TRACK_MIN_STEP_KM} from './engineConstants';
import {decideAutoPause, initAutoPauseState, AutoPauseState} from './autoPause';
import {gpsStallStatus, GPS_STALL_THRESHOLD_MS} from './gpsHealth';
import {saveSnapshot} from './runPersistence';
import {initElevState, feedAltitude, ElevState} from './elevation';

/** A raw GPS fix — the shape both expo-location's LocationObject and the old
 *  geolocation-service position share, so callers forward fixes verbatim.
 *  altitude(m) is optional — used for elevation-gain accumulation; absent/null
 *  fixes simply don't contribute to elevation. */
export interface RawFix {
  coords: {latitude: number; longitude: number; accuracy: number | null; altitude?: number | null; speed?: number | null};
  timestamp: number;
}

/** Observable run state the UI renders. */
export interface RunTrackerState {
  dist: number; // km accumulated (>= 0)
  elapsed: number; // seconds, pause-adjusted (>= 0)
  // 현재(롤링) 페이스: 최근 윈도우의 거리/시간으로 낸 '지금 페이스'(초/km). 표본 부족·정지
  // 시 null(화면 '--'). 평균(dist/elapsed)과 달리 실시간 코칭에 쓰는 1번 신호.
  currentPaceSecPerKm: number | null;
  paused: boolean;
  autoPaused: boolean;
  accuracyM: number | null; // last fix accuracy (null until first fix)
  stalled: boolean; // GPS dead-zone (no fresh fix past threshold) while running
  permissionRevoked: boolean;
  elevGainM: number; // cumulative elevation gain (m, >= 0) from GPS altitude
}

export type RunTrackerEvent =
  | {type: 'state'; state: RunTrackerState}
  | {type: 'paused'; auto: boolean}
  | {type: 'resumed'; auto: boolean}
  | {type: 'firstFix'; lat: number; lon: number}
  | {type: 'permissionRevoked'};

type Listener = (ev: RunTrackerEvent) => void;

export interface RunTrackerConfig {
  goalKm: number;
  shoe: {id: string; name: string};
  /** Epoch ms the run began; defaults to now(). Injectable for tests/recovery. */
  t0?: number;
  /** 누적 GPS stall ms(복구 시드/테스트용; 기본 0). elapsed 에서 빠지는 死구간 시간. */
  stalledMs?: number;
  /**
   * 크래시 복구 '이어 달리기' 시드 — 직전 스냅샷의 누적 거리(km). 기본 0.
   * 새 fix는 여기서부터 누적된다. (t0 는 호출자가 now − elapsed 로 줘 경과시간을 잇는다.)
   */
  seedDist?: number;
  /**
   * 복구 시드 경로점(지도 폴리라인 연속용). 주의: lastGood 는 일부러 시드하지 않는다 —
   * 크래시 공백 동안 주자가 이동했을 수 있어, 재개 후 *첫 fix* 가 새 앵커가 되게 한다
   * (공백 구간을 가로지르는 허위 거리 세그먼트 방지). 거리는 seedDist 로만 잇는다.
   */
  seedPts?: {lat: number; lon: number}[];
  /** 복구 시드 위치 라벨 — 이미 알고 있으면 재역지오코딩을 막는다(firstFix 억제). */
  seedLocation?: string;
}

class RunTracker {
  // ── injectable seams (overridable in tests) ──
  private now: () => number = () => Date.now();

  // ── engine state (mirrors the refs RunActiveScreen used to own) ──
  private kf = new KalmanFilter();
  private dist = 0; // km
  private pts: {lat: number; lon: number}[] = [];
  // 현재(롤링) 페이스용 샘플 — 채택된 fix 마다 {t: fix ts(ms), d: 누적거리(km)}. 슬라이딩
  // 윈도우(CURRENT_PACE_WINDOW_MS)로 최근 구간 페이스를 낸다. 일시정지/재개·권한복구 시 비움.
  private paceSamples: {t: number; d: number}[] = [];
  // OS(doppler) 속도(m/s) — 가장 최근 fix의 유효 속도만 보관(무효면 null). 롤링 거리기반
  // 페이스가 아직 없을 때(초반·재개 직후)만 '현재 페이스'를 보강하는 표시 전용 신호다.
  // 거리/Kalman 누적엔 절대 관여하지 않는다(코어 불변). 일시정지/재개·권한복구 시 비움.
  private lastSpeedMps: number | null = null;
  // 곡선 전용 (누적거리 km, 경과시간 sec) 시계열 — 약 25m 마다 누적(비가지치기). 경로 단순화와
  // 무관하게 거리-시간 대응을 보존해 RunDetail 의 고운 페이스 곡선을 만든다. start/config 시 리셋.
  private paceTrack: {d: number; t: number}[] = [];
  // 심박 시계열({t: 경과초, bpm}) — 외부(워치/HealthKit)가 feedHeartRate 로 먹인다. 완주 시
  // 영속해 HR존 구간시간·트레이닝효과(TRIMP)에 쓴다. ~3s throttle(과밀 저장 방지).
  private hrTrack: {t: number; bpm: number}[] = [];
  private lastHrPushSec = -999;
  // GAP(경사보정페이스)용 (누적거리 km, 경과초, raw GPS 고도 m) 시계열 — paceTrack 과 같은
  // 점에서 고도가 있는 fix 일 때만 적립한다. 노이즈 스무딩·Minetti 보정은 표시단(RunDetail)에서.
  private gapTrack: {d: number; t: number; e: number}[] = [];
  private fixIndex = 0;
  private lastGood: {lat: number; lon: number} | null = null;
  private lastGoodMs = 0;
  private lastRecvMs = 0;
  private lastFixTs = 0; // de-dupe guard: highest fix timestamp processed
  private autoAnchor: {lat: number; lon: number} | null = null;
  private autoAnchorMs = 0;
  private autoPauseState: AutoPauseState = initAutoPauseState();
  private elev: ElevState = initElevState();

  private isPaused = false;
  private autoPausedFlag = false;
  private pausedMs = 0;
  private pauseStartMs = 0;
  // GPS 死구간(stall) 누적 시간 — 임계 초과 무신호는 거리가 안 쌓이므로 elapsed 에서 뺀다
  // (백그라운드 throttle/터널에서 '거리 0 + 시간만 증가 → 페이스 왜곡' 방지). 임계(8s)까지는
  // 정상 fix 간격이라 세지 않고, 그 *초과분*만 누적해 타이머가 뒤로 튀지 않게 한다.
  private stalledMs = 0;

  private t0 = 0;
  private goalKm = 0;
  private shoe: {id: string; name: string} = {id: '', name: ''};
  private cadence = 0;
  private location = '';
  private accuracyM: number | null = null;
  private permissionRevoked = false;
  // Elapsed seconds captured at permission-revocation; once set, getElapsed()
  // returns it verbatim so displayed time freezes (the wall clock keeps ticking
  // and the UI's 1s timer keeps calling tick(), but time must stop on revoke —
  // mirrors how distance freezes). null while the run time is still live.
  private frozenElapsed: number | null = null;
  private active = false;
  private firstFixEmitted = false;

  private listeners = new Set<Listener>();

  /** Override the clock — used by unit tests for deterministic elapsed/snapshot. */
  setNow(fn: () => number) {
    this.now = fn;
  }

  /** Begin a fresh run, clearing all engine state. */
  start(config: RunTrackerConfig) {
    this.kf.reset();
    this.dist = 0;
    this.pts = [];
    this.paceTrack = [];
    this.hrTrack = [];
    this.lastHrPushSec = -999;
    this.gapTrack = [];
    this.paceSamples = [];
    this.lastSpeedMps = null;
    this.fixIndex = 0;
    this.lastGood = null;
    this.lastGoodMs = 0;
    this.lastRecvMs = 0;
    this.lastFixTs = 0;
    this.autoAnchor = null;
    this.autoAnchorMs = 0;
    this.autoPauseState = initAutoPauseState();
    this.elev = initElevState();
    this.isPaused = false;
    this.autoPausedFlag = false;
    this.pausedMs = 0;
    this.pauseStartMs = 0;
    this.stalledMs = config.stalledMs ?? 0;
    this.t0 = config.t0 ?? this.now();
    this.goalKm = config.goalKm;
    this.shoe = config.shoe;
    this.cadence = 0;
    this.location = '';
    this.accuracyM = null;
    this.permissionRevoked = false;
    this.frozenElapsed = null;
    this.active = true;
    this.firstFixEmitted = false;

    // ── 크래시 복구 '이어 달리기' 시드 ──────────────────────────────────
    // seed* 가 없으면(일반 시작) 위 초기화 그대로 — fresh-run 경로는 바이트 동일하다.
    if (config.seedDist && config.seedDist > 0) this.dist = config.seedDist;
    if (config.seedPts && config.seedPts.length > 0) {
      // 경로 폴리라인만 잇는다. lastGood 는 비워 둔 채(=null) 둬, 재개 후 첫 fix 가
      // 새 앵커가 되도록 한다 — 공백을 가로지르는 허위 거리 누적을 막는다.
      this.pts = config.seedPts.map(p => ({lat: p.lat, lon: p.lon}));
      this.fixIndex = this.pts.length;
    }
    if (config.seedLocation) {
      // 위치를 이미 알면 첫 fix 역지오코딩(firstFix 이벤트)을 억제한다.
      this.location = config.seedLocation;
      this.firstFixEmitted = true;
    }
  }

  /** Stop accepting fixes (data is retained for save). Idempotent. */
  stop() {
    this.active = false;
  }

  isActive() {
    return this.active;
  }

  // ── subscription bus ──────────────────────────────────────────────
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(ev: RunTrackerEvent) {
    this.listeners.forEach(l => {
      try {
        l(ev);
      } catch {
        // a listener throwing must not break the engine / other listeners.
      }
    });
  }

  private emitState() {
    this.emit({type: 'state', state: this.getState()});
  }

  // ── meta the engine doesn't compute but persists (set by the UI) ──
  setMeta(meta: {cadence?: number; location?: string}) {
    if (typeof meta.cadence === 'number') this.cadence = meta.cadence;
    if (typeof meta.location === 'string') this.location = meta.location;
  }

  // ── pause control ─────────────────────────────────────────────────
  private enterPause(auto: boolean) {
    if (this.isPaused) return;
    this.isPaused = true;
    this.autoPausedFlag = auto;
    this.pauseStartMs = this.now();
    this.emit({type: 'paused', auto});
    this.emitState();
  }

  private exitPause(auto: boolean) {
    if (!this.isPaused) return;
    if (this.pauseStartMs > 0) {
      const delta = this.now() - this.pauseStartMs;
      if (delta > 0) this.pausedMs += delta;
      this.pauseStartMs = 0; // guard: never double-count one pause window
    }
    this.isPaused = false;
    this.autoPausedFlag = false;
    // reset the machine so leftover slow/fast time can't immediately re-trigger.
    this.autoPauseState = initAutoPauseState();
    // 현재-페이스 윈도우 비움 — 일시정지 공백을 가로질러 페이스를 계산해 거짓으로 느려지는
    // 것을 막는다. 재개 후 새 샘플로 윈도우를 다시 채운다(그동안은 '--').
    this.paceSamples = [];
    this.lastSpeedMps = null;
    this.emit({type: 'resumed', auto});
    this.emitState();
  }

  /** Manual pause toggle from the UI (auto=false). */
  togglePause() {
    if (!this.isPaused) this.enterPause(false);
    else this.exitPause(false);
  }

  pausedFlag() {
    return this.isPaused;
  }

  // ── permission revoked mid-run ────────────────────────────────────
  notifyPermissionRevoked() {
    if (this.permissionRevoked) return;
    // Freeze elapsed BEFORE flipping the flag: capture the live value, then
    // getElapsed() returns it for the rest of the run so time stops growing —
    // distance already stops because `active` goes false and ingestFix() bails.
    this.frozenElapsed = this.getElapsed();
    this.permissionRevoked = true;
    this.active = false; // stop accumulating garbage distance/time
    this.emit({type: 'permissionRevoked'});
    this.emitState();
  }

  /**
   * 주행 중 권한 회수 후, 설정에서 다시 허용하고 앱으로 복귀했을 때 트래킹을 재개한다(#6).
   * 회수 상태가 아니면 no-op(false 반환) — 호출자가 '처음부터 거부(엔진 미시작)' 케이스와
   * 구분하는 데 쓴다. 동결됐던 시점 이후 흐른 wall-clock(설정 다녀온 공백)을 pausedMs 로
   * 흡수해 elapsed 가 동결 지점에서 매끄럽게 이어지게 하고(공백만큼 점프 금지), 거리는 보존된
   * 채 새 fix 부터 다시 누적한다. lastGood 은 비워(공백 가로지르는 허위 세그먼트 방지) 재개
   * 첫 fix 가 새 앵커가 되게 한다. 호출 후 isActive()===true.
   */
  resumeFromPermissionRevoked(): boolean {
    if (!this.permissionRevoked) return false;
    const now = this.now();
    if (this.frozenElapsed != null) {
      const rawMs = now - this.t0 - this.pausedMs - this.stalledMs;
      const gapMs = rawMs - this.frozenElapsed * 1000;
      if (gapMs > 0) this.pausedMs += gapMs; // 공백을 일시정지처럼 elapsed 에서 제외
    }
    this.frozenElapsed = null;
    this.permissionRevoked = false;
    this.active = true;
    this.lastGood = null; // 공백 가로지르는 허위 거리 방지(재개 첫 fix = 새 앵커)
    this.lastRecvMs = now; // 死구간 오판 방지(재개 직후 gap 을 stall 로 세지 않게)
    this.paceSamples = []; // 현재-페이스 윈도우 비움(설정 다녀온 공백 가로지르는 계산 방지)
    this.lastSpeedMps = null;
    this.emit({type: 'resumed', auto: false});
    this.emitState();
    return true;
  }

  // ── the core: process one GPS fix ─────────────────────────────────
  // Faithful port of the App.tsx watchPosition success handler, with a leading
  // timestamp de-dupe so foreground + background delivery of the same fix is safe.
  ingestFix(fix: RawFix) {
    if (!this.active) return;
    const ts = fix.timestamp;
    // De-dupe: only strictly newer fixes advance the engine. Equal/older fixes
    // (a second delivery path echoing the same physical fix) are ignored so
    // distance is never double-counted.
    if (ts > 0 && ts <= this.lastFixTs) return;
    if (ts > 0) this.lastFixTs = ts;

    // 무신호 간격(gap)을 측정한다. 도착 시점에 이미 일시정지였다면 그 시간은 pausedMs 가
    // 책임지므로 stall 로 세지 않는다(recvGap=0). 적립 여부는 아래에서 '채택' 여부로 가른다.
    const recvNow = this.now();
    const recvGap =
      !this.isPaused && this.lastRecvMs > 0 ? recvNow - this.lastRecvMs : 0;
    this.lastRecvMs = recvNow;
    const {latitude: lat, longitude: lon, accuracy} = fix.coords;
    // OS doppler 속도 갱신(표시 전용) — 유효(>= 임계, 정지/무효 제외)할 때만 보관, 아니면 null.
    // 매 fix 가 즉시 덮어쓰므로 항상 최신이다. 거리/세그먼트 게이트와 완전히 독립.
    const sp = fix.coords.speed;
    this.lastSpeedMps = typeof sp === 'number' && sp >= CURRENT_PACE_MIN_SPEED_MPS ? sp : null;
    const acc = accuracy == null ? Infinity : accuracy;
    const f = this.kf.process(lat, lon, acc, ts);
    this.accuracyM = Number.isFinite(acc) ? Math.round(acc) : null;
    const idx = this.fixIndex;

    // 死구간 시간 회계(#3): 이 fix 가 거리로 *채택*될지 미리 판정한다. 채택되면 그 공백 시간은
    // 실제 러닝 시간이므로 stall 로 빼지 않는다(거리·시간 일관). 채택 안 되는(死구간/노이즈/
    // 공백 re-anchor/일시정지) 임계 초과 공백만 stalledMs 로 적립해 getElapsed 에서 빼, '거리는
    // 그대로인데 시간만 흘러' 생기는 페이스 왜곡을 막는다. 적립은 auto-pause/일시정지 early-return
    // 보다 *앞*에 둬야 한다 — 이 fix 가 정지를 유발해도 직전 공백 시간은 빠져야 하기 때문(옛 동작).
    const willCount =
      !this.isPaused &&
      this.lastGood != null &&
      acceptSegment({
        distKm: calcDist(this.lastGood.lat, this.lastGood.lon, f.lat, f.lon),
        dtSec: this.lastGoodMs ? Math.max((ts - this.lastGoodMs) / 1000, 0) : 0,
        accuracyM: acc,
        fixIndex: idx,
      });
    if (!willCount && recvGap > GPS_STALL_THRESHOLD_MS) {
      this.stalledMs += recvGap - GPS_STALL_THRESHOLD_MS;
    }

    // ── auto-pause / resume decision ──
    if (
      idx >= WARMUP_FIXES &&
      this.autoAnchor &&
      (!this.isPaused || this.autoPausedFlag)
    ) {
      const moved = calcDist(this.autoAnchor.lat, this.autoAnchor.lon, f.lat, f.lon);
      const dtA = Math.max((ts - this.autoAnchorMs) / 1000, 0);
      if (dtA > 0) {
        const decision = decideAutoPause(this.autoPauseState, segmentSpeedMps(moved, dtA), dtA);
        this.autoPauseState = decision.state;
        if (decision.justPaused) this.enterPause(true);
        else if (decision.justResumed) this.exitPause(true);
      }
    }
    // anchor advances every fix (even while paused) to keep measuring resume speed.
    this.autoAnchor = {lat: f.lat, lon: f.lon};
    this.autoAnchorMs = ts;

    // no distance/route accumulation while paused.
    if (this.isPaused) {
      this.emitState();
      return;
    }
    this.fixIndex = idx + 1;

    if (!this.firstFixEmitted) {
      this.firstFixEmitted = true;
      this.emit({type: 'firstFix', lat: f.lat, lon: f.lon});
    }

    if (this.lastGood) {
      const d = calcDist(this.lastGood.lat, this.lastGood.lon, f.lat, f.lon);
      const dtSec = this.lastGoodMs ? Math.max((ts - this.lastGoodMs) / 1000, 0) : 0;
      if (acceptSegment({distKm: d, dtSec, accuracyM: acc, fixIndex: idx})) {
        this.dist += d;
        this.pts.push(f);
        this.lastGood = f;
        this.lastGoodMs = ts;
        // 곡선 전용 (누적거리 km, 경과시간 sec) 시계열 — 약 25m 마다 1점, 비가지치기.
        // 경로(pts)는 저장 시 단순화되지만 이 시계열은 거리-시간 대응을 보존해 고운 페이스
        // 곡선을 만든다(RunDetail). 일시정지/공백은 elapsed 가 흡수하므로 페이스가 왜곡 안 됨.
        const lastTr = this.paceTrack[this.paceTrack.length - 1];
        if (!lastTr || this.dist - lastTr.d >= PACE_TRACK_MIN_STEP_KM) {
          const tNow = this.getElapsed();
          this.paceTrack.push({d: this.dist, t: tNow});
          // 같은 점의 raw GPS 고도를 GAP 시계열에 적립(고도 없는 fix 는 건너뜀 — 거리 기준
          // 매칭이라 빠져도 인접 구간 경사는 옳게 계산된다).
          const alt = fix.coords.altitude;
          if (alt != null && Number.isFinite(alt)) {
            this.gapTrack.push({d: this.dist, t: tNow, e: alt});
          }
        }
        // 현재 페이스 샘플 적립(채택된 거리에서만 — re-anchor/거부는 거리 미반영이라 제외).
        // 슬라이딩 윈도우: paceSamples[1]이 cutoff 안에 들 때까지 앞을 버려 [0]을 윈도우 앵커로.
        this.paceSamples.push({t: ts, d: this.dist});
        const cutoff = ts - CURRENT_PACE_WINDOW_MS;
        while (this.paceSamples.length > 2 && this.paceSamples[1].t < cutoff) {
          this.paceSamples.shift();
        }
        // 고도 누적은 거리 누적과 같은 '채택된 fix'에서만 — 거부된 노이즈 fix가
        // 상승분을 부풀리지 않게 한다(임계 필터는 lib/elevation가 추가로 담당).
        this.elev = feedAltitude(this.elev, fix.coords.altitude);
      } else if (idx < WARMUP_FIXES) {
        // warmup: don't count, but advance last-good so the first post-warmup
        // segment isn't a giant settling jump.
        this.lastGood = f;
        this.lastGoodMs = ts;
      } else if (
        acc <= MAX_FIX_ACCURACY_M &&
        d > MAX_SEG_DIST_KM &&
        segmentSpeedMps(d, dtSec) <= MAX_SEG_SPEED_MPS
      ) {
        // GPS 공백 복구 re-anchor(#1): 정확한 fix 인데 직전 앵커와의 점프가 거리 cap(300m)을
        // 넘었다. 단, 속도가 정상 범위(≤MAX_SEG_SPEED)일 때만 — 긴 dt 에 걸친 큰 이동 = 진짜
        // 신호 공백이라는 뜻이다(고속 점프=GPS 스파이크는 이 분기 밖, last-good 보존으로 무시).
        // 그 구간 거리는 신뢰 불가라 계상하지 않되, *앵커를 새 fix 로 전진*시킨다. 전진하지
        // 않으면(옛 동작) 멀어지는 주자에 대해 이후 모든 fix 가 영구히 cap 을 넘어 거부돼, 단
        // 한 번의 긴 공백 뒤 거리계가 런 끝까지 동결된다(5km→2km 식 과소계상).
        this.lastGood = f;
        this.lastGoodMs = ts;
        this.pts.push(f);
        this.elev = feedAltitude(this.elev, fix.coords.altitude);
      }
      // 그 외 거부(정확도/노이즈/속도)는 last-good 보존 — 노이즈 fix 를 건너뛰고 다음 양호
      // fix 와 직접 잇기 위함(짧은 노이즈는 cap 미만이라 위 re-anchor 분기에 안 들어온다).
    } else {
      this.lastGood = f;
      this.lastGoodMs = ts;
      this.pts.push(f);
      // 첫 채택 지점의 고도를 기준으로 설정(누적 0에서 시작).
      this.elev = feedAltitude(this.elev, fix.coords.altitude);
    }

    this.persist();
    this.emitState();
  }

  // ── time + dead-zone (recomputed by the UI's 1s ticker) ───────────
  getElapsed(): number {
    // Once permission is revoked, time is frozen at the captured value — the 1s
    // ticker may keep firing but displayed elapsed must not advance.
    if (this.frozenElapsed != null) return this.frozenElapsed;
    const now = this.now();
    const curPausedMs =
      this.isPaused && this.pauseStartMs > 0
        ? this.pausedMs + (now - this.pauseStartMs)
        : this.pausedMs;
    // 진행 중인 死구간의 초과분(임계 넘은 부분)도 실시간으로 빼, 무신호 동안 타이머가 거리
    // 없이 늘지 않게 한다. 임계 이내(정상 간격)면 0 — 타이머가 매끄럽게 흐른다(역행 없음).
    const ongoingStallMs =
      !this.isPaused && this.lastRecvMs > 0
        ? Math.max(0, now - this.lastRecvMs - GPS_STALL_THRESHOLD_MS)
        : 0;
    return Math.max(0, Math.floor((now - this.t0 - curPausedMs - this.stalledMs - ongoingStallMs) / 1000));
  }

  isStalled(): boolean {
    if (this.isPaused) return false; // fixes legitimately stop while paused
    return gpsStallStatus(this.lastRecvMs, this.now()).stalled;
  }

  /** Recompute time/stall and broadcast — call once per second from the UI. */
  tick() {
    this.emitState();
  }

  /** 최근 윈도우(슬라이딩) 거리/시간으로 현재 페이스(초/km)를 낸다. 일시정지 중·표본 부족·
   *  최소 이동거리 미만이면 null(화면 '--'). 평균과 달리 '지금 얼마나 빠른지'를 즉각 반영한다. */
  private computeCurrentPace(): number | null {
    if (this.isPaused) return null;
    // 1순위: 거리기반 롤링 페이스(스무딩됨, 정상 구간의 신뢰 신호). 가능하면 항상 이걸 쓴다.
    const n = this.paceSamples.length;
    if (n >= 2) {
      const oldest = this.paceSamples[0];
      const latest = this.paceSamples[n - 1];
      const dKm = latest.d - oldest.d;
      const dSec = (latest.t - oldest.t) / 1000;
      if (dKm >= CURRENT_PACE_MIN_DIST_KM && dSec > 0) return dSec / dKm;
    }
    // 보강(P0-6 안전 서브셋): 롤링 페이스가 아직 없을 때(런 초반·재개 직후)만 OS doppler
    // 속도로 '현재 페이스'를 채운다 — 표시 공백을 줄여 더 빨리 페이스를 띄운다. 정상 구간엔
    // 영향 없음(위에서 이미 반환). 거리/Kalman 누적과 무관(표시 전용).
    if (this.lastSpeedMps != null && this.lastSpeedMps >= CURRENT_PACE_MIN_SPEED_MPS) {
      return 1000 / this.lastSpeedMps; // m/s → sec/km
    }
    return null;
  }

  getState(): RunTrackerState {
    return {
      dist: Math.round(this.dist * 100) / 100,
      elapsed: this.getElapsed(),
      currentPaceSecPerKm: this.computeCurrentPace(),
      paused: this.isPaused,
      autoPaused: this.autoPausedFlag,
      accuracyM: this.accuracyM,
      stalled: this.isStalled(),
      permissionRevoked: this.permissionRevoked,
      elevGainM: Math.round(this.elev.gain),
    };
  }

  getDistanceKm(): number {
    return this.dist;
  }

  /** 누적 고도 상승(m, 정수) — 완주 화면 최종값으로 읽는다. */
  getElevationGain(): number {
    return Math.round(this.elev.gain);
  }

  getPoints(): {lat: number; lon: number}[] {
    return this.pts;
  }

  /** 곡선 전용 (누적거리 km, 경과시간 sec) 시계열. 완주 시 영속해 고운 페이스 곡선을 만든다. */
  getPaceTrack(): {d: number; t: number}[] {
    return this.paceTrack;
  }

  /** 외부(워치/HealthKit)가 실시간 심박을 먹인다. 달리는 중(active·미정지)에만 ~3s 간격으로
   *  hrTrack 에 적립한다. bpm<=0(미측정)·정지·비활성은 무시 — 휴식/공백 심박을 안 섞는다. */
  feedHeartRate(bpm: number) {
    if (!this.active || this.pausedFlag()) return;
    if (!(bpm > 0)) return;
    const t = this.getElapsed();
    if (t - this.lastHrPushSec < 3) return;
    this.lastHrPushSec = t;
    this.hrTrack.push({t: Math.round(t), bpm: Math.round(bpm)});
  }

  /** 심박 시계열({t: 경과초, bpm}). 완주 시 영속해 HR존 구간시간·TRIMP 분석에 쓴다. */
  getHrTrack(): {t: number; bpm: number}[] {
    return this.hrTrack;
  }

  /** GAP 시계열({d: 누적 km, t: 경과초, e: raw 고도 m}). 완주 시 영속해 경사보정페이스에 쓴다. */
  getGapTrack(): {d: number; t: number; e: number}[] {
    return this.gapTrack;
  }

  getElapsedFinal(): number {
    return this.getElapsed();
  }

  // ── persistence ───────────────────────────────────────────────────
  persist() {
    void saveSnapshot({
      dist: this.dist,
      elapsed: this.getElapsed(),
      pts: this.pts.map(p => ({lat: p.lat, lon: p.lon})),
      pausedMs: this.pausedMs,
      t0: this.t0,
      shoe: {id: this.shoe.id, name: this.shoe.name},
      goalKm: this.goalKm,
      cadence: this.cadence,
      location: this.location,
      savedAt: this.now(),
    }).catch(() => {});
  }
}

/** Process-wide singleton — the one engine both delivery paths feed. */
export const runTracker = new RunTracker();

/** Exposed for unit tests that want an isolated instance. */
export {RunTracker};
