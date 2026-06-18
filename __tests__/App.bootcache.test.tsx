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

// ── 버그1) 고아 런 방지: 신발 POST 실패 시 그 자식 런은 cloud shoe_id 로 POST 되지 않는다 ───────
// 스펙('신발 id 재키잉으로 런 고아 방지') 위배 방지: 부모 신발이 REST 에 실재할 때만 자식 런을
// POST 한다. C1 신발 POST 가 실패하면 자식 런 rC1 은 (cloud id 로 폴백하지 않고) 건너뛰고,
// 부모 신발 C2 POST 가 성공한 자식 런 rC2 만 서버 신발 id 로 re-key 되어 reconcile 된다.
test('cloud merge: 부모 신발 POST 실패 시 자식 런은 고아(cloud shoe_id)로 POST되지 않고, 성공 부모의 런만 reconcile', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1'); // 빈 REST 정본이라도 온보딩이 아닌 탭 화면으로 부팅.
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
    if (u.includes('/api/shoes') && method === 'POST') {
      // C1(Adidas Boston) 신발 등록은 실패(서버 500), C2(Asics Nimbus)는 성공(서버 id 부여).
      if (body && body.name === 'Adidas Boston') {
        return Promise.resolve({ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve('boom')});
      }
      return Promise.resolve(ok({id: 'S2-server'}));
    }
    if (u.includes('/api/runs') && method === 'POST') return Promise.resolve(ok({id: 'R2-server'}));
    // REST 정본: 비어 있음(모든 클라우드 레코드가 역등록 대상).
    if (u.includes('/api/shoes')) return Promise.resolve(ok([]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([]));
    return Promise.resolve(ok({}));
  });

  const remote = {
    shoes: [
      {id: 'C1', name: 'Adidas Boston', max_km: 700, start_km: 0, purchase_date: day},
      {id: 'C2', name: 'Asics Nimbus', max_km: 800, start_km: 0, purchase_date: day},
    ],
    runs: [
      {id: 'rC1', shoe_id: 'C1', km: 9, run_date: day, duration: 2400}, // 부모 C1 실패 → 건너뜀
      {id: 'rC2', shoe_id: 'C2', km: 3, run_date: day, duration: 1200}, // 부모 C2 성공 → re-key 후 POST
    ],
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

    pressByLabel(root, '마이');
    await flush();
    pressByLabel(root, '설정 열기');
    await flush();

    jest.useFakeTimers();
    await act(async () => {
      pressTestID(root, 'cloud-signin-google');
    });
    await act(async () => {
      jest.advanceTimersByTime(1300);
    });
    for (let i = 0; i < 16; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // 두 신발 모두 역등록 시도(C1 실패, C2 성공).
    const shoePosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes'));
    expect(shoePosts.length).toBe(2);
    // 자식 런은 정확히 1개만 POST(rC2). 고아(C1 cloud shoe_id) POST 는 0.
    const runPosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs'));
    expect(runPosts.length).toBe(1);
    expect(String(runPosts[0].body.km)).toBe('3'); // rC2 (rC1=9 는 건너뜀)
    expect(String(runPosts[0].body.shoe_id)).toBe('S2-server'); // 서버 신발 id 로 re-key
    // 고아 방지: cloud shoe_id 'C1' 로 POST 된 런이 절대 없다.
    expect(runPosts.some(c => String(c.body.shoe_id) === 'C1')).toBe(false);
    expect(runPosts.some(c => String(c.body.km) === '9')).toBe(false);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});

