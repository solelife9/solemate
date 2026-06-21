/**
 * App.tsx 당겨서 새로고침(refreshData)의 lastSyncAt 정합성 (Phase 5b · Stage 3).
 *
 * Stage 3 부터 refreshData 는 runCloudSync(pull→merge→push)를 재호출한다. lastSyncAt 은
 * runCloudSync 가 **성공**(push 까지 완료)했을 때만 찍힌다(try 끝). 따라서:
 *   1) 오프라인(pull reject): 부팅 동기도, 새로고침도 실패 → lastSyncAt 은 찍히지 않는다(거짓 스탬프 0).
 *   2) 온라인: 부팅 동기 성공으로 lastSyncAt 이 찍히고, 새로고침이 그 값을 전진시킨다.
 *
 * 동기는 __KEEGO_ENABLE_CLOUD_SYNC__ + 메모리 cloudPort 주입으로 활성화한다(다른 스위트 무영향).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

function findByProp(root: ReactTestRenderer.ReactTestInstance, prop: string) {
  const hits = root.findAll(n => n.props && typeof n.props[prop] === 'function');
  if (hits.length === 0) throw new Error(`no component with prop: ${prop}`);
  return hits[0];
}

async function tick(n = 8) {
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setupPort(pull: () => Promise<any>) {
  const port = {
    signIn: jest.fn(() => Promise.resolve({uid: 'u-1', email: null, displayName: null})),
    signOut: jest.fn(() => Promise.resolve()),
    deleteAccount: jest.fn(() => Promise.resolve()),
    pull: jest.fn(pull),
    push: jest.fn(() => Promise.resolve()),
  };
  (globalThis as any).__KEEGO_CLOUD_PORT__ = port;
  (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'test-uid'};
  (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__ = true;
  (globalThis as any).__KEEGO_DEV_SEED__ = false;
  return port;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  // 단조 증가 시계 — '새로고침이 lastSyncAt 을 새 값으로 전진/유지'를 동률 충돌 없이 단언.
  let clock = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
  await AsyncStorage.setItem('onboarded', '1');
  await AsyncStorage.setItem('loc_perm_primed', '1');
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}], []);
  // Stage 0 이관 effect 의 REST 접근을 무력화(빈 응답) — 테스트 격리.
  (global.fetch as jest.Mock).mockImplementation(() =>
    Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('{}')}),
  );
  jest.spyOn(Alert, 'alert').mockImplementation((() => {}) as never);
});

afterEach(() => {
  delete (globalThis as any).__KEEGO_CLOUD_PORT__;
  delete (globalThis as any).__KEEGO_AUTH_USER__;
  delete (globalThis as any).__KEEGO_ENABLE_CLOUD_SYNC__;
  delete (globalThis as any).__KEEGO_DEV_SEED__;
});

test('오프라인(pull reject) 새로고침은 lastSyncAt 을 거짓 스탬프하지 않는다', async () => {
  setupPort(() => Promise.reject(new Error('offline')));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick();

  // 부팅 동기도 실패했으므로 lastSyncAt 은 아직 찍히지 않았다.
  const home = findByProp(renderer.root, 'onRefresh');
  expect(home.props.lastSyncAt).toBeFalsy();

  // 당겨서 새로고침(여전히 오프라인) → runCloudSync 가 pull 에서 throw → catch → 스탬프 없음.
  await act(async () => {
    await home.props.onRefresh();
  });
  await tick();

  expect(findByProp(renderer.root, 'onRefresh').props.lastSyncAt).toBeFalsy();
  act(() => renderer.unmount());
});

test('온라인 새로고침은 동기 성공 시 lastSyncAt 을 전진시킨다', async () => {
  setupPort(() => Promise.resolve({shoes: [], runs: [], settings: {}}));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick();

  // 부팅 동기 성공 → lastSyncAt 기준값 V0(number).
  const v0 = findByProp(renderer.root, 'onRefresh').props.lastSyncAt as number;
  expect(typeof v0).toBe('number');

  await act(async () => {
    await findByProp(renderer.root, 'onRefresh').props.onRefresh();
  });
  await tick();

  // 새로고침 동기 성공 → 단조 시계로 V0 보다 전진.
  const after = findByProp(renderer.root, 'onRefresh').props.lastSyncAt as number;
  expect(after).toBeGreaterThan(v0);
  act(() => renderer.unmount());
});
