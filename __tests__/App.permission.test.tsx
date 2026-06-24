/**
 * App.tsx location-permission + GPS dead-zone integration tests (expo-location).
 *
 * Drives the real App through home → goal → live-run and asserts on observable
 * outcomes (whether tracking is/isn't started, the Korean guidance Alert + its
 * settings deeplink, and the on-screen dead-zone banner) — not internal state.
 *
 * Covers:
 *  - expo permission gate: a denied foreground permission must NOT start the GPS
 *    watch, and offers a Settings deeplink + on-screen banner (no garbage distance).
 *  - Mid-run permission revocation (watchPositionAsync errorHandler reports a
 *    permission-denied reason): tracking stops (no further distance) and the user
 *    is guided to Settings.
 *  - audit#9: a GPS dead-zone (no fix received for the stall threshold) surfaces a
 *    Korean banner while elapsed time keeps running (driven by the engine's 1s tick).
 *
 * @format
 */

import React from 'react';
import {Alert, Linking, AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';
import {GPS_STALL_THRESHOLD_MS} from '../lib/gpsHealth';

function mockBackendWithShoe() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) {
      body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
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

function readKm(root: ReactTestRenderer.ReactTestInstance): number {
  const node = root
    .findAll(n => typeof n.type === 'string')
    .find(n => {
      const c = n.props.children;
      return typeof c === 'string' && /^\d+\.\d{2}$/.test(c.trim());
    });
  if (!node) throw new Error('km readout not found');
  return parseFloat(node.props.children as string);
}

// Mount App and navigate to the live-run screen (default 5km goal). Does NOT
// assert that the GPS watch started — permission-gate tests check that itself.
async function startRun() {
  mockBackendWithShoe();
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]); // Stage 3: 부팅 캐시 시드
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // Home → goal keypad
  // 2nd 프레스가 카운트다운(준비·3·2·1·GO)을 띄운다. onDone 타이머 제어를 위해
  // 카운트다운을 fake 타이머 하에서 mount/advance 하고(실타이머 테스트라 임시 보장),
  // 라이브 런 진입 후 원복한다.
  const fakeAlready = typeof (setTimeout as any).clock === 'object';
  if (!fakeAlready) jest.useFakeTimers();
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → 카운트다운
  });
  await act(async () => {
    jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런(onDone)
  });
  if (!fakeAlready) jest.useRealTimers();
  return {renderer, root};
}

const watchMock = () => Location.watchPositionAsync as jest.Mock;

// ── happy path ───────────────────────────────────────────────────────────────
test('the foreground location permission is requested before the GPS watch starts', async () => {
  const {renderer} = await startRun();

  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
  expect(watchMock().mock.calls.length).toBeGreaterThan(0);

  act(() => renderer.unmount());
});

// ── denied foreground permission (graceful, no garbage distance) ─────────────
test('a denied foreground permission blocks the GPS watch and offers a Settings deeplink', async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: false,
    status: 'denied',
  });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const {renderer, root} = await startRun();

    // Denied → tracking never starts.
    expect(watchMock().mock.calls.length).toBe(0);

    // Korean guidance Alert with a working Settings deeplink.
    const call = alertSpy.mock.calls.find(c => String(c[0]).includes('위치 권한'));
    expect(call).toBeTruthy();
    const openBtn = (call![2] as any[]).find(b => b.text === '설정 열기');
    expect(openBtn).toBeTruthy();
    openBtn.onPress();
    expect(Linking.openSettings).toHaveBeenCalled();

    // The denied state is also surfaced as an on-screen banner.
    expect(textOf(root)).toContain('위치 권한이 꺼져');

    act(() => renderer.unmount());
  } finally {
    alertSpy.mockRestore();
  }
});

// ── mid-run permission revocation ────────────────────────────────────────────
test('mid-run permission revocation stops tracking (no further distance) and guides to Settings', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const {renderer, root} = await startRun();

    const calls = watchMock().mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const onPos = calls[0][1] as (p: any) => void;
    const onError = calls[0][2] as (reason: string) => void;

    // Accumulate some real distance first (warmup at P0 then accepted segments).
    const LON = 127.0;
    let t = 100000;
    await act(async () => onPos({coords: {latitude: 37.5, longitude: LON, accuracy: 5}, timestamp: t}));
    await act(async () => onPos({coords: {latitude: 37.5, longitude: LON, accuracy: 5}, timestamp: (t += 2000)}));
    await act(async () => onPos({coords: {latitude: 37.5, longitude: LON, accuracy: 5}, timestamp: (t += 2000)}));
    await act(async () => onPos({coords: {latitude: 37.5003, longitude: LON, accuracy: 5}, timestamp: (t += 3000)}));
    const kmBefore = readKm(root);
    expect(kmBefore).toBeGreaterThan(0);

    // The OS reports a permission-denied reason while the run is live.
    await act(async () => {
      onError('Location permission denied');
    });

    // ...the on-screen banner appears...
    expect(textOf(root)).toContain('위치 권한이 꺼져');
    // ...the guidance Alert offers a working Settings deeplink...
    const call = alertSpy.mock.calls.find(c => String(c[0]).includes('위치 권한'));
    expect(call).toBeTruthy();
    const openBtn = (call![2] as any[]).find(b => b.text === '설정 열기');
    openBtn.onPress();
    expect(Linking.openSettings).toHaveBeenCalled();

    // ...and tracking is stopped: a further fix must NOT add distance.
    await act(async () => onPos({coords: {latitude: 37.5009, longitude: LON, accuracy: 5}, timestamp: (t += 3000)}));
    expect(readKm(root)).toBe(kmBefore);

    act(() => renderer.unmount());
  } finally {
    alertSpy.mockRestore();
  }
});