// ── 버그2) 일시적 역등록 실패는 다음 sync 에서 재시도된다(영구 마스킹 금지) ────────────────────
// 'known=REST 확정'을 낙관적 state 가 아니라 실제 POST 성공분으로 판정하므로, 신발 POST 가
// 한 번 실패해도(applyBackupPayload 로 화면엔 낙관적으로 보여도) 다음 sync 에서 다시 POST 된다.
// 성공 뒤에는 REST 확정 집합에 들어가 더는 재-POST 되지 않는다(멱등).
test('cloud merge: 일시적 신발 POST 실패 후 다음 sync 에서 재시도되고(마스킹 안 됨), 성공 뒤엔 멱등', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1'); // 빈 REST 정본이라도 온보딩이 아닌 탭 화면으로 부팅.
  const day = todayYmd();
  let shoePostAttempts = 0;
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
    if (u.includes('/api/shoes') && method === 'POST') {
      shoePostAttempts += 1;
      // 1차 시도는 실패(네트워크 일시 장애), 2차부터 성공.
      if (shoePostAttempts === 1) {
        return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({}), text: () => Promise.resolve('temp')});
      }
      return Promise.resolve(ok({id: 'S-server-1'}));
    }
    if (u.includes('/api/runs') && method === 'POST') return Promise.resolve(ok({id: 'R-server-1'}));
    if (u.includes('/api/shoes')) return Promise.resolve(ok([]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([]));
    return Promise.resolve(ok({}));
  });

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

    pressByLabel(root, '마이');
    await flush();
    pressByLabel(root, '설정 열기');
    await flush();

    jest.useFakeTimers();
    await act(async () => {
      pressTestID(root, 'cloud-signin-google');
    });
    const settle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(1300);
      });
      for (let i = 0; i < 16; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    };

    // 1차 동기: 신발 POST 1회 시도(실패). 부모 미존재이므로 자식 런은 건너뜀(POST 0).
    await settle();
    expect(shoePostAttempts).toBe(1);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(0);

    // 2차 동기: 실패분이 마스킹되지 않고 *다시* 시도된다 — 이번엔 성공 → 런도 POST.
    await settle();
    expect(shoePostAttempts).toBe(2);
    const runPostsAfter2 = calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs'));
    expect(runPostsAfter2.length).toBe(1);
    expect(String(runPostsAfter2[0].body.shoe_id)).toBe('S-server-1'); // 성공 신발 id 로 re-key

    // 3차 동기: 성공 후엔 REST 확정 집합 + 묘비로 멱등 — 재-POST 0.
    await settle();
    expect(shoePostAttempts).toBe(2);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(1);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});

// ── 버그1) 런 영구 deferral deadlock 방지: 신발 POST 성공 + 같은 패스 런 POST 일시실패 ──────────
// 부모 신발(C1)이 서버 id(S1)로 역등록 성공한 뒤 같은 패스에서 자식 런(rC1) POST 가 *일시 실패*해도,
// 부모 성공 시 자식 런의 live shoe_id 를 즉시 S1 로 re-key 하므로, 다음 sync 에서 그 런은 이미 known
// REST id(S1)라 게이트를 통과해 **서버 신발 id(S1)로 정상 재시도·POST 된다**(영구 deferral 0, 고아 0).
// 이 fix 가 없으면 런의 shoe_id 가 옛 cloud id(C1)로 남고 C1 은 tombstone+known 이 되어 게이트가
// 영구 false → 런이 매 패스 영영 skip 된다(재-POST 0).
test('cloud merge: 신발 POST 성공+같은 패스 런 POST 일시실패 → 다음 sync 에서 그 런이 서버 신발 id로 POST 성공(영구 deferral 0)', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1'); // 빈 REST 정본이라도 온보딩이 아닌 탭 화면으로 부팅.
  const day = todayYmd();
  let runPostAttempts = 0;
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
    // 신발 역등록은 항상 성공하고 새 서버 id(S1)를 부여한다.
    if (u.includes('/api/shoes') && method === 'POST') return Promise.resolve(ok({id: 'S1-server'}));
    // 런 역등록: 1차 시도는 일시 실패(네트워크 장애), 2차부터 성공.
    if (u.includes('/api/runs') && method === 'POST') {
      runPostAttempts += 1;
      if (runPostAttempts === 1) {
        return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({}), text: () => Promise.resolve('temp')});
      }
      return Promise.resolve(ok({id: 'R1-server'}));
    }
    // REST 정본: 비어 있음(모든 클라우드 레코드가 역등록 대상).
    if (u.includes('/api/shoes')) return Promise.resolve(ok([]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([]));
    return Promise.resolve(ok({}));
  });

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

    pressByLabel(root, '마이');
    await flush();
    pressByLabel(root, '설정 열기');
    await flush();

    jest.useFakeTimers();
    await act(async () => {
      pressTestID(root, 'cloud-signin-google');
    });
    const settle = async () => {
      await act(async () => {
        jest.advanceTimersByTime(1300);
      });
      for (let i = 0; i < 16; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    };

    // 1차 동기: 신발 C1 POST 성공(S1). 같은 패스에서 자식 런 rC1 POST 는 1차 시도가 일시 실패.
    await settle();
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(1);
    expect(runPostAttempts).toBe(1);

    // 2차 동기: deferred 런이 *영구 skip 되지 않고* 재시도된다 — 부모가 이미 서버 id(S1)로 옮겨졌고
    // 런의 live shoe_id 도 즉시 S1 로 re-key 됐으므로 게이트 통과 → 이번엔 서버 신발 id(S1)로 POST 성공.
    await settle();
    expect(runPostAttempts).toBe(2);
    const runPosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs'));
    expect(runPosts.length).toBe(2);
    // 두 번의 런 POST 모두 서버 신발 id(S1)로 나갔다 — 절대 cloud shoe id(C1)로 POST 되지 않는다(고아 0).
    expect(runPosts.every(c => String(c.body.shoe_id) === 'S1-server')).toBe(true);
    expect(runPosts.some(c => String(c.body.shoe_id) === 'C1')).toBe(false);
    // 신발은 재-POST 되지 않는다(멱등, 중복 0).
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(1);

    // 3차 동기: 런도 서버 id 로 reconcile + 묘비라 멱등 — 재-POST 0(영구 deferral 0이 확정).
    await settle();
    expect(runPostAttempts).toBe(2);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(1);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});

