/**
 * Phase 2 — 앱 전역 클라우드 동기(Firestore 정본) 테스트.
 *
 * 관찰 가능한 결과:
 *   1) 중앙화: ProfileScreen(마이 탭)으로 이동하지 않아도, 부팅/로그인 직후 cloudPort.pull
 *      (원격 복원)과 cloudPort.push(백업)가 호출된다 — 동기가 더 이상 프로필 탭에 묶여 있지 않다.
 *   2) 복원: 원격(Firestore)에만 있던 신발이 병합(mergeCloudData)되어 화면 상태로 들어온다.
 *
 * 동기는 __KEEGO_ENABLE_CLOUD_SYNC__ 로만 테스트에서 활성화한다(기본 우회 — 다른 App
 * 스위트는 영향 없음). cloudPort 는 메모리 목 주입.
 *
 * @format
 */
import React from 'react';
import {AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

// AppState 'change' 리스너들을 가로채 모아둔다(실제 OS 전환 없이 background/active 모사).
function captureAppStateHandlers() {
  const handlers: ((s: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type: any, cb: any) => {
    if (type === 'change') handlers.push(cb);
    return {remove: jest.fn()} as any;
  });
  return handlers;
}

type Resp = {ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string>};
const ok = (body: any): Resp => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

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

test('중앙 클라우드 동기: 프로필 탭 방문 없이 부팅 직후 pull→push 하고, 원격 신발을 복원한다', async () => {
  await AsyncStorage.clear();
  // REST 부팅은 비어 있게(로컬 빈 상태). 인증만 성공.
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    if (u.includes('/api/shoes')) return Promise.resolve(ok([]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([]));
    return Promise.resolve(ok({}));
  });

  // 원격(Firestore)에만 있는 신발 — pull 로 내려와 병합되어야 한다.
  const remote = {
    shoes: [{id: 'C1', name: 'Adidas Boston', max_km: 700, start_km: 0, updatedAt: 2}],
    runs: [],
    settings: {},
  };
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: null, displayName: null})),
    signOut: jest.fn(() => Promise.resolve()),
    deleteAccount: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn(() => Promise.resolve()),
  };
  (globalThis as any).__KEEGO_CLOUD_PORT__ = port;
  (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'test-uid'};
  (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__ = true;
  // devSeed 가 빈 상태를 덮지 않게(원격 복원만 보이도록).
  (globalThis as any).__KEEGO_DEV_SEED__ = false;

  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    jest.useFakeTimers();
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    // 부팅 effect(즉시 pull) + 디바운스(1.2s) 정착.
    const settle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      for (let i = 0; i < 14; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    };
    await settle();

    // 1) 중앙화: 프로필 탭으로 이동하지 않았는데도 pull/push 가 호출됐다.
    expect(port.pull).toHaveBeenCalled();
    expect(port.push).toHaveBeenCalled();

    // 2) 복원: 원격 신발이 병합되어 상태로 들어왔다. (빈 로컬 + 원격 1켤레 복원이라
    //    '첫 신발' 업적이 발동해 셀러브레이션이 떠 있다 — 복원이 실제로 일어났다는 증거.)
    //    셀러브레이션 '확인'을 눌러 닫은 뒤, 화면에서 원격 신발 이름을 직접 확인한다.
    const screen1 = textOf(renderer.toJSON());
    expect(screen1).toContain('첫 신발');
    const confirm = renderer.root.find(
      (n: any) => n.props && typeof n.props.onPress === 'function' &&
        textOf(n).includes('확인'),
    );
    await act(async () => {
      confirm.props.onPress();
    });
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    // (홈 히어로는 이름을 브랜드 대문자 + 모델로 쪼개 표시하므로 모델명 'Boston' 으로 확인.)
    const screen2 = textOf(renderer.toJSON());
    expect(screen2).toContain('Boston');

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
    delete (globalThis as any).__KEEGO_AUTH_USER__;
    delete (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__;
    delete (globalThis as any).__KEEGO_DEV_SEED__;
  }
});

