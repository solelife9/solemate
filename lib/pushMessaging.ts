// ─── pushMessaging — @react-native-firebase/messaging 얇은 격리 래퍼(Slice 8) ──
// FCM 네이티브 호출(권한·토큰·포그라운드 메시지 핸들러)과 로컬 알림 표시(presentDue)를
// 한 곳에 가둔다. 순수 결정 로직(lib/notifications.dueNotifications)에는 messaging 이
// 새어들어가지 않으며, 앱/화면 계층은 이 모듈의 좁은 API 만 본다. jest.setup.js 가
// '@react-native-firebase/messaging' 를 메모리 가짜로 목 처리하므로 단위/행동 테스트는
// 실 네이티브 없이 green 이다.
//
// 가드레일(slice-8-fcm-native):
//   - 권한 거부는 graceful — requestPushPermission 은 절대 throw 하지 않고 false 를
//     돌려준다(비차단, S8-3). 토큰/핸들러 취득 실패도 삼켜 null/no-op 으로 폴백한다.
//   - OS 타이머 기반 정밀 스케줄(notifee 등) 새 네이티브 의존은 추가하지 않는다.
//     포그라운드 진입 시점의 로컬 표시(presentDue)는 커스텀 다이얼로그(lib/dialog, 주입
//     가능)로만 처리한다 — dueNotifications 가 "무엇을" 정하고, 여기서 "지금" 띄운다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMessaging,
  requestPermission,
  hasPermission,
  getToken,
  onMessage,
  onTokenRefresh,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';

import {type NotificationIntent} from './notifications';
import {showDialog} from './dialog';
import {REMOTE_PUSH_ENABLED} from './featureFlags';

/** 한 알림 의도를 사용자에게 표시하는 함수(주입 가능 — 테스트/대체 표시 경로). */
export type IntentPresenter = (intent: NotificationIntent) => void;

/** 포그라운드 메시지 핸들러를 해제하는 함수(onMessage 가 돌려주는 구독 해제). */
export type Unsubscribe = () => void;

/**
 * 권한 상태가 "메시지를 받을 수 있는" 상태인지. AUTHORIZED(허용)와 PROVISIONAL(잠정
 * 허용, iOS 조용한 알림)을 통과로 본다. DENIED/NOT_DETERMINED 는 false.
 */
