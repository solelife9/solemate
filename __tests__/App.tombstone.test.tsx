/**
 * App.tsx deleteRun 의 soft-delete tombstone 통합 테스트 (audit a2 집계-제외 배선).
 *
 * 회귀 방어 핵심: shoeHealth(lib/shoe.ts)는 deleted 를 직접 거르지 않으므로, '삭제 런이
 * 거리/수명에서 빠진다'는 보장은 App 의 배선 — deleteRun 이 라이브 runs 배열에서 런을 빼고
 * 동시에 {deleted:true,updatedAt} 묘비를 영속 store 에 남기는 것 — 에 달려 있다. 여기서는
 * 그 두 관측 가능한 결과를 한 흐름으로 단언한다:
 *   1) deleteRun 후 해당 런이 live 집계 입력에서 사라져 신발 usedKm(uiShoes.used)가
 *      삭제분만큼 감소한다(거리/수명 제외).
 *   2) 동시에 {deleted:true,updatedAt} 묘비가 영속 store(tombstones_v1)에 남아 다음 동기에
 *      삭제가 계속 전파된다(부활 방지 유지).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

const K_TOMBSTONES = 'tombstones_v1';

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
  await AsyncStorage.setItem('onboarded', '1');
  await AsyncStorage.setItem('loc_perm_primed', '1');
});

// 서버: 신발 1켤레(s1, 수명 600km) + 그 신발로 달린 런 1건(r1, 50km). 미동기 아님이라
// deleteRun 이 REST DELETE(→ ok) 경로를 탄다.
function mockDeleteRunBackend() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'u1'};
    else if (u.includes('/api/shoes') && method === 'GET') {
      payload = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs') && method === 'GET') {
      payload = [{id: 'r1', shoe_id: 's1', km: 50, run_date: '2026-06-01', duration: 1800}];
    }
    // DELETE/PATCH/POST → ok, 빈 본문.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    });
  });
}

async function mountApp() {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(6);
  return renderer;
}

/** ShoesScreen 의 uiShoes(=onSetMaxKm.props.shoes)에서 신발의 used(km) 를 읽는다. */
function usedKmOf(root: ReactTestRenderer.ReactTestInstance, shoeId: string): number {
  const uiShoes = findByProp(root, 'onSetMaxKm').props.shoes as any[];
  const s = uiShoes.find(x => String(x.id) === shoeId);
  if (!s) throw new Error(`no ui shoe: ${shoeId}`);
  return s.used;
}

test('deleteRun 후 런이 live 집계에서 빠져 신발 usedKm 가 삭제분만큼 감소 + 묘비가 영속 store 에 남는다', async () => {
  mockDeleteRunBackend();
  const renderer = await mountApp();

  // (전) Shoes(tab 1) 의 uiShoes 로 삭제 전 used 확인 — 런 50km 가 반영돼 있다.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);
  expect(usedKmOf(renderer.root, 's1')).toBe(50);

  // History(tab 2) 의 onDeleteRun=deleteRun 로 서버 런 'r1' 삭제.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(2);
  });
  await tick(3);
  await act(async () => {
    findByProp(renderer.root, 'onDeleteRun').props.onDeleteRun('r1');
  });
  await tick(5);

  // (후) 거리/수명 제외: live 집계 입력에서 r1 이 사라져 used 가 0 으로 감소.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);
  expect(usedKmOf(renderer.root, 's1')).toBe(0);

  // 묘비 영속: tombstones_v1 에 {deleted:true,updatedAt} 묘비가 남아 다음 동기 전파를 유지.
  const raw = await AsyncStorage.getItem(K_TOMBSTONES);
  expect(raw).toBeTruthy();
  const store = JSON.parse(raw as string);
  const t = store.runs.find((r: any) => String(r.id) === 'r1');
  expect(t).toBeTruthy();
  expect(t.deleted).toBe(true);
  expect(typeof t.updatedAt).toBe('number');
  expect(t.updatedAt).toBeGreaterThan(0);
  expect(t.shoe_id).toBe('s1'); // 원본 필드 보존(머지 진단/undo 용)

  act(() => renderer.unmount());
});
