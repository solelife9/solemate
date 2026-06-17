// ─── Auto-pause / auto-resume state machine ──────────────────────
// Pure decision logic extracted from App.tsx. Given a per-tick (speed, dt)
// sample it decides whether a run should auto-pause (runner stopped) or
// auto-resume (runner moving again), using hysteresis so brief GPS jitter
// near a threshold does not flap the run state on and off.
//
// Thresholds live in engineConstants.ts:
//   pause  : sustained < AUTO_PAUSE_SPEED_MPS (0.6 m/s) for AUTO_PAUSE_HOLD_S (3s)
//   resume : sustained > AUTO_RESUME_SPEED_MPS (1.0 m/s) for AUTO_RESUME_HOLD_S (1s)
// The 0.6/1.0 gap IS the hysteresis band: speeds between the two thresholds
// neither pause nor resume, so a runner hovering near walking pace is stable.

import {
  AUTO_PAUSE_SPEED_MPS,
  AUTO_PAUSE_HOLD_S,
  AUTO_RESUME_SPEED_MPS,
  AUTO_RESUME_HOLD_S,
} from './engineConstants';

export interface AutoPauseState {
  /** Whether the machine currently considers the run paused. */
  paused: boolean;
  /** Seconds of sustained sub-pause-threshold speed while running (toward pause). */
  slowSec: number;
  /** Seconds of sustained super-resume-threshold speed while paused (toward resume). */
  fastSec: number;
  /** Accumulated paused wall-time in ms. Invariant: always >= 0 (never negative). */
  pausedMs: number;
}

export interface AutoPauseDecision {
  /** The next state — feed this back into the following decideAutoPause call. */
  state: AutoPauseState;
  /** Convenience copy of state.paused after this tick. */
  paused: boolean;
  /** True only on the tick that transitioned running → paused. */
  justPaused: boolean;
  /** True only on the tick that transitioned paused → running. */
  justResumed: boolean;
}

/** Fresh machine: running, no accumulated slow/fast time, zero paused ms. */
export function initAutoPauseState(): AutoPauseState {
  return {paused: false, slowSec: 0, fastSec: 0, pausedMs: 0};
}

/**
 * Advance the auto-pause machine by one sample.
 *
 * @param state    previous machine state (not mutated — a new state is returned)
 * @param speedMps instantaneous speed for this tick, meters/second
 * @param dtSec    seconds elapsed since the previous tick (non-positive is treated as 0)
 *
 * While RUNNING: speed below the pause threshold accumulates slowSec; once it
 * reaches the hold window the run flips to paused (justPaused). Any speed at or
 * above the pause threshold resets slowSec, so the stop must be sustained.
 *
 * While PAUSED: the elapsed time is added to pausedMs (so distance/time callers
 * can subtract paused wall-time), and speed above the resume threshold
 * accumulates fastSec; once it reaches the hold window the run flips back to
 * running (justResumed). Speed at or below the resume threshold resets fastSec.
 *
 * pausedMs is clamped to >= 0 on every tick so no transition can ever produce a
 * negative paused duration.
 */
export function decideAutoPause(
  state: AutoPauseState,
  speedMps: number,
  dtSec: number,
): AutoPauseDecision {
  const dt = dtSec > 0 ? dtSec : 0; // guard against non-positive / NaN-ish dt
  let {paused, slowSec, fastSec, pausedMs} = state;
  let justPaused = false;
  let justResumed = false;

  if (!paused) {
    // Running: count sustained slow time toward an auto-pause.
    slowSec = speedMps < AUTO_PAUSE_SPEED_MPS ? slowSec + dt : 0;
    fastSec = 0;
    if (slowSec >= AUTO_PAUSE_HOLD_S) {
      paused = true;
      justPaused = true;
      slowSec = 0;
      fastSec = 0;
    }
  } else {
    // Paused: this interval is paused wall-time; count sustained fast time toward resume.
    pausedMs += dt * 1000;
    fastSec = speedMps > AUTO_RESUME_SPEED_MPS ? fastSec + dt : 0;
    slowSec = 0;
    if (fastSec >= AUTO_RESUME_HOLD_S) {
      paused = false;
      justResumed = true;
      slowSec = 0;
      fastSec = 0;
    }
  }

  if (pausedMs < 0) pausedMs = 0; // invariant: paused duration is never negative

  return {
    state: {paused, slowSec, fastSec, pausedMs},
    paused,
    justPaused,
    justResumed,
  };
}