export function isAuthorizedStatus(status: number): boolean {
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

/**
 * 푸시 알림 권한을 요청한다. iOS 는 알림 권한, Android 13+(API 33) 는 messaging 의
 * requestPermission 이 POST_NOTIFICATIONS 런타임 권한을 요청한다(매니페스트에 권한
 * 선언 필요 — AndroidManifest 에 추가됨). 거부/오류는 graceful: 절대 throw 하지 않고
 * false 를 돌려주므로 호출부(권한 흐름)가 비차단으로 진행할 수 있다(S8-3).
 */
export async function requestPushPermission(): Promise<boolean> {
  try {
    const status = await requestPermission(getMessaging());
    return isAuthorizedStatus(status);
  } catch {
    // 권한 거부·미설정·네이티브 부재 — 비차단. 호출부는 false 로 graceful 안내.
    return false;
  }
}

/**
 * 현재 알림 권한 상태를 *묻지 않고* 조회한다(OS 다이얼로그 0회). 실패는 DENIED 로
 * 폴백해 호출부가 비차단으로 진행한다. 부팅 무프롬프트 배선(silent)과 프라이밍
 * 판단(shouldPrimePushPermission)이 쓴다.
 */
export async function getPushAuthStatus(): Promise<number> {
  try {
    return await hasPermission(getMessaging());
  } catch {
    return AuthorizationStatus.DENIED;
  }
}

/**
 * 이 기기의 FCM 등록 토큰을 가져온다(서버가 이 기기로 푸시를 보낼 주소). 실패(권한
 * 미허용·네트워크·미설정)는 삼켜 null 로 폴백한다 — 토큰 취득 실패가 앱을 막지 않는다.
 */
export async function getPushToken(): Promise<string | null> {
  try {
    const token = await getToken(getMessaging());
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * 앱이 포그라운드일 때 도착하는 FCM 메시지 핸들러를 등록한다. onMessage 의 구독 해제
 * 함수를 돌려준다. 등록 실패(네이티브 부재 등)는 삼키고 no-op 해제 함수를 돌려줘
 * 호출부가 항상 안전하게 정리할 수 있게 한다.
 */
export function registerForegroundMessageHandler(
  handler: (message: unknown) => void,
): Unsubscribe {
  try {
    const unsubscribe = onMessage(getMessaging(), handler);
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch {
    return () => {};
  }
}

/** 기본 표시 경로 — 커스텀 다이얼로그(lib/dialog, 새 네이티브 의존 0). */
const defaultPresenter: IntentPresenter = intent => {
  showDialog(intent.title, intent.body);
};

/**
 * dueNotifications(slice-8-notif-logic) 가 정한 알림 의도들을 포그라운드에서 표시한다.
 * 앱이 포그라운드로 진입할 때 호출되는 로컬 표시 경로다. 표시 자체는 주입 가능한
 * presenter(기본: showDialog)로 위임해 표시 경로를 격리하고 테스트를 결정적으로 만든다.
 * 빈 목록은 아무것도 표시하지 않고, 개별 표시 중 예외가 나도 나머지를 계속 표시한다
 * (한 건의 실패가 전체를 막지 않음 — graceful).
 */
export async function presentDue(
  intents: NotificationIntent[],
  opts?: {present?: IntentPresenter},
): Promise<void> {
  if (!Array.isArray(intents) || intents.length === 0) return;
  const present = opts?.present ?? defaultPresenter;
  for (const intent of intents) {
    if (!intent || typeof intent !== 'object') continue;
    try {
      present(intent);
    } catch {
      // 한 건의 표시 실패는 삼키고 다음 의도로 — 전체 알림 흐름을 막지 않는다.
    }
  }
}

/** initPushMessaging 의 결과 — 권한 여부·토큰(없으면 null)·핸들러 해제 함수. */
export interface PushMessagingSetup {
  granted: boolean;
  token: string | null;
  unsubscribe: Unsubscribe;
}

/**
 * 권한 요청 → 토큰 취득 → 포그라운드 핸들러 등록을 한 번에 수행하는 편의 셋업.
 * 앱 부팅/포그라운드 배선(slice-8-notif-ui)이 호출한다. 어떤 단계가 실패해도 throw
 * 하지 않고 graceful 폴백(granted=false·token=null·no-op 해제)으로 비차단 진행한다.
 *
 * @param onForegroundMessage 포그라운드 FCM 수신 시 콜백(미지정 시 핸들러 미등록).
 */
export async function initPushMessaging(opts?: {
  onForegroundMessage?: (message: unknown) => void;
  /** true 면 권한을 *요청하지 않고* 현재 상태만 본다(OS 다이얼로그 0회) — 부팅 경로용(심사 #3). */
  silent?: boolean;
  /**
   * 원격 푸시(토큰 취득) 사용 여부. 기본값은 lib/featureFlags.REMOTE_PUSH_ENABLED.
   * 주입 가능한 이유: 플래그가 꺼져 있어도 **배선 자체는 계속 테스트돼야** 나중에 켤 때
   * 썩어 있지 않다(끄면서 테스트를 지우면 재개봉 때 검증 없는 코드를 켜게 된다).
   */
  remotePush?: boolean;
}): Promise<PushMessagingSetup> {
  const granted = opts?.silent
    ? isAuthorizedStatus(await getPushAuthStatus())
    : await requestPushPermission();
  // 원격 푸시를 안 쓰기로 한 동안은 **토큰을 아예 받지 않는다**(2026-07-30).
  // 권한은 그대로 요청한다 — 로컬 알림(러닝 리마인더)에 필요하다. 토큰만 건너뛴다:
  // 보낼 서버가 없는데 받아두면 기기 식별자를 목적 없이 보관하는 셈이다(최소수집).
  const remotePush = opts?.remotePush ?? REMOTE_PUSH_ENABLED;
  const token = granted && remotePush ? await getPushToken() : null;
  const unsubscribe = opts?.onForegroundMessage
    ? registerForegroundMessageHandler(opts.onForegroundMessage)
    : () => {};
  return {granted, token, unsubscribe};
}

// ── 토큰 등록 배선(audit a4) ─────────────────────────────────────────────────
// 취득한 FCM 토큰을 백엔드에 등록(POST)하기 전까지 보관하는 AsyncStorage 키. 백엔드
// 등록 API 가 준비되기 전엔 여기 토큰을 큐잉만 하고(등록 no-op), API 가 생기면 이 큐를
// 비우며 POST 한다. App 부팅 배선이 이 키만 알면 되도록 한 곳에 둔다.
export const FCM_TOKEN_PENDING_KEY = 'fcm_token_pending';

/**
 * FCM 토큰을 백엔드에 등록할 절대경로 엔드포인트.
 *
 * **비어 있는 것은 미완성이 아니라 결정이다**(2026-07-30). 원격 푸시를 쓰지 않기로 했고
 * (lib/featureFlags.REMOTE_PUSH_ENABLED=false) 그래서 토큰을 받지도, 보낼 곳도 없다.
 * 배선은 남겨둔다 — 소셜·운영 공지처럼 서버만 아는 알림이 생기면 그때 이 상수에 URL 을
 * 채우고 플래그를 켠다. 이 상수가 비어 있으면 registerPushToken 은 no-op 이다.
 */
export const FCM_REGISTER_ENDPOINT = '';

/**
 * 토큰을 pending 키에 영속한다(비차단). 실패(스토리지 부재 등)는 삼킨다 — 토큰 영속
 * 실패가 부팅/등록 흐름을 막지 않는다(iron law: 비차단).
 */
export async function persistPendingToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(FCM_TOKEN_PENDING_KEY, token);
  } catch {
    // 영속 실패는 비차단 — 다음 부팅/토큰갱신에서 다시 시도된다.
  }
}

/** registerPushToken 의 결과 — 관찰용. */
export type RegisterResult = 'skipped' | 'queued' | 'registered';

/**
 * 취득한 FCM 토큰을 백엔드에 등록한다. 토큰이 없으면(null/빈) 아무것도 하지 않는다
 * ('skipped'). 토큰이 있으면 *항상 먼저* pending 키에 영속하고(다음 부팅/재시도에서 합류
 * 가능), 등록 엔드포인트가:
 *   · 비어 있으면 — 'queued'. 백엔드 등록 API 가 아직 없으므로 POST 하지 않고 큐잉만 한다
 *     (graceful no-op). 라우트가 생기면 다음 호출이 POST 한다.
 *   · 채워져 있으면 — POST 한다. 성공(ok)하면 pending 키를 비우고 'registered', 서버 거부/
 *     네트워크 실패면 pending 을 보존한 채 'queued'(다음 기회 재시도).
 * 어떤 실패(영속·네트워크·미설정)도 throw 하지 않는다 — 등록 실패가 부팅을 막지 않는다.
 * endpoint/userId 는 테스트·미래 백엔드 연결을 위해 주입 가능하다.
 */
export async function registerPushToken(
  token: string | null,
  opts?: {endpoint?: string; userId?: string | null},
): Promise<RegisterResult> {
  if (!token) return 'skipped';
  await persistPendingToken(token);
  const endpoint = opts?.endpoint ?? FCM_REGISTER_ENDPOINT;
  if (!endpoint) return 'queued'; // 백엔드 등록 API 미존재 — 큐잉만(graceful no-op)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({user_id: opts?.userId ?? null, token}),
    });
    if (res && res.ok) {
      try {
        await AsyncStorage.removeItem(FCM_TOKEN_PENDING_KEY); // 등록 완료 — 큐 비움
      } catch {
        // 큐 비우기 실패는 비차단(다음 등록이 같은 토큰을 멱등 재POST).
      }
      return 'registered';
    }
    return 'queued'; // 서버 거부 → pending 유지
  } catch {
    return 'queued'; // 네트워크 실패 → pending 유지
  }
}

