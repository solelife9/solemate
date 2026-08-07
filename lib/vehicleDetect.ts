// ============================================================================
// lib/vehicleDetect.ts — 차량 이동 구간 감지 (순수·DI)
// ============================================================================
// **왜 있는가(2026-08-07, 민우님 실제 데이터).** 차를 타고 가면서 앱을 켜 둔 것이
// **2.56km 러닝으로 저장돼 있었다.** 7분 24초에 2.56km = 시속 20.8km, 시내 주행 속도다.
// 그게 프로필의 「1km 최고」를 차지해 2'53"/km 라는 불가능한 자랑 지표를 만들었다.
//
// ── 왜 기존 방어선이 못 잡았나 ──────────────────────────────────────────────
// 걸음 정지 게이트(`STEP_STILL_GATE_MS`)는 정확히 이런 걸 막으려고 있다 — 걸음이 안 늘면
// 거리 적산을 멈춘다. 그런데 **탈출구**가 있었다(`lib/runTracker.ts` 의 `stillGated`):
//
//     걸음 표본 신선 && 12초간 걸음 증가 없음 && 칼만속도 < STEP_GATE_MAX_SPEED_MPS(2.5)
//
// 마지막 조건이 "걸음이 없어도 2.5m/s 보다 빠르면 게이트를 푼다"이다. 목적은 옳았다 —
// **걸음 센서가 죽은 채 진짜 달리는 러너**의 거리를 잃지 않기 위해서다. 문제는 그 문이
// 위쪽으로 **열려 있었다**는 것: 시속 20km 자동차(5.6m/s)도 같은 문으로 통과한다.
//
// ── 무엇으로 가르나 ──────────────────────────────────────────────────────────
// **속도 하나로는 못 가른다.** 6m/s 는 엘리트 러너의 실제 속도이기도 하다.
// 가르는 것은 **조합**이다 — 걸음 센서가 **살아 있는데**(표본이 신선한데) 걸음이 늘지 않고,
// 그 상태로 사람이 낼 수 없는 속도가 **지속**된다.
//   · 사람이 6.5m/s 로 움직이면 케이던스가 180spm 을 넘는다. 걸음이 0일 수 없다.
//   · 센서가 죽었으면(표본이 안 옴) 이 판정을 **아예 하지 않는다** — 그때는 기존 안전선
//     그대로 거리를 인정한다. 못 가르는 상황에서 사용자 데이터를 버리지 않는다.
//
// ── ⚠️ 이건 **2순위(백스톱)** 다 ─────────────────────────────────────────────
// 업계 표준은 **OS 활동 인식**이다(iOS CMMotionActivity=automotive / Android
// ActivityRecognition=IN_VEHICLE). 나이키·스트라바·애플이 전부 그걸 읽는다 —
// 전용 코프로세서가 상시 분류하므로 우리가 만든 어떤 규칙보다 정확하고 배터리도 덜 쓴다.
// 그래서 판정 순서는 이렇다(`lib/activityRecognition.vehicleFromActivity`):
//
//     OS 가 "차량"이라 하면      → 확정. 아래 규칙을 볼 필요 없다.
//     OS 가 "사람"이라 하면      → 확정. **아래 규칙을 무시한다** — OS 가 사람이라는데
//                                  휴리스틱이 차라고 우기면 진짜 러너의 거리를 버린다.
//     OS 가 모른다/못 쓴다면     → **여기 규칙으로 판정한다**(권한 거부·구형 기기·모듈 부재).
//
// ── 무엇을 하고 무엇을 안 하나 ───────────────────────────────────────────────
// **거리를 조용히 버리지 않는다.** 의심 구간을 따로 세어 두고(`flaggedKm`),
// 저장 시점에 사용자에게 묻는다. Iron Law(사용자 데이터 파괴 금지)를 지키면서
// "차 타고 간 게 러닝으로 남는" 것도 막는 유일한 방법이다.
// 판단은 사용자 몫이고, 앱은 **모른 척하지 않는 것**까지가 역할이다.
// ============================================================================

