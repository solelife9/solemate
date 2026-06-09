/**
 * App.tsx 푸시 알림 포그라운드 배선(slice-8-notif-ui) 행동 테스트.
 *
 * 백그라운드 → 포그라운드(AppState 'active') 전환 시 App 이 dueNotifications(현재 신발
 * forecast·weekly·lastRun·notif_settings 조합)를 계산해 lib/pushMessaging.presentDue 로
 * 표시하는지 "관찰 가능한 결과(Alert 표시 호출)"로 단언한다. 시각 의존성을 없애기 위해
 * reminderTime 을 '00:00' 으로 두고 런 0개(오늘 런 없음)로 만들어 run_reminder 가 항상
 * 트리거되게 한다(전역 Date 모킹 불필요). 권한/네이티브는 jest.setup 모킹으로 격리된다.
 *
 * 또한 기존 흐름 보존을 명시적으로 단언한다:
 *   · 최초 마운트(이미 active)에는 알림을 띄우지 않는다 — mockClear 전에 단언(회귀 가드).
 *   · notif 설정을 바꿔도 기존 인앱 배지 설정(settings_alerts)은 불변(데이터 파괴 0).
 *   · 당일 중복방지(A8-4)는 재시작(remount)을 넘어 유지된다 — notif_presented 영속 단언.
 *   · 표시 경로는 run_reminder 뿐 아니라 shoe_replacement(forecast)·weekly_goal 도
 *     App 레벨에서 트리거된다(App 이 forecast/weekly/lastRun 입력을 올바로 조립).
 *
 * @format
 */
import React from 'react';
import {Alert, AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ymdLocal} from '../lib/format';
import App from '../App';

type ApiShoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type ApiRun = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

// 오늘 로컬 날짜('YYYY-MM-DD') — App 의 today()/ymdLocal 과 동일 산식으로 키를 맞춘다.
function localToday(): string {
  return ymdLocal(new Date());
}

const REMINDER_TITLE = '오늘 달릴 시간이에요';
const SHOE_TITLE = '러닝화 교체 시점';
const WEEKLY_TITLE = '이번 주 목표';

// 백엔드 응답을 주입한다(빈 목록이 기본 — 인자로 신발/런을 채울 수 있다).
function mockBackend(shoes: ApiShoe[] = [], runs: ApiRun[] = []) {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) body = shoes;
    else if (u.includes('/api/runs')) body = runs;
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

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

// 탭/행/토글 텍스트 매칭(탭은 accessibilityLabel 로 식별).
function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  if ((out === '' || node.props?.accessibilityRole === 'tab') && typeof node.props?.accessibilityLabel === 'string') {
    return node.props.accessibilityLabel;
  }
  return out;
}

function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string): ReactTestRenderer.ReactTestInstance {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

async function tap(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    await node.props.onPress();
  });
  await flush();
}

