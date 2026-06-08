/**
 * App.tsx 푸시 알림 포그라운드 배선(slice-8-notif-ui) 행동 테스트.
 *
 * 백그라운드 → 포그라운드(AppState 'active') 전환 시 App 이 dueNotifications(현재 신발
 * forecast·weekly·lastRun·notif_settings 조합)를 계산해 lib/pushMessaging.presentDue 로
 * 표시하는지 "관찰 가능한 결과(Alert 표시 호출)"로 단언한다. 시각 의존성을 없애기 위해
 * reminderTime 을 '00:00' 으로 두고 런 0개(오늘 런 없음)로 만들어 run_reminder 가 항상
 * 트리거되게 한다(전역 Date 모킹 불필요). 권한/네이티브는 jest.setup 모킹으로 격리된다.
 *
 * 또한 기존 흐름 보존: 최초 마운트(이미 active)에는 알림을 띄우지 않는다(중복 표시 0).
 *
 * @format
 */
import React from 'react';
import {Alert, AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

function mockEmptyBackend() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes') || u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

// AppState 'change' 리스너를 가로채 핸들러를 캡처한다(실제 OS 전환 없이 포그라운드 진입 모사).
function captureAppState() {
  const ref: {handler: ((s: string) => void) | null} = {handler: null};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type: any, cb: any) => {
    if (type === 'change') ref.handler = cb;
    return {remove: jest.fn()} as any;
  });
  return ref;
}

async function mountApp() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // 부트(설정·notif_settings 비동기 복원)의 AsyncStorage→parse→setState 체인을 여러 틱
  // 흘려보내, 포그라운드 발화 시점에 notifSettings 가 확실히 반영되게 한다(시간 의존 제거).
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  return renderer;
}

describe('App 포그라운드 진입 시 dueNotifications → presentDue 표시', () => {
  test('run_reminder 설정이 켜져 있고 오늘 런이 없으면 포그라운드 진입 시 리마인더 Alert 를 띄운다', async () => {
    mockEmptyBackend();
    await AsyncStorage.removeItem('notif_presented');
    // notif_settings: 러닝 리마인더만 켜고 시각 00:00(항상 충족) → 시간 의존 제거.
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: false, weeklyGoal: false, runReminder: true, reminderTime: '00:00'}),
    );
    const appState = captureAppState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const renderer = await mountApp();
    // 최초 마운트(이미 active)에는 표시하지 않는다 — 'change' 이벤트가 오지 않았으므로.
    expect(appState.handler).toBeTruthy();
    alertSpy.mockClear();

    // 백그라운드 → 포그라운드 전환.
    await act(async () => {
      appState.handler!('active');
    });

    const titles = alertSpy.mock.calls.map(c => String(c[0]));
    expect(titles).toContain('오늘 달릴 시간이에요');

    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    act(() => renderer.unmount());
  });

  test('같은 날 두 번째 포그라운드 진입에는 같은 알림을 다시 띄우지 않는다(당일 1회, A8-4)', async () => {
    mockEmptyBackend();
    await AsyncStorage.removeItem('notif_presented');
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: false, weeklyGoal: false, runReminder: true, reminderTime: '00:00'}),
    );
    const appState = captureAppState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const renderer = await mountApp();
    alertSpy.mockClear();

    await act(async () => {
      appState.handler!('active');
    });
    const firstCount = alertSpy.mock.calls.filter(c => String(c[0]) === '오늘 달릴 시간이에요').length;
    expect(firstCount).toBe(1);

    // 두 번째 진입 — 이미 표시한 key 라 다시 띄우지 않는다.
    await act(async () => {
      appState.handler!('active');
    });
    const secondCount = alertSpy.mock.calls.filter(c => String(c[0]) === '오늘 달릴 시간이에요').length;
    expect(secondCount).toBe(1);

    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    act(() => renderer.unmount());
  });

  test('모든 종류가 꺼진 설정이면 포그라운드 진입에도 아무 알림을 띄우지 않는다(비차단·끄기 동작)', async () => {
    mockEmptyBackend();
    await AsyncStorage.removeItem('notif_presented');
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: false, weeklyGoal: false, runReminder: false, reminderTime: '00:00'}),
    );
    const appState = captureAppState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const renderer = await mountApp();
    alertSpy.mockClear();

    await act(async () => {
      appState.handler!('active');
    });
    const titles = alertSpy.mock.calls.map(c => String(c[0]));
    expect(titles).not.toContain('오늘 달릴 시간이에요');

    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    act(() => renderer.unmount());
  });
});
