import {calcDist, acceptSegment, segmentSpeedMps, simplifyRoute} from '../../lib/geo';
import {MIN_SEG_DIST_KM, PHANTOM_ACC_FLOOR_FACTOR} from '../../lib/engineConstants';

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

  test('노이즈 하한 = max(1m, 정확도×계수) — C1 팬텀 드리프트 억제', () => {
    // 계수 이력: 0.35 → 0.8(2026-07-11, +9% 과대 교정) → 0.6(2026-07-28, 실측 -5.3%
    // 과소 교정). 리터럴을 박지 않고 상수에서 하한을 계산해, 계수를 바꿔도 '경계 규칙'
    // 자체가 지켜지는지만 본다(값이 아니라 계약을 검사).
    const floorKm = (accM: number) =>
      Math.max(MIN_SEG_DIST_KM, (accM * PHANTOM_ACC_FLOOR_FACTOR) / 1000);
    const acc = 8;
    const f = floorKm(acc);
    expect(acceptSegment({...good, accuracyM: acc, distKm: f - 0.0001})).toBe(false);
    expect(acceptSegment({...good, accuracyM: acc, distKm: f})).toBe(true);
    // 정확도가 좋으면 하한도 그만큼 낮다(비례 규칙).
    const f4 = floorKm(4);
    expect(acceptSegment({...good, accuracyM: 4, distKm: f4})).toBe(true);
    expect(acceptSegment({...good, accuracyM: 4, distKm: f4 - 0.0005})).toBe(false);
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
    // 리터럴 대신 상수에서 뽑는다 — 계수를 바꿔도 '>= 경계' 계약은 그대로여야 한다.
    const floorKm = (good.accuracyM * PHANTOM_ACC_FLOOR_FACTOR) / 1000;
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
