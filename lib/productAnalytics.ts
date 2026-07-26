// ─── productAnalytics — 제품 계측(퍼널·활성화·리텐션) 얇은 격리 래퍼 ──────────
// 왜 필요한가(2026-07-26 출시 심사 B-12): 지금까지 모든 개선 판단이 1인 실기기 피드백에
// 의존했다. 사용자가 늘면 그 방식은 확장되지 않는다. 온보딩 어디서 이탈하는지, 첫 러닝까지
// 도달률이 얼마인지 모르면 개선이 감(感)이 된다. 출시 후에 붙이면 **최초 코호트를 영구히
// 잃는다** — 그래서 출시와 동시에 있어야 한다.
//
// ⚠️ lib/analytics/ 와 다르다. 그쪽은 VO2max·심박존 같은 **피트니스 계산**이고,
//    이 파일은 **제품 사용 계측**이다(이름이 헷갈려 심사에서 오독됐던 지점).
//
// 개인정보 원칙(처리방침 §2 와 일치해야 한다):
//   · 자유 텍스트(신발 모델명·메모·닉네임) 금지 — 파라미터는 **열거값과 버킷**만.
//   · 정확한 거리·페이스 대신 구간(버킷)만 보낸다(개인 식별 가능성 최소화).
//   · setUserId 를 쓰지 않는다 — 계정과 행동 로그를 잇지 않는다.
//   · 이벤트 이름은 아래 EVENTS 에 고정. 임의 이벤트를 흘리지 않는다.
//
// 모든 호출은 no-throw. 계측이 앱을 죽이면 안 된다(lib/crashlytics 와 동일 규약).

// 동적 require — 네이티브 부재 환경 방어.
let mod: any = null;
try {
  mod = require('@react-native-firebase/analytics');
} catch {
  mod = null;
}

/** 보낼 수 있는 이벤트의 전부. 새 이벤트는 여기 추가하고 처리방침을 함께 확인한다. */
export const EVENTS = {
  onboardingStep: 'kg_onboarding_step',
  firstShoeAdded: 'kg_first_shoe_added',
  runStart: 'kg_run_start',
  runSave: 'kg_run_save',
  runDiscard: 'kg_run_discard',
  permissionResult: 'kg_permission_result',
  login: 'kg_login',
  syncFailed: 'kg_sync_failed',
  crashRecovery: 'kg_crash_recovery',
  shoeRetired: 'kg_shoe_retired',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** analytics 인스턴스(획득 실패 시 null). */
function instance() {
  try {
    if (!mod) return null;
    return mod.getAnalytics();
  } catch {
    return null;
  }
}

/** 내부 전송 — 실패는 삼킨다. */
function send(name: EventName, params?: Record<string, string | number | boolean>): void {
  try {
    const a = instance();
    if (!a || !mod) return;
    mod.logEvent(a, name, params);
  } catch {
    /* 계측 실패는 앱을 막지 않는다 */
  }
}

/**
 * 거리를 구간으로 뭉갠다 — 정확한 km 를 보내지 않기 위한 버킷.
 * 러닝 문화의 자연 경계(5k·10k·하프·풀)를 따른다.
 */
export function kmBucket(km: number): string {
  const v = Number(km);
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v < 3) return '0-3';
  if (v < 5) return '3-5';
  if (v < 10) return '5-10';
  if (v < 21.0975) return '10-half';
  if (v < 42.195) return 'half-full';
  return 'full+';
}

/** 소요 시간(분)을 구간으로. */
export function minuteBucket(sec: number): string {
  const m = Number(sec) / 60;
  if (!Number.isFinite(m) || m <= 0) return '0';
  if (m < 15) return '0-15';
  if (m < 30) return '15-30';
  if (m < 60) return '30-60';
  if (m < 120) return '60-120';
  return '120+';
}

// ── 퍼널: 설치 → 온보딩 → 첫 신발 → 첫 러닝 ────────────────────────────────
/** 온보딩 단계 도달(0-based index). 어디서 빠지는지 = 첫 화면 개선의 유일한 근거. */
export function trackOnboardingStep(step: number): void {
  send(EVENTS.onboardingStep, {step: Math.max(0, Math.floor(Number(step) || 0))});
}

/** 첫 신발 등록 — 활성화 지표. 리텐션의 분기점이다. */
export function trackFirstShoeAdded(source: 'picker' | 'manual'): void {
  send(EVENTS.firstShoeAdded, {source});
}

// ── 코어 루프: 러닝 시작 → 저장 ─────────────────────────────────────────────
export function trackRunStart(opts: {
  goalType: 'free' | 'distance' | 'time' | 'speed' | 'track';
  device: 'phone' | 'watch';
  hasShoe: boolean;
}): void {
  send(EVENTS.runStart, {
    goal_type: opts.goalType,
    device: opts.device,
    has_shoe: !!opts.hasShoe,
  });
}

export function trackRunSave(opts: {km: number; durationSec: number; device: 'phone' | 'watch'; hadGps: boolean}): void {
  send(EVENTS.runSave, {
    km_bucket: kmBucket(opts.km),
    minute_bucket: minuteBucket(opts.durationSec),
    device: opts.device,
    had_gps: !!opts.hadGps,
  });
}

export function trackRunDiscard(reason: 'user' | 'too_short'): void {
  send(EVENTS.runDiscard, {reason});
}

// ── 마찰 지점 ───────────────────────────────────────────────────────────────
/** 권한 수락률 — 거부되면 그 기능 전체가 죽으므로 문구·시점 개선의 근거가 된다. */
export function trackPermissionResult(
  kind: 'location' | 'location_background' | 'notification' | 'health' | 'motion',
  granted: boolean,
): void {
  send(EVENTS.permissionResult, {kind, granted: !!granted});
}

export function trackLogin(provider: 'google' | 'apple' | 'kakao' | 'naver' | 'anonymous'): void {
  send(EVENTS.login, {provider});
}

/** 동기 실패 — 조용한 실패가 얼마나 잦은지(무음 실패 계열의 관측). */
export function trackSyncFailed(stage: 'pull' | 'push' | 'detail'): void {
  send(EVENTS.syncFailed, {stage});
}

/** 크래시 후 '이어 달리기' 선택 결과 — 복구 경로가 실제로 쓰이는지. */
export function trackCrashRecovery(action: 'resume' | 'save' | 'discard'): void {
  send(EVENTS.crashRecovery, {action});
}

/** 신발 은퇴 — 수명 관리 루프의 완결(차별점이 실제로 소비되는지). */
export function trackShoeRetired(usedRatioBucket: 'under_80' | '80_100' | 'over_100'): void {
  send(EVENTS.shoeRetired, {used_ratio: usedRatioBucket});
}

/**
 * 수집 on/off. 기본은 켬(서비스 개선 목적, 처리방침 고지). 사용자 opt-out 스위치가
 * 생기면 여기에 연결한다.
 */
export function setAnalyticsEnabled(enabled: boolean): void {
  try {
    const a = instance();
    if (a && mod) mod.setAnalyticsCollectionEnabled(a, !!enabled);
  } catch {
    /* no-op */
  }
}
