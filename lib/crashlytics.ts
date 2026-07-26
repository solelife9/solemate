// ─── crashlytics — @react-native-firebase/crashlytics 얇은 격리 래퍼 ───────────
// 네이티브 크래시 + JS 예외(비치명) 수집을 한 곳에 가둔다. 앱/화면 계층은 이 좁은 API
// 만 본다. 모든 호출은 graceful — 절대 throw 하지 않는다(관측성 코드가 앱을 죽이면 안
// 된다). jest.setup.js 가 '@react-native-firebase/crashlytics' 를 메모리 가짜로 목
// 처리하므로 단위/행동 테스트는 실 네이티브 없이 green 이다.
//
// 가드레일:
//   - 모든 함수는 try/catch 로 감싸 네이티브 부재/오류에서도 no-op 으로 폴백한다.
//   - 화면/도메인 로직에 crashlytics 가 새어들지 않는다(이 모듈의 API 만 노출).

// 동적 require: 네이티브 모듈 없는 환경(에뮬레이터/테스트)에서 모듈 로드 자체가
// throw 하는 케이스를 방어한다.
let fbMod: any = null;
try {
  fbMod = require('@react-native-firebase/crashlytics');
} catch {
  fbMod = null;
}

/** crashlytics 인스턴스(획득 실패 시 null — 호출부는 항상 null 체크). */
function instance() {
  try {
    if (!fbMod) return null;
    return fbMod.getCrashlytics();
  } catch {
    return null;
  }
}

/** 크래시 직전 맥락을 남기는 빵부스러기 로그. 실패는 삼킨다. */
export function logBreadcrumb(message: string): void {
  try {
    const c = instance();
    if (c && fbMod) fbMod.log(c, message);
  } catch {
    /* 관측성 실패는 앱을 막지 않는다 */
  }
}

/** 비치명 에러 기록(try/catch 로 잡은 예외 등). context 가 있으면 로그로 함께 남긴다. */
export function recordError(error: unknown, context?: string): void {
  try {
    const c = instance();
    if (!c || !fbMod) return;
    if (context) fbMod.log(c, context);
    const err = error instanceof Error ? error : new Error(String(error));
    fbMod.recordError(c, err);
  } catch {
    /* 관측성 실패는 앱을 막지 않는다 */
  }
}

/** 로그인 사용자 식별자를 크래시에 연결(사용자별 묶기). 실패는 삼킨다. */
export function setCrashUser(userId: string): void {
  try {
    const c = instance();
    if (c && userId && fbMod) fbMod.setUserId(c, userId);
  } catch {
    /* no-op */
  }
}

/** 크래시 수집 on/off(옵트아웃 설정 등). 실패는 삼킨다. */
export function setCrashCollectionEnabled(enabled: boolean): void {
  try {
    const c = instance();
    if (c && fbMod) fbMod.setCrashlyticsCollectionEnabled(c, enabled);
  } catch {
    /* no-op */
  }
}

/**
 * 전역 JS 에러 핸들러 설치 — 잡히지 않은 JS 예외를 Crashlytics 에 기록한 뒤 기존
 * 핸들러로 체이닝한다(RN 기본 동작 보존). 앱 부팅 시 한 번만 설치한다(중복 방지 가드).
 */
export function installCrashHandler(): void {
  try {
    const g = globalThis as any;
    const EU = g.ErrorUtils;
    if (!EU || typeof EU.getGlobalHandler !== 'function') return;
    if (g.__keegoCrashHandlerInstalled) return;
    g.__keegoCrashHandlerInstalled = true;
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((error: any, isFatal?: boolean) => {
      recordError(error, isFatal ? 'fatal JS error' : 'uncaught JS error');
      if (typeof prev === 'function') prev(error, isFatal);
    });
  } catch {
    /* no-op */
  }
}

/**
 * 진단 보고 — 원격 기록 + 개발 중 콘솔, 한 번에.
 *
 * 왜 필요한가(2026-07-26 감사 F-05): 릴리스 번들은 babel(transform-remove-console)이
 * console.log 를 걷어낸다. 그래서 `catch(e){console.log('...', e)}` 만 있는 진단은
 * **개발에선 보이고 릴리스에선 완전히 사라진다** — 정작 원인을 알아야 하는 건 사용자
 * 기기에서 일어난 실패인데, 거기서만 흔적이 없다.
 * 이 함수를 쓰면 '개발에선 콘솔, 릴리스에선 원격'이 한 줄로 보장된다.
 */
export function reportIssue(context: string, error: unknown): void {
  recordError(error, context);
  // __DEV__ 는 RN 전역 — 정의되지 않은 환경(순수 node 테스트)도 방어한다.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // 이 파일이 진단 콘솔의 유일한 창구다(호출부는 reportIssue 만 쓴다).
    // eslint-disable-next-line no-console
    console.log(context, error);
  }
}
