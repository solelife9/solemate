/**
 * App.tsx 당겨서 새로고침(refreshData)의 lastSyncAt 스탬프 정합성 통합 테스트.
 *
 * 칩 계약: 동기화 칩(HomeScreen.lastSyncAt)은 '마지막 동기화 **성공** 시각'이다. 따라서
 * lastSyncAt 은 실제 서버 fetch 성공(try 분기) 또는 큐의 미동기 런을 진짜로 서버에 밀어낸
 * 경우(flushPendingRuns synced>0)에만 갱신돼야 한다.
 *
 * 회귀 방어(product_bug): refreshData 의 catch(오프라인/백엔드 다운) 분기가 syncPendingRuns
 * 뒤 무조건 setLastSyncAt(Date.now()) 를 부르면, 빈 큐는 단락하고 per-run POST 실패는
 * flushPendingRuns 가 자체 삼키므로 *아무것도 동기화하지 못한 채* 칩이 '방금 동기화'로
 * 거짓표시된다. 여기서는 그 관측 가능한 결과(HomeScreen 에 흘러가는 lastSyncAt prop)를 단언한다:
 *   1) 성공 부팅 후 lastSyncAt 이 한 번 찍힌다(기준값 V0).
 *   2) 그 뒤 오프라인(fetch reject)에서 당겨서 새로고침 → 큐가 비어 synced 0 → lastSyncAt 이
 *      *갱신되지 않는다*(V0 그대로). 버그 코드라면 V0 보다 큰 새 값으로 바뀌어 이 단언이 실패한다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

function findByProp(root: ReactTestRenderer.ReactTestInstance, prop: string) {
  const hits = root.findAll(n => n.props && typeof n.props[prop] === 'function');
  if (hits.length === 0) throw new Error(`no component with prop: ${prop}`);
  return hits[0];
}

async function tick(n = 6) {
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  // 단조 증가 시계 — 부팅 스탬프(V0)보다 '그 다음 Date.now()'가 확정적으로 크다. 그래야
  // '오프라인 새로고침이 lastSyncAt 을 새 값으로 덮어쓰지 않았다'를 동률 충돌 없이 단언할 수 있다.
  let clock = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
  await AsyncStorage.setItem('onboarded', '1');
  await AsyncStorage.setItem('loc_perm_primed', '1');
});

test('오프라인 당겨서 새로고침은 lastSyncAt 을 거짓 스탬프하지 않는다(빈 큐 → synced 0)', async () => {
  // 성공 부팅용 백엔드(신발 1켤레, 런/큐 없음). offline 토글을 켜면 이후 fetch 가 거부된다.
  let offline = false;
  (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
    if (offline) return Promise.reject(new Error('offline'));
    const u = String(url);
    let body: unknown = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    else if (u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
  jest.spyOn(Alert, 'alert').mockImplementation((() => {}) as never);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(6);

  // 1) 성공 부팅 → HomeScreen(tab 0)에 lastSyncAt 기준값 V0 가 찍혔다(칩이 의미를 갖는다).
  const home = findByProp(renderer.root, 'onRefresh');
  const v0 = home.props.lastSyncAt as number;
  expect(typeof v0).toBe('number');

  // 2) 오프라인 전환 후 당겨서 새로고침(production refreshData) — fetch 는 거부되고 큐는 비어
  //    synced 0 이다. catch 분기가 lastSyncAt 을 덮어쓰면 안 된다.
  offline = true;
  await act(async () => {
    await home.props.onRefresh();
  });
  await tick(6);

  // 관측: HomeScreen 에 흘러가는 lastSyncAt 이 V0 그대로다(오프라인 새로고침은 동기화 성공이 아니다).
  const after = findByProp(renderer.root, 'onRefresh').props.lastSyncAt as number;
  expect(after).toBe(v0);

  act(() => renderer.unmount());
});

test('온라인 당겨서 새로고침은 서버 fetch 성공 시 lastSyncAt 을 갱신한다', async () => {
  // 대칭 단언: 정상(온라인) 경로에선 try 분기가 lastSyncAt 을 새 시각으로 갱신해 칩이 전진한다.
  (global.fetch as jest.Mock).mockImplementation((url: unknown) => {
    const u = String(url);
    let body: unknown = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    else if (u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
  jest.spyOn(Alert, 'alert').mockImplementation((() => {}) as never);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(6);

  const home = findByProp(renderer.root, 'onRefresh');
  const v0 = home.props.lastSyncAt as number;
  expect(typeof v0).toBe('number');

  await act(async () => {
    await home.props.onRefresh();
  });
  await tick(6);

  // 서버 재fetch 성공 → lastSyncAt 이 V0 보다 새 값으로 전진(단조 시계).
  const after = findByProp(renderer.root, 'onRefresh').props.lastSyncAt as number;
  expect(after).toBeGreaterThan(v0);

  act(() => renderer.unmount());
});