describe('App 포그라운드 진입 시 dueNotifications → presentDue 표시', () => {
  test('run_reminder 설정이 켜져 있고 오늘 런이 없으면 포그라운드 진입 시 리마인더 Alert 를 띄운다', async () => {
    mockBackend();
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
    // mockClear 로 지우기 전에 명시적으로 단언: 초기 마운트에 리마인더 Alert 가 발생하지
    // 않았다(온보딩/부트 흐름과 독립 — '첫 마운트 표시' 회귀를 여기서 잡는다).
    expect(alertSpy.mock.calls.map(c => String(c[0]))).not.toContain(REMINDER_TITLE);
    alertSpy.mockClear();

    // 백그라운드 → 포그라운드 전환.
    await act(async () => {
      appState.handler!('active');
    });

    const titles = alertSpy.mock.calls.map(c => String(c[0]));
    expect(titles).toContain(REMINDER_TITLE);

    await flush();
    act(() => renderer.unmount());
  });

  test('같은 날 두 번째 포그라운드 진입에는 같은 알림을 다시 띄우지 않는다(당일 1회, A8-4)', async () => {
    mockBackend();
    await AsyncStorage.removeItem('notif_presented');
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: false, weeklyGoal: false, runReminder: true, reminderTime: '00:00'}),
    );
    const appState = captureAppState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const renderer = await mountApp();
    // 초기 마운트에는 리마인더 Alert 가 없다(중복 표시 0) — 지우기 전에 단언.
    expect(alertSpy.mock.calls.map(c => String(c[0]))).not.toContain(REMINDER_TITLE);
    alertSpy.mockClear();

    await act(async () => {
      appState.handler!('active');
    });
    const firstCount = alertSpy.mock.calls.filter(c => String(c[0]) === REMINDER_TITLE).length;
    expect(firstCount).toBe(1);

    // 두 번째 진입 — 이미 표시한 key 라 다시 띄우지 않는다.
    await act(async () => {
      appState.handler!('active');
    });
    const secondCount = alertSpy.mock.calls.filter(c => String(c[0]) === REMINDER_TITLE).length;
    expect(secondCount).toBe(1);

    await flush();
    act(() => renderer.unmount());
  });

  test('모든 종류가 꺼진 설정이면 포그라운드 진입에도 아무 알림을 띄우지 않는다(비차단·끄기 동작)', async () => {
    mockBackend();
    await AsyncStorage.removeItem('notif_presented');
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: false, weeklyGoal: false, runReminder: false, reminderTime: '00:00'}),
    );
    const appState = captureAppState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const renderer = await mountApp();
    // 초기 마운트에도 리마인더 Alert 가 없다(끄기 설정 + 첫 마운트 독립).
    expect(alertSpy.mock.calls.map(c => String(c[0]))).not.toContain(REMINDER_TITLE);
    alertSpy.mockClear();

    await act(async () => {
      appState.handler!('active');
    });
    const titles = alertSpy.mock.calls.map(c => String(c[0]));
    expect(titles).not.toContain(REMINDER_TITLE);

    await flush();
    act(() => renderer.unmount());
  });
});

describe('App 데이터 파괴 0 — notif 설정 변경이 기존 인앱 배지 설정을 건드리지 않는다', () => {
  test('notif 토글 변경 → notif_settings 만 갱신, settings_alerts(AlertSettings)는 불변(iron law)', async () => {
    mockBackend([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}], []);
    // 기존 인앱 배지 설정을 디스크에 시드(구별되는 비기본값) — 변경되면 즉시 드러나게.
    const SEEDED_ALERTS = JSON.stringify({enabled: false, thresholdPct: 73});
    await AsyncStorage.setItem('settings_alerts', SEEDED_ALERTS);
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: true, weeklyGoal: true, runReminder: true, reminderTime: '19:00'}),
    );

    const renderer = await mountApp();
    const root = renderer.root;

    // 프로필(마이) → 푸시 알림 행 펼치기 → '러닝 리마인더' 끄기(끄기는 권한 요청과 무관).
    await tap(pressBy(root, '마이'));
    await tap(pressBy(root, '푸시 알림'));
    await tap(pressBy(root, '러닝 리마인더'));

    // 1) notif_settings 는 갱신됐다(러닝 리마인더 off).
    const notifRaw = await AsyncStorage.getItem('notif_settings');
    expect(JSON.parse(notifRaw as string).runReminder).toBe(false);

    // 2) settings_alerts 는 바이트까지 그대로다 — 별개 키, 절대 건드리지 않음(데이터 파괴 0).
    expect(await AsyncStorage.getItem('settings_alerts')).toBe(SEEDED_ALERTS);

    await flush();
    act(() => renderer.unmount());
  });
});

