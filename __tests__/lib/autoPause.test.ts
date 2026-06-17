import {decideAutoPause, initAutoPauseState} from '../../lib/autoPause';
import {
  AUTO_PAUSE_SPEED_MPS,
  AUTO_PAUSE_HOLD_S,
  AUTO_RESUME_SPEED_MPS,
  AUTO_RESUME_HOLD_S,
} from '../../lib/engineConstants';

// Drive a sequence of (speed, dt) samples through the machine, returning the
// final decision. Mirrors how App.tsx feeds one GPS fix at a time.
function run(samples: Array<[number, number]>) {
  let r = decideAutoPause(initAutoPauseState(), samples[0][0], samples[0][1]);
  for (let i = 1; i < samples.length; i++) {
    r = decideAutoPause(r.state, samples[i][0], samples[i][1]);
  }
  return r;
}

describe('initAutoPauseState', () => {
  test('starts running with zeroed counters', () => {
    expect(initAutoPauseState()).toEqual({paused: false, slowSec: 0, fastSec: 0, pausedMs: 0});
  });
});

describe('decideAutoPause — pause on sustained slow speed', () => {
  test('does not pause before the hold window elapses', () => {
    const r = run([[0.3, 2]]); // 2s slow < 3s hold
    expect(r.paused).toBe(false);
    expect(r.justPaused).toBe(false);
  });

  test('pauses once sub-threshold speed is sustained past AUTO_PAUSE_HOLD_S', () => {
    let r = decideAutoPause(initAutoPauseState(), 0.3, 2);
    expect(r.paused).toBe(false);
    r = decideAutoPause(r.state, 0.3, 1.5); // cumulative 3.5s ≥ 3s
    expect(r.paused).toBe(true);
    expect(r.justPaused).toBe(true);
    expect(r.justResumed).toBe(false);
  });

  test('justPaused fires only on the transition tick, not while already paused', () => {
    let r = run([[0.2, 7]]);
    expect(r.justPaused).toBe(true);
    r = decideAutoPause(r.state, 0.2, 2); // still slow, still paused
    expect(r.paused).toBe(true);
    expect(r.justPaused).toBe(false);
  });

  test('a moving sample at or above the pause threshold resets accumulated slow time', () => {
    // 2s slow, then one fast sample, then 2s slow again → still under 3s of *sustained* slow.
    const r = run([[0.2, 2], [3.0, 1], [0.2, 2]]);
    expect(r.paused).toBe(false);
  });

  test('speed exactly at AUTO_PAUSE_SPEED_MPS does not count as slow (strict <)', () => {
    const r = run([[AUTO_PAUSE_SPEED_MPS, 10]]);
    expect(r.paused).toBe(false);
    expect(r.state.slowSec).toBe(0);
  });
});

describe('decideAutoPause — resume on sustained fast speed', () => {
  test('resumes once super-threshold speed is sustained past AUTO_RESUME_HOLD_S', () => {
    let r = run([[0.2, 7]]); // paused
    expect(r.paused).toBe(true);
    r = decideAutoPause(r.state, 1.5, 1.5); // 1.5s fast ≥ 1s
    expect(r.paused).toBe(false);
    expect(r.justResumed).toBe(true);
    expect(r.justPaused).toBe(false);
  });

  test('does not resume before the fast hold window elapses', () => {
    let r = run([[0.2, 7]]); // paused
    r = decideAutoPause(r.state, 1.5, 0.5); // 0.5s fast < 1s
    expect(r.paused).toBe(true);
    expect(r.justResumed).toBe(false);
  });

  test('hysteresis band: speed between pause and resume thresholds neither resumes nor flaps', () => {
    // 0.8 m/s is above the 0.6 pause floor but below the 1.0 resume ceiling.
    let r = run([[0.2, 7]]); // paused
    r = decideAutoPause(r.state, 0.8, 10); // long, but in the dead band
    expect(r.paused).toBe(true); // stays paused — no resume
    expect(r.state.fastSec).toBe(0);
  });

  test('speed exactly at AUTO_RESUME_SPEED_MPS does not count as fast (strict >)', () => {
    let r = run([[0.2, 7]]); // paused
    r = decideAutoPause(r.state, AUTO_RESUME_SPEED_MPS, 10);
    expect(r.paused).toBe(true);
    expect(r.state.fastSec).toBe(0);
  });
});

describe('decideAutoPause — pausedMs accounting', () => {
  test('accumulates elapsed time only while paused', () => {
    let r = decideAutoPause(initAutoPauseState(), 0.2, 7); // pauses; this tick is running-time
    expect(r.state.pausedMs).toBe(0);
    r = decideAutoPause(r.state, 0.1, 4); // 4s paused
    expect(r.state.pausedMs).toBe(4000);
    r = decideAutoPause(r.state, 0.1, 3); // +3s paused
    expect(r.state.pausedMs).toBe(7000);
  });

  test('pausedMs is never negative across any sequence of transitions', () => {
    let r = decideAutoPause(initAutoPauseState(), 0.2, 7);
    r = decideAutoPause(r.state, 1.5, 3); // resume
    r = decideAutoPause(r.state, 0.1, 8); // pause again
    r = decideAutoPause(r.state, 1.5, 3); // resume again
    expect(r.state.pausedMs).toBeGreaterThanOrEqual(0);
  });

  test('non-positive dt is treated as zero (no negative or NaN drift)', () => {
    let r = decideAutoPause(initAutoPauseState(), 0.2, 7); // paused
    const before = r.state.pausedMs;
    r = decideAutoPause(r.state, 0.1, -5); // negative dt ignored
    expect(r.state.pausedMs).toBe(before);
    expect(r.state.pausedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('decideAutoPause — purity', () => {
  test('does not mutate the input state', () => {
    const s = initAutoPauseState();
    const snapshot = {...s};
    decideAutoPause(s, 0.2, 7);
    expect(s).toEqual(snapshot);
  });
});

describe('engine constants are pinned to the tuned spec', () => {
  // The hysteresis behavior above is described in terms of concrete numbers
  // (0.6/1.0 m/s, 3s/1s). Pin those exact values so a stray retune of
  // engineConstants.ts that would silently change auto-pause feel — or break the
  // 0.6→1.0 hysteresis gap that prevents flapping — fails the suite loudly.
  test('pause/resume speed thresholds and hold windows match', () => {
    expect(AUTO_PAUSE_SPEED_MPS).toBe(0.6);
    expect(AUTO_RESUME_SPEED_MPS).toBe(1.0);
    expect(AUTO_PAUSE_HOLD_S).toBe(3);
    expect(AUTO_RESUME_HOLD_S).toBe(1);
  });
});
