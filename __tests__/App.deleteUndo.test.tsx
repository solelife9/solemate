/**
 * App.tsx 삭제 확정 통합 테스트 — '실행취소' 액션 전면 폐지(2026-07-25 민우님 확정).
 *
 * 새 계약:
 *   보호막은 삭제 전 확인 다이얼로그 1겹(showDialog)로 단일화한다. 삭제 후 토스트는
 *   메시지("삭제됨")만 — actionLabel/onAction 이 *없어야* 한다(액션이 다시 붙으면 회귀).
 *   삭제는 여전히 묘비(soft-delete): live 집계 제외 + {deleted:true} 묘비 영속 +
 *   사이드키(route_/time_/…) 전부 정리(고아 누수 금지).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as dialogLib from '../lib/dialog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';
import {getCurrentToast, dismissToast} from '../lib/toast';

const K_TOMBSTONES = 'tombstones_v1';

// 런 r1 의 사이드키 원본 — 삭제→실행취소 라운드트립 후 *바이트 그대로* 돌아와야 한다.
const ORIG = {
  route: JSON.stringify([{lat: 37.1, lng: 127.2, t: 0}, {lat: 37.2, lng: 127.3, t: 60}]),
  time: '08:30',
  surface: 'trail',
  splits: JSON.stringify([300, 305, 298]),
  paceTrack: JSON.stringify([{d: 0, t: 0}, {d: 0.5, t: 150}, {d: 1, t: 300}]),
  hrTrack: JSON.stringify([{t: 0, bpm: 120}, {t: 60, bpm: 150}]),
  gapTrack: JSON.stringify([{d: 0, t: 0, e: 10}, {d: 1, t: 300, e: 60}]),
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
  jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  // Firestore 정본·로컬-퍼스트 부팅: 신발/런은 REST GET 이 아니라 부팅 캐시에서 읽힌다.
  // mockBackend 와 동일한 시드(s1·s2 + r1)를 캐시에 깔아 화면에 올린다.
  await seedBootCache(
    [
      {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
      {id: 's2', name: 'Asics Nimbus', max_km: 500, start_km: 0},
    ],
    [{id: 'r1', shoe_id: 's1', km: 50, run_date: '2026-06-01', duration: 1800}],
  );
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

test('런 삭제 확정: 메시지 전용 토스트(액션 없음) + 묘비 영속 + 사이드키 전부 정리', async () => {
  mockBackend();
  // 런 r1 의 사이드키를 미리 깔아둔다(완주 저장이 남긴 것과 동형).
  await AsyncStorage.setItem('route_r1', ORIG.route);
  await AsyncStorage.setItem('time_r1', ORIG.time);
  await AsyncStorage.setItem('surface_r1', ORIG.surface);
  await AsyncStorage.setItem('splits_r1', ORIG.splits);
  await AsyncStorage.setItem('paceTrack_r1', ORIG.paceTrack);
  await AsyncStorage.setItem('hrTrack_r1', ORIG.hrTrack);
  await AsyncStorage.setItem('gapTrack_r1', ORIG.gapTrack);

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

  // 1) 토스트: '삭제됨' 메시지만 — 실행취소 액션이 없어야 한다(폐지 계약).
  const toast = getCurrentToast();
  expect(toast).toBeTruthy();
  expect(toast!.message).toContain('삭제됨');
  expect(toast!.actionLabel).toBeUndefined();
  expect(toast!.onAction).toBeUndefined();

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
  expect(await AsyncStorage.getItem('paceTrack_r1')).toBeNull();
  expect(await AsyncStorage.getItem('hrTrack_r1')).toBeNull();
  expect(await AsyncStorage.getItem('gapTrack_r1')).toBeNull();

  // 3) 삭제는 확정 — 라이브에 r1 이 없고(deleted 레코드 미노출) 묘비가 그대로 남는다.
  expect(rawRun(renderer.root, 'r1')).toBeUndefined();
  expect(typeof tombUpdatedAt).toBe('number');

  await flushAnim();
  act(() => renderer.unmount());
});

test('펜딩(미동기) 런 삭제: 큐(pending_runs)에서도 제거돼 다음 부팅 overlay 로 부활하지 않는다(#5)', async () => {
  // 캐시엔 없고 큐에만 있는 미동기 런 run_p — overlayPendingRuns 가 id='run_p' 로 라이브에 얹는다.
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}], []);
  await AsyncStorage.setItem(
    'pending_runs',
    JSON.stringify([
      {localId: 'run_p', shoe_id: 's1', km: 4, run_date: '2026-06-20', memo: '', source: 'gps',
       duration: 1200, cadence: 0, route: '', location: '', heart_rate: 0, run_time: '08:00', queuedAt: 1_700_000_000_000},
    ]),
  );
  jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(6);
  // (전) 큐에 run_p 가 있다.
  const before = JSON.parse((await AsyncStorage.getItem('pending_runs')) || '[]');
  expect(before.some((p: any) => p.localId === 'run_p')).toBe(true);

  // 삭제(onDeleteRun 은 History=tab 2).
  await act(async () => { findByProp(renderer.root, 'onTab').props.onTab(2); });
  await tick(3);
  await act(async () => { findByProp(renderer.root, 'onDeleteRun').props.onDeleteRun('run_p'); });
  await tick(6);

  // (후) 큐에서도 제거됐다 → 다음 부팅 overlayPendingRuns 부활 없음.
  const after = JSON.parse((await AsyncStorage.getItem('pending_runs')) || '[]');
  expect(after.some((p: any) => p.localId === 'run_p')).toBe(false);

  await flushAnim();
  act(() => renderer.unmount());
});

test('신발 삭제 확정: 메시지 전용 토스트(액션 없음) + 묘비 영속', async () => {
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
  expect(toast!.actionLabel).toBeUndefined();
  expect(toast!.onAction).toBeUndefined();

  // 삭제 후: uiShoes 에서 빠지고 묘비 영속 — 되돌림 경로 없음(확정).
  const afterShoes = findByProp(renderer.root, 'onSetMaxKm').props.shoes as any[];
  expect(afterShoes.some(s => String(s.id) === 's2')).toBe(false);
  const afterDelStore = JSON.parse((await AsyncStorage.getItem(K_TOMBSTONES)) as string);
  const tomb = (afterDelStore.shoes as any[]).find(s => String(s.id) === 's2');
  expect(tomb).toBeTruthy();
  expect(tomb.deleted).toBe(true);

  await flushAnim();
  act(() => renderer.unmount());
});