/**
 * 걸음 없이 이 속도(m/s)를 넘으면 사람이 아니다.
 *
 * 근거(세계기록 평균 속도): 마라톤 5.83 · 10km 6.36 · **5km 6.62** · 1500m 7.28.
 * 6.5 는 5km 세계기록 언저리다 — 걸음 신호가 살아 있는데 이 속도가 지속되면
 * 사람일 수 없다. 엘리트를 자르지 않으려 넉넉히 잡았고, 그래서 **시내 주행(5.6)은
 * 이 값만으로는 안 걸린다** — 아래 `VEHICLE_SLOW_SPEED_MPS` 가 그걸 맡는다.
 */
export const VEHICLE_SPEED_MPS = 6.5;

/**
 * 저속 주행(막히는 시내·주차장) 판정 속도(m/s). 2.5~6.5 구간은 러너와 차가 겹치므로
 * 속도만으로 못 가른다. 대신 **훨씬 길게 지속되는지**를 본다(아래 SUSTAIN 두 값).
 * 3.0 m/s = 5'33"/km — 이 속도로 달리는 사람은 걸음이 반드시 잡힌다.
 */
export const VEHICLE_SLOW_SPEED_MPS = 3.0;

/** 빠른 속도(≥VEHICLE_SPEED_MPS)에서 차량으로 확정하기까지 필요한 지속 시간(ms). */
export const VEHICLE_SUSTAIN_FAST_MS = 20000;

/**
 * 저속 구간에서 차량으로 확정하기까지 필요한 지속 시간(ms).
 * 길게 잡는다 — 이 구간에는 **걸음 센서가 잠깐 멎은 진짜 러너**가 섞일 수 있다.
 * 90초 내내 걸음이 하나도 안 늘면서 3m/s 로 움직이는 사람은 없다.
 */
export const VEHICLE_SUSTAIN_SLOW_MS = 90000;

/** 저장 시점에 사용자에게 물어볼 최소 의심 거리(km). 이보다 작으면 조용히 둔다. */
export const VEHICLE_ASK_MIN_KM = 0.3;

/** 저장 시점에 사용자에게 물어볼 최소 의심 비율(전체 거리 대비). */
export const VEHICLE_ASK_MIN_SHARE = 0.2;

export interface VehicleState {
  /** 현재 의심 구간이 시작된 시각(ms). 아니면 null. */
  since: number | null;
  /** 확정된 의심 구간의 누적 거리(km). */
  flaggedKm: number;
  /** 확정된 의심 구간의 누적 시간(ms). */
  flaggedMs: number;
}

export function initVehicleState(): VehicleState {
  return {since: null, flaggedKm: 0, flaggedMs: 0};
}

export interface VehicleSample {
  /** 이 fix 의 시각(ms). */
  nowMs: number;
  /** 평활(칼만) 속도 m/s. 없으면 null — 판정하지 않는다. */
  speedMps: number | null;
  /** 걸음 표본이 신선한가(센서가 살아 있는가). false 면 **판정하지 않는다**. */
  stepsFresh: boolean;
  /** 마지막 걸음 증가 이후 지난 시간(ms). */
  msSinceStepIncrease: number;
  /** 이 fix 가 더한 거리(km). 의심 구간이면 여기에 적립된다. */
  segKm: number;
  /** 이 fix 가 더한 시간(ms). */
  segMs: number;
}

export interface VehicleFeedResult {
  state: VehicleState;
  /** 지금 이 구간이 차량으로 판정됐는가(화면 배너·거리 처리 판단용). */
  isVehicle: boolean;
}

/**
 * fix 하나를 먹인다(순수 — 새 상태를 돌려준다).
 *
 * 판정하지 **않는** 경우(전부 "모르면 사용자 편"):
 *   · 걸음 표본이 안 온다(센서 없음·권한 거부·동결) → 가를 근거가 없다
 *   · 속도를 모른다(칼만 미수렴)
 *   · 걸음이 늘고 있다 → 사람이다
 */
