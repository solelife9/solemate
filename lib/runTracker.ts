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
import {DistanceSmoother} from './distanceSmoother';
import {calcDist, acceptSegment, segmentSpeedMps} from './geo';
import {WARMUP_FIXES, MAX_FIX_ACCURACY_M, MAX_SEG_DIST_KM, MAX_SEG_SPEED_MPS, CURRENT_PACE_WINDOW_MS, CURRENT_PACE_MIN_DIST_KM, CURRENT_PACE_MIN_SPEED_MPS, PACE_TRACK_MIN_STEP_KM, STEP_SIGNAL_FRESH_MS, STEP_STILL_GATE_MS, STEP_GATE_MAX_SPEED_MPS, AUTO_PAUSE_STEP_STALL_MS, AUTO_PAUSE_BACKDATE_CAP_MS, AUTO_PAUSE_STEP_MAX_KALMAN_MPS, AUTO_RESUME_SPEED_MPS} from './engineConstants';
import {decideAutoPause, initAutoPauseState, AutoPauseState} from './autoPause';
import {
  feedVehicleSample,
  initVehicleState,
  isVehicleNow,
  VehicleState,
} from './vehicleDetect';
import {gpsStallStatus, GPS_STALL_THRESHOLD_MS} from './gpsHealth';
import {saveSnapshot} from './runPersistence';
import {recordError} from './crashlytics';
import {initElevState, feedAltitude, ElevState} from './elevation';
import {genRunId} from './genId';

/**
 * OS 가 **믿을 만하다고 표시한** 고도만 돌려준다(아니면 null).
 *
 * 왜 필요한가(2026-08-07 감사): 엔진은 여태 `coords.altitude` 를 그대로 먹었고
 * **수직 정확도는 한 번도 보지 않았다**(RawFix 에 필드조차 없었다). GPS 수직 오차는
 * 보통 수평의 2~3배라, 수평 5m 로 '양호' 판정을 받은 fix 의 고도가 수십 m 씩 틀린다.
 * 그 값이 상승고도·GAP(경사보정페이스)에 그대로 들어갔다.
 *
 * 판정 규칙은 **워치 Swift 와 같은 것**을 쓴다(WorkoutManager: `verticalAccuracy > 0`).
 * iOS CLLocation 규약상 음수/0 은 "이 고도는 무효"라는 뜻이고, 안드로이드도
 * 제공하지 않으면 null 이다. 폰이 워치보다 덜 조심스러웠던 것을 맞춘다.
 *
 * ⚠️ 여기서 **양수 임계값을 새로 만들지 않는다.** "정확도가 N m 보다 나쁘면 버린다"는
 * 규칙은 그럴듯하지만, 적정 N 은 실기기 원자료 없이는 정할 수 없다. 합성 모델로
 * 튜닝해 보니 현행 상승률 상한이 잡음 구간에서 **진짜 등반을 과소 보고**하는 정반대
 * 실패까지 나왔다(모델 의존적이라 채택하지 않음). 그건 실측 항목으로 남긴다.
 */
function trustedAltitude(fix: RawFix): number | null {
  const alt = fix.coords.altitude;
  if (alt == null || !Number.isFinite(alt)) return null;
  const va = fix.coords.altitudeAccuracy;
  // 필드를 안 주는 소스(구 페이로드·백그라운드 경로 일부)는 예전처럼 통과시킨다 —
  // 없다고 버리면 고도가 통째로 사라진다(회귀).
  if (va == null) return alt;
  if (!Number.isFinite(va) || va <= 0) return null;
  return alt;
}

// 스냅샷 쓰기 주기(ms) — persist() 주석 참조. 스칼라는 자주, 경로는 드물게.
// 3000: 구 인터벌과 같은 주기(복구 정확도 불변). 15000: 경로 모양의 최대 손실 구간 —
// 거리·시간은 스칼라가 3초 주기로 지키므로 이 값이 커져도 기록의 정확도는 그대로다.
/**
 * 캐시된 위치로 보고 버릴 수 있는 fix 의 **한 런당 상한**. 구독 직후 OS 가 주는
 * '마지막으로 알던 위치'는 보통 한 개라 2 면 넉넉하고, 시계 가정이 깨졌을 때
 * 거리가 통째로 멎는 것을 막는 상한이기도 하다(ingestFix 안전 밸브).
 */
const MAX_STALE_FIX_DROPS = 2;

const STATE_WRITE_MS = 3000;
/**
 * 기압계 고도를 '신선하다'고 볼 최대 지연(ms). 구독 주기가 1초라 5초면 넉넉하다.
 * 지나면 GPS 고도로 폴백한다 — 오래된 기압값을 계속 쓰면 실제 오르내림을 놓친다.
 */
const BARO_FRESH_MS = 5000;
// 스냅샷 저장 연속 실패가 이 횟수를 넘으면 '백업 안 됨'을 사용자에게 알린다. 1~2회는
// 일시적일 수 있어 즉시 경고하지 않는다(3회 ≈ 9초 이상 지속 실패).
const SNAPSHOT_FAIL_ALERT_AT = 3;
const ROUTE_WRITE_MS = 15000;

/** A raw GPS fix — the shape both expo-location's LocationObject and the old
 *  geolocation-service position share, so callers forward fixes verbatim.
 *  altitude(m) is optional — used for elevation-gain accumulation; absent/null
 *  fixes simply don't contribute to elevation. */
