/**
 * App.tsx background-tracking wiring test (expo-location).
 *
 * Drives the real App through home → goal → live-run and asserts the engine
 * started a location-typed foreground service via
 * Location.startLocationUpdatesAsync with the prepared Korean notification copy,
 * AND a live foreground watch via Location.watchPositionAsync. With the
 * expo-location swap this is REAL screen-off tracking (the background task feeds
 * the same shared engine), not a forward-prep no-op. We assert on the actual
 * calls the engine made (not internal state).
 *
 * Also covers the permission gate: a denied foreground permission must NOT start
 * any tracking, and a denied *background* permission is graceful — the
 * foreground watch still starts (no screen-off service), so the run records
 * while the screen is on.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import App from '../App';
import {RUN_LOCATION_TASK} from '../lib/locationService';

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
  // Goal → 카운트다운 → live run. 카운트다운 onDone 타이머를 제어하려면 카운트다운이
  // fake 타이머 하에서 mount/advance 돼야 한다(real/fake 양쪽에서 불리므로 임시 보장).
  const fakeAlready = typeof (setTimeout as any).clock === 'object';
  if (!fakeAlready) jest.useFakeTimers();
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → 카운트다운
  });
  await act(async () => {
    jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런(onDone, default 5km)
  });
  if (!fakeAlready) jest.useRealTimers();
  return {renderer, root};
}

const watchMock = () => Location.watchPositionAsync as jest.Mock;
const bgMock = () => Location.startLocationUpdatesAsync as jest.Mock;

test('live run starts a location foreground service (background task) with the prepared Korean notification + a live foreground watch', async () => {
  const {renderer} = await startRun();

  // Foreground live updates started.
  expect(watchMock().mock.calls.length).toBeGreaterThan(0);

  // Background screen-off updates started under the run-location task with a
  // location-typed foreground service notification (real backgrounding now).
  const calls = bgMock().mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[0][0]).toBe(RUN_LOCATION_TASK);
  const options = calls[0][1];
  expect(options).toBeTruthy();
  expect(options.foregroundService).toBeTruthy();
  expect(options.foregroundService.notificationTitle).toBe('러닝 기록 중');
  // The default-goal run (5km) surfaces the goal in the notification body.
  expect(options.foregroundService.notificationBody).toContain('5km');

  act(() => renderer.unmount());
});

// ── permission gate ──────────────────────────────────────────────────────────
// A denied foreground permission must NOT start any tracking (no garbage
// distance) — neither the foreground watch nor the background service.
test('a denied foreground location permission blocks all tracking (no watch, no background service)', async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: false,
    status: 'denied',
  });
  const {renderer} = await startRun();

  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
  expect(watchMock().mock.calls.length).toBe(0);
  expect(bgMock().mock.calls.length).toBe(0);

  act(() => renderer.unmount());
});

// A denied BACKGROUND permission is graceful: the foreground watch still starts
// (the run records while the screen is on), but no screen-off service is started.
test('a denied background permission is graceful — foreground watch starts, no background service', async () => {
  (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: false,
    status: 'denied',
  });
  const {renderer} = await startRun();

  // Foreground tracking still runs...
  expect(watchMock().mock.calls.length).toBeGreaterThan(0);
  // ...but the screen-off background service was not started (graceful denial).
  expect(bgMock().mock.calls.length).toBe(0);

  act(() => renderer.unmount());
});
