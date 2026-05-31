// ─── Geo / distance helpers ──────────────────────────────────────
// Pure geometry extracted from App.tsx. Behavior-preserving.
// NOTE: `acceptSegment` (the fix-accuracy/warmup/speed gate) is intentionally
// NOT defined here — it belongs to the slice-1-fix-filter job. This module
// provides only the primitives it will build on: distance + segment speed,
// plus route point simplification.

export interface LatLon {
  lat: number;
  lon: number;
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