// 회귀(데이터 유실): 부팅 직후 동기가 *아직 클라우드에 안 올라간 로컬-전용 런*을 지우면 안 된다.
// auth 복원이 캐시 로드보다 먼저 끝나는 레이스에서, 동기가 빈 로컬(runs=[])을 remote 와 머지해
// applyBackupPayload + 부팅캐시 영속이 로컬 런을 덮어쓰던 버그를 막는다(runCloudSync 의
// bootState ready 가드). fix 가 없으면 첫 push 페이로드가 런을 누락 → every(hasRun) 실패.
test('부팅 동기는 클라우드에 없는 로컬-전용 런을 보존한다(빈 로컬 클로버 금지)', async () => {
  await AsyncStorage.clear();
  // 로컬 부팅 캐시: 동기 안 된 GPS 런 1건(+신발). 원격엔 이 런이 없다.
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0, updatedAt: 1}]),
  );
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([
      {id: 'local-run-1', shoe_id: 's1', km: 5.1, run_date: '2026-06-24', source: 'gps', duration: 1800, route: '', updatedAt: 1782300000000},
    ]),
  );
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    return Promise.resolve(ok([]));
  });
  // 원격 백업엔 런이 없다(신발만). 머지가 로컬-전용 런을 보존하고 push 로 올려야 한다.
  const remote = {
    shoes: [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0, updatedAt: 1}],
    runs: [],
    settings: {},
  };
  const pushed: any[] = [];
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: null, displayName: null})),
    signOut: jest.fn(() => Promise.resolve()),
    deleteAccount: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn((d: any) => {
      pushed.push(d);
      return Promise.resolve();
    }),
  };
  (globalThis as any).__KEEGO_CLOUD_PORT__ = port;
  (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'test-uid'};
  (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__ = true;
  (globalThis as any).__KEEGO_DEV_SEED__ = false;

  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    jest.useFakeTimers();
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    const settle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      for (let i = 0; i < 14; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    };
    await settle();

    // 동기가 일어났고, *모든* push 페이로드가 로컬-전용 런을 포함해야 한다(빈 로컬 클로버 0회).
    expect(port.push).toHaveBeenCalled();
    const hasRun = (d: any) =>
      Array.isArray(d.runs) && d.runs.some((r: any) => String(r.id) === 'local-run-1');
    expect(pushed.length).toBeGreaterThan(0);
    expect(pushed.every(hasRun)).toBe(true);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
    delete (globalThis as any).__KEEGO_AUTH_USER__;
    delete (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__;
    delete (globalThis as any).__KEEGO_DEV_SEED__;
  }
});

// 빈틈 닫기: 앱 이탈(AppState 'background') 시 동기를 flush 한다. 런 저장 후 곧장 화면을 끄거나
// 앱을 종료해 1.2s 디바운스 창을 놓쳐도, 이탈 직전 push 가 한 번 더 걸려 유실을 막는다.
test('앱 백그라운드 전환 시 동기를 flush 한다(저장 직후 이탈 유실 방지)', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0, updatedAt: 1}]),
  );
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([
      {id: 'local-run-bg', shoe_id: 's1', km: 3.3, run_date: '2026-06-24', source: 'gps', duration: 1200, route: '', updatedAt: 1782300000001},
    ]),
  );
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    return Promise.resolve(ok([]));
  });
  const remote = {shoes: [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0, updatedAt: 1}], runs: [], settings: {}};
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: null, displayName: null})),
    signOut: jest.fn(() => Promise.resolve()),
    deleteAccount: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn(() => Promise.resolve()),
  };
  (globalThis as any).__KEEGO_CLOUD_PORT__ = port;
  (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'test-uid'};
  (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__ = true;
  (globalThis as any).__KEEGO_DEV_SEED__ = false;
  const handlers = captureAppStateHandlers();

  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    jest.useFakeTimers();
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    const flush = async () => {
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      for (let i = 0; i < 14; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    };
    await flush();

    const before = port.push.mock.calls.length;
    // 앱 이탈(background) — 등록된 모든 'change' 리스너에 전달.
    await act(async () => {
      handlers.forEach(h => h('background'));
    });
    await flush();

    // 이탈 시 동기가 한 번 더 돌아 push 가 추가로 호출된다(flush).
    expect(port.push.mock.calls.length).toBeGreaterThan(before);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
    delete (globalThis as any).__KEEGO_AUTH_USER__;
    delete (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__;
    delete (globalThis as any).__KEEGO_DEV_SEED__;
  }
});
