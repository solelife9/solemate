/**
 * 러닝 중 잠금화면 지표 알림 — 문구 빌더 (2026-08-05)
 *
 * 왜 이 기능이 있나: 안드로이드에서 폰을 주머니에 넣고 달리면 잠금을 풀기 전엔 얼마나 왔는지
 * 볼 수가 없다. 아이폰은 워치가 그 자리를 메우지만 안드로이드엔 워치가 없다.
 *
 * 왜 별도 알림인가: 이미 떠 있는 '러닝 기록 중'(expo-location 포그라운드 서비스) 문구를
 * 갱신하려면 startLocationUpdatesAsync 를 다시 불러야 하는데, 안드로이드 구현이
 * setOptions 에서 stopLocationUpdates() + startLocationUpdates() 를 한다 —
 * **문구를 바꿀 때마다 GPS 가 재시작된다.** 그래서 GPS 와 무관한 알림을 따로 띄운다.
 *
 * 여기서 검증하는 건 순수 문구 빌더다(네이티브 없이 전부 검증 가능한 부분).
 *
 * @format
 */
import {buildRunNotificationText} from '../../lib/runNotification';

const base = {km: 3.42, elapsedSec: 18 * 60 + 30, avgPaceSecPerKm: 324, paused: false};

describe('buildRunNotificationText — 잠금화면 두 줄', () => {
  test('제목은 거리·시간, 본문은 평균 페이스·신발', () => {
    const {title, body} = buildRunNotificationText({...base, shoeName: 'Novablast 5'});
    expect(title).toBe('3.42km · 18:30');
    expect(body).toBe("평균 5'24\"/km · Novablast 5");
  });

  test('1시간을 넘으면 시까지 보여 준다', () => {
    const {title} = buildRunNotificationText({...base, elapsedSec: 3600 + 5 * 60 + 7});
    expect(title).toBe('3.42km · 1:05:07');
  });

  test('일시정지 중이면 제목이 먼저 그렇게 말한다', () => {
    // 주머니에서 자동 일시정지가 걸렸는데 모르고 계속 달리는 게 가장 나쁜 경우다 —
    // 그동안 거리가 안 쌓인다. 그래서 거리보다 앞에 놓는다.
    const {title} = buildRunNotificationText({...base, paused: true});
    expect(title.startsWith('일시정지 · ')).toBe(true);
  });

  test('페이스가 없으면(출발 직후) 페이스 칸을 만들지 않는다', () => {
    const {body} = buildRunNotificationText({...base, avgPaceSecPerKm: null, shoeName: 'Clifton 9'});
    expect(body).toBe('Clifton 9');
  });

  test('보여 줄 게 아무것도 없으면 빈 줄 대신 상태를 말한다', () => {
    const {title, body} = buildRunNotificationText({km: 0, elapsedSec: 0, avgPaceSecPerKm: null, paused: false});
    expect(title).toBe('0.00km · 0:00');
    expect(body).toContain('기록 중');
  });

  test('말도 안 되는 페이스(1km에 1시간 초과)는 버린다 — 출발 직후 계산은 쓰레기다', () => {
    const {body} = buildRunNotificationText({...base, avgPaceSecPerKm: 4000, shoeName: 'X'});
    expect(body).toBe('X');
  });

  test("초 반올림이 60이 돼도 5'60\" 같은 건 안 만든다", () => {
    // 359.6초/km → 반올림하면 5분 60초. 6'00" 이 돼야 한다.
    const {body} = buildRunNotificationText({...base, avgPaceSecPerKm: 359.6});
    expect(body).toContain("6'00\"");
  });

  test('마일 단위면 거리와 페이스가 함께 환산된다(둘이 어긋나면 안 된다)', () => {
    const {title, body} = buildRunNotificationText({...base, km: 1.609344, avgPaceSecPerKm: 300}, 'mi');
    expect(title).toBe('1.00mi · 18:30');
    expect(body).toContain("8'03\"/mi"); // 300초/km × 1.609344 = 482.8초/mi → 8분 03초
  });

  test('음수·NaN 거리는 0 으로 본다(잠금화면에 이상한 숫자 금지)', () => {
    expect(buildRunNotificationText({...base, km: -5}).title).toBe('0.00km · 18:30');
    expect(buildRunNotificationText({...base, km: NaN}).title).toBe('0.00km · 18:30');
  });
});

