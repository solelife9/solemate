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
import {WARMUP_FIXES} from './engineConstants';
import {decideAutoPause, initAutoPauseState, AutoPauseState} from './autoPause';
import {gpsStallStatus, GPS_STALL_THRESHOLD_MS} from './gpsHealth';
import {saveSnapshot} from './runPersistence';
import {initElevState, feedAltitude, ElevState} from './elevation';

/** A raw GPS fix — the shape both expo-location's LocationObject and the old
 *  geolocation-service position share, so callers forward fixes verbatim.
 *  altitude(m) is optional — used for elevation-gain accumulation; absent/null
 *  fixes simply don't contribute to elevation. */
export interface RawFix {
  coords: {latitude: number; longitude: number; accuracy: number | null; altitude?: number | null};
  timestamp: number;
}

/** Observable run state the UI renders. */
export interface RunTrackerState {
  dist: number; // km accumulated (>= 0)
  elapsed: number; // seconds, pause-adjusted (>= 0)
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
}

class RunTracker {
  // ── injectable seams (overridable in tests) ──
  private now: () => number = () => Date.now();

  // ── engine state (mirrors the refs RunActiveScreen used to own) ──
  private kf = new KalmanFilter();
  private dist = 0; // km
  private pts: {lat: number; lon: number}[] = [];
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

    // 死구간 종료: 이번 fix 직전까지의 무신호 간격이 stall 임계를 넘었으면, 그 *초과분*을
    // 누적 stall 로 적립한다(임계까지는 정상 fix 간격). 일시정지 중 간격은 pausedMs 가 따로
    // 책임지므로 제외. 이렇게 모은 stalledMs 를 getElapsed 가 빼 페이스 왜곡을 막는다.
    const recvNow = this.now();
    if (!this.isPaused && this.lastRecvMs > 0) {
      const gap = recvNow - this.lastRecvMs;
      if (gap > GPS_STALL_THRESHOLD_MS) this.stalledMs += gap - GPS_STALL_THRESHOLD_MS;
    }
    this.lastRecvMs = recvNow;
    const {latitude: lat, longitude: lon, accuracy} = fix.coords;
    const acc = accuracy == null ? Infinity : accuracy;
    const f = this.kf.process(lat, lon, acc, ts);
    this.accuracyM = Number.isFinite(acc) ? Math.round(acc) : null;
    const idx = this.fixIndex;

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
        // 고도 누적은 거리 누적과 같은 '채택된 fix'에서만 — 거부된 노이즈 fix가
        // 상승분을 부풀리지 않게 한다(임계 필터는 lib/elevation가 추가로 담당).
        this.elev = feedAltitude(this.elev, fix.coords.altitude);
      } else if (idx < WARMUP_FIXES) {
        // warmup: don't count, but advance last-good so the first post-warmup
        // segment isn't a giant settling jump.
        this.lastGood = f;
        this.lastGoodMs = ts;
      }
      // other rejections preserve last-good for path continuity.
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

  getState(): RunTrackerState {
    return {
      dist: Math.round(this.dist * 100) / 100,
      elapsed: this.getElapsed(),
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
