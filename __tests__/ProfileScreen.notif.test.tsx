/**
 * ProfileScreen 푸시 알림 설정(slice-8-notif-ui) 행동 테스트.
 *
 * props 주입(notifSettings·onChangeNotifSettings·onRequestPushPermission)으로 네이티브
 * 없이 "관찰 가능한 결과"를 단언한다(test_critic 요건 — 정적 스캔 불충분, 실제 단언 필수):
 *   1) 설정행 반영 — 주입한 notif_settings 가 토글의 켜짐/꺼짐 라벨과 요약 detail 에 그대로
 *      반영된다(화면이 실제 값을 보여준다).
 *   2) 토글 press → onChangeNotifSettings 올바른 인자 — 각 종류 토글을 누르면 해당 키만
 *      뒤집힌 NotifSettings 로 콜백된다(다른 키·reminderTime 보존). 리마인더 시각 +/- 도
 *      30분 증감된 reminderTime 으로 콜백된다.
 *   3) 권한 거부 비차단(S8-3) — onRequestPushPermission 이 false 를 돌려줘도 설정 변경은
 *      그대로 저장되고(콜백 호출됨), graceful 안내가 뜨며 크래시가 없다(나머지 동작 정상).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen.rn';
import {DEFAULT_NOTIF_SETTINGS, type NotifSettings} from '../lib/notifications';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(props: any) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  // 설정은 마이탭 헤더 ⚙️ 뒤의 '설정' 뷰로 분리됐다 — 설정 대상 테스트라 열어둔다.
  act(() => {
    renderer.root.findAll((n: any) => n.props?.accessibilityLabel === '설정 열기')[0]?.props?.onPress?.();
  });
  return renderer.root;
}

function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id)[0];
}
// 토글은 NotifToggle 래퍼 컴포넌트에도 testID prop 이 전달되므로, 실제 Pressable(=onPress·
// accessibilityState 를 가진 인스턴스)을 골라야 한다.
function pressableByTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id && typeof n.props?.onPress === 'function')[0];
}
function hasId(root: ReactTestRenderer.ReactTestInstance, id: string): boolean {
  return root.findAll((n: any) => n.props?.testID === id).length > 0;
}

// 동기 press(상태 토글 등).
function press(node: ReactTestRenderer.ReactTestInstance) {
  act(() => {
    node.props.onPress();
  });
}
// 비동기 press(권한 promise 체인을 act 안에서 흘려보낸다).
async function pressAsync(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    await node.props.onPress();
  });
}

// 알림 패널을 펼친 상태로 만든다(토글·시각 스테퍼가 트리에 마운트되도록).
function openNotif(root: ReactTestRenderer.ReactTestInstance) {
  press(byTestId(root, 'notif-row'));
}

const ALL_ON: NotifSettings = {...DEFAULT_NOTIF_SETTINGS};
const ALL_OFF: NotifSettings = {
  shoeReplacement: false,
  weeklyGoal: false,
  runReminder: false,
  reminderTime: '19:00',
};

describe('ProfileScreen 푸시 알림 설정행이 실제 notif_settings 를 반영', () => {
  test('전부 켜진 설정 → 요약은 "3개 켜짐", 각 토글 라벨은 "켜짐"', () => {
    const root = render({notifSettings: ALL_ON});
    expect(textOf(byTestId(root, 'notif-detail'))).toBe('3개 켜짐');
    openNotif(root);
    expect(textOf(pressableByTestId(root, 'notif-toggle-shoeReplacement'))).toContain('켜짐');
    expect(textOf(pressableByTestId(root, 'notif-toggle-weeklyGoal'))).toContain('켜짐');
    expect(textOf(pressableByTestId(root, 'notif-toggle-runReminder'))).toContain('켜짐');
    // 토글의 접근성 상태도 실제 값을 반영한다(checked=true).
    expect(pressableByTestId(root, 'notif-toggle-runReminder').props.accessibilityState.checked).toBe(true);
  });

  test('전부 꺼진 설정 → 요약은 "꺼짐", 각 토글 라벨은 "꺼짐"', () => {
    const root = render({notifSettings: ALL_OFF});
    expect(textOf(byTestId(root, 'notif-detail'))).toBe('꺼짐');
    openNotif(root);
    expect(textOf(pressableByTestId(root, 'notif-toggle-shoeReplacement'))).toContain('꺼짐');
    expect(pressableByTestId(root, 'notif-toggle-shoeReplacement').props.accessibilityState.checked).toBe(false);
  });

  test('일부만 켜진 설정 → 요약은 켜진 개수를 보여준다', () => {
    const root = render({notifSettings: {...ALL_OFF, weeklyGoal: true}});
    expect(textOf(byTestId(root, 'notif-detail'))).toBe('1개 켜짐');
    // 리마인더 시각도 주입값 그대로 표시된다.
    openNotif(root);
    expect(textOf(root).includes('19:00')).toBe(true);
  });
});

describe('ProfileScreen 푸시 알림 토글 press → onChangeNotifSettings 올바른 인자', () => {
  test('교체 임박 토글(꺼짐→켜짐): shoeReplacement 만 true 로 뒤집힌 설정으로 콜백', async () => {
    const onChangeNotifSettings = jest.fn();
    const onRequestPushPermission = jest.fn(() => Promise.resolve(true));
    const root = render({notifSettings: ALL_OFF, onChangeNotifSettings, onRequestPushPermission});
    openNotif(root);
    await pressAsync(pressableByTestId(root, 'notif-toggle-shoeReplacement'));
    expect(onChangeNotifSettings).toHaveBeenCalledTimes(1);
    expect(onChangeNotifSettings).toHaveBeenCalledWith({
      shoeReplacement: true,
      weeklyGoal: false,
      runReminder: false,
      reminderTime: '19:00',
    });
    // 켜는 동작에선 기기 권한을 1회 요청한다.
    expect(onRequestPushPermission).toHaveBeenCalledTimes(1);
  });

  test('주간 목표 토글(켜짐→꺼짐): weeklyGoal 만 false 로, 권한 요청은 하지 않는다', () => {
    const onChangeNotifSettings = jest.fn();
    const onRequestPushPermission = jest.fn(() => Promise.resolve(true));
    const root = render({notifSettings: ALL_ON, onChangeNotifSettings, onRequestPushPermission});
    openNotif(root);
    press(pressableByTestId(root, 'notif-toggle-weeklyGoal'));
    expect(onChangeNotifSettings).toHaveBeenCalledWith({
      shoeReplacement: true,
      weeklyGoal: false,
      runReminder: true,
      reminderTime: '19:00',
    });
    // 끄는 동작은 권한과 무관 — 요청하지 않는다.
    expect(onRequestPushPermission).not.toHaveBeenCalled();
  });

  test('리마인더 시각 +/- → 30분 증감된 reminderTime 으로 콜백(다른 키 보존)', () => {
    const onChangeNotifSettings = jest.fn();
    const root = render({notifSettings: {...ALL_ON, reminderTime: '19:00'}, onChangeNotifSettings});
    openNotif(root);
    // 스테퍼 +/- 버튼은 accessibilityLabel 로 식별(리마인더 시각 늘리기/줄이기).
    const plus = root.findAll((n: any) => n.props?.accessibilityLabel === '리마인더 시각 늘리기')[0];
    const minus = root.findAll((n: any) => n.props?.accessibilityLabel === '리마인더 시각 줄이기')[0];
    press(plus);
    expect(onChangeNotifSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({reminderTime: '19:30', shoeReplacement: true, weeklyGoal: true, runReminder: true}),
    );
    press(minus);
    expect(onChangeNotifSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({reminderTime: '18:30'}),
    );
  });
});

describe('ProfileScreen 푸시 권한 거부는 비차단(S8-3)', () => {
  test('권한 거부(false)에도 설정은 저장되고 graceful 안내가 뜨며 크래시가 없다', async () => {
    const onChangeNotifSettings = jest.fn();
    const onRequestPushPermission = jest.fn(() => Promise.resolve(false));
    const root = render({notifSettings: ALL_OFF, onChangeNotifSettings, onRequestPushPermission});
    openNotif(root);
    // 거부 전에는 안내가 없다.
    expect(hasId(root, 'notif-perm-denied')).toBe(false);
    await pressAsync(pressableByTestId(root, 'notif-toggle-runReminder'));
    // 1) 권한이 거부돼도 설정 변경은 그대로 상위로 올라간다(저장됨 — 비차단).
    expect(onChangeNotifSettings).toHaveBeenCalledWith(
      expect.objectContaining({runReminder: true}),
    );
    // 2) graceful 안내가 노출된다(거부 사실을 알리되 흐름을 막지 않음).
    expect(hasId(root, 'notif-perm-denied')).toBe(true);
    // 3) 권한 요청은 실제로 시도됐다.
    expect(onRequestPushPermission).toHaveBeenCalledTimes(1);
  });

  test('권한 요청이 throw 해도(방어) 크래시 없이 설정은 저장된다', async () => {
    const onChangeNotifSettings = jest.fn();
    const onRequestPushPermission = jest.fn(() => Promise.reject(new Error('native missing')));
    const root = render({notifSettings: ALL_OFF, onChangeNotifSettings, onRequestPushPermission});
    openNotif(root);
    await pressAsync(pressableByTestId(root, 'notif-toggle-shoeReplacement'));
    expect(onChangeNotifSettings).toHaveBeenCalledWith(
      expect.objectContaining({shoeReplacement: true}),
    );
    // throw 경로도 graceful 안내로 수렴(비차단).
    expect(hasId(root, 'notif-perm-denied')).toBe(true);
  });
});
