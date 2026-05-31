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
 *   3) The displayed elapsed timer freezes while paused — it does not advance and
 *      never goes negative/garbage (audit#4: elapsed = max(0, now-t0-pausedMs)
 *      with the pauseStartRef guard, verified here at the App/UI level).
 *   4) After auto-resume both the distance engine AND the clock restart — km()
 *      climbs above the paused value (guards the "label clears but engine stays
 *      frozen" bug).
 *
 * Cadence is intentionally out of scope here: it is driven by the accelerometer
 * (step detection), not by the GPS speed that the auto-pause machine consumes,
 * and the test harness's accelerometer mock never emits — so cadence stays at
 * its no-data placeholder ('--') throughout. The freeze test asserts that the
 * GPS auto-pause path never fabricates a cadence value, which is the only
 * cadence behavior reachable from this code path.
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

// Read the displayed elapsed timer (fmtTime → "MM:SS" while under an hour) and
// return it as whole seconds. fmtPace renders as `m'ss"` (apostrophe/quote, no
// colon) so the MM:SS shape is unique to the time metric on the run screen.
function readElapsedSec(root: ReactTestRenderer.ReactTestInstance): number {
  const node = root
    .findAll(n => typeof n.type === 'string')
    .find(n => {
      const c = n.props.children;
      return typeof c === 'string' && /^\d{1,2}:\d{2}$/.test(c.trim());
    });
  if (!node) throw new Error('elapsed readout not found');
  const [m, s] = (node.props.children as string).trim().split(':').map(Number);
  return m * 60 + s;
}

// Read the cadence metric value. The cadence metric View renders as
// [Ionicons 'walk-outline', <value>, '케이던스'] — the walk-outline icon is
// unique to cadence on the run screen — so concatenating its text and stripping
// the icon name + label leaves just the value ('--' when there is no cadence).
// Used to prove the GPS auto-pause path never fabricates a cadence value.
function readCadence(root: ReactTestRenderer.ReactTestInstance): string {
  const metric = root
    .findAll(n => typeof n.type === 'string')
    .filter(n => {
      const t = textOf(n);
      return t.includes('케이던스') && t.includes('walk-outline');
    })
    // The metric's child Texts each hold only one of the two tokens, so the
    // smallest host node containing BOTH is the metric View itself
    // ("walk-outline" + value + "케이던스"); ancestors are strictly longer.
    .sort((a, b) => textOf(a).length - textOf(b).length)[0];
  if (!metric) throw new Error('cadence metric not found');
  return textOf(metric).replace('walk-outline', '').replace('케이던스', '');
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

test('displayed elapsed timer freezes while auto-paused — never advances, never negative/garbage', async () => {
  // Fake timers let us drive the once-per-second elapsed interval and the
  // Date.now() clock it reads (elapsed = max(0, now - t0 - pausedMs)). The GPS
  // fixes below use their own pos.timestamp axis (independent of Date.now), so
  // the auto-pause machine and the wall clock advance separately — exactly as on
  // device. We anchor system time to the fixes' base so t0 ≈ 100000.
  jest.useFakeTimers();
  jest.setSystemTime(100000);
  try {
    const {renderer, root, emit} = await startRun();

    // Warmup at P0 then one real move so the run is genuinely running.
    let t = 100000;
    await emit(37.5, LON, 5, t);
    await emit(37.5, LON, 5, (t += 2000));
    await emit(37.5, LON, 5, (t += 2000));
    await emit(37.5003, LON, 5, (t += 2000));
    expect(isAutoPaused(root)).toBe(false);

    // Advance the wall clock 10s while RUNNING: the interval must move the timer
    // forward (proving it is live before we pause it).
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    const elapsedRunning = readElapsedSec(root);
    expect(elapsedRunning).toBeGreaterThan(0);

    // Stand still → auto-pause. These fixes only advance pos.timestamp, not the
    // wall clock, so the timer reading does not change here.
    for (let i = 0; i < 12; i++) {
      await emit(37.5003, LON, 5, (t += 3000));
    }
    expect(isAutoPaused(root)).toBe(true);
    const elapsedAtPause = readElapsedSec(root);
    expect(elapsedAtPause).toBe(elapsedRunning);

    // Now burn 30s of wall time WHILE PAUSED. The interval keeps firing but the
    // pauseStartRef-guarded branch must not setElapsed → the displayed timer is
    // frozen, stays non-negative, and is a finite integer (not NaN/garbage).
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    const elapsedWhilePaused = readElapsedSec(root);
    expect(elapsedWhilePaused).toBe(elapsedAtPause); // frozen — did not advance
    expect(elapsedWhilePaused).toBeGreaterThanOrEqual(0); // never negative
    expect(Number.isInteger(elapsedWhilePaused)).toBe(true); // not garbage/NaN

    // Cadence is accelerometer-driven (out of the GPS auto-pause scope): the
    // mock never emits, so the auto-pause path must leave it at the '--'
    // placeholder rather than fabricating a value.
    expect(readCadence(root)).toBe('--');

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});

test('distance engine restarts after auto-resume — km climbs above the paused value (not just the label clearing)', async () => {
  const {renderer, root, emit, km} = await startRun();

  // Warmup at P0, then an accepted ~22m/6s move so km > 0 before we pause.
  let t = 100000;
  await emit(37.5, LON, 5, t);
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5002, LON, 5, (t += 6000)); // ~22m over 6s ≈ 3.7 m/s → accepted
  const kmBeforePause = km();
  expect(kmBeforePause).toBeGreaterThan(0);

  // Stand still → auto-pause; distance must freeze at the pre-pause value.
  for (let i = 0; i < 12; i++) {
    await emit(37.5002, LON, 5, (t += 3000));
  }
  expect(isAutoPaused(root)).toBe(true);
  const kmAtPause = km();
  expect(kmAtPause).toBe(kmBeforePause);

  // Two sustained fast fixes (>1.0 m/s for ≥2s) → auto-resume.
  await emit(37.5004, LON, 5, (t += 1500)); // fastSec 1.5 < 2 → still paused
  expect(isAutoPaused(root)).toBe(true);
  await emit(37.5006, LON, 5, (t += 2000)); // fastSec ≥ 2 → resume
  expect(isAutoPaused(root)).toBe(false);

  // A further accepted move after resume must accumulate: if the engine were
  // frozen (label-only resume bug), km() would stay at kmAtPause forever.
  await emit(37.5009, LON, 5, (t += 3000));
  expect(km()).toBeGreaterThan(kmAtPause);

  act(() => renderer.unmount());
});