export interface RawFix {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude?: number | null;
    /**
     * 수직 정확도(m). OS 가 그 고도값을 얼마나 믿는지 스스로 매긴 값이다.
     * **0 이하/무한/없음 = 그 고도는 무효**라는 뜻(iOS CLLocation 규약).
     * 여태 이 필드를 읽지 않아 무효 표본이 그대로 상승고도에 들어갔다.
     */
    altitudeAccuracy?: number | null;
    speed?: number | null;
  };
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
  /**
   * 스냅샷 저장이 연속 실패 중인가(저장 공간 부족이 대표 원인).
   * true = **크래시 복구 불가 상태로 달리는 중** — 폰이 꺼지면 이 러닝은 사라진다.
   * 한 번의 실패는 일시적일 수 있어 연속 SNAPSHOT_FAIL_ALERT_AT 회부터 참이 된다.
   */
  snapshotFailing: boolean;
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
  /** 자동 일시정지 on/off(#16, 기본 true). false 면 정지해도 시간·거리 회계는 수동 조작만. */
  autoPause?: boolean;
  /** 시간 목표(분). 스냅샷에 실어 크래시 복구가 시간 목표를 보존하게 한다(#15). 기본 0. */
  goalMin?: number;
  /** 스피드 모드 km별 목표 페이스(초/km). 스냅샷 영속용(복구 시 코칭 유지). 기본 []. */
  pacePlan?: number[];
  /**
   * 실내(트레드밀) 모드 — GPS 를 아예 쓰지 않고 **CMPedometer 거리를 정본**으로 삼는다.
   * 기본 false(야외). 야외에서 만보계는 GPS 死구간 갭 필러일 뿐이지만, 실내에서는 fix 가
   * 영영 오지 않으므로 그 게이트를 통과하지 못해 거리가 0 으로 멈춰 있었다
   * (2026-07-27 출시 심사 B-13 근본 해결).
   */
  indoor?: boolean;
  shoe: {id: string; name: string};
  /** Epoch ms the run began; defaults to now(). Injectable for tests/recovery. */
  t0?: number;
  /** 누적 GPS stall ms(복구 시드/테스트용; 기본 0). elapsed 에서 빠지는 死구간 시간. */
  stalledMs?: number;
  /**
   * 死구간 중 만보계로 거리를 되찾은 시간(ms) — stalledMs 의 상쇄분. 복구 시드/테스트용.
   * stalledMs 를 이어받을 때 이것도 같이 줘야 경과 시간이 복구 직후 튀지 않는다.
   */
  pedFillMs?: number;
  /** 복구 시드 — 이동 중에만 쌓인 누적 걸음수(기본 0). 복구 런의 평균 케이던스에 쓴다. */
  movingSteps?: number;
  /** 복구 시드 — 이 러닝의 저장 id(스냅샷에서 이어받는다). 없으면 새로 만든다. */
  runId?: string;
  /** 복구 시드 — 누적 고도 상승(m). 없으면 0(예전 동작: 복구 런은 고도를 잃었다). */
  seedElevGainM?: number;
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
  private dist = 0; // km — 화면·저장에 쓰는 정본 거리(워치가 있으면 워치 값)
  /**
   * **폰이 스스로 잰 거리(km).** 워치가 기록자일 때도 계속 쌓인다 — 표시하지 않을 뿐이다.
   * 워치와 나란히 두면 폰 GPS 정확도를 실측할 수 있다(가리지 않는다).
   * 워치가 없으면 `dist` 와 같다.
   */
  private phoneDist = 0;
  // 거리 적산용 5점 중심 평활기 — 채택 좌표의 지터 톱니가 거리로 적산되는 것을
  // 소거한다(실측 +9% 과대 교정의 반쪽, 2026-07-11). dist 는 평활 폴리라인의
  // 증분으로만 늘어난다(~2 fix 지연·구간 종료 시 flush 로 무손실). pts(경로)는
  // 종전대로 원 채택 좌표 — 지도 표시는 평활 대상이 아니다.
  private smoother = new DistanceSmoother();
  private pts: {lat: number; lon: number}[] = [];
  // 스냅샷 쓰기 스로틀 타임스탬프(persist() 주석 참조). 0 = 아직 안 씀 → 첫 호출은 통과.
  private stateWrittenAt = 0;
  private snapshotFails = 0; // 연속 저장 실패 횟수(성공 시 0으로)
  private routeWrittenAt = 0;
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
  // 런 시작 이전 시각(=캐시된 위치)이라 버린 fix 수. 안전 밸브 — ingestFix 주석 참조.
  private staleDrops = 0;
  private autoAnchor: {lat: number; lon: number} | null = null;
  private autoAnchorMs = 0;
  private autoPauseState: AutoPauseState = initAutoPauseState();

  // ── 차량 감지(2026-08-10 배선) ────────────────────────────────────────────
  // 걸음 정지 게이트(아래 stillGated)는 차가 **빠를 때 일부러 풀린다** — 걸음 센서가
  // 동결된 진짜 러너의 거리를 죽이지 않으려는 안전선이다. 그 구멍이 곧 2026-08-07
  // 사고 경로였다(차 안에서 2.56km 가 쌓여 「1km 최고」를 차지). 그래서 게이트가
  // 풀린 구간을 여기서 따로 세어 두고, 저장 시점에 **묻는다**(지우지 않는다).
  private vehicleState: VehicleState = initVehicleState();

  /** OS 활동 인식 판정(1순위). 화면이 주기적으로 밀어 넣는다. null = 모름. */
  private osVehicleVerdict: boolean | null = null;

  /** 지금 이 구간이 차량으로 판정됐는가(표시용). */
  private vehicleFlag = false;
  private elev: ElevState = initElevState();
  // 걸음 정지 게이트 상태(feedSteps 가 갱신) — 걸음수가 늘지 않는 동안 거리 적산을
  // 동결해 도심 신호대기 팬텀을 차단한다. 표본이 안 오면(-1/0) 게이트는 꺼져 있다.
  private lastStepCount = -1;
  private lastStepIncreaseMs = 0;
  private lastStepSampleMs = 0;
  // 마지막 '확실한 이동' 시각(ms) — GPS 재개 임계(1.0m/s) 이상 세그먼트 or 걸음수 증가.
  // 오토포즈 소급 정산의 앵커: 감지가 늦어도 이 시점부터 일시정지로 계상한다.
  private lastDefiniteMoveMs = 0;
  // CMPedometer 거리 융합 — GPS 死구간(stall)에서만 보행거리로 유실분을 메운다(feedPedometerDistance).
  // 엔진은 stall 후 재앵커 시 공백 거리를 버리므로(팬텀 방지) 그 구간 실제 이동이 유실되는데,
  // 그 유실분만 보탠다. GPS 정상 구간엔 절대 관여하지 않아 이중계산 불가 + 순수 가산(회귀 0).
  private pedLastCumM = -1;    // 마지막 CMPedometer 누적거리(m); -1=미수신/리셋 대기
  private pedFillKm = 0;       // 융합으로 메운 누적 거리(km) — 스냅샷/검증용
  // 실내 모드: 만보계가 갭 필러가 아니라 **거리 정본**이다(GPS 미사용).
  private indoorMode = false;

  private isPaused = false;
  private autoPausedFlag = false;
  private pausedMs = 0;
  private pauseStartMs = 0;
  // GPS 死구간(stall) 누적 시간 — 임계 초과 무신호는 거리가 안 쌓이므로 elapsed 에서 뺀다
  // (백그라운드 throttle/터널에서 '거리 0 + 시간만 증가 → 페이스 왜곡' 방지). 임계(8s)까지는
  // 정상 fix 간격이라 세지 않고, 그 *초과분*만 누적해 타이머가 뒤로 튀지 않게 한다.
  /**
   * 이 러닝이 저장될 때 쓸 id. **시작할 때 한 번 정하고 끝까지 바뀌지 않는다.**
   * 저장을 멱등하게 만드는 열쇠다(스냅샷 주석 참조).
   */
  private runId = '';
  /**
   * 기압계가 보고한 최신 고도(m)와 그 시각. **GAP(경사보정페이스)의 정본**이다.
   *
   * 왜 필요한가(2026-08-07 감사): 화면의 '상승 고도'는 기압계를 쓰는데(iOS, ±0.5m)
   * GAP 시계열은 **raw GPS 고도**를 쌓고 있었다. 같은 러닝 안에서 두 개의 고도 진실이
   * 공존한 것이다. 08-05 아이폰 런의 GAP 은 1,814m 를 만든 바로 그 신호로 계산됐다.
   *
   * 기압계는 상대 고도(구독 시작 기준)를 주는데 GAP 은 **차이**만 쓰므로(경사 = Δe/Δd)
   * 절대값이 아니어도 된다 — 오히려 훨씬 매끄럽다.
   */
  private baroAltM: number | null = null;
  private baroAtMs = 0;
  /** 이동 중에만 쌓인 누적 걸음수(스냅샷 영속용 — 컨테이너가 setMeta 로 갱신). */
  private movingSteps = 0;
  private stalledMs = 0;
  /**
   * 死구간 중 **만보계로 거리를 되찾은** 시간(ms). stalledMs 에서 이만큼은 도로 인정한다.
   *
   * 왜 필요한가(2026-08-07 감사): 두 방어가 서로를 파괴하고 있었다.
   *   · stalledMs   — 무신호 구간은 거리가 안 쌓이니 시간도 빼자(페이스 왜곡 방지)
   *   · pedFillKm   — 무신호 구간의 실제 이동을 만보계로 메우자(거리 유실 방지)
   * 둘 다 옳지만 **같은 구간에 동시에 걸리면** 거리는 인정하고 시간은 삭제하게 된다.
   * 실측(엔진 직접 실행): 60초 러닝 + 5분 터널(만보계 1km) →
   *   거리 1.286km · 경과 **67초** · 페이스 **0'52"/km**.
   * PB 판정이 duration/dist 라 터널 하나가 가짜 개인 최고를 만들었다(Truth only 위반).
   *
   * 그래서 '되찾은 만큼은 진짜 러닝 시간'으로 회계한다. 이 값은 stalledMs 를 상쇄할
   * 뿐 절대 시간을 늘리지 않는다(상쇄 상한 = 死구간 총량).
   */
  private pedFillMs = 0;
  /** 마지막으로 만보계 거리를 보탠 시각(ms). 위 회계의 구간 폭을 재는 기준. */
  private pedFillAtMs = 0;

  private t0 = 0;
  private autoPauseEnabled = true;
  private goalKm = 0;
  private goalMin = 0;
  private pacePlan: number[] = [];
  private shoe: {id: string; name: string} = {id: '', name: ''};
  private cadence = 0;
  private location = '';
  // 트랙 모드 랩 상태(엔진은 계산 안 함 — 컨테이너가 setTrackMeta 로 먹인다). 스냅샷에 실어
  // 크래시 복구 시 랩수·확정랩거리·lock 을 복원한다(트랙 런이 GPS 런으로 잘못 복구되는 것 방지).
  private trackMeta: {lapM: number; lapTimes: number[]; locked: boolean} | null = null;
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

  // ── 평활 거리 적산 심 ──────────────────────────────────────────────
  // dist 는 반드시 이 두 헬퍼를 통해서만 늘어난다(평활기 증분 = 단일 소스).
  //
  // ⚠️ **워치가 기록자일 땐 `dist` 에 더하지 않는다**(2026-08-09 진짜 미러링).
  // 화면·저장 거리는 워치가 정본이다 — 두 기기가 각자 재면 본 것과 남는 것이 갈린다.
  //
  // 다만 **폰이 스스로 잰 거리는 계속 센다**(`phoneDist`). 표시하지 않을 뿐 버리지 않는다.
  // 이유: 워치를 찰 때마다 폰 값이 사라지면 **폰 GPS 가 얼마나 정확한지 영영 못 잰다.**
  // 그러면 나중에 "폰이 워치보다 3% 짧다" 같은 걸 알아내 보정할 근거 자체가 없어진다.
  // 워치는 폰 정확도를 가리는 뚜껑이 아니라, 대조할 기준선이어야 한다.
  private smoothPush(p: {lat: number; lon: number}) {
    const before = this.smoother.distKm();
    this.smoother.push(p);
    const add = this.smoother.distKm() - before;
    this.phoneDist += add;              // 항상 — 폰 자체 측정은 끊지 않는다
    if (this.watchLed()) return;
    this.dist += add;
  }

  /** 구간 경계(일시정지·재앵커·종료·권한동결): 꼬리 거리를 계상하고 체인을 끊는다. */
  private smoothFlush() {
    const before = this.smoother.distKm();
    this.smoother.flush();
    const add = this.smoother.distKm() - before;
    this.phoneDist += add;
    if (this.watchLed()) return;
    this.dist += add;
  }

  /** Begin a fresh run, clearing all engine state. */
  start(config: RunTrackerConfig) {
    this.kf.reset();
    this.dist = 0;
    this.phoneDist = 0;
    // 워치 미러링 상태 — 새 런에서 반드시 지운다. 안 지우면 직전 러닝의 누적 거리가
    // 남아 "워치 값이 현재보다 크면 채택" 규칙에 걸려 **새 런이 지난 거리에서 시작**한다.
    this.watchKm = 0;
    this.watchAtMs = 0;
    this.smoother = new DistanceSmoother();
    this.pts = [];
    this.stateWrittenAt = 0;   // 새 런 = 첫 저장 즉시(스로틀 리셋)
    this.snapshotFails = 0;
    this.routeWrittenAt = 0;
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
    this.staleDrops = 0;
    this.autoAnchor = null;
    this.autoAnchorMs = 0;
    this.autoPauseState = initAutoPauseState();
    this.vehicleState = initVehicleState();
    this.osVehicleVerdict = null;
    this.vehicleFlag = false;
    this.elev = initElevState();
    this.lastStepCount = -1;
    this.lastStepIncreaseMs = 0;
    this.lastStepSampleMs = 0;
    this.pedLastCumM = -1;
    this.pedFillKm = 0;
    // 크래시 복구 시드 — stalledMs 를 이어받으면 그 상쇄분도 같이 이어받아야
    // 복구 직후 경과 시간이 갑자기 줄지 않는다(구 스냅샷엔 없으므로 기본 0).
    this.pedFillMs = config.pedFillMs ?? 0;
    this.pedFillAtMs = 0;
    this.baroAltM = null;
    this.baroAtMs = 0;
    this.movingSteps = config.movingSteps ?? 0;
    // 복구면 스냅샷의 id 를 이어받는다 — 그래야 '이어 달리기' 저장이 원래 런과 같은 줄이 된다.
    this.runId = config.runId || genRunId(this.now());
    this.isPaused = false;
    this.autoPausedFlag = false;
    this.pausedMs = 0;
    this.pauseStartMs = 0;
    this.stalledMs = config.stalledMs ?? 0;
    this.indoorMode = !!config.indoor;
    this.t0 = config.t0 ?? this.now();
    this.autoPauseEnabled = config.autoPause ?? true;
    this.goalKm = config.goalKm;
    this.goalMin = config.goalMin ?? 0;
    this.pacePlan = (config.pacePlan ?? []).slice();
    this.shoe = config.shoe;
    this.cadence = 0;
    this.location = '';
    this.trackMeta = null;
    this.accuracyM = null;
    this.permissionRevoked = false;
    this.frozenElapsed = null;
    this.active = true;
    this.firstFixEmitted = false;

    // ── 크래시 복구 '이어 달리기' 시드 ──────────────────────────────────
    // seed* 가 없으면(일반 시작) 위 초기화 그대로 — fresh-run 경로는 바이트 동일하다.
    if (config.seedDist && config.seedDist > 0) this.dist = config.seedDist;
    // 고도도 잇는다 — 거리·시간만 잇고 고도를 0 으로 두면 복구 런의 상승분이 사라진다.
    if (config.seedElevGainM && config.seedElevGainM > 0) {
      this.elev = {...this.elev, gain: config.seedElevGainM};
    }
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
    if (this.active) {
      this.smoothFlush(); // 평활 꼬리(마지막 ~2 fix) 거리 계상 — 유실 금지
      // 정지 = 분기점: 스로틀을 무시하고 경로까지 즉시 확정한다. 여기서 안 쓰면 마지막
      // 최대 15초 구간의 경로 모양이 크래시 시 유실될 수 있다(거리·시간은 무관).
      this.persist({force: true});
    }
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
  /**
   * 기압계 고도 표본을 먹인다(iOS 컨테이너가 구독해서 전달). GAP 시계열이 이 값을
   * 우선 쓴다 — 화면의 상승 고도와 **같은 소스**여야 한다.
   */
  feedBaroAltitude(relativeM: number, atMs?: number) {
    if (!Number.isFinite(relativeM)) return;
    this.baroAltM = relativeM;
    this.baroAtMs = atMs ?? this.now();
  }

  /** 지금 쓸 만큼 신선한 기압계 고도(없으면 null). */
  private freshBaroAlt(atMs: number): number | null {
    if (this.baroAltM == null) return null;
    return atMs - this.baroAtMs <= BARO_FRESH_MS ? this.baroAltM : null;
  }

  /** 이 러닝의 저장 id(시작 시 확정). 저장 경로가 멱등하려면 이 값을 써야 한다. */
  getRunId(): string {
    return this.runId;
  }

  setMeta(meta: {cadence?: number; location?: string; movingSteps?: number}) {
    if (typeof meta.cadence === 'number') this.cadence = meta.cadence;
    if (typeof meta.location === 'string') this.location = meta.location;
    // 이동 중에만 쌓인 걸음수 — 스냅샷에 실어 복구 런의 케이던스가 이어지게 한다.
    if (typeof meta.movingSteps === 'number' && meta.movingSteps >= 0) {
      this.movingSteps = Math.floor(meta.movingSteps);
    }
  }

  /** 트랙 랩 상태를 엔진에 실어 스냅샷에 영속되게 한다(컨테이너가 랩 변화 시 호출). null=비트랙. */
  setTrackMeta(t: {lapM: number; lapTimes: number[]; locked: boolean} | null) {
    this.trackMeta = t ? {lapM: t.lapM, lapTimes: t.lapTimes.slice(), locked: t.locked} : null;
  }

  // ── pause control ─────────────────────────────────────────────────
  private enterPause(auto: boolean) {
    if (this.isPaused) return;
    // 일시정지 = 구간 종료: 평활 버퍼의 꼬리(직전 ~2 fix 거리)를 지금 계상한다.
    // 재개 시 lastGood=null 규약과 짝 — 정지 전/후 구간은 잇지 않는다.
    this.smoothFlush();
    this.isPaused = true;
    this.autoPausedFlag = auto;
    this.pauseStartMs = this.now();
    // 소급 정산(2026-07-18): 오토포즈는 감지가 판정 홀드+지터만큼 늦는다 — 일시정지 시작을
    // '마지막 확실한 이동' 시점으로 되돌려 그 지연이 경과시간에 쌓이지 않게 한다(상한 10s —
    // 스톨 차감·이전 구간과의 이중 차감 방지). 수동 일시정지는 누른 순간 그대로.
    if (auto && this.lastDefiniteMoveMs > 0) {
      const floorMs = this.pauseStartMs - AUTO_PAUSE_BACKDATE_CAP_MS;
      const anchor = Math.max(floorMs, this.lastDefiniteMoveMs);
      if (anchor < this.pauseStartMs) this.pauseStartMs = anchor;
    }
    // 일시정지 = 분기점(사용자가 앱을 내리거나 종료할 확률이 가장 높은 순간) —
    // 스로틀을 무시하고 경로까지 즉시 확정한다.
    this.persist({force: true});
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
    // C1: 재개 시 앵커를 비운다 — 일시정지 중 주자가 이동(오토포즈 후 걸어감/신호대기 이탈)했다면
    // pre-pause 위치에서 재개 위치까지 거리가 첫 fix 에서 유령으로 합산되기 때문. 비우면 재개 첫
    // fix 가 새 앵커가 되어 그 공백 구간 거리를 계상하지 않는다(start/권한재개와 동일 규약).
    this.lastGood = null;
    // 재개 시각을 마지막 수신 시각으로 리셋한다(권한재개 경로와 동일 규약). 일시정지 동안
    // fix 가 없었으면 lastRecvMs 는 일시정지 이전을 가리켜, getElapsed 의 ongoingStallMs 가
    // 그 공백을 '진행 중 死구간'으로 다시 빼버린다 — pausedMs 로 이미 뺀 창을 이중 차감해
    // 경과시간이 0 으로 붕괴하고, 재개 직후 정지·저장 시 저장 시간까지 과소. now 로 리셋해
    // 재개 직후 gap 을 stall 로 오판하지 않게 한다(다음 fix 까지 매끄럽게 흐름).
    this.lastRecvMs = this.now();
    // 현재-페이스 윈도우 비움 — 일시정지 공백을 가로질러 페이스를 계산해 거짓으로 느려지는
    // 것을 막는다. 재개 후 새 샘플로 윈도우를 다시 채운다(그동안은 '--').
    this.paceSamples = [];
    this.lastSpeedMps = null;
    this.lastDefiniteMoveMs = this.now(); // 재개 시점 = 새 이동 앵커(소급 하한)
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
    this.smoothFlush(); // 동결 전 평활 꼬리 거리 계상(재허용 재개 시 유실 방지)
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

    // ── 캐시된 위치 차단 (2026-08-10 실기기) ──────────────────────────────────
    // OS 는 위치 추적을 켜는 순간 **마지막으로 알던 위치를 즉시 하나 준다.** 위성을 새로
    // 잡은 값이 아니라 몇 분 전 좌표일 수 있다. 그걸 그대로 받으면 그 점이 경로의 0번이
    // 되어, 지도가 **사용자가 있지도 않았던 곳에서 시작**한다.
    //
    // 민우님 실측(2026-08-10): 엘에스로에서 러닝을 시작했는데 지도는 회사 입구에서
    // 시작했다. 그 사이 거리가 통째로 경로에 그려졌다.
    //
    // 판정은 추측이 아니라 정의로 한다 — **런이 시작되기 전 시각의 위치는 이 런의 것이
    // 아니다.** t0 는 start() 시점(복구면 원래 런의 시작)이라 이 비교가 정확하다.
    //
    // ⚠️ '도착했을 때 몇 초 지났는가'로 재지 않는다. 백그라운드 배달은 여러 fix 를 묶어
    // 늦게 주므로, 나이로 자르면 **주머니 러닝에서 정상 fix 를 버려 거리가 멎는다**
    // (이 저장소가 예전에 겪은 사고다 — GPS background-tracking fix).
    //
    // 🔒 안전 밸브: **한 런에서 최대 MAX_STALE_FIX_DROPS 개만** 버린다. 이 게이트는 두
    // 시계(fix 시각 · 앱 시각)가 같은 기준이라는 가정 위에 서 있는데, 어떤 기기·경로에서
    // 그 가정이 깨지면 게이트가 **모든 fix 를 버려 거리가 영영 0** 이 된다. 잘못된 시작점
    // 하나보다 러닝 전체를 잃는 쪽이 비교할 수 없이 나쁘다(Iron Law — 거리 유실 금지).
    // 캐시 위치는 구독 직후 한 개가 오는 게 보통이라 상한이 낮아도 실효가 있고, 상한을
    // 넘긴 뒤에도 워밍업(WARMUP_FIXES)이 거리는 계속 지킨다.
    if (ts > 0 && this.t0 > 0 && ts < this.t0 && this.staleDrops < MAX_STALE_FIX_DROPS) {
      this.staleDrops++;
      return;
    }

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

    // 걸음 정지 게이트: 걸음 표본이 신선한데 걸음수 증가가 임계 이상 없으면 '서 있음' —
    // 이 fix 는 거리로 계상하지 않는다(앵커 보존 = 재출발 시 이동분 합산, 무손실 유예).
    // 칼만 속도 ≥ 상한이면 게이트 해제(자전거/센서 동결 시 거리 유실 방지 안전선).
    const stillGated =
      this.lastStepSampleMs > 0 &&
      recvNow - this.lastStepSampleMs <= STEP_SIGNAL_FRESH_MS &&
      recvNow - this.lastStepIncreaseMs >= STEP_STILL_GATE_MS &&
      (this.kf.speedMps() ?? Infinity) < STEP_GATE_MAX_SPEED_MPS;

    // 死구간 시간 회계(#3): 이 fix 가 거리로 *채택*될지 미리 판정한다. 채택되면 그 공백 시간은
    // 실제 러닝 시간이므로 stall 로 빼지 않는다(거리·시간 일관). 채택 안 되는(死구간/노이즈/
    // 공백 re-anchor/일시정지) 임계 초과 공백만 stalledMs 로 적립해 getElapsed 에서 빼, '거리는
    // 그대로인데 시간만 흘러' 생기는 페이스 왜곡을 막는다. 적립은 auto-pause/일시정지 early-return
    // 보다 *앞*에 둬야 한다 — 이 fix 가 정지를 유발해도 직전 공백 시간은 빠져야 하기 때문(옛 동작).
    const willCount =
      !this.isPaused &&
      !stillGated &&
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
      this.autoPauseEnabled &&
      idx >= WARMUP_FIXES &&
      this.autoAnchor &&
      (!this.isPaused || this.autoPausedFlag)
    ) {
      const moved = calcDist(this.autoAnchor.lat, this.autoAnchor.lon, f.lat, f.lon);
      const dtA = Math.max((ts - this.autoAnchorMs) / 1000, 0);
      if (dtA > 0) {
        // 걸음 보조(2026-07-18 비교런 근본수정): 제자리 GPS 지터(0.6~1.5m/s 유령 속도)가
        // slowSec 카운터를 리셋시켜 신호대기 감지가 5~6초씩 늦던 것 — 걸음수가
        // AUTO_PAUSE_STEP_STALL_MS 이상 안 늘면(표본 신선) 속도 0 취급해 판정을 지터에서
        // 분리한다. 걸음 표본이 없으면(권한 거부 등) 기존 GPS 판정 그대로.
        const stepsFreshAP = this.lastStepSampleMs > 0 && ts - this.lastStepSampleMs <= STEP_SIGNAL_FRESH_MS;
        const rawSpd = segmentSpeedMps(moved, dtA);
        // 안전선(거리 게이트와 동일 원칙·동일 신호): **칼만 평활 속도**가 러닝급(≥
        // STEP_GATE_MAX_SPEED_MPS)이면 걸음 보조를 끈다 — 걸음 센서가 동결된 채 진짜
        // 달리는 러너를 오토포즈로 죽이는 사고 방지(하네스 안전선 테스트가 잡은 회귀).
        // 원시 세그먼트 속도는 노이즈로 러닝 중에도 2.5 아래로 출렁여 안전선으로 못 쓴다.
        const stepStalledAP = stepsFreshAP
          && ts - this.lastStepIncreaseMs >= AUTO_PAUSE_STEP_STALL_MS
          && (this.kf.speedMps() ?? Infinity) < AUTO_PAUSE_STEP_MAX_KALMAN_MPS;
        const effSpd = stepStalledAP ? 0 : rawSpd;
        if (effSpd >= AUTO_RESUME_SPEED_MPS) this.lastDefiniteMoveMs = ts;
        const decision = decideAutoPause(this.autoPauseState, effSpd, dtA);
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

    // 이 fix 가 실제로 더한 거리/시간을 재기 위한 기준점(차량 감지에 넘긴다).
    const distBefore = this.dist;
    const vehDtMs = this.lastGoodMs ? Math.max(0, ts - this.lastGoodMs) : 0;

    if (this.lastGood) {
      const d = calcDist(this.lastGood.lat, this.lastGood.lon, f.lat, f.lon);
      const dtSec = this.lastGoodMs ? Math.max((ts - this.lastGoodMs) / 1000, 0) : 0;
      if (!stillGated && acceptSegment({distKm: d, dtSec, accuracyM: acc, fixIndex: idx})) {
        this.smoothPush(f); // dist 는 평활 폴리라인 증분으로 늘어난다(직결 d 적산 금지)
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
          // **기압계만 쓴다** — 화면의 상승 고도와 같은 소스여야 한 러닝 안에 두 개의
          // 고도 진실이 생기지 않는다(2026-08-07 감사).
          //
          // 2026-08-10 실기기에서 그 두 진실이 실제로 드러났다: 상승 고도는 `--`(기압계
          // 없음)인데 같은 화면이 "오르막 코스 — 평지였다면 2'39\"" 라고 단정했다. GPS
          // 고도 폴백이 여기만 남아 있었기 때문이다(63de810 이 상승 고도 쪽 폴백만 폐지).
          //
          // 190m 걷는 동안 GPS 고도는 ±5~10m 흔들린다 — 가짜 언덕을 만들기에 충분하다.
          // 모르는 것은 만들지 않는다: 기압계가 없으면 GAP 도 없다(카드가 조용히 빠진다).
          const alt = this.freshBaroAlt(ts);
          if (alt != null) {
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
        // ⚠️ **ts 를 반드시 넘긴다.** 없으면 lib/elevation 의 상승률 상한이 통째로 잠들어
        // 임계 히스테리시스만 남는다 — 1Hz 잡음이 임계 근처에서 진동하면 올라갈 때마다
        // 적립되고 내려갈 때는 기준만 낮아진다(2026-08-05 실측: 아이폰 5km 에 1,814m).
        // 아래 두 호출도 같은 이유로 ts 를 넘긴다.
        this.elev = feedAltitude(this.elev, trustedAltitude(fix), ts);
      } else if (idx < WARMUP_FIXES) {
        // warmup: don't count, but advance last-good so the first post-warmup
        // segment isn't a giant settling jump.
        this.smoothFlush(); // 워밍업 이동은 미계상 — 평활 체인도 새 앵커에서 시작
        this.smoothPush(f);
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
        this.smoothFlush(); // 공백 구간 미계상 — 평활 체인 리셋 후 새 앵커부터
        this.smoothPush(f);
        this.lastGood = f;
        this.lastGoodMs = ts;
        this.pts.push(f);
        this.elev = feedAltitude(this.elev, trustedAltitude(fix), ts);
      }
      // 그 외 거부(정확도/노이즈/속도)는 last-good 보존 — 노이즈 fix 를 건너뛰고 다음 양호
      // fix 와 직접 잇기 위함(짧은 노이즈는 cap 미만이라 위 re-anchor 분기에 안 들어온다).
    } else {
      // 새 앵커(런 시작·일시정지 해제·권한 재개): 이전 구간과 잇지 않는다.
      this.smoothFlush();
      this.smoothPush(f);
      this.lastGood = f;
      this.lastGoodMs = ts;
      this.pts.push(f);
      // 첫 채택 지점의 고도를 기준으로 설정(누적 0에서 시작).
      this.elev = feedAltitude(this.elev, trustedAltitude(fix), ts);
    }

    // ── 차량 감지: 이 fix 가 더한 거리/시간을 먹인다 ──────────────────────────
    // **1순위는 OS 활동 인식**(CLAUDE.md '업계 표준 정석') — `isVehicleNow` 가 순서를
    // 소유하므로 여기서 다시 쓰지 않는다. 걸음 신호는 걸음 게이트와 같은 소스를 쓴다.
    {
      const vres = feedVehicleSample(this.vehicleState, {
        nowMs: recvNow,
        speedMps: this.kf.speedMps(),
        // 걸음 표본이 아예 없으면(권한 거부·센서 없음) 가를 근거가 없다 — 그 경우
        // 아래 stepsFresh 가 false 라 feedVehicleSample 이 판정을 접는다.
        // (feedSteps 는 첫 표본에서 두 시각을 함께 세우므로 둘은 항상 같이 산다.)
        msSinceStepIncrease: recvNow - this.lastStepIncreaseMs,
        stepsFresh:
          this.lastStepSampleMs > 0 && recvNow - this.lastStepSampleMs <= STEP_SIGNAL_FRESH_MS,
        segKm: Math.max(0, this.dist - distBefore),
        segMs: vehDtMs,
      });
      this.vehicleState = vres.state;
      this.vehicleFlag = isVehicleNow(this.osVehicleVerdict, vres.isVehicle);
    }

    this.persist();
    this.emitState();
  }

  /**
   * OS 활동 인식 판정을 밀어 넣는다(1순위). 화면이 주기적으로 부른다.
   * true=차량 · false=사람 · null=모름(백스톱 휴리스틱에 맡긴다).
   */
  setOsActivityVerdict(v: boolean | null) {
    this.osVehicleVerdict = v === true || v === false ? v : null;
  }

  /** 저장 시점 판정용 누적 상태. */
  getVehicleState(): VehicleState {
    return {...this.vehicleState};
  }

  /** 지금 차량 구간으로 보이는가(표시용). */
  vehicleFlagged(): boolean {
    return this.vehicleFlag;
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
    // 실내에는 GPS 가 없으므로 死구간 개념도 없다 — 시간이 그대로 흘러야 한다.
    // (실내에선 lastRecvMs 가 0 이라 아래 식도 0 이 되지만, 의도를 코드로 못 박는다.)
    const ongoingStallMs =
      !this.indoorMode && !this.isPaused && this.lastRecvMs > 0
        ? Math.max(0, now - this.lastRecvMs - GPS_STALL_THRESHOLD_MS)
        : 0;
    // 死구간 총량에서 **만보계로 거리를 되찾은 시간만큼은 도로 인정한다.**
    // 그 구간의 이동은 dist 에 이미 들어가 있으므로, 시간까지 빼면 거리와 시간의
    // 짝이 깨져 페이스가 폭주한다(pedFillMs 주석의 0'52"/km 실측). 상쇄는 死구간
    // 총량을 넘지 않는다 — 이 회계가 시간을 늘리는 일은 절대 없다.
    const rawStallMs = this.stalledMs + ongoingStallMs;
    const netStallMs = Math.max(0, rawStallMs - this.pedFillMs);
    return Math.max(0, Math.floor((now - this.t0 - curPausedMs - netStallMs) / 1000));
  }

  isStalled(): boolean {
    if (this.indoorMode) return false; // 실내엔 GPS 가 없다 — 死구간 경고를 띄우면 안 된다
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
      snapshotFailing: this.snapshotFails >= SNAPSHOT_FAIL_ALERT_AT,
      paused: this.isPaused,
      autoPaused: this.autoPausedFlag,
      accuracyM: this.accuracyM,
      stalled: this.isStalled(),
      permissionRevoked: this.permissionRevoked,
      elevGainM: Math.round(this.elev.gain),
    };
  }

  // ── 폰+워치 동시 러닝 = **진짜 미러링** (2026-08-09) ─────────────────────
  //
  // 예전엔 폰으로 시작해도 워치가 **자기 워크아웃을 독립적으로** 돌렸다. 미러링이 아니라
  // 두 기기가 각자 잰 것이다. 그 결과:
  //   · 러닝 중 두 화면이 **다른 숫자**를 보여준다(실측 폰 5.14 / 워치 5.358)
  //   · 종료 시 병합에서 워치 값이 이겨 **본 것과 남는 것이 달라진다**(조용히 바뀐다)
  //
  // 업계는 **기록자를 시작할 때 하나로 정한다** — 애플은 아이폰에 러닝 기록 자체가 없고
  // (워치 전용), 가민도 시계가 기록자다. 스트라바는 겹치는 활동이 오면 병합이 아니라
  // 거부한다. 두 기록자를 두고 사후에 필드별로 합치는 앱은 확인된 게 없다.
  //
  // 그래서 워치가 붙어 있으면 **워치가 기록자**다. 폰은 워치가 보내는 거리를 그대로
  // 표시하고 저장한다 → 두 화면이 같아지고, 저장하면서 숫자가 바뀌지 않는다.
  // (경로 지도·고도·케이던스는 폰이 계속 잰다 — 워치가 안 주는 것들이다.)

  /** 워치가 마지막으로 알려 준 거리(km). 0 = 아직 없음. */
  private watchKm = 0;
  /** 그 값이 도착한 시각(ms). 0 = 아직 없음. */
  private watchAtMs = 0;

  /**
   * 워치 거리가 이 시간(ms) 넘게 안 오면 **폰이 기록자로 돌아온다.**
   * 워치가 꺼지거나 멀어지면 거리가 그 자리에 얼어붙는데, 그건 데이터 유실이다.
   * HK 컬렉션 콜백은 보통 수 초 간격이라 20초면 넉넉하고, 얼어붙는 시간도 짧다.
   */
  private static readonly WATCH_STALE_MS = 20000;

  /** 지금 워치가 기록자인가(최근 표본이 살아 있는가). */
  private watchLed(): boolean {
    return this.watchAtMs > 0 && this.now() - this.watchAtMs < RunTracker.WATCH_STALE_MS;
  }

  /**
   * 워치가 잰 **누적 거리**(km)를 먹인다. 워치 워크아웃이 도는 동안 주기적으로 들어온다.
   *
   * 지키는 선:
   *  · **줄지 않는다.** 워치 값이 현재보다 작으면 무시한다(워치가 늦게 시작했거나 표본이
   *    튄 경우). 화면의 거리가 뒤로 가면 사용자는 기록이 사라졌다고 읽는다 — Iron Law.
   *  · 정지·일시정지 중에는 받지 않는다(그 구간은 어느 기기든 거리가 늘면 안 된다).
   *  · 비유한·음수는 버린다.
   *  · 워치가 끊기면 WATCH_STALE_MS 뒤 폰이 이어받는다 — **현재 거리에서 이어서** 쌓으므로
   *    되돌아가지도, 건너뛰지도 않는다(평활기 증분 방식이라 그 지점부터 더해진다).
   */
  feedWatchDistance(km: number, atMs?: number) {
    if (!this.active || this.pausedFlag()) return;
    if (!Number.isFinite(km) || km <= 0) return;
    const now = atMs ?? this.now();
    this.watchAtMs = now;           // 값을 안 쓰더라도 '워치가 살아 있다'는 사실은 갱신한다
    if (km <= this.watchKm) return; // 워치 누적은 단조 — 역행 표본은 버린다
    this.watchKm = km;
    if (km > this.dist) this.dist = km;  // 절대 줄이지 않는다
  }

  /**
   * 폰이 스스로 잰 거리(km) — 워치가 기록자여도 계속 쌓인다.
   * 워치 값(getDistanceKm)과 대조하면 폰 GPS 정확도를 잴 수 있다.
   */
  getPhoneDistanceKm(): number {
    return this.phoneDist;
  }

  /** 지금 거리의 출처 — 화면이 '워치로 측정 중'을 알릴 수 있게. */
  getDistanceSource(): 'watch' | 'phone' {
    return this.watchLed() ? 'watch' : 'phone';
  }

  getDistanceKm(): number {
    return this.dist;
  }

  /** 누적 고도 상승(m, 정수) — 완주 화면 최종값으로 읽는다. */
  getElevationGain(): number {
    return Math.round(this.elev.gain);
  }

  /**
   * 경로 스냅샷(**복사본**). 내부 배열을 그대로 주면 소비자가 변화를 관측하지 못한다 —
   * 엔진은 push 로 제자리 변형하므로 참조가 늘 같고, React 는 `Object.is` 로 같다고 보아
   * 리렌더를 건너뛴다(그 상태로 memo 를 붙이면 지도가 영영 멈춘다).
   * 복사 비용이 있으니 **매 fix 마다 부르지 말 것** — 경로가 실제로 화면에 필요한 순간
   * (일시정지 지도·완주 저장)에만 호출한다. 러닝 중 진행 표시는 거리/시간 스칼라로 충분하다.
   */
  getPoints(): {lat: number; lon: number}[] {
    return this.pts.slice();
  }

  /** 경로점 개수 — 배열 복사 없이 '새 점이 생겼나'만 알고 싶을 때(트랙 자동랩 등). */
  getPointCount(): number {
    return this.pts.length;
  }

  /** 경로 첫 점 사본(없으면 null) — 트랙 자동랩의 출발 앵커. */
  getFirstPoint(): {lat: number; lon: number} | null {
    const p = this.pts[0];
    return p ? {lat: p.lat, lon: p.lon} : null;
  }

  /** 경로 마지막 점 사본(없으면 null) — '지금 출발점 반경 안인가' 판정용. */
  getLastPoint(): {lat: number; lon: number} | null {
    const p = this.pts[this.pts.length - 1];
    return p ? {lat: p.lat, lon: p.lon} : null;
  }

  /** 곡선 전용 (누적거리 km, 경과시간 sec) 시계열. 완주 시 영속해 고운 페이스 곡선을 만든다. */
  getPaceTrack(): {d: number; t: number}[] {
    return this.paceTrack;
  }

  /**
   * OS 걸음 센서의 '누적 걸음수' 표본을 먹인다(App 이 5s 폴링으로 호출 — 일시정지 중에도).
   * 걸음수가 STEP_STILL_GATE_MS 이상 늘지 않으면(표본은 신선한데) '서 있음'으로 보고
   * ingestFix 가 거리 적산을 동결한다 — 도심 신호대기 팬텀 차단(2026-07-11).
   * 리셋(누적 감소)은 새 기준으로 재시작. 비정상 입력은 무시(게이트는 꺼진 채 유지).
   */
  feedSteps(cumulativeSteps: number, atMs?: number) {
    if (!Number.isFinite(cumulativeSteps) || cumulativeSteps < 0) return;
    const t = atMs ?? this.now();
    if (this.lastStepCount < 0 || cumulativeSteps < this.lastStepCount) {
      // 첫 표본/센서 리셋: 이 표본을 새 기준으로 — 증가 시각도 지금으로(시작 직후 오게이트 금지).
      this.lastStepCount = cumulativeSteps;
      this.lastStepIncreaseMs = t;
      this.lastStepSampleMs = t;
      return;
    }
    if (cumulativeSteps > this.lastStepCount) {
      this.lastStepIncreaseMs = t;
      this.lastDefiniteMoveMs = Math.max(this.lastDefiniteMoveMs, t);
    }
    this.lastStepCount = cumulativeSteps;
    this.lastStepSampleMs = t;
  }

  /**
   * CMPedometer 의 '누적 이동거리(m)' 표본을 먹인다(App 이 러닝 중 구독 — GPS 와 병행).
   * 코어 원칙: **GPS 가 정본**이고, CMPedometer 는 GPS 死구간(stall)에서만 거리를 보탠다.
   * 엔진은 stall 후 재앵커 시 공백 구간 거리를 버리므로(팬텀 방지) 그 구간의 실제 이동은
   * 현재 유실된다 — 그 유실분만 보행거리로 메운다. GPS 가 살아있는 구간엔 절대 더하지
   * 않아 이중계산이 원천 불가능하고, 순수 가산이라 GPS 경로 회귀가 0이다.
   * 관여하지 않는 경우(전부 무시): 첫 GPS fix 이전 · 정지/일시정지 · GPS 정상(비stall) ·
   * 첫 표본/센서 리셋(기준만 갱신). Iron Law: dist 는 단조 증가만(음수·유실 없음).
   */
  feedPedometerDistance(cumulativeMeters: number, atMs?: number) {
    if (!Number.isFinite(cumulativeMeters) || cumulativeMeters < 0) return;
    const now = atMs ?? this.now();
    // 첫 표본/센서 리셋(누적 감소): 기준만 잡고 이번엔 더하지 않는다.
    if (this.pedLastCumM < 0 || cumulativeMeters < this.pedLastCumM) {
      this.pedLastCumM = cumulativeMeters;
      return;
    }
    const deltaM = cumulativeMeters - this.pedLastCumM;
    this.pedLastCumM = cumulativeMeters; // 정지 중 델타도 흡수(재개 시 catch-up 점프 방지)
    if (deltaM <= 0) return;
    // ── 실내(트레드밀): 만보계가 거리 정본 ────────────────────────────────────
    // GPS 를 켜지 않으므로 firstFix 도 死구간 판정도 존재하지 않는다. 델타를 그대로 쌓는다.
    // 이중계산 위험도 없다 — 실내에선 GPS 적산 경로 자체가 돌지 않는다.
    if (this.indoorMode) {
      if (!this.active || this.pausedFlag()) return;
      const addKmIndoor = deltaM / 1000;
      this.dist += addKmIndoor;
      this.pedFillKm += addKmIndoor;
      return;
    }
    // 첫 GPS fix 이전엔 융합하지 않는다(콜드스타트 대체가 아니라 死구간 갭 필러).
    if (!this.firstFixEmitted || !this.active || this.pausedFlag()) return;
    // GPS 死구간일 때만 보탠다 — 정상 구간은 GPS(스무더)가 이미 적산 중이라 손대면 이중계산.
    const gpsStalled = now - this.lastRecvMs > GPS_STALL_THRESHOLD_MS;
    if (!gpsStalled) {
      // 정상 구간에서도 기준 시각은 따라간다 — 死구간에 처음 진입했을 때 그 이전
      // 시간까지 통째로 '되찾은 시간'으로 세지 않기 위해서다.
      this.pedFillAtMs = now;
      return;
    }
    const addKm = deltaM / 1000;
    this.dist += addKm;
    this.pedFillKm += addKm;
    // ── 되찾은 거리에는 되찾은 시간이 따라붙는다 ────────────────────────────
    // 이 구간의 이동을 거리로 인정했으면 그 시간도 러닝 시간이다. 인정하지 않으면
    // '거리는 있는데 시간이 없는' 구간이 생겨 페이스가 폭주한다(위 필드 주석 참조).
    // 폭은 직전 만보계 표본과의 간격 — 표본 주기(2.5s)만큼씩 촘촘히 되돌려준다.
    if (this.pedFillAtMs > 0) this.pedFillMs += Math.max(0, now - this.pedFillAtMs);
    this.pedFillAtMs = now;
  }

  /** 융합(死구간 보행거리)으로 메운 누적 거리(km) — 검증·디버그용(총 거리 중 CMP 기여분). */
  getPedometerFillKm(): number {
    return this.pedFillKm;
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

  /**
   * 이 러닝이 **시작된** 시각(epoch ms). 0 = 아직 시작한 적 없음.
   *
   * 저장 날짜를 여기서 뽑는다(2026-08-04 QA 감사 Q-6): 예전엔 저장하는 순간의 날짜를
   * 썼다 — 23:30 에 출발해 00:20 에 끝낸 러닝이 **다음 날 기록**이 됐고, 스트릭·주간 목표·
   * 리마인더(`ranToday`)가 하루씩 어긋났다. 업계 관례(Strava·NRC·가민)도, 이 앱의 워치 런
   * 경로도 이미 시작 시각 기준이다 — 같은 앱 안에서 두 규칙이 공존하고 있었다.
   */
  getStartMs(): number {
    return this.t0;
  }

  // ── persistence ───────────────────────────────────────────────────
  /**
   * 크래시 복구용 스냅샷 저장. **호출은 잦지만 실제 쓰기는 스스로 조절한다.**
   *
   * 이전: ingestFix() 끝(≈1Hz)과 3초 인터벌이 각각 무조건 전량 저장을 트리거해, 초당
   * 1회 이상 `pts` 전체를 복제(map) → 다시 복제(sanitizePoints) → JSON 직렬화 → 디스크
   * 기록했다. 비용이 러닝 길이에 비례해 커져(60분이면 한 번에 수천 개 할당) JS 스레드에
   * 주기적 스톨을 만들었다 — 같은 스레드가 1초 타이머·GPS 콜백·지도·롱프레스 타이머를
   * 돌린다.
   *
   * 지금: 두 축으로 나눈다.
   *   · 스칼라(거리·경과·일시정지·목표·랩) = 작고 상수 크기 → STATE_MS 마다.
   *   · 경로(pts) = 길이에 비례해 커짐 → ROUTE_MS 마다, 또는 force.
   * 크래시 시 최대 손실은 **경로 모양 15초분**뿐이고 거리·시간은 스칼라가 지킨다.
   * 정지·일시정지 같은 분기점에서는 force 로 즉시 확정한다.
   */
  persist(opts?: {force?: boolean}) {
    // 정지된 엔진은 스냅샷을 쓰지 않는다(2026-08-04 QA 감사 Q-1 동반 수정).
    // stop() 은 active 를 내리기 *전에* 마지막 저장을 하므로 정상 경로는 영향이 없다.
    // 막는 것은 이 경로다: 러닝이 끝난 뒤(또는 권한 거부로 시작조차 못 한 채) 화면이
    // togglePause() 를 부르면 enterPause 가 persist 를 탄다 — 그러면 **이미 저장이 끝난
    // 직전 러닝**(혹은 t0=0 인 빈 상태)이 스냅샷으로 되살아나, 다음 실행에서 "완료하지
    // 않은 러닝이 있어요"로 떠 같은 기록을 한 번 더 저장할 수 있게 된다.
    if (!this.active) return;
    const force = !!opts?.force;
    const now = this.now();
    // 스칼라 쓰기 스로틀 — 1Hz fix 와 3초 인터벌이 겹쳐 들어와도 실제 기록은 이 주기.
    // 첫 저장(stateWrittenAt===0)은 스로틀하지 않는다 — 러닝이 시작되자마자 복구 가능한
    // 스냅샷이 존재해야 한다(시작 직후 크래시가 가장 위험한 구간이다).
    if (!force && this.stateWrittenAt > 0 && now - this.stateWrittenAt < STATE_WRITE_MS) return;
    const withRoute = force || now - this.routeWrittenAt >= ROUTE_WRITE_MS;
    this.stateWrittenAt = now;
    if (withRoute) this.routeWrittenAt = now;
    void saveSnapshot({
      dist: this.dist,
      elapsed: this.getElapsed(),
      // 복제하지 않는다 — saveSnapshot 이 경로를 실제로 쓸 때만 한 번 살균 복사한다.
      pts: this.pts,
      pausedMs: this.pausedMs,
      t0: this.t0,
      shoe: {id: this.shoe.id, name: this.shoe.name},
      goalKm: this.goalKm,
      goalMin: this.goalMin,
      pacePlan: this.pacePlan,
      cadence: this.cadence,
      movingSteps: this.movingSteps,
      runId: this.runId,
      elevGainM: this.elev.gain,
      location: this.location,
      track: this.trackMeta,
      savedAt: now,
    }, {route: withRoute}).then(() => {
      // 한 번이라도 성공하면 경고를 내린다(일시적 실패에서 회복).
      if (this.snapshotFails > 0) { this.snapshotFails = 0; this.emitState(); }
    }).catch(err => {
      // 스냅샷 쓰기 실패 = 크래시 복구 불가 상태로 달리고 있다는 뜻이다. 무음으로 넘기면
      // '러닝이 통째로 사라졌다'는 CS 의 원인을 영영 추적할 수 없다(저장 공간 부족이 대표).
      // 관측성 실패가 러닝을 막아선 안 되므로 여기서도 throw 하지 않는다 — 대신 연속 실패를
      // 세어 화면이 한 줄로 알리게 한다(사용자가 지금 위험을 알아야 조치할 수 있다).
      recordError(err, 'storage: run snapshot write');
      this.snapshotFails += 1;
      if (this.snapshotFails === SNAPSHOT_FAIL_ALERT_AT) this.emitState();
    });
  }
}

/** Process-wide singleton — the one engine both delivery paths feed. */
export const runTracker = new RunTracker();

/** Exposed for unit tests that want an isolated instance. */
export {RunTracker};
