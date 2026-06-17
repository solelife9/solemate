/**
 * App.tsx 삭제 undo(실행취소) 통합 테스트 — 런/신발 삭제 후 '삭제됨 · 실행취소' 토스트로
 * *완전복원*이 되는가.
 *
 * 회귀 방어 핵심(anti-test: 부분복원 금지):
 *   삭제는 묘비(soft-delete)일 뿐이라 '실행취소'로 되돌릴 수 있어야 한다. '완전복원'은 라이브
 *   레코드만 살아나는 게 아니라 — 런의 사이드키(route_/time_/surface_/splits_)까지 *원래 값
 *   그대로* 돌아오고, 묘비가 되돌려져야(tombstones store 에서 빠지고, 라이브가 deleted:false +
 *   updatedAt 갱신으로 복원) 한다. 여기서는 그 관측 가능한 결과를 모두 한 흐름으로 단언한다:
 *     1) 삭제 시 '삭제됨' 메시지 + '실행취소' 액션 토스트가 뜬다.
 *     2) 삭제 후: live 집계에서 빠지고({deleted:true} 묘비 영속), 사이드키도 지워진다.
 *     3) '실행취소' 후: 런이 live 로 복귀(used 회복) + 사이드키 4종 전부 원복 + 묘비 제거 +
 *        복원 레코드는 deleted 아님 & updatedAt 이 묘비보다 새것(머지 un-delete 우선).
 *   사이드키 4종을 *전부* 단언해 '런만 살고 사이드키 유실'(부분복원)을 거부한다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {getCurrentToast, runToastAction, dismissToast, TOAST_UNDO_LABEL} from '../lib/toast';

const K_TOMBSTONES = 'tombstones_v1';

// 런 r1 의 사이드키 원본 — 삭제→실행취소 라운드트립 후 *바이트 그대로* 돌아와야 한다.
const ORIG = {
  route: JSON.stringify([{lat: 37.1, lng: 127.2, t: 0}, {lat: 37.2, lng: 127.3, t: 60}]),
  time: '08:30',
  surface: 'trail',
  splits: JSON.stringify([300, 305, 298]),
};

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

// ToastHost 의 입/퇴장 Animated 콜백(최대 ~220ms)을 env teardown 전에 흘려보낸다 — 안 그러면
// 테스트 종료 후 타이머가 unmounted 호스트에 setState 를 호출해 누수/teardown 에러를 낸다.
async function flushAnim() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 260));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  dismissToast();
  // Date.now 를 단조 증가시켜 묘비(삭제 시각)보다 복원(updatedAt 갱신) 시각이 확정적으로 큰지
  // 단언할 수 있게 한다 — 같은 ms 충돌로 인한 플레이크 제거.
  let clock = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
  await AsyncStorage.setItem('onboarded', '1');
  await AsyncStorage.setItem('loc_perm_primed', '1');
});

afterEach(() => {
  dismissToast();
});

// 서버: 신발 2켤레(s1 600km / s2 500km) + s1 로 달린 런 r1(50km). r1 은 동기됨(REST DELETE 경로).
function mockBackend() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'u1'};
    else if (u.includes('/api/shoes') && method === 'GET') {
      payload = [
        {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
        {id: 's2', name: 'Asics Nimbus', max_km: 500, start_km: 0},
      ];
    } else if (u.includes('/api/runs') && method === 'GET') {
      payload = [{id: 'r1', shoe_id: 's1', km: 50, run_date: '2026-06-01', duration: 1800}];
    }
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

function usedKmOf(root: ReactTestRenderer.ReactTestInstance, shoeId: string): number {
  const uiShoes = findByProp(root, 'onSetMaxKm').props.shoes as any[];
  const s = uiShoes.find(x => String(x.id) === shoeId);
  if (!s) throw new Error(`no ui shoe: ${shoeId}`);
  return s.used;
}

/** ShoesScreen 의 rawRuns(=live runs 그대로)에서 런 1건을 읽는다(updatedAt/deleted 확인용). */
function rawRun(root: ReactTestRenderer.ReactTestInstance, id: string): any {
  const rawRuns = findByProp(root, 'onSetMaxKm').props.rawRuns as any[];
  return rawRuns.find(r => String(r.id) === id);
}

function tombstoneRun(store: any, id: string) {
  return store && Array.isArray(store.runs) ? store.runs.find((r: any) => String(r.id) === id) : undefined;
}

