import {calcDist, segmentSpeedMps, simplifyRoute} from '../../lib/geo';

describe('calcDist', () => {
  test('zero distance for identical points', () => {
    expect(calcDist(37.5665, 126.978, 37.5665, 126.978)).toBe(0);
  });

  test('~111m for 0.001° of latitude near Seoul', () => {
    const d = calcDist(37.5665, 126.978, 37.5675, 126.978);
    expect(d).toBeGreaterThan(0.08);
    expect(d).toBeLessThan(0.15);
  });

  test('symmetric in argument order', () => {
    const a = calcDist(37.5665, 126.978, 37.57, 126.99);
    const b = calcDist(37.57, 126.99, 37.5665, 126.978);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('segmentSpeedMps', () => {
  test('50m in 1s = 50 m/s (GPS jump magnitude)', () => {
    expect(segmentSpeedMps(0.05, 1)).toBeCloseTo(50, 5);
  });

  test('10m in 5s = 2 m/s (jogging pace)', () => {
    expect(segmentSpeedMps(0.01, 5)).toBeCloseTo(2, 5);
  });

  test('non-positive dt returns 0 (no Infinity / divide-by-zero)', () => {
    expect(segmentSpeedMps(0.01, 0)).toBe(0);
    expect(segmentSpeedMps(0.01, -3)).toBe(0);
  });
});

describe('simplifyRoute', () => {
  test('routes within the cap are returned unchanged (same reference)', () => {
    const pts = [{lat: 1, lon: 1}, {lat: 2, lon: 2}];
    expect(simplifyRoute(pts, 200)).toBe(pts);
  });

  test('over-cap routes are down-sampled to exactly max points', () => {
    const pts = Array.from({length: 1000}, (_, i) => ({lat: i, lon: i}));
    const out = simplifyRoute(pts, 200);
    expect(out).toHaveLength(200);
  });

  test('first and last points are preserved when down-sampling', () => {
    const pts = Array.from({length: 1000}, (_, i) => ({lat: i, lon: i}));
    const out = simplifyRoute(pts, 200);
    expect(out[0]).toEqual({lat: 0, lon: 0});
    expect(out[out.length - 1]).toEqual({lat: 999, lon: 999});
  });
});
