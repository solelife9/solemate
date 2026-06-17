/**
 * App.tsx 부팅캐시 + 오프라인 오버레이 + 클라우드→REST 역등록 통합 테스트 (audit a3).
 *
 * 관찰 가능한 결과만 단언한다(내부 상태/에러부재 검사 금지):
 *
 *   1) 오프라인 부팅 가시성: 백엔드가 다운이라도 부팅 폴백 캐시(cache_shoes_v1/
 *      cache_runs_v1) 위에 미동기 런 큐(pending_runs)를 오버레이해, 아직 서버로 못 간
 *      런까지 화면(이번 주 거리)에 보인다. 이미 캐시에 든 런은 중복되지 않는다.
 *   2) 클라우드 머지 역등록: ProfileScreen 자동 동기(pull→merge→push)의 병합 결과 중
 *      REST 정본에 없는(클라우드-only) 신발/런만 apiAddShoe/apiAddRun 으로 역등록되고,
 *      이미 REST 에 있던 레코드는 POST 되지 않는다.
 *   3) 역등록 멱등성(중복방지): 동일 원격을 다시 pull 해 재동기화해도, 1차에 서버 id 로
 *      reconcile + 옛 클라우드 id 묘비를 남겼으므로 같은 레코드가 두 번 POST 되지 않는다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

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
const has = (root: any, testID: string) =>
  root.findAll((n: any) => n.props && n.props.testID === testID).length > 0;
function pressTestID(root: any, testID: string) {
  root.find((n: any) => n.props && n.props.testID === testID).props.onPress();
}
function pressByLabel(root: any, label: string) {
  const node = root.find(
    (n: any) => n.props && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  act(() => {
    node.props.onPress();
  });
}

async function flush(times = 8) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// today (현재 주 안에 드는 날짜) — 런이 '이번 주 거리'에 집계되도록.
function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── 1) 오프라인 부팅: 캐시 + 미동기 큐 오버레이 가시성 ────────────────────────────
test('offline boot: 캐시 런 위에 미동기(pending) 런을 오버레이해 이번 주 거리에 합산해 보인다', async () => {
  await AsyncStorage.clear(); // clearAllMockStorages 누수 회피(메모리 키 완전 초기화)
  const day = todayYmd();
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]),
  );
  // 캐시엔 동기된 런 r1(5km)만 있다.
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([{id: 'r1', shoe_id: 's1', km: 5, run_date: day, duration: 1800}]),
  );
  // 큐엔 아직 서버로 못 간 런 run_p1(4.2km) — 오버레이로 보여야 한다.
  await AsyncStorage.setItem(
    'pending_runs',
    JSON.stringify([
      {
        localId: 'run_p1', shoe_id: 's1', km: 4.2, run_date: day, memo: '', source: 'gps',
        duration: 1200, cadence: 160, route: '', location: '', heart_rate: 0,
        run_time: '08:00', queuedAt: 1_700_000_000_000,
      },
    ]),
  );
  // 백엔드 다운 → 오프라인 분기.
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('cold backend')));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // 재시도 카드가 아니라 홈으로 부팅한다(캐시 폴백).
  expect(has(root, 'boot-error')).toBe(false);
  expect(textOf(root)).toContain('오늘은 어떤 신발로');
  // 이번 주 거리 = 캐시 런(5) + 미동기 런(4.2) = 9.2 → 오버레이가 반영됐다.
  expect(textOf(root)).toContain('9.2');

  act(() => renderer.unmount());
});

test('offline boot: 이미 캐시에 든 런(localId==id)은 큐 오버레이로 중복되지 않는다', async () => {
  await AsyncStorage.clear();
  const day = todayYmd();
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]),
  );
  // 캐시 런의 id 가 큐의 localId 와 같다(디바운스가 이미 캐시에 반영한 _pending 런).
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([{id: 'run_p1', shoe_id: 's1', km: 6, run_date: day, duration: 1800, _pending: true}]),
  );
  await AsyncStorage.setItem(
    'pending_runs',
    JSON.stringify([
      {
        localId: 'run_p1', shoe_id: 's1', km: 6, run_date: day, memo: '', source: 'gps',
        duration: 1800, cadence: 160, route: '', location: '', heart_rate: 0,
        run_time: '08:00', queuedAt: 1_700_000_000_000,
      },
    ]),
  );
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('cold backend')));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // 한 번만 집계(6.0) — 더해서 12.0 이 되면 안 된다(중복방지).
  expect(textOf(root)).toContain('6.0');
  expect(textOf(root)).not.toContain('12.0');

  act(() => renderer.unmount());
});

// ── 2)·3) 클라우드 머지 → REST 역등록 + 멱등성(중복방지) ─────────────────────────
test('cloud merge: REST 미존재 레코드만 역등록하고, 재동기화해도 중복 POST 하지 않는다', async () => {
  await AsyncStorage.clear(); // 직전 테스트의 pending_runs 누수가 boot 재동기 POST 로 새지 않게.
  const day = todayYmd();
  const calls: {method: string; url: string; body: any}[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let body: any;
    try {
      body = init && init.body ? JSON.parse(init.body) : undefined;
    } catch {
      body = undefined;
    }
    calls.push({method, url: u, body});
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    // 역등록 POST 는 새 서버 id 를 부여한다(클라이언트가 그 id 로 reconcile).
    if (u.includes('/api/shoes') && method === 'POST') return Promise.resolve(ok({id: 'S-server-1'}));
    if (u.includes('/api/runs') && method === 'POST') return Promise.resolve(ok({id: 'R-server-1'}));
    // REST 정본: 기존 신발 L1 + 런 rL1.
    if (u.includes('/api/shoes')) return Promise.resolve(ok([{id: 'L1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([{id: 'rL1', shoe_id: 'L1', km: 5, run_date: day, duration: 1800}]));
    return Promise.resolve(ok({}));
  });

  // 클라우드(원격)에만 있는 신발 C1 + 런 rC1 — REST 에 없으므로 역등록 대상.
  const remote = {
    shoes: [{id: 'C1', name: 'Adidas Boston', max_km: 700, start_km: 0, purchase_date: day}],
    runs: [{id: 'rC1', shoe_id: 'C1', km: 9, run_date: day, duration: 2400}],
    settings: {},
  };
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: 'runner@keego.app'})),
    signOut: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn(() => Promise.resolve()),
  };
  (globalThis as any).__KEEGO_CLOUD_PORT__ = port;

  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flush();
    const root = renderer.root;

    // 마이 탭 → 설정 열기 → Google 로그인(자동 동기 예약).
    pressByLabel(root, '마이');
    await flush();
    pressByLabel(root, '설정 열기');
    await flush();

    jest.useFakeTimers();
    await act(async () => {
      pressTestID(root, 'cloud-signin-google');
    });
    // 자동 동기 디바운스(1s) 경과 → pull→merge→push→onCloudMerged→역등록.
    const settle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(1300);
      });
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    };
    await settle();

    // 역등록: 클라우드-only C1/rC1 만 POST 됐다(기존 L1/rL1 은 아님).
    const shoePosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes'));
    expect(shoePosts.length).toBe(1);
    expect(shoePosts[0].body.name).toBe('Adidas Boston');
    const runPosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs'));
    expect(runPosts.length).toBe(1);
    expect(String(runPosts[0].body.km)).toBe('9');

    // 재동기화: 동일 원격을 다시 pull→merge. 멱등성 — C1/rC1 은 서버 id 로 reconcile +
    // 옛 클라우드 id 묘비라 다시 POST 되지 않는다.
    await settle();
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(1);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(1);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});