test('런 삭제→실행취소: 사이드키 4종 포함 완전복원 + 묘비 되돌림(부분복원 거부)', async () => {
  mockBackend();
  // 런 r1 의 사이드키를 미리 깔아둔다(완주 저장이 남긴 것과 동형).
  await AsyncStorage.setItem('route_r1', ORIG.route);
  await AsyncStorage.setItem('time_r1', ORIG.time);
  await AsyncStorage.setItem('surface_r1', ORIG.surface);
  await AsyncStorage.setItem('splits_r1', ORIG.splits);

  const renderer = await mountApp();

  // (전) s1 used = 50.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);
  expect(usedKmOf(renderer.root, 's1')).toBe(50);

  // ── 삭제 ── (onDeleteRun 은 HistoryScreen=tab 2 에 있다)
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(2);
  });
  await tick(3);
  await act(async () => {
    findByProp(renderer.root, 'onDeleteRun').props.onDeleteRun('r1');
  });
  await tick(5);

  // 1) 토스트: '삭제됨' 메시지 + '실행취소' 액션.
  const toast = getCurrentToast();
  expect(toast).toBeTruthy();
  expect(toast!.message).toContain('삭제됨');
  expect(toast!.actionLabel).toBe(TOAST_UNDO_LABEL);
  expect(typeof toast!.onAction).toBe('function');

  // 2) 삭제 후: live 집계 제외(used 0) + 묘비 영속 + 사이드키 제거.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);
  expect(usedKmOf(renderer.root, 's1')).toBe(0);

  const afterDelStore = JSON.parse((await AsyncStorage.getItem(K_TOMBSTONES)) as string);
  const tomb = tombstoneRun(afterDelStore, 'r1');
  expect(tomb).toBeTruthy();
  expect(tomb.deleted).toBe(true);
  const tombUpdatedAt = tomb.updatedAt as number;
  expect(typeof tombUpdatedAt).toBe('number');

  expect(await AsyncStorage.getItem('route_r1')).toBeNull();
  expect(await AsyncStorage.getItem('time_r1')).toBeNull();
  expect(await AsyncStorage.getItem('surface_r1')).toBeNull();
  expect(await AsyncStorage.getItem('splits_r1')).toBeNull();

  // ── 실행취소 ──
  await act(async () => {
    runToastAction(); // '실행취소' 버튼 탭과 동일 경로
  });
  await tick(6);

  // 3a) 사이드키 4종 전부 원복(부분복원 거부 — 런만 살고 사이드키 유실 금지).
  expect(await AsyncStorage.getItem('route_r1')).toBe(ORIG.route);
  expect(await AsyncStorage.getItem('time_r1')).toBe(ORIG.time);
  expect(await AsyncStorage.getItem('surface_r1')).toBe(ORIG.surface);
  expect(await AsyncStorage.getItem('splits_r1')).toBe(ORIG.splits);

  // 3b) live 복귀: s1 used 가 50 으로 회복.
  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);
  expect(usedKmOf(renderer.root, 's1')).toBe(50);

  // 3c) 복원 레코드: deleted 아님 + updatedAt 이 묘비보다 새것(머지 un-delete 우선).
  const restored = rawRun(renderer.root, 'r1');
  expect(restored).toBeTruthy();
  expect(restored.deleted).toBeFalsy();
  expect(restored.updatedAt).toBeGreaterThan(tombUpdatedAt);

  // 3d) 묘비 되돌림: tombstones store 에서 r1 제거.
  const afterUndoStore = JSON.parse((await AsyncStorage.getItem(K_TOMBSTONES)) as string);
  expect(tombstoneRun(afterUndoStore, 'r1')).toBeUndefined();

  await flushAnim();
  act(() => renderer.unmount());
});

test('신발 삭제→실행취소: 신발 라이브 복귀 + 묘비 되돌림(updatedAt 갱신)', async () => {
  mockBackend();
  const renderer = await mountApp();

  await act(async () => {
    findByProp(renderer.root, 'onTab').props.onTab(1);
  });
  await tick(3);

  // 삭제 전 s2 가 uiShoes 에 있다.
  const beforeShoes = findByProp(renderer.root, 'onSetMaxKm').props.shoes as any[];
  expect(beforeShoes.some(s => String(s.id) === 's2')).toBe(true);

  // ── 삭제 ──
  await act(async () => {
    findByProp(renderer.root, 'onDelete').props.onDelete('s2');
  });
  await tick(5);

  const toast = getCurrentToast();
  expect(toast).toBeTruthy();
  expect(toast!.message).toContain('삭제됨');
  expect(toast!.actionLabel).toBe(TOAST_UNDO_LABEL);

  // 삭제 후: uiShoes 에서 빠지고 묘비 영속.
  const afterShoes = findByProp(renderer.root, 'onSetMaxKm').props.shoes as any[];
  expect(afterShoes.some(s => String(s.id) === 's2')).toBe(false);
  const afterDelStore = JSON.parse((await AsyncStorage.getItem(K_TOMBSTONES)) as string);
  const tomb = (afterDelStore.shoes as any[]).find(s => String(s.id) === 's2');
  expect(tomb).toBeTruthy();
  expect(tomb.deleted).toBe(true);
  const tombUpdatedAt = tomb.updatedAt as number;

  // ── 실행취소 ──
  await act(async () => {
    runToastAction();
  });
  await tick(6);

  // 신발 라이브 복귀.
  const restoredShoes = findByProp(renderer.root, 'onSetMaxKm').props.shoes as any[];
  expect(restoredShoes.some(s => String(s.id) === 's2')).toBe(true);

  // 복원 레코드(rawShoes): deleted 아님 + updatedAt 이 묘비보다 새것.
  const rawShoes = findByProp(renderer.root, 'onSetMaxKm').props.rawShoes as any[];
  const restored = rawShoes.find(s => String(s.id) === 's2');
  expect(restored).toBeTruthy();
  expect(restored.deleted).toBeFalsy();
  expect(restored.updatedAt).toBeGreaterThan(tombUpdatedAt);

  // 묘비 되돌림: store 에서 s2 제거.
  const afterUndoStore = JSON.parse((await AsyncStorage.getItem(K_TOMBSTONES)) as string);
  expect((afterUndoStore.shoes as any[]).find(s => String(s.id) === 's2')).toBeUndefined();

  await flushAnim();
  act(() => renderer.unmount());
});