export function feedVehicleSample(prev: VehicleState, s: VehicleSample): VehicleFeedResult {
  const speed = typeof s.speedMps === 'number' && Number.isFinite(s.speedMps) ? s.speedMps : null;
  const walking = s.msSinceStepIncrease < VEHICLE_SUSTAIN_FAST_MS / 4; // 최근 5초 안에 걸음이 있었다

  // 가를 수 없으면 의심을 접는다(누적분은 유지 — 이미 확정된 구간은 사실이다).
  if (!s.stepsFresh || speed == null || walking) {
    return {state: {...prev, since: null}, isVehicle: false};
  }

  const fast = speed >= VEHICLE_SPEED_MPS;
  const slow = speed >= VEHICLE_SLOW_SPEED_MPS;
  if (!slow) {
    // 사람 속도 범위 — 걸음이 없어도 차량이라 부르지 않는다(신호대기·정지는 걸음 게이트 몫).
    return {state: {...prev, since: null}, isVehicle: false};
  }

  const since = prev.since ?? s.nowMs;
  const held = Math.max(0, s.nowMs - since);
  const need = fast ? VEHICLE_SUSTAIN_FAST_MS : VEHICLE_SUSTAIN_SLOW_MS;
  const confirmed = held >= need;

  const km = Number.isFinite(s.segKm) && s.segKm > 0 ? s.segKm : 0;
  const ms = Number.isFinite(s.segMs) && s.segMs > 0 ? s.segMs : 0;
  return {
    state: {
      since,
      flaggedKm: confirmed ? prev.flaggedKm + km : prev.flaggedKm,
      flaggedMs: confirmed ? prev.flaggedMs + ms : prev.flaggedMs,
    },
    isVehicle: confirmed,
  };
}

export interface VehicleVerdict {
  /** 사용자에게 물어볼 만한가. */
  ask: boolean;
  /** 의심 구간 거리(km). */
  km: number;
  /** 전체 거리 대비 비율(0~1). 전체가 0이면 0. */
  share: number;
}

/**
 * 저장 시점 판정. **자동으로 지우지 않는다** — 물어볼지만 정한다.
 * 기준이 둘인 이유: 짧은 러닝의 0.3km 와 긴 러닝의 0.3km 는 의미가 다르다.
 * 둘 중 하나라도 넘으면 묻는다(놓치는 쪽보다 한 번 더 묻는 쪽이 낫다 —
 * 사용자는 "아니오"를 한 번 누르면 되지만, 못 물으면 가짜 기록이 영구히 남는다).
 */
export function vehicleVerdict(state: VehicleState, totalKm: number): VehicleVerdict {
  const km = Math.max(0, state.flaggedKm);
  const total = Number.isFinite(totalKm) && totalKm > 0 ? totalKm : 0;
  const share = total > 0 ? Math.min(1, km / total) : 0;
  return {ask: km >= VEHICLE_ASK_MIN_KM || (total > 0 && share >= VEHICLE_ASK_MIN_SHARE && km > 0), km, share};
}

/**
 * **최종 판정 — 1순위(OS) 우선, 2순위(휴리스틱) 백스톱.**
 *
 * 호출부는 이 함수 하나만 쓰면 된다. 순서를 호출부마다 다시 쓰면 언젠가 한 곳이
 * 뒤집힌다(이 저장소가 "한 화면만 고치고 다른 화면이 튀어나오는" 사고를 여러 번 겪었다).
 *
 * @param osVerdict `lib/activityRecognition.vehicleFromActivity()` 결과
 *                  (true=차량 · false=사람 · null=모름)
 * @param heuristic 이 모듈의 `feedVehicleSample().isVehicle`
 */
export function isVehicleNow(osVerdict: boolean | null, heuristic: boolean): boolean {
  if (osVerdict === true) return true;    // OS 가 차량이라 확신 → 끝
  if (osVerdict === false) return false;  // OS 가 사람이라 확신 → 휴리스틱을 이긴다
  return heuristic;                        // 모를 때만 백스톱
}