// ============================================================================
// 발송 경로 (2026-08-07 감사)
//
// 이 파일은 여태 **문구(buildRunNotificationText)만** 검사했다. 그래서 실제로 알림을
// 띄우는 showRunNotification 의 배선 결함이 그대로 살아 있었다:
//
//   채널을 만들어 놓고 scheduleNotificationAsync 에 channelId 를 안 넘겼다.
//   → expo-notifications 가 그 채널을 못 찾아 폴백 채널로 보낸다.
//   → 소리 없음·진동 없음·배지 없음·importance 3 이 **전부 무시**되고,
//     사용자 알림 설정에도 '러닝 중 기록'이 아니라 정체불명 채널명으로 보인다.
//     3초마다 갱신되는 알림이라 영향이 크다.
// ============================================================================
describe('러닝 알림 발송', () => {
  /**
   * 모듈을 리셋한 뒤 **그 다음에** 플랫폼을 세팅한다.
   * jest.resetModules() 는 react-native 도 새로 물어오므로, 리셋 전에 잡아둔 Platform
   * 참조에 값을 넣으면 테스트 대상이 보는 인스턴스와 달라진다(여기서 한 번 밟았다).
   */
  const bootAndroid = () => {
    jest.resetModules();
    const api = {
      setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
      scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
      dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
      // 구 채널 제거(2026-08-17) — 3초마다 울리던 v1 채널을 지운다.
      deleteNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
      // 알림 액션 버튼(2026-08-08) — 카테고리 등록 + 응답 구독.
      setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
      addNotificationResponseReceivedListener: jest.fn((cb: (r: {actionIdentifier?: string}) => void) => {
        api.__fire = cb;
        return {remove: jest.fn()};
      }),
      __fire: undefined as undefined | ((r: {actionIdentifier?: string}) => void),
    };
    jest.doMock('expo-notifications', () => api);
    const rn = require('react-native');
    rn.Platform.OS = 'android';
    return {api, rn};
  };

  afterEach(() => {
    jest.dontMock('expo-notifications');
    jest.resetModules();
  });

  test('만든 채널로 보낸다 — channelId 를 빠뜨리면 폴백 채널로 샌다', async () => {
    const {api} = bootAndroid();
    const {showRunNotification} = require('../../lib/runNotification');

    await showRunNotification({km: 5.2, elapsedSec: 1800, avgPaceSecPerKm: 346, paused: false});

    expect(api.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
    const createdChannel = api.setNotificationChannelAsync.mock.calls[0][0];
    expect(api.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const content = api.scheduleNotificationAsync.mock.calls[0][0].content;
    // 핵심: 보낸 채널이 **방금 만든 그 채널**이어야 한다.
    expect(content.channelId).toBe(createdChannel);
  });

  // ── 3초마다 알림음이 울리던 것 (2026-08-17 실기기) ─────────────────────────
  // 이 알림은 3초 스로틀로 **다시 게시**된다. 안드로이드 8+ 는 소리가 채널 속성이라,
  // 채널이 소리를 갖고 있으면 재게시마다 다시 울린다. v1 은 importance 3(DEFAULT)이었고
  // DEFAULT 는 정의상 소리를 낸다. `setOnlyAlertOnce` 는 expo 가 노출하지 않는다.
  // → 유일하게 확실한 길이 **importance ≤ 2(LOW)** 다(LOW 이하는 소리·진동이 없다).
  test('채널 중요도가 LOW 이하다 — 3초마다 재게시되므로 소리가 있으면 매번 울린다', async () => {
    const {api} = bootAndroid();
    const {showRunNotification} = require('../../lib/runNotification');

    await showRunNotification({km: 1, elapsedSec: 60, avgPaceSecPerKm: null, paused: false});

    const [, cfg] = api.setNotificationChannelAsync.mock.calls[0];
    expect(cfg.importance).toBeLessThanOrEqual(2);
    // 소리·진동도 함께 꺼 둔다(LOW 가 이미 막지만, 중요도를 올리는 순간 이게 마지막 방어선이다).
    expect(cfg.sound).toBeNull();
    expect(cfg.enableVibrate).toBe(false);
  });

  test('구 채널(keego-run-live)을 지운다 — 설정에 소리 켜진 유령이 남지 않게', async () => {
    const {api} = bootAndroid();
    const {showRunNotification} = require('../../lib/runNotification');

    await showRunNotification({km: 1, elapsedSec: 60, avgPaceSecPerKm: null, paused: false});

    const newId = api.setNotificationChannelAsync.mock.calls[0][0];
    expect(api.deleteNotificationChannelAsync).toHaveBeenCalledWith('keego-run-live');
    // 새 채널은 구 채널과 **다른 id** 여야 한다 — 같은 id 로는 중요도를 바꿀 수 없다.
    expect(newId).not.toBe('keego-run-live');
  });

  // ── 게시 횟수 자체가 위험이다 (2026-08-17 실기기) ───────────────────────────
  // 35분 러닝에서 467회를 게시했더니 삼성이 채널을 '과다 알림'으로 자동 차단했고,
  // 차단된 채널로 간 알림을 expo 가 폴백 채널(Miscellaneous)로 흘려보내
  // 소리·진동·팝업이 되살아났다. 채널 무음을 아무리 걸어도 소용없던 진짜 이유다.
  test('문구가 같으면 다시 게시하지 않는다 — 게시 횟수가 곧 차단 위험이다', async () => {
    const {api} = bootAndroid();
    const {showRunNotification} = require('../../lib/runNotification');
    const state = {km: 1.23, elapsedSec: 400, avgPaceSecPerKm: 325, paused: false};

    await showRunNotification(state);
    await showRunNotification(state); // 같은 상태 — 건너뛰어야 한다
    await showRunNotification(state);
    expect(api.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // 값이 바뀌면 다시 게시한다(멈춰 있지 않다는 뜻이므로).
    await showRunNotification({...state, km: 1.29});
    expect(api.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  test('안드로이드가 아니면 아무것도 하지 않는다', async () => {
    const {api, rn} = bootAndroid();
    rn.Platform.OS = 'ios';
    const {showRunNotification} = require('../../lib/runNotification');

    await showRunNotification({km: 1, elapsedSec: 60, avgPaceSecPerKm: null, paused: false});

    expect(api.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

// ── 잠금화면에서 조작할 수 있어야 한다 (2026-08-08, 감사 L-9) ────────────────
// 지표를 잠금화면에 띄워 놓고 조작은 잠금을 풀어야만 되게 두면 이 알림의 목적을 반쯤
// 무효화한다. 자동 일시정지를 보고도 다시 뛰려면 폰을 꺼내야 한다 — 달리는 중에 하기
// 가장 나쁜 동작이다. NRC·스트라바 안드로이드판은 알림에서 바로 조작된다.
describe('알림 액션 버튼', () => {
  const bootAndroid = () => {
    jest.resetModules();
    const api: any = {
      setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
      scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
      dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
      setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
      addNotificationResponseReceivedListener: jest.fn((cb: any) => {
        api.__fire = cb;
        return {remove: jest.fn()};
      }),
    };
    jest.doMock('expo-notifications', () => api);
    const rn = require('react-native');
    rn.Platform.OS = 'android';
    return {api, rn};
  };
  afterEach(() => {
    jest.dontMock('expo-notifications');
    jest.resetModules();
  });

  test('달리는 중엔 [일시정지][종료] — 상태에 맞는 버튼이 붙는다', async () => {
    const {api} = bootAndroid();
    const {showRunNotification, RUN_ACTION} = require('../../lib/runNotification');
    await showRunNotification({km: 3, elapsedSec: 900, avgPaceSecPerKm: 300, paused: false});

    const cats = api.setNotificationCategoryAsync.mock.calls;
    const running = cats.find((c: any[]) =>
      c[1].some((a: any) => a.identifier === RUN_ACTION.pause));
    expect(running).toBeDefined();
    expect(running[1].map((a: any) => a.buttonTitle)).toEqual(['일시정지', '종료']);
    // 보낸 알림이 그 카테고리를 가리켜야 한다 — 등록만 하고 안 붙이면 버튼이 안 뜬다.
    expect(api.scheduleNotificationAsync.mock.calls[0][0].content.categoryIdentifier).toBe(running[0]);
  });

  test('멈춘 중엔 [재개][종료] — 다른 카테고리로 바뀐다', async () => {
    const {api} = bootAndroid();
    const {showRunNotification, RUN_ACTION} = require('../../lib/runNotification');
    await showRunNotification({km: 3, elapsedSec: 900, avgPaceSecPerKm: 300, paused: true});

    const cats = api.setNotificationCategoryAsync.mock.calls;
    const paused = cats.find((c: any[]) =>
      c[1].some((a: any) => a.identifier === RUN_ACTION.resume));
    expect(paused[1].map((a: any) => a.buttonTitle)).toEqual(['재개', '종료']);
    expect(api.scheduleNotificationAsync.mock.calls[0][0].content.categoryIdentifier).toBe(paused[0]);
  });

  test('버튼은 앱을 열지 않는다 — 달리는 중에 앱이 튀어나오면 그게 더 방해다', async () => {
    const {api} = bootAndroid();
    const {showRunNotification} = require('../../lib/runNotification');
    await showRunNotification({km: 1, elapsedSec: 300, avgPaceSecPerKm: null, paused: false});
    for (const call of api.setNotificationCategoryAsync.mock.calls) {
      for (const a of call[1]) expect(a.options.opensAppToForeground).toBe(false);
    }
  });

  test('우리 버튼만 콜백한다 — 알림 본문을 눌렀다고 러닝이 멈추면 안 된다', () => {
    const {api} = bootAndroid();
    const {onRunNotificationAction, RUN_ACTION} = require('../../lib/runNotification');
    const seen: string[] = [];
    onRunNotificationAction((a: string) => seen.push(a));

    api.__fire({actionIdentifier: 'expo.modules.notifications.actions.DEFAULT'}); // 본문 탭
    api.__fire({}); // 식별자 없음
    api.__fire({actionIdentifier: RUN_ACTION.pause});
    api.__fire({actionIdentifier: RUN_ACTION.stop});

    expect(seen).toEqual([RUN_ACTION.pause, RUN_ACTION.stop]);
  });

  test('구독 해제가 리스너를 떼어 낸다', () => {
    bootAndroid();
    const {onRunNotificationAction} = require('../../lib/runNotification');
    expect(() => onRunNotificationAction(() => {})()).not.toThrow();
  });

  test('모듈이 없으면 조용히 no-op — 호출부가 분기하지 않아도 된다', () => {
    jest.resetModules();
    jest.doMock('expo-notifications', () => {
      throw new Error('없음');
    });
    const {onRunNotificationAction} = require('../../lib/runNotification');
    expect(() => onRunNotificationAction(() => {})()).not.toThrow();
  });
});
