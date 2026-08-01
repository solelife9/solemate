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

describe('simplifyRoute — 허용 오차 기반 RDP (2026-07-31 근본수정)', () => {
  // 이전 구현은 **균등 간격 추출**이라 직선에서 점을 낭비하고 코너에서 점이 없었다.
  // 그 결과 저장된 경로로 거리를 다시 계산하면 도심 30km 에서 -14.9%, 풀코스 -20.7%
  // 였다(앱 화면 거리는 무관 — 거리는 fix 마다 실시간 누적한다). 문제는 GPX 로 꺼내
  // 스트라바·가민에 올릴 때 그쪽이 좌표로 거리를 다시 계산한다는 점이었다.
  //
  // 새 계약: "원래 경로에서 허용 오차(기본 5m) 이상 벗어나지 않는다." 점 개수는 코스
  // 복잡도가 정한다 — 직선은 2점, 코너는 촘촘히.

  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dist = (a: {lat: number; lon: number}, b: {lat: number; lon: number}) => {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const totalKm = (p: {lat: number; lon: number}[]) => {
    let d = 0;
    for (let i = 1; i < p.length; i++) d += dist(p[i - 1], p[i]);
    return d;
  };
  /**
   * 합성 코스: turnEveryM 마다 90도 꺾는 루프(도심) + 자연스러운 사행.
   * 누적 거리는 **증분으로** 센다 — 루프 조건에서 totalKm 을 다시 부르면 O(n²) 이라
   * 풀코스(약 25,000점)에서 테스트가 멈춘다.
   */
  const course = (km: number, turnEveryM: number, wobbleDeg: number) => {
    const pts: {lat: number; lon: number}[] = [];
    let lat = 37.5;
    let lon = 127.0;
    let acc = 0; // 누적 거리(km)
    const step = 1.7; // 1초당 이동(m) ≈ 5'50"/km
    const mLat = 111320;
    const mLon = 111320 * Math.cos(toRad(37.5));
    for (let t = 0; t < 40000 && acc < km; t++) {
      const phase = (t * step) % (turnEveryM * 4);
      let hdg =
        phase < turnEveryM ? 0 : phase < turnEveryM * 2 ? 90 : phase < turnEveryM * 3 ? 180 : 270;
      hdg += wobbleDeg * Math.sin(t / 25);
      const r = toRad(hdg);
      const prev = {lat, lon};
      lat += (step * Math.cos(r)) / mLat;
      lon += (step * Math.sin(r)) / mLon;
      if (pts.length) acc += dist(prev, {lat, lon});
      pts.push({lat, lon});
    }
    return pts;
  };
  /**
   * 단순화 결과가 원본에서 실제로 얼마나 벗어나는가(최대 수직거리, m).
   * simp 는 full 의 부분수열이고 **원소가 같은 객체**이므로, 두 배열을 한 번에 훑으며
   * 현재 구간을 전진시킨다(O(n)). indexOf 를 쓰면 O(n²) 이 되어 테스트가 멈춘다.
   */
  const maxDeviationM = (
    full: {lat: number; lon: number}[],
    simp: {lat: number; lon: number}[],
  ) => {
    const mLat = 111320;
    const mLon = 111320 * Math.cos(toRad(full[0].lat));
    const X = (p: {lat: number; lon: number}) => ({x: p.lon * mLon, y: p.lat * mLat});
    const perp = (p: any, a: any, b: any) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = dx * dx + dy * dy;
      if (!L) return Math.hypot(p.x - a.x, p.y - a.y);
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    let worst = 0;
    let seg = 0; // simp 상의 현재 구간 시작
    for (const pt of full) {
      // 원본 점이 다음 앵커에 도달하면 구간을 전진(참조 비교라 O(1)).
      while (seg < simp.length - 2 && pt === simp[seg + 1]) seg++;
      const d = perp(X(pt), X(simp[seg]), X(simp[seg + 1]));
      if (d > worst) worst = d;
    }
    return worst;
  };

  test('2점 이하는 그대로 돌려준다(같은 참조)', () => {
    const pts = [{lat: 1, lon: 1}, {lat: 2, lon: 2}];
    expect(simplifyRoute(pts)).toBe(pts);
  });

  test('직선은 2점으로 줄인다 — 중간 점은 정보가 아니다', () => {
    const pts = Array.from({length: 1000}, (_, i) => ({lat: 37.5 + i * 1e-5, lon: 127}));
    const out = simplifyRoute(pts);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[1]).toEqual(pts[999]);
  });

  test('코너는 보존한다 — ㄱ자 경로에서 꺾이는 점이 남는다', () => {
    const pts: {lat: number; lon: number}[] = [];
    for (let i = 0; i < 200; i++) pts.push({lat: 37.5, lon: 127 + i * 1e-5});   // 동쪽 직진
    for (let i = 1; i < 200; i++) pts.push({lat: 37.5 + i * 1e-5, lon: 127 + 199e-5}); // 북쪽 직진
    const out = simplifyRoute(pts);
    expect(out.length).toBeGreaterThanOrEqual(3); // 시작·코너·끝
    expect(out.length).toBeLessThan(10);          // 직선은 낭비하지 않는다
    const corner = out.find(p => Math.abs(p.lon - (127 + 199e-5)) < 1e-9 && Math.abs(p.lat - 37.5) < 1e-9);
    expect(corner).toBeDefined();
  });

  test('첫 점과 끝 점은 항상 보존한다', () => {
    const full = course(10, 200, 12);
    const out = simplifyRoute(full);
    expect(out[0]).toEqual(full[0]);
    expect(out[out.length - 1]).toEqual(full[full.length - 1]);
  });

  test('원본에서 허용 오차(5m) 이상 벗어나지 않는다', () => {
    const full = course(10, 200, 12);
    const out = simplifyRoute(full);
    expect(maxDeviationM(full, out)).toBeLessThanOrEqual(5.5); // 부동소수 여유
  });

  // ── 회귀 방어의 핵심: 거리 오차 상한을 숫자로 못 박는다 ──────────────────
  // 옛 구현(균등 200점)은 여기서 도심 30km -14.9%, 풀코스 -20.7% 였다.
  test.each([
    ['도심 10km', 10, 200, 12],
    ['도심 30km', 30, 200, 12],
    ['도심 풀코스', 42.2, 200, 12],
    ['강변 30km', 30, 1500, 4],
  ])('%s — 저장된 경로로 거리를 다시 계산해도 오차 1%% 이내', (_name, km, turn, wob) => {
    const full = course(km as number, turn as number, wob as number);
    const out = simplifyRoute(full);
    const err = Math.abs((totalKm(out) - totalKm(full)) / totalKm(full)) * 100;
    expect(err).toBeLessThan(1);
  });

  test('점 개수는 코스 복잡도가 정한다 — 굽은 코스가 더 많이 남는다', () => {
    const city = simplifyRoute(course(30, 200, 12));
    const river = simplifyRoute(course(30, 1500, 4));
    expect(city.length).toBeGreaterThan(river.length);
    expect(city.length).toBeLessThan(1000); // 그래도 과하지 않다
  });

  test('안전 상한을 넘지 않는다(울트라·GPS 폭주 방어)', () => {
    const full = course(42.2, 60, 25); // 60m 마다 꺾는 병적 코스
    const out = simplifyRoute(full, 5, 100);
    expect(out.length).toBeLessThanOrEqual(100);
  });

  test('아주 긴 입력에서도 스택을 넘기지 않는다(반복형 RDP)', () => {
    const pts = Array.from({length: 30000}, (_, i) => ({
      lat: 37.5 + Math.sin(i / 50) * 1e-3,
      lon: 127 + i * 1e-6,
    }));
    expect(() => simplifyRoute(pts)).not.toThrow();
  });
});