// ── 데이터 유실 회귀) 온라인 부팅에서 백엔드가 데이터를 잃어도(빈 GET) 로컬 신발은 유실되지 않는다 ──
// 사용자 보고 버그: 익명(로그인X) 사용자가 추가한 신발이 앱을 껐다 켜면 사라진다. 원인은 부팅 성공
// 경로가 `setShoes(serverShoes)` 로 라이브를 서버 응답으로 통째 교체한 것 — Render 무료 백엔드가
// 스핀다운 때 데이터를 잃고 빈 목록을 돌려주면 캐시(로컬 정본)의 신발이 화면에서 사라졌다. fix:
// reconcileFetchedLocalFirst 로 로컬-퍼스트 병합 → 로컬-only 신발 보존 + backRegisterMerged 로
// (휘발된) 백엔드에 재등록해 서버 정본 복원. 정상(서버에 데이터 있음) 부팅엔 멱등 no-op.
test('online boot: 백엔드가 빈 목록을 줘도 캐시의 로컬 신발은 유실되지 않고 백엔드에 역등록된다', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
  const day = todayYmd();
  // 이전 세션에 디바운스 캐시 writer 가 저장한 사용자 신발 s1(+런 r1). REST 엔(스핀다운 휘발) 없다.
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0, purchase_date: day, updatedAt: 2000}]),
  );
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([{id: 'r1', shoe_id: 's1', km: 5, run_date: day, duration: 1800, updatedAt: 2000}]),
  );

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
    // 역등록 POST 는 새 서버 id 를 부여(클라이언트가 그 id 로 reconcile).
    if (u.includes('/api/shoes') && method === 'POST') return Promise.resolve(ok({id: 'S-new'}));
    if (u.includes('/api/runs') && method === 'POST') return Promise.resolve(ok({id: 'R-new'}));
    // 핵심: 백엔드가 데이터를 잃어 GET 이 빈 목록을 돌려준다.
    if (u.includes('/api/shoes')) return Promise.resolve(ok([]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([]));
    return Promise.resolve(ok({}));
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // ① 재시도 카드가 아니라 홈으로 부팅한다.
  expect(has(root, 'boot-error')).toBe(false);
  // ② 핵심: 캐시의 로컬 신발 s1 이 병합에서 보존돼(통째 교체였다면 사라짐) (휘발된) 백엔드에
  //    역등록(POST)된다 — POST 가 일어났다는 것 자체가 'state 에 살아남았다'는 증거.
  const shoePosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes'));
  expect(shoePosts.length).toBe(1);
  expect(shoePosts[0].body.name).toBe('Nike Pegasus');
  // ③ 자식 런 r1 도 서버 신발 id(S-new)로 re-key 되어 역등록된다(고아 0).
  const runPosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs'));
  expect(runPosts.length).toBe(1);
  expect(String(runPosts[0].body.shoe_id)).toBe('S-new');

  act(() => renderer.unmount());
});

