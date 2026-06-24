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

// ── 0) 삭제 부활 방지(#4): 부팅캐시에 남은 묘비 레코드는 부팅 라이브에서 걸러진다 ──────────
test('offline boot: 묘비(tombstones_v1)에 든 런은 캐시에 남아 있어도 부팅에서 걸러져 부활하지 않는다(#4)', async () => {
  await AsyncStorage.clear();
  const day = todayYmd();
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]),
  );
  // 캐시엔 r1(5km) + 삭제했지만 800ms 디바운스 전에 종료돼 캐시에 남은 r-del(3km).
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([
      {id: 'r1', shoe_id: 's1', km: 5, run_date: day, duration: 1800},
      {id: 'r-del', shoe_id: 's1', km: 3, run_date: day, duration: 1000},
    ]),
  );
  // 삭제 시 *동기적으로* 영속된 묘비. 부팅 필터가 r-del 을 라이브에서 빼야 한다.
  await AsyncStorage.setItem(
    'tombstones_v1',
    JSON.stringify({shoes: [], runs: [{id: 'r-del', shoe_id: 's1', km: 3, run_date: day, deleted: true, updatedAt: 1_700_000_000_000}]}),
  );
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('cold backend')));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const home = textOf(renderer.root);
  // 신발 히어로 사용거리 = r1(5)만. r-del 이 부활했다면 8 이었을 것.
  expect(home).toContain('5 / 600km 사용');
  expect(home).not.toContain('8 / 600km 사용');

  act(() => renderer.unmount());
});

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
  // [관측 위치 변경] 홈의 '이번 주 거리' QuickStats 행은 제거됐다(HomeScreen.rn.tsx 의 week
  // prop 은 더 이상 렌더되지 않음). 오버레이 합산은 이제 신발 히어로의 사용/잔여 거리에서
  // 관측한다: 캐시 런(5) + 미동기 런(4.2) = 9.2 → 사용 '9', 잔여 600-9.2≈'591'. 오버레이가
  // 없었다면 사용 '5'·잔여 '595' 였을 것이다.
  const home = textOf(root);
  expect(home).toContain('9 / 600km 사용');
  expect(home).toContain('591km 남았어요');
  expect(home).not.toContain('5 / 600km 사용');
  expect(home).not.toContain('595km 남았어요');

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

  // [관측 위치 변경] 홈 주간거리 행 제거 → 신발 히어로 사용/잔여로 관측. 캐시 런과 큐의
  // localId 가 같아 한 번만 집계: 사용 '6'·잔여 '594'(600-6). 중복됐다면 사용 '12'·잔여 '588'.
  const home = textOf(root);
  expect(home).toContain('6 / 600km 사용');
  expect(home).toContain('594km 남았어요');
  expect(home).not.toContain('12 / 600km 사용');
  expect(home).not.toContain('588km 남았어요');

  act(() => renderer.unmount());
});

// ── 2)·3) 클라우드 머지 → Firestore push(REST 역등록 폐지) + 멱등성 ───────────────
// [설계 변경] REST 역등록(backRegisterMerged/apiAddShoe/apiAddRun)은 제거됐다(App.tsx:929-934
// "REST 역등록은 제거됨 — Firestore 가 유일 백엔드이므로 정본 합류가 곧 push 다"). 따라서
// 클라우드 머지는 더 이상 /api/shoes·/api/runs 로 POST 하지 않는다. 새 정본 합류 경로는
// pull→mergeCloudData→push(Firestore)→applyBackupPayload(로컬 정본 반영)다(App.tsx:981-996).
// 새 동작을 검증한다: 원격-only 레코드가 (1) 로컬 정본(화면 상태)에 합류하고 (2) Firestore 로
// push 되며 (3) REST POST 는 0 이다. 재동기화해도 push 만 반복할 뿐 REST POST 는 계속 0.
test('cloud merge: 원격-only 레코드가 로컬 정본에 합류하고 Firestore 로 push 된다(REST POST 0)', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
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
    return Promise.resolve(ok([]));
  });

  // 클라우드(원격)에만 있는 신발 C1 + 런 rC1 — 머지로 로컬 정본에 합류해야 한다.
  const remote = {
    shoes: [{id: 'C1', name: 'Adidas Boston', max_km: 700, start_km: 0, purchase_date: day, updatedAt: 5000}],
    runs: [{id: 'rC1', shoe_id: 'C1', km: 9, run_date: day, duration: 2400, updatedAt: 5000}],
    settings: {},
  };
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: 'runner@keego.app'})),
    signOut: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn((_data: any) => Promise.resolve()),
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
    // 자동 동기 디바운스(1s) 경과 → pull→merge→push→applyBackupPayload.
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

    // (1)+(2) 로컬 정본 합류 == Firestore push: runCloudSync 는 같은 merged 를 push 하고
    // applyBackupPayload(로컬 상태)로 반영한다(App.tsx:994-996) — push payload 가 곧 로컬 정본.
    // 따라서 push 된 payload 에 원격-only C1/rC1 이 담겼는지로 '머지+합류'를 함께 관측한다.
    expect(port.push).toHaveBeenCalled();
    const pushed = port.push.mock.calls[port.push.mock.calls.length - 1][0] as any;
    expect(pushed.shoes.some((s: any) => s.name === 'Adidas Boston')).toBe(true);
    expect(pushed.runs.some((r: any) => String(r.km) === '9')).toBe(true);

    // (3) REST 역등록 폐지: /api/shoes·/api/runs POST 는 0.
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(0);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(0);

    // 재동기화: push 는 반복되어도 REST POST 는 여전히 0(멱등 — REST 정본 합류 없음).
    await settle();
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(0);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(0);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});

