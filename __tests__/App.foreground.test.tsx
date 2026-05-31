/**
 * App.tsx foreground-service option wiring test (forward-prep).
 *
 * Drives the real App through home → goal → live-run and asserts the engine
 * registered its Geolocation.watchPosition with a `foregroundService`
 * notification config in the options (3rd arg). This verifies only that the
 * forward-compat option is PASSED to watchPosition with the expected channel /
 * copy — NOT that screen-off tracking actually persists. The installed
 * react-native-geolocation-service@5.3.1 ignores this option (no foreground
 * service), so real background tracking is a follow-up (lib swap / native
 * service) — see .tenet/knowledge/2026-06-01_geolocation-no-foreground-service.md.
 * We assert on the actual call the engine made (not internal state).
 *
 * @format
 */

import React from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import Geolocation from 'react-native-geolocation-service';
import App from '../App';
import {FG_SERVICE_CHANNEL_ID} from '../lib/foregroundService';

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

async function startRun() {
  mockBackendWithShoe();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // Home → goal keypad
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → live run (default 5km)
  });
  return renderer;
}

test('live run passes a foreground-service notification config to the GPS watch (forward-prep option is wired; real backgrounding is follow-up)', async () => {
  const renderer = await startRun();

  const calls = (Geolocation.watchPosition as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);

  const options = calls[0][2];
  expect(options).toBeTruthy();
  expect(options.foregroundService).toBeTruthy();
  // Bound to the dedicated run-tracking channel with the prepared Korean copy
  // (the notification text shown only once a real foreground service runs).
  expect(options.foregroundService.channelId).toBe(FG_SERVICE_CHANNEL_ID);
  expect(options.foregroundService.notificationTitle).toBe('러닝 기록 중');
  // The default-goal run (5km) surfaces the goal in the prepared notification.
  expect(options.foregroundService.notificationBody).toContain('5km');

  act(() => renderer.unmount());
});

// ── permission gate regression ──────────────────────────────────────────────
// On Android the engine MUST request ACCESS_FINE_LOCATION before starting the
// GPS watch, and MUST NOT start watchPosition when that fine-location request is
// denied. (The previously-added ACCESS_BACKGROUND_LOCATION request was removed as
// a Play-safe re-scope; only the fine-location gate governs whether tracking
// starts.) This guards against a regression where a denied grant still leaks
// location tracking. Drives the real App on Platform.OS='android'.
test('on Android, a denied fine-location grant blocks the GPS watch from starting (no watchPosition)', async () => {
  const prevOS = Platform.OS;
  Platform.OS = 'android';
  // Fine-location request is denied; engine must alert and bail before beginRun().
  const reqSpy = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  try {
    const renderer = await startRun();

    // The fine-location permission was actually requested (the gate ran)...
    const requested = reqSpy.mock.calls.map(c => c[0]);
    expect(requested).toContain(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    // ...background location is NEVER requested (removed in the re-scope)...
    expect(requested).not.toContain(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    );
    // ...and because fine location was denied, the GPS watch never started.
    expect((Geolocation.watchPosition as jest.Mock).mock.calls.length).toBe(0);

    act(() => renderer.unmount());
  } finally {
    reqSpy.mockRestore();
    Platform.OS = prevOS;
  }
});

// Complementary: when fine location IS granted on Android, the watch starts AND
// background location is still never requested (the re-scope holds on the happy
// path too — only the harmful background request was removed, not the gate).
test('on Android with fine-location granted, the GPS watch starts and background location is never requested', async () => {
  const prevOS = Platform.OS;
  Platform.OS = 'android';
  const reqSpy = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  try {
    const renderer = await startRun();

    const requested = reqSpy.mock.calls.map(c => c[0]);
    expect(requested).toContain(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    expect(requested).not.toContain(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    );
    expect(
      (Geolocation.watchPosition as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);

    act(() => renderer.unmount());
  } finally {
    reqSpy.mockRestore();
    Platform.OS = prevOS;
  }
});
