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
//   of the true ~168 spm). computeSpm() reports a per-minute RATE over the span
//   it actually observed strikes for, then converges to the raw 60s count once
//   the window fills.
//
// AUDIT#14b — normalize over the OBSERVED step span, not the run start:
//   The first fix divided by `nowMs - startMs` (the run-start origin). Any idle
//   before the first footfall — GPS warm-up, waiting on the start line — then
//   inflated the denominator and RE-INTRODUCED the under-display audit#14 set
//   out to kill (30s idle + a true 180 spm read ~26; 10s idle + 10s run ~90).
//   computeSpm() now divides by `nowMs - firstStepInWindow` so idle time never
//   dilutes the rate; the denominator is purely the time we were stepping.
//
// Constants live in engineConstants.ts.

import {
  STEP_PEAK_THRESHOLD,
  STEP_MIN_INTERVAL_MS,
  CADENCE_WINDOW_MS,
  CADENCE_MIN_WINDOW_MS,
} from './engineConstants';

export interface CadenceState {
  /** ms timestamps of accepted foot strikes still inside the rolling window,
   *  kept in arrival order so steps[0] is the oldest survivor. */
  steps: number[];
  /** Previous magnitude sample — used to detect the upward threshold crossing. */
  lastMag: number;
  /** ms of the last accepted step — used for the debounce gate. */
  lastStepMs: number;
}

export interface CadenceSample {
  /** Next state — feed this back into the following feedAccelSample call. */
  state: CadenceState;
  /** True only on the sample that registered a new foot strike. */
  stepDetected: boolean;
  /** Current cadence in steps-per-minute (both feet); 0 until enough data. */
  spm: number;
}

/** Fresh machine: no steps yet. lastStepMs is -Infinity so the debounce never
 *  blocks the very first strike, regardless of the clock origin the caller feeds
 *  (Date.now(), a relative ms count, etc.). The cadence rate is normalized over
 *  the observed step span, so no run-start timestamp is needed. */
export function initCadenceState(): CadenceState {
  return {steps: [], lastMag: 0, lastStepMs: -Infinity};
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

  const next: CadenceState = {steps, lastMag: magnitude, lastStepMs};
  return {state: next, stepDetected, spm: computeSpm(next, nowMs)};
}

/**
 * Cadence in steps-per-minute for the current state at time `nowMs`.
 *
 * Normalizes the strikes inside the rolling window over the span we actually
 * observed them — `min(60s, nowMs - firstStepInWindow)` — NOT the time since the
 * run started (audit#14b). This equals the raw 60s strike count once the window
 * is full, extrapolates correctly while it is still filling (audit#14), and is
 * immune to idle time before the first footfall: a true 180 spm started 30s into
 * the run reads 180, not ~26.
 *
 * Returns 0 when no strikes are in the window, and withholds (also 0) until the
 * observed span reaches CADENCE_MIN_WINDOW_MS — extrapolating from a sub-3s
 * sample is too noisy to display. The withholding gate is on the step span, not
 * the run start, for the same idle-immunity reason.
 */
export function computeSpm(state: CadenceState, nowMs: number): number {
  const {steps} = state;
  if (steps.length === 0) return 0;
  const firstStepMs = steps[0]; // oldest strike still inside the window
  const spanMs = Math.min(CADENCE_WINDOW_MS, Math.max(0, nowMs - firstStepMs));
  if (spanMs < CADENCE_MIN_WINDOW_MS) return 0;
  return Math.round((steps.length * 60000) / spanMs);
}