// ── 정상 부팅 멱등) 백엔드에 데이터가 있으면 로컬-퍼스트 병합은 재-POST 하지 않는다(no-op) ──────
test('online boot: 서버에 신발이 이미 있으면 역등록 POST 0(멱등 no-op)', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
  const day = todayYmd();
  const calls: {method: string; url: string; body: any}[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    calls.push({method, url: u, body: undefined});
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    if (u.includes('/api/shoes') && method === 'POST') return Promise.resolve(ok({id: 'X'}));
    if (u.includes('/api/runs') && method === 'POST') return Promise.resolve(ok({id: 'Y'}));
    // 서버가 신발을 정상 보유.
    if (u.includes('/api/shoes')) return Promise.resolve(ok([{id: 'L1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([{id: 'rL1', shoe_id: 'L1', km: 5, run_date: day, duration: 1800}]));
    return Promise.resolve(ok({}));
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  expect(has(root, 'boot-error')).toBe(false);
  // 서버에 이미 있으므로(REST 확정) 역등록 POST 는 0(중복 방지·멱등 no-op).
  expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(0);
  expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(0);

  act(() => renderer.unmount());
});

// ── 버그2) 오프라인 부팅 seed: 미POST cloud-only 캐시 레코드를 'REST 확정'으로 오인하지 않는다 ─────
// 부팅캐시는 매 mutation 마다 full live state 로 재기록되어 applyBackupPayload(클라우드 머지)가 낙관적으로
// 끼운 **미POST cloud-only 레코드**를 포함할 수 있다. 오프라인 부팅(데이터 fetch 실패) 분기에서 이를
// 'REST 확정'으로 seed 하면, 온라인 복귀 후 cloud sync 가 그 레코드를 known 으로 보고 역등록을 영구
// 마스킹한다(REST 정본에 영영 합류 못 함). fix: 오프라인 분기에선 캐시로 seed 하지 않는다 → 캐시의
// cloud-only 신발/런이 온라인 복귀 시 정상 back-register 된다.
test('offline boot: 미POST cloud-only 캐시 레코드가 REST-확정으로 오인되지 않고, 온라인 복귀 시 back-register 된다', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
  const day = todayYmd();
  // 부팅캐시에 미POST cloud-only 신발 C9 + 런 rC9 가 들어 있다(이전 세션의 클라우드 머지가
  // 낙관적으로 끼운 뒤 디바운스 캐시 writer 가 live state 로 영속한 것 — REST 엔 아직 없음).
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 'C9', name: 'Hoka Clifton', max_km: 750, start_km: 0, purchase_date: day}]),
  );
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([{id: 'rC9', shoe_id: 'C9', km: 7, run_date: day, duration: 2100}]),
  );

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
    // 인증은 성공(userId 연결)하지만 데이터 fetch(GET)는 일시 실패 → 오프라인 캐시 부팅 분기.
    // (auth 성공으로 userId 가 잡혀, 온라인 복귀 후 cloud sync 의 back-register 가 실제로 동작한다.)
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    if ((u.includes('/api/shoes') || u.includes('/api/runs')) && method === 'GET') {
      return Promise.reject(new Error('cold backend (data fetch)'));
    }
    // 복귀 후 역등록 POST 는 성공하고 새 서버 id 를 부여한다.
    if (u.includes('/api/shoes') && method === 'POST') return Promise.resolve(ok({id: 'S9-server'}));
    if (u.includes('/api/runs') && method === 'POST') return Promise.resolve(ok({id: 'R9-server'}));
    return Promise.resolve(ok({}));
  });

  // 원격(클라우드)에도 같은 cloud-only 레코드가 있다(이 레코드의 출처).
  const remote = {
    shoes: [{id: 'C9', name: 'Hoka Clifton', max_km: 750, start_km: 0, purchase_date: day}],
    runs: [{id: 'rC9', shoe_id: 'C9', km: 7, run_date: day, duration: 2100}],
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

    // 오프라인 캐시 폴백으로 부팅됐다(재시도 카드 아님).
    expect(has(root, 'boot-error')).toBe(false);

    pressByLabel(root, '마이');
    await flush();
    pressByLabel(root, '설정 열기');
    await flush();

    jest.useFakeTimers();
    await act(async () => {
      pressTestID(root, 'cloud-signin-google');
    });
    await act(async () => {
      jest.advanceTimersByTime(1300);
    });
    for (let i = 0; i < 16; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // 핵심: 캐시의 cloud-only 신발 C9 가 'REST 확정'으로 오인돼 마스킹되지 *않고* 실제 역등록(POST)된다.
    const shoePosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes'));
    expect(shoePosts.length).toBe(1);
    expect(shoePosts[0].body.name).toBe('Hoka Clifton');
    // 자식 런도 서버 신발 id(S9)로 re-key 되어 back-register 된다(완전 reconcile, 마스킹 0).
    const runPosts = calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs'));
    expect(runPosts.length).toBe(1);
    expect(String(runPosts[0].body.shoe_id)).toBe('S9-server');

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});
