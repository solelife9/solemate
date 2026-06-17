/**
 * App.tsx mutation 의 updatedAt 스탬프 통합 테스트 (audit a1).
 *
 * 모든 신발/런 mutation 은 레코드에 updatedAt(epoch ms)을 찍어야 cloudSync 의 '최신 우선'
 * 머지가 실데이터에서 작동한다. 여기서는 관찰 가능한 결과만 검증한다:
 *   1) addRun  — 완주 런이 미동기 큐(loadPendingRuns)에 updatedAt(숫자, >0)과 함께 남는다.
 *   2) updateShoeMaxKm — 수명 조정 후 신발 레코드(ShoesScreen rawShoes prop)에 updatedAt.
 *   3) retireShoe — 보관 토글 후 신발 레코드에 updatedAt(+ retired 반영).
 *   4) addShoe — 신규 등록(AddShoeScreen onSave) 후 생성 신발 레코드에 updatedAt
 *      (+ id/name/max_km/start_km 보존).
 *   5) editRun — 런 편집(HistoryScreen onEditRun) 후 편집 런 레코드에 updatedAt
 *      (+ km/duration 반영) → scenario #1 edit-wins 배선.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {SNAPSHOT_KEY, RunSnapshot, loadPendingRuns} from '../lib/runPersistence';

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
  return out;
}

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

/** Find the single mounted component whose props carry the given handler name. */
function findByProp(root: ReactTestRenderer.ReactTestInstance, prop: string) {
  const hits = root.findAll(n => n.props && typeof n.props[prop] === 'function');
  if (hits.length === 0) throw new Error(`no component with prop: ${prop}`);
  return hits[0];
}

async function tick(n = 6) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  // 기본 픽스처(setup.after)가 지운 onboarding 플래그를 복원 — 곧장 Home 으로 마운트.
  await AsyncStorage.setItem('onboarded', '1');
  await AsyncStorage.setItem('loc_perm_primed', '1');
});

// ── 1) addRun: 완주 런이 updatedAt 과 함께 큐에 남는다 ────────────────────────────
const SNAP: RunSnapshot = {
  dist: 3.2,
  elapsed: 900,
  pts: [
    {lat: 37.5, lon: 127.0},
    {lat: 37.503, lon: 127.0},
  ],
  pausedMs: 0,
  t0: 1_700_000_000_000,
  shoe: {id: 's1', name: 'Nike Pegasus'},
  goalKm: 5,
  cadence: 172,
  location: '서울',
  savedAt: 1_700_000_900_000,
};

test('addRun 은 완주 런에 updatedAt(epoch ms)을 찍어 미동기 큐에 남긴다', async () => {
  // POST 를 실패시켜 런이 큐에 남게 한다(updatedAt 관찰용). iron law: 실패해도 유실 0.
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    if (u.includes('/api/runs') && method === 'POST') {
      return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({})});
    }
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'u1'};
    else if (u.includes('/api/shoes') || u.includes('/api/runs')) payload = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    });
  });

  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(5);
  const call = alertSpy.mock.calls.find(c => String(c[0]).includes('미완료 런'));
  if (!call) throw new Error('recover Alert was not shown');
  const recover = (call[2] as any[]).find(b => b.text === '복구');
  await act(async () => {
    recover.onPress();
  });
  await act(async () => {
    pressByText(renderer.root, '저장하기');
  });
  await tick(8);

  const queue = await loadPendingRuns();
  expect(queue).toHaveLength(1);
  expect(queue[0].km).toBe(3.2);
  expect(typeof queue[0].updatedAt).toBe('number');
  expect(queue[0].updatedAt as number).toBeGreaterThan(0);

  act(() => renderer.unmount());
});

// ── 2)/3) 신발 mutation: updateShoeMaxKm / retireShoe 가 updatedAt 을 찍는다 ──────
function mockShoeBackend() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'u1'};
    else if (u.includes('/api/shoes') && method === 'GET') {
      payload = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs') && method === 'GET') payload = [];
    // PATCH/POST/DELETE → ok, 빈 본문.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    });
  });
}

async function mountToShoesTab() {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(6);
  // Home(tab 0) → Shoes(tab 1) 로 전환(onTab=setTab 를 직접 호출).
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);
  return renderer;
}

test('updateShoeMaxKm 는 신발 레코드에 updatedAt 을 찍는다(수명 변경 반영)', async () => {
  mockShoeBackend();
  const renderer = await mountToShoesTab();

  await act(async () => {
    findByProp(renderer.root, 'onSetMaxKm').props.onSetMaxKm('s1', 700);
  });
  await tick(4);

  const shoes = findByProp(renderer.root, 'onSetMaxKm').props.rawShoes as any[];
  const s1 = shoes.find(s => s.id === 's1');
  expect(s1.max_km).toBe(700);
  expect(typeof s1.updatedAt).toBe('number');
  expect(s1.updatedAt).toBeGreaterThan(0);

  act(() => renderer.unmount());
});

