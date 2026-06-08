/**
 * lib/pushMessaging — @react-native-firebase/messaging 격리 래퍼 행동 테스트.
 *
 * 관찰 가능한 결과(반환값·실제로 호출된 messaging/표시 함수)를 단언한다. 네이티브
 * messaging 은 jest.setup.js 에서 메모리 가짜로 목 처리된다(권한 기본 AUTHORIZED,
 * 토큰 'mock-fcm-token', onMessage→unsubscribe). 핵심 가드레일은 "권한/토큰/핸들러
 * 취득 실패가 throw 하지 않고 graceful 폴백" + "presentDue 가 의도를 실제로 표시".
 *
 * @format
 */

import {Alert} from 'react-native';
import {
  requestPermission,
  getToken,
  onMessage,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';

import {
  isAuthorizedStatus,
  requestPushPermission,
  getPushToken,
  registerForegroundMessageHandler,
  presentDue,
  initPushMessaging,
} from '../../lib/pushMessaging';
import {type NotificationIntent} from '../../lib/notifications';

const reqMock = requestPermission as jest.Mock;
const tokenMock = getToken as jest.Mock;
const onMessageMock = onMessage as jest.Mock;

const intent = (over: Partial<NotificationIntent> = {}): NotificationIntent => ({
  type: 'run_reminder',
  title: '오늘 달릴 시간이에요',
  body: '가볍게 한 바퀴 어때요?',
  key: 'run_reminder:2026-06-09',
  ...over,
});

describe('isAuthorizedStatus', () => {
  test('AUTHORIZED·PROVISIONAL 은 통과, DENIED·NOT_DETERMINED 는 불통과', () => {
    expect(isAuthorizedStatus(AuthorizationStatus.AUTHORIZED)).toBe(true);
    expect(isAuthorizedStatus(AuthorizationStatus.PROVISIONAL)).toBe(true);
    expect(isAuthorizedStatus(AuthorizationStatus.DENIED)).toBe(false);
    expect(isAuthorizedStatus(AuthorizationStatus.NOT_DETERMINED)).toBe(false);
  });
});

describe('requestPushPermission', () => {
  test('권한 허용(AUTHORIZED) 시 true 를 돌려준다', async () => {
    await expect(requestPushPermission()).resolves.toBe(true);
    expect(reqMock).toHaveBeenCalledTimes(1);
  });

  test('권한 거부(DENIED) 시 throw 없이 false 를 돌려준다 (S8-3 비차단)', async () => {
    reqMock.mockResolvedValueOnce(AuthorizationStatus.DENIED);
    await expect(requestPushPermission()).resolves.toBe(false);
  });

  test('네이티브가 reject 해도 throw 하지 않고 false 로 graceful 폴백', async () => {
    reqMock.mockRejectedValueOnce(new Error('no native module'));
    await expect(requestPushPermission()).resolves.toBe(false);
  });
});

describe('getPushToken', () => {
  test('토큰 문자열을 그대로 돌려준다', async () => {
    await expect(getPushToken()).resolves.toBe('mock-fcm-token');
    expect(tokenMock).toHaveBeenCalledTimes(1);
  });

  test('토큰 취득이 reject 하면 null 로 graceful 폴백(throw 없음)', async () => {
    tokenMock.mockRejectedValueOnce(new Error('network'));
    await expect(getPushToken()).resolves.toBeNull();
  });

  test('빈 토큰은 null 로 정규화', async () => {
    tokenMock.mockResolvedValueOnce('');
    await expect(getPushToken()).resolves.toBeNull();
  });
});

describe('registerForegroundMessageHandler', () => {
  test('onMessage 에 핸들러를 등록하고, 도착 메시지를 핸들러로 전달하며, 해제 함수를 돌려준다', () => {
    const unsub = jest.fn();
    let captured: ((m: unknown) => void) | undefined;
    onMessageMock.mockImplementationOnce((_messaging, listener) => {
      captured = listener;
      return unsub;
    });

    const handler = jest.fn();
    const returned = registerForegroundMessageHandler(handler);

    // 등록된 리스너로 들어온 FCM 메시지가 우리 핸들러로 전달된다(관찰 가능 결과).
    expect(typeof captured).toBe('function');
    captured?.({notification: {title: 'hi'}});
    expect(handler).toHaveBeenCalledWith({notification: {title: 'hi'}});

    // 돌려준 해제 함수는 onMessage 의 unsubscribe 다.
    expect(returned).toBe(unsub);
    returned();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  test('onMessage 가 throw 해도 no-op 해제 함수를 돌려준다(호출해도 안전)', () => {
    onMessageMock.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    const returned = registerForegroundMessageHandler(jest.fn());
    expect(typeof returned).toBe('function');
    expect(() => returned()).not.toThrow();
  });
});

describe('presentDue', () => {
  test('각 의도를 주입된 presenter 로 표시한다(제목/본문 전달)', async () => {
    const present = jest.fn();
    const intents = [
      intent({type: 'shoe_replacement', title: '교체', body: 'A', key: 'k1'}),
      intent({type: 'weekly_goal', title: '주간', body: 'B', key: 'k2'}),
    ];
    await presentDue(intents, {present});
    expect(present).toHaveBeenCalledTimes(2);
    expect(present).toHaveBeenNthCalledWith(1, intents[0]);
    expect(present).toHaveBeenNthCalledWith(2, intents[1]);
  });

  test('기본 presenter 는 react-native Alert 로 제목·본문을 표시한다', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await presentDue([intent({title: 'T', body: 'B'})]);
    expect(alertSpy).toHaveBeenCalledWith('T', 'B');
    alertSpy.mockRestore();
  });

  test('빈 목록은 아무것도 표시하지 않는다', async () => {
    const present = jest.fn();
    await presentDue([], {present});
    expect(present).not.toHaveBeenCalled();
  });

  test('한 건의 표시가 throw 해도 나머지를 계속 표시한다(graceful)', async () => {
    const present = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('display failed');
      })
      .mockImplementation(() => {});
    const intents = [intent({key: 'k1'}), intent({key: 'k2'})];
    await expect(presentDue(intents, {present})).resolves.toBeUndefined();
    expect(present).toHaveBeenCalledTimes(2);
  });
});

describe('initPushMessaging', () => {
  test('권한 허용 시 토큰을 취득하고 포그라운드 핸들러를 등록한다', async () => {
    const unsub = jest.fn();
    onMessageMock.mockImplementationOnce((_m, listener) => {
      // 등록된 리스너가 실제 콜백으로 연결됨을 라운드트립 단언 가능하게 캡처.
      (onMessageMock as any)._listener = listener;
      return unsub;
    });
    const onForegroundMessage = jest.fn();

    const setup = await initPushMessaging({onForegroundMessage});

    expect(setup.granted).toBe(true);
    expect(setup.token).toBe('mock-fcm-token');
    expect(setup.unsubscribe).toBe(unsub);
    (onMessageMock as any)._listener({data: 1});
    expect(onForegroundMessage).toHaveBeenCalledWith({data: 1});
  });

  test('권한 거부 시 토큰을 취득하지 않고 granted=false·token=null 로 graceful', async () => {
    reqMock.mockResolvedValueOnce(AuthorizationStatus.DENIED);
    const setup = await initPushMessaging();
    expect(setup.granted).toBe(false);
    expect(setup.token).toBeNull();
    expect(tokenMock).not.toHaveBeenCalled();
    // 핸들러 미지정 시 해제 함수는 안전한 no-op.
    expect(() => setup.unsubscribe()).not.toThrow();
  });
});