describe('App 당일 중복방지는 재시작(remount)을 넘어 유지된다(A8-4 영속)', () => {
  test('첫 표시 후 notif_presented 에 오늘 키가 영속되고, 재마운트(새 인스턴스) 후에도 다시 띄우지 않는다', async () => {
    mockBackend([], []);
    await AsyncStorage.removeItem('notif_presented');
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: false, weeklyGoal: false, runReminder: true, reminderTime: '00:00'}),
    );

    // ── 1차 실행 — 포그라운드 진입에 리마인더 1회 표시.
    const appState1 = captureAppState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const r1 = await mountApp();
    alertSpy.mockClear();
    await act(async () => {
      appState1.handler!('active');
    });
    expect(alertSpy.mock.calls.filter(c => String(c[0]) === REMINDER_TITLE).length).toBe(1);

    // 표시 후 오늘 키가 notif_presented 에 "디스크로" 영속된다(인메모리 ref 뿐 아니라).
    // 이 단언이 있어야 재시작을 넘는 중복방지를 보장한다(ref-only dedup 으로는 통과 불가).
    await flush();
    const presented = JSON.parse((await AsyncStorage.getItem('notif_presented')) || '[]');
    expect(presented).toContain(`run_reminder:${localToday()}`);
    act(() => r1.unmount());

    // ── 2차 실행(재시작) — 같은 AsyncStorage(notif_presented 유지). 새 인스턴스라 인메모리
    // ref 는 비어 시작하지만, 영속 키를 부트에서 복원하므로 같은 날 같은 알림을 안 띄운다.
    const appState2 = captureAppState();
    alertSpy.mockClear();
    const r2 = await mountApp();
    alertSpy.mockClear();
    await act(async () => {
      appState2.handler!('active');
    });
    expect(alertSpy.mock.calls.filter(c => String(c[0]) === REMINDER_TITLE).length).toBe(0);

    await flush();
    act(() => r2.unmount());
  });
});

describe('App 이 forecast/weekly 입력을 조립해 다른 종류의 표시 경로도 트리거한다', () => {
  test('shoe_replacement — 수명을 초과(overdue)한 신발이 있으면 포그라운드 진입 시 교체 Alert 를 띄운다', async () => {
    // 목표 100km 신발에 500km 런 1건 → 실효 마모가 목표를 크게 초과(overdue). forecast 는
    // App 이 신발·런에서 조립한다(중복 계산 0). 시간 의존 없음(overdue 는 잔여≤0 분기).
    mockBackend(
      [{id: 's1', name: 'Nike Pegasus', max_km: 100, start_km: 0}],
      [{id: 'r1', shoe_id: 's1', km: 500, run_date: localToday(), duration: 1800}],
    );
    await AsyncStorage.removeItem('notif_presented');
    await AsyncStorage.setItem(
      'notif_settings',
      JSON.stringify({shoeReplacement: true, weeklyGoal: false, runReminder: false, reminderTime: '23:59'}),
    );
    const appState = captureAppState();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const renderer = await mountApp();
    alertSpy.mockClear();
    await act(async () => {
      appState.handler!('active');
    });

    const titles = alertSpy.mock.calls.map(c => String(c[0]));
    expect(titles).toContain(SHOE_TITLE);

    await flush();
    act(() => renderer.unmount());
  });

  test('weekly_goal — 금요일 + 주간 목표 미달이면 포그라운드 진입 시 주간 목표 Alert 를 띄운다', async () => {
    // weekly_goal 은 "금요일 이후 + 목표<100%"가 조건이라 요일 의존적이다. 시스템 시각을
    // 금요일 정오(2026-06-12)에 고정하고(타이머만 가짜, 마이크로태스크/부트 async 는 동작),
    // 이번 주 월요일(06-08)에 10km 런 1건을 시드 → 기본 목표 30km 대비 33%(<100). App 이
    // weeklyProgress 를 조립해 weekly_goal 을 트리거하는지 App 레벨에서 단언한다.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-06-12T12:00:00')); // 금요일 정오
      mockBackend(
        [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}],
        [{id: 'r1', shoe_id: 's1', km: 10, run_date: '2026-06-08', duration: 1800}],
      );
      await AsyncStorage.removeItem('notif_presented');
      await AsyncStorage.setItem(
        'notif_settings',
        JSON.stringify({shoeReplacement: false, weeklyGoal: true, runReminder: false, reminderTime: '23:59'}),
      );
      const appState = captureAppState();
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      const renderer = await mountApp();
      alertSpy.mockClear();
      await act(async () => {
        appState.handler!('active');
      });

      const titles = alertSpy.mock.calls.map(c => String(c[0]));
      expect(titles).toContain(WEEKLY_TITLE);

      await flush();
      act(() => renderer.unmount());
    } finally {
      jest.useRealTimers();
    }
  });
});
