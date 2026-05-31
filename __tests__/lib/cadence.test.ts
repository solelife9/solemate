import {initCadenceState, feedAccelSample, computeSpm} from '../../lib/cadence';
import {
  STEP_PEAK_THRESHOLD,
  STEP_MIN_INTERVAL_MS,
  CADENCE_WINDOW_MS,
  CADENCE_MIN_WINDOW_MS,
} from '../../lib/engineConstants';

// Synthesize the accelerometer magnitude trace for N foot strikes spaced
// `intervalMs` apart, starting at `startMs`. Each strike is a below→above→below
// triple around STEP_PEAK_THRESHOLD so the rising-edge detector fires exactly
// once per strike. Returns {state, spm} after feeding the whole trace.
function runStrikes(opts: {
  startMs: number;
  count: number;
  intervalMs: number;
  peak?: number;
}) {
  const peak = opts.peak ?? STEP_PEAK_THRESHOLD + 5;
  let state = initCadenceState(opts.startMs);
  let last = {state, stepDetected: false, spm: 0};
  let steps = 0;
  for (let i = 0; i < opts.count; i++) {
    const t = opts.startMs + i * opts.intervalMs;
    // dip below the threshold so the next sample is a fresh rising edge…
    last = feedAccelSample(state, STEP_PEAK_THRESHOLD - 2, t);
    state = last.state;
    // …then the strike itself crosses upward.
    last = feedAccelSample(state, peak, t + 1);
    state = last.state;
    if (last.stepDetected) steps++;
  }
  return {state, spm: last.spm, steps};
}

describe('initCadenceState', () => {
  test('starts with no steps and the given start time', () => {
    expect(initCadenceState(1000)).toEqual({steps: [], lastMag: 0, lastStepMs: -Infinity, startMs: 1000});
  });
});

describe('feedAccelSample — peak (foot-strike) detection', () => {
  test('a single upward threshold crossing registers exactly one step', () => {
    let s = initCadenceState(0);
    let r = feedAccelSample(s, STEP_PEAK_THRESHOLD - 1, 0); // below
    expect(r.stepDetected).toBe(false);
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD + 3, 1); // crosses up → strike
    expect(r.stepDetected).toBe(true);
    expect(r.state.steps).toEqual([1]);
  });

  test('staying above the threshold does not re-count without a new rising edge', () => {
    let r = feedAccelSample(initCadenceState(0), STEP_PEAK_THRESHOLD + 3, 0); // strike
    expect(r.stepDetected).toBe(true);
    // still above threshold (no dip back below) → no new edge even much later
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD + 4, 500);
    expect(r.stepDetected).toBe(false);
    expect(r.state.steps).toHaveLength(1);
  });

  test('exactly at the threshold is not a peak (strict >)', () => {
    let r = feedAccelSample(initCadenceState(0), STEP_PEAK_THRESHOLD - 1, 0);
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD, 1); // == threshold
    expect(r.stepDetected).toBe(false);
    expect(r.state.steps).toHaveLength(0);
  });

  test('debounce drops a second rising edge inside STEP_MIN_INTERVAL_MS', () => {
    let r = feedAccelSample(initCadenceState(0), STEP_PEAK_THRESHOLD + 3, 0); // strike @0
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD - 2, 100); // dip
    // rising edge again at +200ms — inside the 250ms debounce, so rejected
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD + 3, 200);
    expect(r.stepDetected).toBe(false);
    expect(r.state.steps).toHaveLength(1);
  });

  test('a rising edge just past STEP_MIN_INTERVAL_MS is accepted', () => {
    let r = feedAccelSample(initCadenceState(0), STEP_PEAK_THRESHOLD + 3, 0); // strike @0
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD - 2, 100); // dip
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD + 3, STEP_MIN_INTERVAL_MS + 1);
    expect(r.stepDetected).toBe(true);
    expect(r.state.steps).toHaveLength(2);
  });
});

