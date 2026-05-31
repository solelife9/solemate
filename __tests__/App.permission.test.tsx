/**
 * App.tsx location-permission + GPS dead-zone integration tests.
 *
 * Drives the real App through home → goal → live-run and asserts on observable
 * outcomes (the GPS watch is/ isn't started, the Korean guidance Alert + its
 * settings deeplink, and the on-screen dead-zone banner) — not internal state.
 *
 * Covers:
 *  - audit#8: iOS now requests whenInUse authorization before tracking; a denial
 *    blocks the watch and offers a Settings deeplink (no garbage distance, no crash).
 *  - Android danger-zone regression: a denied ACCESS_FINE_LOCATION grant must NOT
 *    start watchPosition, and now also offers the Settings deeplink.
 *  - Mid-run permission revocation (watchPosition error code 1): tracking is
 *    stopped (clearWatch) and the user is guided to Settings.
 *  - audit#9: a GPS dead-zone (no fix received for the stall threshold) surfaces a
 *    Korean banner while elapsed time keeps running.
 *
 * Tests use globalThis (fetch mock, fake-timer clock).
 *
 * @format
 */

import React from 'react';
import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import Geolocation from 'react-native-geolocation-service';
import App from '../App';
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

// Mount App and navigate to the live-run screen (default 5km goal). Does NOT
// assert that the GPS watch started — permission-gate tests check that itself.
async function startRun() {
  mockBackendWithShoe();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // Home → goal keypad
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → live run
  });
  return {renderer, root};
}

const watchMock = () => Geolocation.watchPosition as jest.Mock;

// The global beforeEach runs jest.clearAllMocks(), which wipes recorded calls but
// NOT implementations — so a mockResolvedValue set in one test would leak into the
// next. Re-establish the default "granted" authorization before every test.
beforeEach(() => {
  (Geolocation.requestAuthorization as jest.Mock).mockResolvedValue('granted');
});

// ── iOS authorization (audit#8) ──────────────────────────────────────────────
test('iOS requests whenInUse authorization before starting the GPS watch (audit#8)', async () => {
  // The preset's default Platform.OS is 'ios'; the requestAuthorization mock
  // resolves 'granted', so the watch should start after the request.
  const {renderer} = await startRun();

  expect(Geolocation.requestAuthorization).toHaveBeenCalledWith('whenInUse');
  expect(watchMock().mock.calls.length).toBeGreaterThan(0);

  act(() => renderer.unmount());
});

test('iOS: a denied whenInUse authorization blocks the watch and offers a Settings deeplink', async () => {
  (Geolocation.requestAuthorization as jest.Mock).mockResolvedValue('denied');
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const {renderer, root} = await startRun();

    expect(Geolocation.requestAuthorization).toHaveBeenCalledWith('whenInUse');
    // Denied → tracking never starts (no garbage distance).
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

// ── Android fine-location danger-zone gate ───────────────────────────────────
test('Android: a denied fine-location grant blocks the GPS watch and offers a Settings deeplink', async () => {
  const prevOS = Platform.OS;
  Platform.OS = 'android';
  const reqSpy = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const {renderer, root} = await startRun();

    // The fine-location gate ran...
    expect(reqSpy.mock.calls.map(c => c[0])).toContain(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    // ...and because it was denied, tracking never started.
    expect(watchMock().mock.calls.length).toBe(0);

    // Korean guidance Alert with a Settings deeplink.
    const call = alertSpy.mock.calls.find(c => String(c[0]).includes('위치 권한'));
    expect(call).toBeTruthy();
    const openBtn = (call![2] as any[]).find(b => b.text === '설정 열기');
    expect(openBtn).toBeTruthy();
    openBtn.onPress();
    expect(Linking.openSettings).toHaveBeenCalled();

    expect(textOf(root)).toContain('위치 권한이 꺼져');

    act(() => renderer.unmount());
  } finally {
    alertSpy.mockRestore();
    reqSpy.mockRestore();
    Platform.OS = prevOS;
  }
});

// ── Mid-run permission revocation ────────────────────────────────────────────
test('mid-run permission revocation (error code 1) stops tracking and guides to Settings', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const {renderer, root} = await startRun();

    const calls = watchMock().mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const onError = calls[0][1] as (e: any) => void;

    // The OS reports PERMISSION_DENIED while the run is live.
    act(() => {
      onError({code: 1, message: 'permission revoked'});
    });

    // Tracking is stopped so no garbage distance accrues...
    expect(Geolocation.clearWatch as jest.Mock).toHaveBeenCalled();
    // ...the on-screen banner appears...
    expect(textOf(root)).toContain('위치 권한이 꺼져');
    // ...and the guidance Alert offers a working Settings deeplink.
    const call = alertSpy.mock.calls.find(c => String(c[0]).includes('위치 권한'));
    expect(call).toBeTruthy();
    const openBtn = (call![2] as any[]).find(b => b.text === '설정 열기');
    openBtn.onPress();
    expect(Linking.openSettings).toHaveBeenCalled();

    act(() => renderer.unmount());
  } finally {
    alertSpy.mockRestore();
  }
});

// ── GPS dead-zone banner (audit#9) ───────────────────────────────────────────
test('a GPS dead-zone (no fix for the stall threshold) surfaces a Korean banner', async () => {
  jest.useFakeTimers();
  try {
    mockBackendWithShoe();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    const root = renderer.root;
    pressByText(root, '러닝 시작');
    await act(async () => {
      pressByText(root, '러닝 시작');
    });

    const onPos = watchMock().mock.calls[0][0] as (p: any) => void;

    // One fix arrives → last-received time is set; no stall yet.
    await act(async () => {
      onPos({
        coords: {latitude: 37.5, longitude: 127.0, accuracy: 5},
        timestamp: Date.now(),
      });
    });
    expect(textOf(root)).not.toContain('GPS 신호가 약해');

    // Advance the clock past the stall threshold with no further fixes; the 1s
    // engine tick must flip the dead-zone banner on (distance frozen, time runs).
    await act(async () => {
      jest.advanceTimersByTime(GPS_STALL_THRESHOLD_MS + 1500);
    });
    expect(textOf(root)).toContain('GPS 신호가 약해');

    // A fresh fix clears the dead-zone banner again.
    await act(async () => {
      onPos({
        coords: {latitude: 37.5001, longitude: 127.0, accuracy: 5},
        timestamp: Date.now(),
      });
    });
    expect(textOf(root)).not.toContain('GPS 신호가 약해');

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});
