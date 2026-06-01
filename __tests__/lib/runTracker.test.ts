/**
 * lib/runTracker — shared GPS distance engine unit tests.
 *
 * Exercises an ISOLATED RunTracker instance (not the module singleton) with a
 * deterministic injected clock and synthetic fixes. Assertions are on observable
 * engine outputs (getDistanceKm / getElapsed / getState() / emitted events) —
 * the same contract both delivery paths (foreground watch + background task)
 * depend on. The pure decision logic (Kalman → segment gate → distance, auto
 * pause/resume) is reused unchanged from lib/*, so these guard the stateful
 * orchestration the engine adds: warmup, de-dup, pause accounting, permission stop.
 *
 * @format
 */

import {RunTracker, RawFix, RunTrackerEvent} from '../../lib/runTracker';

const LON = 127.0;

function fix(lat: number, lon: number, acc: number, ts: number): RawFix {
  return {coords: {latitude: lat, longitude: lon, accuracy: acc}, timestamp: ts};
}

// Build an engine with a controllable clock so elapsed/pause math is deterministic.
function makeEngine() {
  const t = new RunTracker();
  let clock = 100000;
  t.setNow(() => clock);
  return {t, set: (v: number) => (clock = v)};
}

// Clear warmup at a single point P0 (idx 0..2 do not count distance).
function clearWarmup(t: RunTracker) {
  t.ingestFix(fix(37.5, LON, 5, 100000));
  t.ingestFix(fix(37.5, LON, 5, 102000));
  t.ingestFix(fix(37.5, LON, 5, 104000));
}

test('accumulates distance only after warmup, summing accepted segments', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  clearWarmup(t);
  expect(t.getDistanceKm()).toBe(0); // first 3 fixes are warmup → no distance

  t.ingestFix(fix(37.5003, LON, 5, 107000)); // ~33 m accepted
  const d1 = t.getDistanceKm();
  expect(d1).toBeGreaterThan(0);

  t.ingestFix(fix(37.5006, LON, 5, 110000)); // another ~33 m
  expect(t.getDistanceKm()).toBeGreaterThan(d1); // summed, not overwritten
});

test('de-dupes by timestamp: a non-newer fix (echoed by a second path) is ignored', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);

  t.ingestFix(fix(37.5003, LON, 5, 107000));
  const d = t.getDistanceKm();

  // Same timestamp delivered again (foreground + background overlap) → dropped.
  t.ingestFix(fix(37.5006, LON, 5, 107000));
  expect(t.getDistanceKm()).toBe(d);
  // An older timestamp is also dropped.
  t.ingestFix(fix(37.5009, LON, 5, 106000));
  expect(t.getDistanceKm()).toBe(d);
});

test('manual pause freezes distance; resume lets it accumulate again', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);
  t.ingestFix(fix(37.5003, LON, 5, 107000));
  const dRunning = t.getDistanceKm();
  expect(dRunning).toBeGreaterThan(0);

  t.togglePause();
  expect(t.getState().paused).toBe(true);
  t.ingestFix(fix(37.5006, LON, 5, 110000)); // moving fix while paused
  expect(t.getDistanceKm()).toBe(dRunning); // frozen

  t.togglePause();
  expect(t.getState().paused).toBe(false);
  t.ingestFix(fix(37.5009, LON, 5, 113000));
  expect(t.getDistanceKm()).toBeGreaterThan(dRunning); // engine restarts
});

test('elapsed is pause-adjusted, frozen while paused, and never negative', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  set(110000);
  expect(t.getElapsed()).toBe(10); // 10s of run time

  t.togglePause(); // pause at t=110000
  set(140000); // 30s pass while paused
  expect(t.getElapsed()).toBe(10); // frozen — paused time does not count

  t.togglePause(); // resume at t=140000 (pausedMs += 30000)
  set(145000);
  expect(t.getElapsed()).toBe(15); // 10s before + 5s after resume
  expect(t.getElapsed()).toBeGreaterThanOrEqual(0);
});

test('standing still auto-pauses, sustained motion auto-resumes', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  let ts = 100000;
  t.ingestFix(fix(37.5, LON, 5, ts));
  t.ingestFix(fix(37.5, LON, 5, (ts += 2000)));
  t.ingestFix(fix(37.5, LON, 5, (ts += 2000)));
  t.ingestFix(fix(37.5003, LON, 5, (ts += 2000))); // a real move
  expect(t.getState().autoPaused).toBe(false);

  // Stand still: repeated fixes at one point → slowSec crosses the 6s hold.
  for (let i = 0; i < 12; i++) t.ingestFix(fix(37.5003, LON, 5, (ts += 3000)));
  expect(t.getState().autoPaused).toBe(true);

  // Two sustained fast fixes (>1 m/s for ≥2s) → auto-resume.
  t.ingestFix(fix(37.5005, LON, 5, (ts += 1500))); // fastSec 1.5 < 2 → still paused
  expect(t.getState().autoPaused).toBe(true);
  t.ingestFix(fix(37.5007, LON, 5, (ts += 2000))); // fastSec ≥ 2 → resume
  expect(t.getState().autoPaused).toBe(false);
});

test('notifyPermissionRevoked stops accumulation and flags the state', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);
  t.ingestFix(fix(37.5003, LON, 5, 107000));
  const d = t.getDistanceKm();
  expect(d).toBeGreaterThan(0);

  t.notifyPermissionRevoked();
  expect(t.getState().permissionRevoked).toBe(true);
  expect(t.isActive()).toBe(false);

  // Further fixes are ignored — no garbage distance after revocation.
  t.ingestFix(fix(37.5009, LON, 5, 110000));
  expect(t.getDistanceKm()).toBe(d);
});

test('notifyPermissionRevoked freezes elapsed time — clock keeps ticking but time does not', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  set(120000); // 20s into the run
  expect(t.getElapsed()).toBe(20);

  t.notifyPermissionRevoked(); // time must freeze here, like distance does
  expect(t.getElapsed()).toBe(20);

  // 1s ticker keeps firing and wall clock keeps advancing — elapsed stays put.
  t.tick();
  set(200000); // 80s more pass on the wall clock
  t.tick();
  expect(t.getElapsed()).toBe(20); // frozen, not 100
  expect(t.getState().elapsed).toBe(20);
});

test('emits firstFix once and pause/resume events with the auto flag', () => {
  const {t} = makeEngine();
  const events: RunTrackerEvent[] = [];
  t.subscribe(ev => events.push(ev));
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  clearWarmup(t);
  const firstFixes = events.filter(e => e.type === 'firstFix');
  expect(firstFixes.length).toBe(1); // emitted exactly once

  t.togglePause();
  t.togglePause();
  const paused = events.find(e => e.type === 'paused');
  const resumed = events.find(e => e.type === 'resumed');
  expect(paused).toMatchObject({type: 'paused', auto: false});
  expect(resumed).toMatchObject({type: 'resumed', auto: false});
});