// ── 고아 런 방지(Firestore push 무결성) ─────────────────────────────────────────
// [설계 변경] 원래는 REST 역등록에서 '부모 신발 POST 가 실패하면 자식 런을 cloud shoe_id 로
// 고아 POST 하지 않는다(부모 성공분만 서버 id 로 re-key)'를 검증했다. REST 역등록이 제거돼
// 그 re-keying/실패-게이트 메커니즘은 더는 없다(App.tsx:929-934). Firestore 머지는 부모 신발과
// 자식 런을 한 payload 로 함께 push 하므로 '서버 id 재키잉'이 필요 없고, 자식 런의 shoe_id 는
// 머지된 payload 안의 신발을 그대로 가리킨다. 보존해야 할 불변식(고아 0 — 런의 shoe_id 가
// payload 에 실재하는 신발을 가리킨다)을 새 push 경로에서 검증한다.
test('cloud merge: Firestore push payload 에서 모든 런의 shoe_id 가 payload 안 신발을 가리킨다(고아 0)', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
  const day = todayYmd();
  const calls: {method: string; url: string; body: any}[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    calls.push({method, url: u, body: undefined});
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    return Promise.resolve(ok([]));
  });

  const remote = {
    shoes: [
      {id: 'C1', name: 'Adidas Boston', max_km: 700, start_km: 0, purchase_date: day, updatedAt: 5000},
      {id: 'C2', name: 'Asics Nimbus', max_km: 800, start_km: 0, purchase_date: day, updatedAt: 5000},
    ],
    runs: [
      {id: 'rC1', shoe_id: 'C1', km: 9, run_date: day, duration: 2400, updatedAt: 5000},
      {id: 'rC2', shoe_id: 'C2', km: 3, run_date: day, duration: 1200, updatedAt: 5000},
    ],
    settings: {},
  };
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: 'runner@keego.app'})),
    signOut: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn((_data: any) => Promise.resolve()),
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

    // 머지 payload 가 Firestore 로 push 됐다.
    expect(port.push).toHaveBeenCalled();
    const pushed = port.push.mock.calls[port.push.mock.calls.length - 1][0] as any;
    // 부모 신발 C1·C2 모두 payload 에 있다(어느 쪽도 버려지지 않는다 — 무손실 머지).
    const shoeIds = new Set((pushed.shoes as any[]).map(s => String(s.id)));
    expect(shoeIds.has('C1')).toBe(true);
    expect(shoeIds.has('C2')).toBe(true);
    // 고아 0: 모든 런의 shoe_id 가 payload 안 신발을 가리킨다(cloud id 그대로, re-key 불필요).
    const liveRunsPushed = (pushed.runs as any[]).filter(r => !r.deleted);
    expect(liveRunsPushed.length).toBeGreaterThan(0);
    expect(liveRunsPushed.every(r => shoeIds.has(String(r.shoe_id)))).toBe(true);
    // REST 역등록은 일어나지 않는다(POST 0).
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(0);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(0);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});

// [제거됨] 'cloud merge: 일시적 신발 POST 실패 후 다음 sync 에서 재시도된다(마스킹 안 됨)' 및
// 'cloud merge: 신발 POST 성공+같은 패스 런 POST 일시실패 → 다음 sync 에서 서버 신발 id 로 POST'.
// 두 테스트는 REST 역등록의 '실제 POST 성공분으로 known 판정 → 실패분 재시도 / 부모 성공 후
// 자식 런 re-key 로 영구 deferral 방지' 메커니즘을 검증했다. REST 역등록(apiAddShoe/apiAddRun)이
// 제거되며(App.tsx:929-934) 이 메커니즘(POST 시도 카운팅·서버 id 재키잉·deferral 게이트) 자체가
// 사라졌다 — Firestore push 는 머지 payload 1건의 원자 호출이라 부분 실패/재키잉/deferral 이
// 없다. 폐지된 서브시스템을 검증하던 두 테스트는 제거한다(REST POST 0·무손실 머지는 위
// '원격-only 합류'·'고아 0' 테스트가 계속 커버한다).

