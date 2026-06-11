// ─── crashlytics — @react-native-firebase/crashlytics 얇은 격리 래퍼 ───────────
// 네이티브 크래시 + JS 예외(비치명) 수집을 한 곳에 가둔다. 앱/화면 계층은 이 좁은 API
// 만 본다. 모든 호출은 graceful — 절대 throw 하지 않는다(관측성 코드가 앱을 죽이면 안
// 된다). jest.setup.js 가 '@react-native-firebase/crashlytics' 를 메모리 가짜로 목
// 처리하므로 단위/행동 테스트는 실 네이티브 없이 green 이다.
//
// 가드레일:
//   - 모든 함수는 try/catch 로 감싸 네이티브 부재/오류에서도 no-op 으로 폴백한다.
//   - 화면/도메인 로직에 crashlytics 가 새어들지 않는다(이 모듈의 API 만 노출).

import {
  getCrashlytics,
  recordError as fbRecordError,
  log as fbLog,
  setCrashlyticsCollectionEnabled,
  setUserId as fbSetUserId,
} from '@react-native-firebase/crashlytics';

/** crashlytics 인스턴스(획득 실패 시 null — 호출부는 항상 null 체크). */
function instance() {
  try {
    return getCrashlytics();
  } catch {
    return null;
  }
}

/** 크래시 직전 맥락을 남기는 빵부스러기 로그. 실패는 삼킨다. */
export function logBreadcrumb(message: string): void {
  try {
    const c = instance();
    if (c) fbLog(c, message);
  } catch {
    /* 관측성 실패는 앱을 막지 않는다 */
  }
}

/** 비치명 에러 기록(try/catch 로 잡은 예외 등). context 가 있으면 로그로 함께 남긴다. */
export function recordError(error: unknown, context?: string): void {
  try {
    const c = instance();
    if (!c) return;
    if (context) fbLog(c, context);
    const err = error instanceof Error ? error : new Error(String(error));
    fbRecordError(c, err);
  } catch {
    /* 관측성 실패는 앱을 막지 않는다 */
  }
}

/** 로그인 사용자 식별자를 크래시에 연결(사용자별 묶기). 실패는 삼킨다. */
export function setCrashUser(userId: string): void {
  try {
    const c = instance();
    if (c && userId) fbSetUserId(c, userId);
  } catch {
    /* no-op */
  }
}

/** 크래시 수집 on/off(옵트아웃 설정 등). 실패는 삼킨다. */
export function setCrashCollectionEnabled(enabled: boolean): void {
  try {
    const c = instance();
    if (c) setCrashlyticsCollectionEnabled(c, enabled);
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