describe('computeSpm — both-feet step counting at the running standard', () => {
  // 170 spm = one strike every 60000/170 ≈ 352.9ms. Run a full minute of strikes
  // and confirm the reported cadence lands on the running-standard band.
  test('~170 spm trace over a full window reads ~160-180 spm', () => {
    const intervalMs = Math.round(60000 / 170); // 353ms
    const {spm} = runStrikes({startMs: 0, count: 170, intervalMs});
    expect(spm).toBeGreaterThanOrEqual(160);
    expect(spm).toBeLessThanOrEqual(180);
  });

  test('once the window is full, spm equals the raw strike count in the last 60s', () => {
    // Strikes at a steady 350ms cadence for well over a minute.
    const intervalMs = 350;
    const {state} = runStrikes({startMs: 0, count: 300, intervalMs});
    const now = state.steps[state.steps.length - 1] + 1;
    const inWindow = state.steps.filter(t => now - t <= CADENCE_WINDOW_MS).length;
    expect(computeSpm(state, now)).toBe(inWindow);
  });
});

describe('computeSpm — audit#14 initial-window normalization', () => {
  test('extrapolates the partial-window count to a per-minute rate', () => {
    // 28 strikes in the first 10s → true cadence 28/10*60 = 168 spm, NOT 28.
    const intervalMs = Math.round(10000 / 28); // ~357ms
    const start = 0;
    const {state} = runStrikes({startMs: start, count: 28, intervalMs});
    const now = start + 28 * intervalMs + 1; // ~10s in
    const spm = computeSpm(state, now);
    expect(spm).toBeGreaterThan(150); // normalized rate, far above the raw 28
    expect(spm).toBeLessThan(190);
  });

  test('the same partial count would under-report without normalization', () => {
    // Guard: the normalized value must exceed the naive raw step count, which is
    // exactly the under-display bug audit#14 fixes.
    const intervalMs = 357;
    const {state} = runStrikes({startMs: 0, count: 28, intervalMs});
    const now = 28 * intervalMs + 1;
    expect(computeSpm(state, now)).toBeGreaterThan(state.steps.length);
  });

  test('returns 0 before CADENCE_MIN_WINDOW_MS elapses (too little data)', () => {
    // A couple of strikes within the first 2s — under the 3s minimum window.
    let r = feedAccelSample(initCadenceState(0), STEP_PEAK_THRESHOLD + 3, 200);
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD - 2, 600);
    r = feedAccelSample(r.state, STEP_PEAK_THRESHOLD + 3, 1000);
    expect(r.state.steps.length).toBeGreaterThan(0); // strikes were detected…
    expect(computeSpm(r.state, 2000)).toBe(0); // …but cadence is withheld until 3s
  });

  test('begins reporting a normalized rate exactly at CADENCE_MIN_WINDOW_MS', () => {
    const {state} = runStrikes({startMs: 0, count: 9, intervalMs: 333}); // ~3s of 180spm
    expect(computeSpm(state, CADENCE_MIN_WINDOW_MS)).toBeGreaterThan(0);
  });
});

describe('feedAccelSample — rolling 60s window pruning', () => {
  test('strikes older than the window age out even on a non-step sample', () => {
    let r = feedAccelSample(initCadenceState(0), STEP_PEAK_THRESHOLD + 3, 0); // strike @0
    expect(r.state.steps).toEqual([0]);
    // a quiet sample well past the window — the old strike must be pruned
    r = feedAccelSample(r.state, 1, CADENCE_WINDOW_MS + 1);
    expect(r.state.steps).toEqual([]);
  });
});

describe('feedAccelSample — purity', () => {
  test('does not mutate the input state', () => {
    const s = initCadenceState(0);
    s.steps.push(0);
    const snapshot = {steps: [...s.steps], lastMag: s.lastMag, lastStepMs: s.lastStepMs, startMs: s.startMs};
    feedAccelSample(s, STEP_PEAK_THRESHOLD + 5, 1000);
    expect(s).toEqual(snapshot);
  });
});

describe('cadence constants are pinned to the tuned spec', () => {
  test('peak / debounce / window constants match', () => {
    expect(STEP_PEAK_THRESHOLD).toBe(12);
    expect(STEP_MIN_INTERVAL_MS).toBe(250);
    expect(CADENCE_WINDOW_MS).toBe(60000);
    expect(CADENCE_MIN_WINDOW_MS).toBe(3000);
  });
});