/**
 * FCM 토큰 갱신(onTokenRefresh) 핸들러를 등록한다. 토큰은 시간/재설치/복원에 따라 바뀌므로
 * 갱신될 때마다 다시 영속·등록해야 푸시가 끊기지 않는다. 등록 실패(네이티브 부재 등)는
 * 삼키고 no-op 해제 함수를 돌려줘 호출부가 항상 안전하게 정리할 수 있게 한다.
 */
export function registerTokenRefreshHandler(
  handler: (token: string) => void,
): Unsubscribe {
  try {
    const unsubscribe = onTokenRefresh(getMessaging(), handler);
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch {
    return () => {};
  }
}

/** setupPushMessaging 결과 — 포그라운드/토큰갱신 핸들러 해제 함수(언마운트 정리용). */
export interface PushWiring {
  unsubscribeForeground: Unsubscribe;
  unsubscribeTokenRefresh: Unsubscribe;
}

/**
 * 앱 부팅(또는 로그인 직후) 1회 배선: 권한 요청 → 토큰 취득 → pending 영속+등록(graceful)
 * → 포그라운드 메시지 핸들러 + onTokenRefresh 등록을 한 번에 수행한다. 전 과정을 try/catch
 * 로 감싸 *어떤 단계가 실패해도 절대 throw 하지 않는다* — 토큰 배선 실패가 부팅을 막지
 * 않는다(iron law: 비차단). 항상 두 해제 함수를 돌려줘(실패 시 no-op) 호출부(언마운트)가
 * 안전하게 정리할 수 있다.
 */
export async function setupPushMessaging(opts?: {
  userId?: string | null;
  onForegroundMessage?: (message: unknown) => void;
  endpoint?: string;
  /** 원격 푸시 사용 여부 오버라이드(기본 = REMOTE_PUSH_ENABLED). 배선 테스트용. */
  remotePush?: boolean;
  /** true 면 부팅 무프롬프트 배선 — 권한을 요청하지 않고 이미 허용된 경우에만 토큰을 취득한다(심사 #3). */
  silent?: boolean;
}): Promise<PushWiring> {
  const noop: PushWiring = {
    unsubscribeForeground: () => {},
    unsubscribeTokenRefresh: () => {},
  };
  try {
    const setup = await initPushMessaging({
      onForegroundMessage: opts?.onForegroundMessage,
      silent: opts?.silent,
      remotePush: opts?.remotePush,
    });
    await registerPushToken(setup.token, {
      userId: opts?.userId,
      endpoint: opts?.endpoint,
    });
    // 토큰 갱신 시마다 다시 영속+등록(graceful) — 위와 같은 비차단 규약.
    const unsubscribeTokenRefresh = registerTokenRefreshHandler(token => {
      void registerPushToken(token, {
        userId: opts?.userId,
        endpoint: opts?.endpoint,
      });
    });
    return {
      unsubscribeForeground: setup.unsubscribe,
      unsubscribeTokenRefresh,
    };
  } catch {
    // 어떤 실패도 비차단 — 부팅을 막지 않는다(no-op 해제 함수 반환).
    return noop;
  }
}

// ── 권한 프라이밍(심사 #3, 2026-07-22) ───────────────────────────────────────
// OS 알림 다이얼로그는 부팅이 아니라 '첫 러닝을 마친 순간'(첫 리캡 닫힘)에 띄운다 —
// 가치를 본 뒤에 묻는다. 한 번 물었으면(수락/거절 무관) 다시 묻지 않는다. iOS 는
// 어차피 OS 가 재프롬프트를 막으므로 NOT_DETERMINED 일 때만 의미가 있다.

/** 프라이밍 1회 기록 키 — '나중에'를 골라도 마킹해 반복 조르기를 막는다(설정 경로는 유지). */
export const PUSH_PRIME_KEY = 'push_prime_done';

/** 지금 프라이밍을 띄워야 하는가 — 아직 안 물었고(NOT_DETERMINED) 프라이밍 이력도 없을 때만. */
export async function shouldPrimePushPermission(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(PUSH_PRIME_KEY)) return false;
    return (await getPushAuthStatus()) === AuthorizationStatus.NOT_DETERMINED;
  } catch {
    return false;
  }
}

/** 프라이밍을 띄웠음을 영속한다(수락/거절 무관 1회만 묻는다). 실패는 삼킨다. */
export async function markPushPrimed(): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_PRIME_KEY, '1');
  } catch {
    // 영속 실패 시 다음에 한 번 더 물을 수 있을 뿐 — 비차단.
  }
}

/**
 * 프라이밍 수락 후의 실제 권한 요청 + 토큰 등록. 부팅 배선이 silent 로 건너뛴 토큰
 * 경로를 여기서 마저 잇는다. 어떤 실패도 throw 하지 않는다.
 */
export async function primePushPermission(opts?: {
  userId?: string | null;
  endpoint?: string;
}): Promise<boolean> {
  try {
    const granted = await requestPushPermission();
    if (granted) {
      const token = await getPushToken();
      await registerPushToken(token, opts);
    }
    return granted;
  } catch {
    return false;
  }
}
