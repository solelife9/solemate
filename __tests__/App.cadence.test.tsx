/**
 * App.tsx cadence wiring integration test.
 *
 * Drives the real App to the live-run screen, then injects a synthetic
 * accelerometer trace through the registered react-native-sensors
 * accelerometer.subscribe() callback — the same end-to-end path the device
 * uses: accel sample → feedAccelSample (peak detection + window normalization)
 * → setCadence → run-screen render. Assertions are on the observable cadence
 * metric ('--' placeholder vs a rendered spm number), so this verifies the
 * accel→setCadence→UI batter, not the pure lib in isolation (that lives in
 * __tests__/lib/cadence.test.ts).
 *
 * The accel callback reads Date.now() for each sample's timestamp, so fake
 * timers + setSystemTime let us place strikes on a real ~170 spm cadence. We
 * assert the metric shows '--' before the 3s minimum window has been observed,
 * then renders a value inside the 160-180 running-standard band once ~12s of
 * strikes have streamed through.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {accelerometer} from 'react-native-sensors';
import {STEP_PEAK_THRESHOLD} from '../lib/engineConstants';
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

// Read the cadence metric value ('--' when there is no cadence, else the spm
// number as a string). The metric icons were removed (UI polish slice-4), so the
// cadence metric View now renders as [<value>, '케이던스']. The bare '케이던스'
// label Text also contains the needle, so we keep only host nodes whose text has
// MORE than the label (i.e. the value too) and take the smallest — the metric
// View itself ('<value>케이던스'); ancestors are strictly longer.
function readCadence(root: ReactTestRenderer.ReactTestInstance): string {
  const metric = root
    .findAll(n => typeof n.type === 'string')
    .filter(n => {
      const t = textOf(n);
      return t.includes('케이던스') && t.replace('케이던스', '').trim() !== '';
    })
    .sort((a, b) => textOf(a).length - textOf(b).length)[0];
  if (!metric) throw new Error('cadence metric not found');
  return textOf(metric).replace('케이던스', '').trim();
}

async function startRun() {
  mockBackendWithShoe();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작');
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → 카운트다운
  });
  // 카운트다운(준비·GPS락·3·2·1·GO) 자동 진행을 건너뛰어 라이브 런으로 진입한다.
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });

  // The run engine called accelerometer.subscribe(cb) in beginRun — grab cb so
  // we can feed it synthetic magnitude samples.
  const calls = (accelerometer.subscribe as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const onAccel = calls[calls.length - 1][0] as (s: {x: number; y: number; z: number}) => void;

  return {renderer, root, onAccel};
}

const DIP = STEP_PEAK_THRESHOLD - 2; // mag below threshold → arms the next rising edge
const PEAK = STEP_PEAK_THRESHOLD + 3; // mag above threshold → a foot strike
const BASE = 100000;

test('accelerometer ~170spm trace renders cadence in the 160-180 band, and "--" before 3s', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE);
  try {
    const {renderer, root, onAccel} = await startRun();
    expect(readCadence(root)).toBe('--'); // no strikes yet

    const intervalMs = Math.round(60000 / 170); // 353ms → 170 spm
    // Emit strike k as a dip→peak rising edge at wall-clock BASE + k*interval.
    // mag = sqrt(x²+y²+z²); a single-axis x feeds mag = x directly.
    const strike = (k: number) => {
      const at = BASE + k * intervalMs;
      jest.setSystemTime(at - 1);
      act(() => onAccel({x: DIP, y: 0, z: 0}));
      jest.setSystemTime(at);
      act(() => onAccel({x: PEAK, y: 0, z: 0}));
    };

    // First few strikes land inside the 3s minimum window → cadence withheld.
    for (let k = 0; k <= 6; k++) strike(k); // up to ~2.1s of observed span
    expect(readCadence(root)).toBe('--');

    // Keep streaming to ~12s of observed span — the window normalization now has
    // a stable rate and the metric must render a real spm value in-band.
    for (let k = 7; k <= 34; k++) strike(k);
    const shown = readCadence(root);
    expect(shown).not.toBe('--');
    const spm = Number(shown);
    expect(Number.isInteger(spm)).toBe(true);
    expect(spm).toBeGreaterThanOrEqual(160);
    expect(spm).toBeLessThanOrEqual(180);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});

// Regression for the audit#14b bug: idle before the first footfall must NOT
// dilute the displayed cadence. The accel stream starts only after a long GPS
// warm-up; the metric must still render the true ~170 spm, not a fraction of it.
test('idle before the first strike does not under-report the displayed cadence', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE);
  try {
    const {renderer, root, onAccel} = await startRun();

    // 30s of silence (GPS warm-up / start-line wait) — no accel samples emitted.
    const firstStrikeAt = BASE + 30000;
    const intervalMs = Math.round(60000 / 170);
    const strike = (k: number) => {
      const at = firstStrikeAt + k * intervalMs;
      jest.setSystemTime(at - 1);
      act(() => onAccel({x: DIP, y: 0, z: 0}));
      jest.setSystemTime(at);
      act(() => onAccel({x: PEAK, y: 0, z: 0}));
    };

    // ~12s of real 170 spm running after the idle gap.
    for (let k = 0; k <= 34; k++) strike(k);
    const shown = readCadence(root);
    const spm = Number(shown);
    expect(spm).toBeGreaterThanOrEqual(160); // real cadence, NOT pulled toward ~26
    expect(spm).toBeLessThanOrEqual(180);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});
