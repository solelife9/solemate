/**
 * Unit tests for the pure GPS dead-zone (死구간) detector.
 *
 * Behavioral contract: given only the last-received-fix time and "now", decide
 * whether the GPS signal has been silent long enough that distance has stalled
 * while elapsed time keeps growing (audit#9). No timers, no Date — the caller
 * supplies both timestamps, so every edge is deterministic. Tests use globalThis.
 *
 * @format
 */

import {gpsStallStatus, GPS_STALL_THRESHOLD_MS} from '../../lib/gpsHealth';

// Anchor every case to one base instant via globalThis so the arithmetic reads
// as "T plus N ms" rather than bare magic numbers.
const T: number = (globalThis as any).Date ? 1_700_000_000_000 : 0;

describe('gpsStallStatus', () => {
  test('before the first fix (lastFixMs <= 0) it is never stalled — that is the warmup/searching state', () => {
    expect(gpsStallStatus(0, T)).toEqual({stalled: false, silentMs: 0});
    expect(gpsStallStatus(-1, T + 999999)).toEqual({stalled: false, silentMs: 0});
  });

  test('a recent fix (gap below threshold) is not stalled and reports the elapsed silence', () => {
    const gap = GPS_STALL_THRESHOLD_MS - 1;
    const status = gpsStallStatus(T, T + gap);
    expect(status.stalled).toBe(false);
    expect(status.silentMs).toBe(gap);
  });

  test('silence of exactly the threshold counts as stalled (boundary is inclusive)', () => {
    const status = gpsStallStatus(T, T + GPS_STALL_THRESHOLD_MS);
    expect(status.stalled).toBe(true);
    expect(status.silentMs).toBe(GPS_STALL_THRESHOLD_MS);
  });

  test('silence well beyond the threshold is stalled', () => {
    const status = gpsStallStatus(T, T + GPS_STALL_THRESHOLD_MS + 5000);
    expect(status.stalled).toBe(true);
    expect(status.silentMs).toBe(GPS_STALL_THRESHOLD_MS + 5000);
  });

  test('a custom threshold overrides the default', () => {
    // 3s silence: stalled under a 2s threshold, not stalled under a 4s threshold.
    expect(gpsStallStatus(T, T + 3000, 2000).stalled).toBe(true);
    expect(gpsStallStatus(T, T + 3000, 4000).stalled).toBe(false);
  });

  test('clock skew (now before last fix) clamps silence to 0 — no false dead-zone', () => {
    const status = gpsStallStatus(T, T - 10000);
    expect(status.stalled).toBe(false);
    expect(status.silentMs).toBe(0);
  });
});
