/**
 * App.tsx auto-pause/resume integration tests.
 *
 * Drives the real App to the live-run screen, then injects synthetic GPS fixes
 * through the registered watchPosition callback (same harness as
 * App.gps.test.tsx). Assertions are on observable run-screen state — the live
 * status label ("자동 일시정지") and the displayed distance — so they verify the
 * end-to-end wiring of lib/autoPause's decideAutoPause into the run engine:
 *
 *   1) Standing still for >6s auto-pauses the run (label flips to 자동 일시정지).
 *   2) While paused, distance does NOT accumulate (the audit#4 / freeze fix).
 *   3) Sustained movement (>1.0 m/s for >2s) auto-resumes (label clears).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import Geolocation from 'react-native-geolocation-service';
import App from '../App';

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

const isAutoPaused = (root: ReactTestRenderer.ReactTestInstance) =>
  textOf(root).includes('자동 일시정지');

async function startRun() {
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

  const calls = (Geolocation.watchPosition as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const onPos = calls[calls.length - 1][0] as (p: any) => void;

  const emit = (lat: number, lon: number, accuracy: number, timestamp: number) =>
    act(() => {
      onPos({coords: {latitude: lat, longitude: lon, accuracy}, timestamp});
    });

  return {renderer, root, emit, km: () => readKm(root)};
}

const LON = 127.0;

test('standing still for over 6s auto-pauses the run', async () => {
  const {renderer, root, emit} = await startRun();

  // Warmup at P0 (idx0..2) then one real move so the run is genuinely running.
  let t = 100000;
  await emit(37.5, LON, 5, t);
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5003, LON, 5, (t += 2000)); // ~33m move → counts as motion
  expect(isAutoPaused(root)).toBe(false);

  // Now stand still: many fixes at the same point, 3s apart. Once the Kalman
  // residual settles below the 0.6 m/s floor, slowSec crosses the 6s hold → pause.
  for (let i = 0; i < 12; i++) {
    await emit(37.5003, LON, 5, (t += 3000));
  }
  expect(isAutoPaused(root)).toBe(true);

  act(() => renderer.unmount());
});

test('distance does not accumulate while auto-paused, then auto-resumes on sustained movement', async () => {
  const {renderer, root, emit, km} = await startRun();

  let t = 100000;
  await emit(37.5, LON, 5, t);
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5003, LON, 5, (t += 2000));
  for (let i = 0; i < 12; i++) {
    await emit(37.5003, LON, 5, (t += 3000));
  }
  expect(isAutoPaused(root)).toBe(true);
  const kmAtPause = km();

  // A moving fix while paused but BELOW the 2s resume hold (dt=1s): the run must
  // stay paused AND must not add distance (accumulation is frozen during pause).
  await emit(37.5004, LON, 5, (t += 1000)); // ~11m in 1s → fast, fastSec=1 < 2
  expect(isAutoPaused(root)).toBe(true);
  expect(km()).toBe(kmAtPause);

  // A second moving fix pushes sustained fast time past 2s → auto-resume.
  await emit(37.5005, LON, 5, (t += 1500)); // fastSec ≥ 2 → resume
  expect(isAutoPaused(root)).toBe(false);

  act(() => renderer.unmount());
});