test('retireShoe 는 보관 토글 시 신발 레코드에 updatedAt 을 찍는다', async () => {
  mockShoeBackend();
  const renderer = await mountToShoesTab();

  await act(async () => {
    findByProp(renderer.root, 'onRetire').props.onRetire('s1', true);
  });
  await tick(4);

  const shoes = findByProp(renderer.root, 'onRetire').props.rawShoes as any[];
  const s1 = shoes.find(s => s.id === 's1');
  expect(s1.retired).toBe(true);
  expect(typeof s1.updatedAt).toBe('number');
  expect(s1.updatedAt).toBeGreaterThan(0);

  act(() => renderer.unmount());
});

// ── 4) addShoe: 신규 등록 신발 레코드에 updatedAt 을 찍는다 ────────────────────────
// 서버(POST /api/shoes)는 생성 신발을 echo back 하고, addShoe 가 그 레코드에
// updatedAt 을 스탬프한다. 빈 신발(GET []) 로 시작해 신규 1건을 관찰한다.
function mockAddShoeBackend() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'u1'};
    else if (u.includes('/api/shoes') && method === 'POST') {
      // 생성 신발 echo — 클라이언트가 보낸 본문을 그대로 돌려줘 보존을 검증한다.
      const body = init && init.body ? JSON.parse(String(init.body)) : {};
      payload = {
        id: 'srv-shoe-1',
        name: body.name,
        max_km: body.max_km,
        start_km: body.start_km,
      };
    } else if (u.includes('/api/shoes') && method === 'GET') payload = [];
    else if (u.includes('/api/runs') && method === 'GET') payload = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    });
  });
}

test('addShoe 는 생성 신발 레코드에 updatedAt 을 찍는다(id/name/max_km/start_km 보존)', async () => {
  mockAddShoeBackend();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(6);

  // Home → '신발 추가'(onAddShoe=setOverlay('add')) → AddShoeScreen(onSave) 로 등록.
  await act(async () => {
    findByProp(renderer.root, 'onAddShoe').props.onAddShoe();
  });
  await tick(2);
  await act(async () => {
    findByProp(renderer.root, 'onSave').props.onSave({
      brand: 'Nike',
      model: 'Pegasus',
      max: 600,
      used: 50,
      condition: '양호',
    });
  });
  await tick(5);

  // 등록 후 overlay 닫히고 Home(tab 0). Shoes(tab 1) 로 전환해 rawShoes 로 관찰.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);

  const shoes = findByProp(renderer.root, 'onSetMaxKm').props.rawShoes as any[];
  const created = shoes.find(s => s.id === 'srv-shoe-1');
  expect(created).toBeTruthy();
  expect(created.name).toBe('Nike Pegasus');
  expect(created.max_km).toBe(600);
  expect(created.start_km).toBe(50);
  expect(typeof created.updatedAt).toBe('number');
  expect(created.updatedAt).toBeGreaterThan(0);

  act(() => renderer.unmount());
});

// ── 5) editRun: 편집 런 레코드에 updatedAt 을 찍는다(scenario #1 edit-wins) ─────────
// 서버 런 1건(미동기 아님)을 시드하고 onEditRun 으로 km/duration 을 바꾼 뒤,
// 낙관적 runs 상태(ShoesScreen rawRuns prop)에 updatedAt 이 갱신됐는지 본다.
function mockEditRunBackend() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'u1'};
    else if (u.includes('/api/shoes') && method === 'GET') {
      payload = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs') && method === 'GET') {
      payload = [
        {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-06-01', duration: 1800},
      ];
    }
    // PATCH/POST/DELETE → ok, 빈 본문.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    });
  });
}

test('editRun 은 편집 런 레코드에 updatedAt 을 찍는다(km/duration 반영)', async () => {
  mockEditRunBackend();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(6);

  // History(tab 2) 의 onEditRun=editRun 로 서버 런 'r1' 의 km/duration 을 편집.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(2);
  });
  await tick(3);
  await act(async () => {
    findByProp(renderer.root, 'onEditRun').props.onEditRun('r1', {km: 8, duration: 2400});
  });
  await tick(4);

  // Shoes(tab 1) 의 rawRuns(=runs 상태)로 편집 결과 관찰.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);

  const runsProp = findByProp(renderer.root, 'onSetMaxKm').props.rawRuns as any[];
  const r1 = runsProp.find(r => String(r.id) === 'r1');
  expect(r1).toBeTruthy();
  expect(r1.km).toBe(8);
  expect(r1.duration).toBe(2400);
  expect(typeof r1.updatedAt).toBe('number');
  expect(r1.updatedAt).toBeGreaterThan(0);

  act(() => renderer.unmount());
});
