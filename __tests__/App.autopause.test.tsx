/**
 * App.tsx auto-pause/resume integration tests.
 *
 * Drives the real App to the live-run screen, then injects synthetic GPS fixes
 * through the registered watchPosition callback (same harness as
 * App.gps.test.tsx). Assertions are on observable run-screen state — the live
 * status label ("자동 일시정지") and the displayed distance — so they verify the
 * end-to-end wiring of lib/autoPause's decideAutoPause into the run engine:
 *
 *   1) Standing still for >3s auto-pauses the run (label flips to 자동 일시정지).
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
import * as Location from 'expo-location';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

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

// Read the cadence metric value. The metric icons were removed (UI polish
// slice-4), so the cadence metric View now renders as [<value>, '케이던스']. The
// bare '케이던스' label Text also matches the needle, so keep only host nodes
// whose text carries MORE than the label (i.e. the value), and take the smallest
// — the metric View itself ('<value>케이던스'); ancestors are strictly longer.
// Used to prove the GPS auto-pause path never fabricates a cadence value.
function readCadence(root: ReactTestRenderer.ReactTestInstance): string {
  const metric = root
    .findAll(n => typeof n.type === 'string')
    .filter(n => {
      const t = textOf(n);
      return t.includes('케이던스') && t.replace('케이던스', '').trim() !== '';
    })
    .sort((a, b) => textOf(a).length - textOf(b).length)[0];
  if (!metric) throw new Error('cadence metric not found');
  return textOf(metric).replace('케이던스', '');
}

const isAutoPaused = (root: ReactTestRenderer.ReactTestInstance) =>
  textOf(root).includes('자동 일시정지');

async function startRun() {
  mockBackendWithShoe();
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]); // Stage 3: 부팅 캐시 시드
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // home → goal
  // 2nd 프레스가 카운트다운(준비·3·2·1·GO)을 띄운다. onDone 타이머를 제어하려면
  // 카운트다운이 fake 타이머 하에서 mount/advance 돼야 하므로, 이 헬퍼가 real/fake
  // 양쪽 테스트에서 불리는 점을 고려해 진입 동안만 fake 를 보장하고 원복한다.
  const fakeAlready = typeof (setTimeout as any).clock === 'object';
  if (!fakeAlready) jest.useFakeTimers();
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → 카운트다운
  });
  await act(async () => {
    jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런(onDone)
  });
  if (!fakeAlready) jest.useRealTimers();

  const calls = (Location.watchPositionAsync as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  // expo watchPositionAsync(options, callback, errorHandler) → callback is arg 1.
  const onPos = calls[calls.length - 1][1] as (p: any) => void;

  const emit = (lat: number, lon: number, accuracy: number, timestamp: number) =>
    act(() => {
      onPos({coords: {latitude: lat, longitude: lon, accuracy}, timestamp});
    });

  return {renderer, root, emit, km: () => readKm(root)};
}

const LON = 127.0;

test('standing still for over 3s auto-pauses the run', async () => {
  const {renderer, root, emit} = await startRun();

  // Warmup at P0 (idx0..2) then one real move so the run is genuinely running.
  let t = 100000;
  await emit(37.5, LON, 5, t);
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5003, LON, 5, (t += 2000)); // ~33m move → counts as motion
  expect(isAutoPaused(root)).toBe(false);

  // Now stand still: many fixes at the same point, 3s apart. Once the Kalman
  // residual settles below the 0.6 m/s floor, slowSec crosses the 3s hold → pause.
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

  // A moving fix while paused but BELOW the 1s resume hold (dt=0.8s): the run must
  // stay paused AND must not add distance (accumulation is frozen during pause).
  await emit(37.50035, LON, 5, (t += 800)); // ~6m in 0.8s → fast, fastSec=0.8 < 1
  expect(isAutoPaused(root)).toBe(true);
  expect(km()).toBe(kmAtPause);

  // A second moving fix pushes sustained fast time past 1s → auto-resume.
  await emit(37.5004, LON, 5, (t += 800)); // fastSec ≥ 1 → resume
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

  // Two sustained fast fixes (>1.0 m/s for ≥1s) → auto-resume.
  await emit(37.50025, LON, 5, (t += 800)); // ~6m/0.8s fast, fastSec 0.8 < 1 → still paused
  expect(isAutoPaused(root)).toBe(true);
  await emit(37.5003, LON, 5, (t += 800)); // fastSec ≥ 1 → resume
  expect(isAutoPaused(root)).toBe(false);

  // A further accepted move after resume must accumulate: if the engine were
  // frozen (label-only resume bug), km() would stay at kmAtPause forever.
  await emit(37.5006, LON, 5, (t += 3000)); // ~33m/3s ≈ 11 m/s → accepted
  expect(km()).toBeGreaterThan(kmAtPause);

  act(() => renderer.unmount());
});
