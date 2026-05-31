// ─── Cadence (steps-per-minute) detection ────────────────────────
// Pure cadence logic extracted from App.tsx. Given a stream of accelerometer
// magnitude samples it (1) detects each foot strike as a rising-edge peak and
// (2) reports cadence in steps-per-minute (spm).
//
// STEP COUNTING — single vs both feet (러닝 표준 ~160-180spm):
//   Each accepted peak is ONE foot strike, i.e. a single step. Cadence is the
//   aggregate of BOTH feet's strikes per minute (the running convention), so a
//   runner taking 80-90 strides/min per foot reads ~160-180 spm. The peak
//   detector therefore counts every footfall, not stride pairs.
//
// AUDIT#14 — initial-window normalization:
//   The old App.tsx computed spm as the raw count of steps in a rolling 60s
//   window. During the first 60s that window is not yet full, so the raw count
//   under-reports cadence (e.g. 28 strikes at the 10s mark showed "28" instead
//   of the true ~168 spm). computeSpm() now reports a per-minute RATE over the
//   elapsed span until the window fills, then converges to the raw 60s count.
//
// Constants live in engineConstants.ts.

import {
  STEP_PEAK_THRESHOLD,
  STEP_MIN_INTERVAL_MS,
  CADENCE_WINDOW_MS,
  CADENCE_MIN_WINDOW_MS,
} from './engineConstants';

export interface CadenceState {
  /** ms timestamps of accepted foot strikes still inside the rolling window. */
  steps: number[];
  /** Previous magnitude sample — used to detect the upward threshold crossing. */
  lastMag: number;
  /** ms of the last accepted step — used for the debounce gate. */
  lastStepMs: number;
  /** ms at which cadence tracking began — used to normalize the initial window. */
  startMs: number;
}

export interface CadenceSample {
  /** Next state — feed this back into the following feedAccelSample call. */
  state: CadenceState;
  /** True only on the sample that registered a new foot strike. */
  stepDetected: boolean;
  /** Current cadence in steps-per-minute (both feet); 0 until enough data. */
  spm: number;
}

/** Fresh machine: no steps yet, tracking started at `startMs`. lastStepMs is
 *  -Infinity so the debounce never blocks the very first strike, regardless of
 *  the clock origin the caller feeds (Date.now(), a relative ms count, etc.). */
export function initCadenceState(startMs: number): CadenceState {
  return {steps: [], lastMag: 0, lastStepMs: -Infinity, startMs};
}

/**
 * Feed one accelerometer magnitude sample (sqrt(x²+y²+z²)) at time `nowMs`.
 *
 * A foot strike is registered when the magnitude crosses STEP_PEAK_THRESHOLD
 * upward (this sample above, previous at/below) AND at least STEP_MIN_INTERVAL_MS
 * has elapsed since the last accepted strike (debounce against double-counting a
 * single landing). The rolling window is pruned on every sample — including
 * non-step samples — so stale strikes age out even while the foot is mid-air.
 *
 * The input state is not mutated; a new state is returned.
 */
export function feedAccelSample(
  state: CadenceState,
  magnitude: number,
  nowMs: number,
): CadenceSample {
  let {steps, lastStepMs} = state;
  let stepDetected = false;

  if (
    magnitude > STEP_PEAK_THRESHOLD &&
    state.lastMag <= STEP_PEAK_THRESHOLD &&
    nowMs - lastStepMs > STEP_MIN_INTERVAL_MS
  ) {
    stepDetected = true;
    lastStepMs = nowMs;
    steps = [...steps, nowMs];
  }

  // Prune strikes older than the rolling window (inclusive bound matches the
  // original App.tsx filter so a full-window count is unchanged).
  steps = steps.filter(t => nowMs - t <= CADENCE_WINDOW_MS);

  const next: CadenceState = {steps, lastMag: magnitude, lastStepMs, startMs: state.startMs};
  return {state: next, stepDetected, spm: computeSpm(next, nowMs)};
}

/**
 * Cadence in steps-per-minute for the current state at time `nowMs`.
 *
 * Reports a per-minute rate over the *measured* span — `min(60s, elapsed)` —
 * which equals the raw 60s strike count once the window is full but extrapolates
 * correctly while it is still filling (audit#14). Returns 0 while fewer than
 * CADENCE_MIN_WINDOW_MS have elapsed, since extrapolating from a sub-3s sample is
 * too noisy to display.
 */
export function computeSpm(state: CadenceState, nowMs: number): number {
  const elapsedMs = Math.max(0, nowMs - state.startMs);
  const windowMs = Math.min(CADENCE_WINDOW_MS, elapsedMs);
  if (windowMs < CADENCE_MIN_WINDOW_MS) return 0;
  return Math.round((state.steps.length * 60000) / windowMs);
}
