// ─── Geo / distance helpers ──────────────────────────────────────
// Pure geometry extracted from App.tsx. Behavior-preserving primitives
// (distance, segment speed, route simplification) plus `acceptSegment`, the
// GPS fix-accuracy/warmup/speed/distance gate that decides whether a segment's
// distance should be counted toward the run total.

import {
  MAX_FIX_ACCURACY_M,
  WARMUP_FIXES,
  MAX_SEG_SPEED_MPS,
  MIN_SEG_DIST_KM,
  MAX_SEG_DIST_KM,
} from './engineConstants';

export interface LatLon {
  lat: number;
  lon: number;
}

/** Inputs for {@link acceptSegment}: one candidate movement segment. */
export interface SegmentInput {
  /** Segment distance in kilometers (e.g. from {@link calcDist}). */
  distKm: number;
  /** Elapsed seconds since the previous accepted fix. */
  dtSec: number;
  /** Reported GPS accuracy radius in meters for the new fix. */
  accuracyM: number;
  /** 0-based index of this fix since the run started (for warmup exclusion). */
  fixIndex: number;
}

/**
 * Decide whether a GPS segment's distance should be counted toward the run.
 *
 * Rejects a segment when ANY of the following holds:
 *  - the fix is too inaccurate: `accuracyM > MAX_FIX_ACCURACY_M` (20m)
 *  - it is still in GPS warmup: `fixIndex < WARMUP_FIXES` (first 3 fixes)
 *  - it implies an impossible speed: `segmentSpeed > MAX_SEG_SPEED_MPS` (12 m/s)
 *  - it is below the noise floor: `distKm < MIN_SEG_DIST_KM` (~1m — relaxed from
 *    the old 3m floor per audit#5, which under-counted slow/normal-pace segments)
 *  - it exceeds the single-fix jump cap: `distKm > MAX_SEG_DIST_KM` (300m)
 *
 * Otherwise the segment is accepted.
 */
export function acceptSegment({distKm, dtSec, accuracyM, fixIndex}: SegmentInput): boolean {
  if (accuracyM > MAX_FIX_ACCURACY_M) return false;
  if (fixIndex < WARMUP_FIXES) return false;
  if (segmentSpeedMps(distKm, dtSec) > MAX_SEG_SPEED_MPS) return false;
  if (distKm < MIN_SEG_DIST_KM) return false;
  if (distKm > MAX_SEG_DIST_KM) return false;
  return true;
}

/**
 * Great-circle distance between two coordinates, in kilometers (haversine).
 * Identical formula to the original App.tsx implementation.
 */
export function calcDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371,
    dL = ((lat2 - lat1) * Math.PI) / 180,
    dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Instantaneous segment speed in meters/second from a distance (km) and a
 * time delta (s). Returns 0 for non-positive time so callers never divide by
 * zero or produce Infinity.
 */
export function segmentSpeedMps(distKm: number, dtSec: number): number {
  if (dtSec <= 0) return 0;
  return (distKm * 1000) / dtSec;
}

/**
 * Down-sample a route to at most `max` evenly-spaced points, preserving the
 * first and last. Mirrors the 200-point sampling previously inlined in
 * App.tsx's handleStop. Routes already within the cap are returned unchanged.
 */
export function simplifyRoute<T>(pts: T[], max = 200): T[] {
  if (pts.length <= max) return pts;
  return Array.from({length: max}, (_, i) =>
    pts[Math.min(Math.floor((i * (pts.length - 1)) / (max - 1)), pts.length - 1)],
  );
}