// ── 권한 회수 후 재허용+복귀 시 재개(#6) ─────────────────────────────────────────
test('권한 회수 후 설정 재허용 + 앱 복귀(AppState active)하면 트래킹이 재개된다(#6)', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const handlers: ((s: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type: any, cb: any) => {
    if (type === 'change') handlers.push(cb);
    return {remove: jest.fn()} as any;
  });
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({granted: true, status: 'granted'});
  const flushP = async () => {
    for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
  };
  try {
    const {renderer, root} = await startRun();
    const LON = 127.0;
    let t = 100000;
    const onPos = watchMock().mock.calls[0][1] as (p: any) => void;
    const onError = watchMock().mock.calls[0][2] as (r: string) => void;
    await act(async () => onPos({coords: {latitude: 37.5, longitude: LON, accuracy: 5}, timestamp: t}));
    await act(async () => onPos({coords: {latitude: 37.5, longitude: LON, accuracy: 5}, timestamp: (t += 2000)}));
    await act(async () => onPos({coords: {latitude: 37.5, longitude: LON, accuracy: 5}, timestamp: (t += 2000)}));
    await act(async () => onPos({coords: {latitude: 37.5003, longitude: LON, accuracy: 5}, timestamp: (t += 3000)}));
    const kmBefore = readKm(root);
    expect(kmBefore).toBeGreaterThan(0);

    // 주행 중 권한 회수 → 배너 + 트래킹 정지.
    await act(async () => { onError('Location permission denied'); });
    expect(textOf(root)).toContain('위치 권한이 꺼져');
    const watchCountAtRevoke = watchMock().mock.calls.length;

    // 재허용 + 복귀(AppState 'active') → 재개.
    await act(async () => { handlers.forEach(h => h('active')); });
    await flushP();

    // 배너가 사라지고, 트래킹이 재무장된다(새 watch 구독 추가).
    expect(textOf(root)).not.toContain('위치 권한이 꺼져');
    expect(watchMock().mock.calls.length).toBeGreaterThan(watchCountAtRevoke);

    // 재개 후 새 fix 로 거리가 다시 누적된다(회수 전 값 보존 + 증가).
    const onPos2 = watchMock().mock.calls[watchMock().mock.calls.length - 1][1] as (p: any) => void;
    await act(async () => onPos2({coords: {latitude: 37.5006, longitude: LON, accuracy: 5}, timestamp: (t += 3000)}));
    await act(async () => onPos2({coords: {latitude: 37.5009, longitude: LON, accuracy: 5}, timestamp: (t += 3000)}));
    expect(readKm(root)).toBeGreaterThan(kmBefore);

    act(() => renderer.unmount());
  } finally {
    alertSpy.mockRestore();
    jest.restoreAllMocks();
  }
});

// ── GPS dead-zone banner (audit#9) ───────────────────────────────────────────
test('a GPS dead-zone (no fix for the stall threshold) surfaces a Korean banner', async () => {
  jest.useFakeTimers();
  try {
    mockBackendWithShoe();
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]); // Stage 3: 부팅 캐시 시드
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    const root = renderer.root;
    pressByText(root, '러닝 시작'); // home → goal
    await act(async () => {
      pressByText(root, '러닝 시작'); // goal → 카운트다운
    });
    // 카운트다운(준비·3·2·1·GO) 자동 진행을 건너뛰어 라이브 런으로 진입(이 테스트는 자체 fake 타이머).
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    const onPos = watchMock().mock.calls[0][1] as (p: any) => void;

    // One fix arrives → last-received time is set; no stall yet.
    await act(async () => {
      onPos({
        coords: {latitude: 37.5, longitude: 127.0, accuracy: 5},
        timestamp: Date.now(),
      });
    });
    expect(textOf(root)).not.toContain('GPS 신호 약함');

    // Advance the clock past the stall threshold with no further fixes; the 1s
    // engine tick must flip the dead-zone banner on (distance frozen, time runs).
    await act(async () => {
      jest.advanceTimersByTime(GPS_STALL_THRESHOLD_MS + 1500);
    });
    expect(textOf(root)).toContain('GPS 신호 약함');

    // A fresh fix clears the dead-zone banner again.
    await act(async () => {
      onPos({
        coords: {latitude: 37.5001, longitude: 127.0, accuracy: 5},
        timestamp: Date.now(),
      });
    });
    expect(textOf(root)).not.toContain('GPS 신호 약함');

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});
