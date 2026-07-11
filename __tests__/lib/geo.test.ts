import {calcDist, acceptSegment, segmentSpeedMps, simplifyRoute} from '../../lib/geo';
import {MIN_SEG_DIST_KM} from '../../lib/engineConstants';

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

describe('acceptSegment', () => {
  // A baseline segment that should be accepted, so each test below can flip a
  // single field and assert that field alone causes rejection.
  const good = {distKm: 0.01, dtSec: 2, accuracyM: 8, fixIndex: 10};

  test('accepts a normal post-warmup, accurate, in-range segment', () => {
    expect(acceptSegment(good)).toBe(true);
  });

  test('rejects fixes less accurate than 20m', () => {
    expect(acceptSegment({...good, accuracyM: 21})).toBe(false);
    expect(acceptSegment({...good, accuracyM: 35})).toBe(false);
    // exactly at the 20m boundary is still accepted (not > MAX) —
    // 20m acc 의 노이즈 하한은 16m(×0.8)이므로 그보다 긴 변위로 검사한다.
    expect(acceptSegment({...good, distKm: 0.017, accuracyM: 20})).toBe(true);
  });

  test('rejects the first WARMUP_FIXES (3) fixes regardless of quality', () => {
    expect(acceptSegment({...good, fixIndex: 0})).toBe(false);
    expect(acceptSegment({...good, fixIndex: 2})).toBe(false);
    expect(acceptSegment({...good, fixIndex: 3})).toBe(true);
  });

  test('rejects segments implying speed over 12 m/s (GPS jump)', () => {
    // 50m in 1s = 50 m/s
    expect(acceptSegment({...good, distKm: 0.05, dtSec: 1})).toBe(false);
    // ~12 m/s is still within bound: 0.024km / 2s = 12 m/s
    expect(acceptSegment({...good, distKm: 0.024, dtSec: 2})).toBe(true);
  });

  test('노이즈 하한 = max(1m, 정확도×0.8) — C1 팬텀 드리프트 억제(2026-07-11 0.35→0.8)', () => {
    // acc 8m → 하한 6.4m: 그 아래 변위는 통계적 노이즈로 거부(정지 표류 차단).
    expect(acceptSegment({...good, distKm: 0.0063})).toBe(false); // 6.3m < 6.4m
    expect(acceptSegment({...good, distKm: 0.0065})).toBe(true); // 6.5m ≥ 6.4m
    // 정확도가 좋으면(acc 4m → 하한 3.2m) 그만큼 하한도 낮다.
    expect(acceptSegment({...good, accuracyM: 4, distKm: 0.0033})).toBe(true);
    expect(acceptSegment({...good, accuracyM: 4, distKm: 0.0015})).toBe(false); // 1.5m < 3.2m
    // 하한 미달로 거부돼도 앵커 보존(runTracker) 덕에 변위는 다음 fix 에 합산돼
    // 무손실이다(저속 러닝/걷기는 '유예'될 뿐 삭제되지 않는다 — audit#5 정신 유지).
  });

  test('rejects single-fix jumps over 300m', () => {
    // 350m even over a long dt (so speed alone would not reject it)
    expect(acceptSegment({...good, distKm: 0.35, dtSec: 120})).toBe(false);
    expect(acceptSegment({...good, distKm: 0.3, dtSec: 120})).toBe(true);
  });

  test('적응 하한은 정확한 >= 경계다(하한 정확히 = 통과, 그 아래 = 거부)', () => {
    expect(MIN_SEG_DIST_KM).toBe(0.001);
    const floorKm = (good.accuracyM * 0.8) / 1000; // acc 8m → 0.0064km
    expect(acceptSegment({...good, distKm: floorKm})).toBe(true);
    expect(acceptSegment({...good, distKm: floorKm - 1e-7})).toBe(false);
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