// ── 데이터 유실 회귀) 부팅에서 백엔드가 데이터를 잃어도(빈 GET) 캐시의 로컬 신발은 유실되지 않는다 ──
// 사용자 보고 버그: 익명(로그인X) 사용자가 추가한 신발이 앱을 껐다 켜면 사라진다. 원인은 옛 부팅
// 성공 경로가 `setShoes(serverShoes)` 로 라이브를 서버 응답으로 통째 교체한 것 — 백엔드가 빈 GET
// 을 주면 캐시 신발이 사라졌다. [설계 변경] Firestore 정본·로컬-퍼스트 부팅으로 전환되며 부팅은
// REST GET 을 하지 않고 로컬 캐시(loadBootCache)에서 직접 읽는다(App.tsx:597-608) — 서버 빈 GET
// 이 라이브를 덮을 여지가 원천 차단됐다. REST 역등록도 제거됐다(App.tsx:929-934). 따라서 새
// 동작을 검증한다: 캐시 신발이 부팅 후 화면에 그대로 살아 있고, REST 로의 역등록 POST 는 0 이다.
test('online boot: 백엔드가 빈 목록을 줘도(또는 GET 자체가 없어도) 캐시의 로컬 신발은 화면에 유실되지 않는다', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
  const day = todayYmd();
  // 이전 세션에 디바운스 캐시 writer 가 저장한 사용자 신발 s1(+런 r1).
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
    calls.push({method, url: u, body: undefined});
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    // 백엔드가 데이터를 잃어 GET 이 빈 목록을 돌려준다(옛 회귀 트리거).
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
  // ② 핵심: 캐시 신발 s1(Nike Pegasus)이 부팅 후 화면에 살아 있다(서버 빈 GET 이 덮지 못함).
  expect(textOf(root)).toContain('Pegasus');
  // ③ REST 역등록은 일어나지 않는다(폐지 — Firestore push 가 정본 합류를 담당).
  expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(0);
  expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(0);

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

// ── 캐시의 cloud-only 레코드가 동기에서 마스킹되지 않고 Firestore 정본에 합류한다 ─────────────
// [설계 변경] 원래는 '오프라인 부팅 캐시에 든 미POST cloud-only 레코드를 REST 확정으로 오인하면
// 온라인 복귀 후 역등록이 영구 마스킹된다'는 REST 역등록 게이트 회귀를 막았다. REST 역등록이
// 제거됐으므로(App.tsx:929-934) 'REST 확정 마스킹' 개념 자체가 없다. 보존해야 할 불변식은
// '캐시에서 부팅된 cloud-only 신발/런이 클라우드 동기에서 버려지지 않고 Firestore 정본(push
// payload)에 합류한다'는 것 — 새 push 경로에서 검증한다.
test('cloud merge: 캐시에서 부팅된 cloud-only 신발/런이 마스킹되지 않고 Firestore push payload 에 합류한다', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
  const day = todayYmd();
  // 부팅캐시에 cloud-only 신발 C9 + 런 rC9 가 들어 있다(이전 세션 클라우드 머지가 낙관적으로
  // 끼운 뒤 디바운스 캐시 writer 가 live state 로 영속한 것).
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 'C9', name: 'Hoka Clifton', max_km: 750, start_km: 0, purchase_date: day, updatedAt: 3000}]),
  );
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([{id: 'rC9', shoe_id: 'C9', km: 7, run_date: day, duration: 2100, updatedAt: 3000}]),
  );

  const calls: {method: string; url: string; body: any}[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    calls.push({method, url: u, body: undefined});
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    return Promise.resolve(ok([]));
  });

  // 원격(클라우드)에도 같은 cloud-only 레코드가 있다(이 레코드의 출처) — 머지는 무손실.
  const remote = {
    shoes: [{id: 'C9', name: 'Hoka Clifton', max_km: 750, start_km: 0, purchase_date: day, updatedAt: 3000}],
    runs: [{id: 'rC9', shoe_id: 'C9', km: 7, run_date: day, duration: 2100, updatedAt: 3000}],
    settings: {},
  };
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: 'runner@keego.app'})),
    signOut: jest.fn(() => Promise.resolve()),
    pull: jest.fn(() => Promise.resolve(remote)),
    push: jest.fn((_data: any) => Promise.resolve()),
  };
  (globalThis as any).__KEEGO_CLOUD_PORT__ = port;

  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flush();
    const root = renderer.root;

    // 캐시 폴백으로 부팅됐다(재시도 카드 아님) + cloud-only 신발이 화면에 살아 있다.
    expect(has(root, 'boot-error')).toBe(false);
    expect(textOf(root)).toContain('Clifton');

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

    // 핵심: cloud-only C9/rC9 가 마스킹되지 *않고* Firestore push payload 에 합류한다.
    expect(port.push).toHaveBeenCalled();
    const pushed = port.push.mock.calls[port.push.mock.calls.length - 1][0] as any;
    expect(pushed.shoes.some((s: any) => s.name === 'Hoka Clifton')).toBe(true);
    expect(pushed.runs.some((r: any) => String(r.km) === '7')).toBe(true);
    // REST 역등록은 일어나지 않는다(폐지).
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/shoes')).length).toBe(0);
    expect(calls.filter(c => c.method === 'POST' && c.url.includes('/api/runs')).length).toBe(0);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
    delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  }
});
