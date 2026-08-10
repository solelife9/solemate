// ============================================================================
// lib/activityRecognition.ts — OS 활동 인식 파사드 (차량 감지 1순위)
// ============================================================================
// **업계 표준을 먼저 쓴다**(CLAUDE.md §구현 원칙). 사람이 지금 걷는지·뛰는지·차에 타고
// 있는지는 **OS 가 이미 판정하고 있다** — 전용 저전력 코프로세서가 가속도·자이로 패턴으로
// 상시 분류한다. 나이키·스트라바·애플 피트니스가 전부 이걸 읽는다.
//
//   iOS     : CMMotionActivityManager → stationary/walking/running/**automotive**/cycling
//   Android : ActivityRecognitionClient → STILL/WALKING/RUNNING/**IN_VEHICLE**/ON_BICYCLE
//
// 우리 자체 휴리스틱(`lib/vehicleDetect.ts`)은 **이게 없을 때의 백스톱**이다 —
// 권한 거부·구형 기기·네이티브 모듈 부재. 1순위/2순위를 여기서 분명히 가른다.
//
// ── 이 파일이 하는 일 ────────────────────────────────────────────────────────
// `lib/health.ts`(healthkit ↔ healthConnect)와 같은 파사드 패턴이다. 네이티브 모듈이
// 없으면 **조용히 'unknown' 을 돌려준다** — 앱은 백스톱으로 계속 동작하고, 모듈이
// 붙는 순간 자동으로 1순위가 켜진다. 호출부는 그 차이를 몰라도 된다.
//
// ⚠️ 네이티브 모듈(`KeegoActivityRecognition`)은 **아직 없다.** 이 파일은 그 계약을
// 먼저 고정하고 폴백을 정의한다 — 모듈이 들어오면 이 파일은 한 줄도 안 바뀐다.
// ============================================================================
import {NativeModules, Platform} from 'react-native';

/** OS 가 돌려주는 활동 분류(플랫폼 공통으로 정규화한 값). */
export type ActivityKind =
  | 'still'
  | 'walking'
  | 'running'
  | 'cycling'
  | 'automotive'
  | 'unknown';

export interface ActivitySample {
  kind: ActivityKind;
  /**
   * 신뢰도 0~100. iOS 는 low/medium/high 를 33/66/100 으로 정규화한다.
   * **확신 없는 판정으로 사용자 거리를 버리지 않는다** — 임계는 아래 상수.
   */
  confidence: number;
}

/**
 * 차량으로 **확정**할 최소 신뢰도. 낮게 잡으면 버스 옆을 달리는 러너의 거리를 버릴 수 있고,
 * 높게 잡으면 못 잡는다. 66 = iOS medium 이상 · Android 는 대체로 75+ 를 준다.
 */
export const VEHICLE_CONFIDENCE_MIN = 66;

/**
 * 최근 분류를 다시 물어보는 주기(ms).
 *
 * OS 활동 인식은 원래 느린 신호다 — iOS `CMMotionActivityManager` 도 Android
 * `ActivityRecognitionClient` 도 분류가 바뀌는 데 수십 초가 걸린다. 1초마다 물어도
 * 같은 답이 오고 배터리만 쓴다. 10초면 차량 확정 최단 시간(20초)보다 촘촘하다.
 */
export const ACTIVITY_POLL_MS = 10000;

const UNKNOWN: ActivitySample = {kind: 'unknown', confidence: 0};

type NativeAR = {
  isAvailable?: () => Promise<boolean>;
  requestPermission?: () => Promise<boolean>;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
  /** 가장 최근 분류 1건. 없으면 null. */
  current?: () => Promise<{kind?: string; confidence?: number} | null>;
};

function mod(): NativeAR | null {
  const m = (NativeModules as Record<string, unknown>).KeegoActivityRecognition;
  return m ? (m as NativeAR) : null;
}

/** 네이티브 모듈이 붙어 있는가. 없으면 호출부는 백스톱만 쓴다. */
export function activityRecognitionAvailable(): boolean {
  return mod() != null && (Platform.OS === 'ios' || Platform.OS === 'android');
}

/** 플랫폼별 원문 문자열을 공통 값으로 정규화한다(모르는 값은 unknown — 지어내지 않는다). */
export function normalizeActivityKind(raw: unknown): ActivityKind {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'still' || s === 'stationary') return 'still';
  if (s === 'walking' || s === 'on_foot' || s === 'onfoot') return 'walking';
  if (s === 'running') return 'running';
  if (s === 'cycling' || s === 'on_bicycle' || s === 'onbicycle') return 'cycling';
  if (s === 'automotive' || s === 'in_vehicle' || s === 'invehicle') return 'automotive';
  return 'unknown';
}

/** 권한 요청(iOS: 동작·피트니스 / Android: ACTIVITY_RECOGNITION). 실패는 false. */
export async function requestActivityPermission(): Promise<boolean> {
  const m = mod();
  if (!m?.requestPermission) return false;
  try {
    return !!(await m.requestPermission());
  } catch {
    return false;
  }
}

/** 구독 시작. 모듈이 없으면 조용히 no-op(앱은 백스톱으로 돈다). */
export async function startActivityUpdates(): Promise<boolean> {
  const m = mod();
  if (!m?.start) return false;
  try {
    await m.start();
    return true;
  } catch {
    return false;
  }
}

/** 구독 종료. 러닝이 끝나면 반드시 부른다(배터리). */
export async function stopActivityUpdates(): Promise<void> {
  const m = mod();
  if (!m?.stop) return;
  try {
    await m.stop();
  } catch {
    /* 종료 실패는 삼킨다 — 앱을 죽일 이유가 없다 */
  }
}

/** 가장 최근 분류. 모듈이 없거나 실패하면 unknown(= 백스톱에 맡긴다). */
export async function currentActivity(): Promise<ActivitySample> {
  const m = mod();
  if (!m?.current) return UNKNOWN;
  try {
    const r = await m.current();
    if (!r) return UNKNOWN;
    const conf = Number(r.confidence);
    return {
      kind: normalizeActivityKind(r.kind),
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : 0,
    };
  } catch {
    return UNKNOWN;
  }
}

/**
 * OS 가 "차량"이라고 **확신**하는가. 판정 3단계:
 *   true  — 차량 확정(신뢰도 충족). 백스톱을 볼 필요 없다.
 *   false — 사람 활동(walking/running/still)이라고 답했다. **백스톱도 무시한다** —
 *           OS 가 사람이라는데 우리 휴리스틱이 차라고 우기면 진짜 러너의 거리를 버린다.
 *   null  — 모른다(모듈 없음·unknown·신뢰도 미달). **백스톱에 맡긴다.**
 */
export function vehicleFromActivity(a: ActivitySample | null): boolean | null {
  if (!a || a.kind === 'unknown') return null;
  if (a.confidence < VEHICLE_CONFIDENCE_MIN) return null;
  if (a.kind === 'automotive') return true;
  if (a.kind === 'running' || a.kind === 'walking' || a.kind === 'still') return false;
  // cycling 은 러닝이 아니지만 '차량'도 아니다 — 이 함수의 질문에 답할 수 없다.
  return null;
}
