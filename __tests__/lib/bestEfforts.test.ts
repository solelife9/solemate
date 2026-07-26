// 거리 베스트에포트 엔진 정확성 증명. 핵심: '정확히 D 구간의 최소 시간'을
// (a) 양끝 앵커가 둘 다 필요함(한쪽만이면 틀림)을 반례로, (b) 브루트포스와 교차검증.
import {
  bestEffortSec,
  runBestEfforts,
  aggregateDistancePBs,
  type TrackPoint,
} from '../../lib/bestEfforts';

// 참조 구현: 거리 x 에서의 시간(선형보간) + 미세 스텝 브루트포스 최소.
function Tref(pts: TrackPoint[], x: number): number {
  if (x <= pts[0].d) return pts[0].t;
  const last = pts[pts.length - 1];
  if (x >= last.d) return last.t;
  for (let k = 1; k < pts.length; k++) {
    if (pts[k].d >= x) {
      const a = pts[k - 1], b = pts[k];
      const span = b.d - a.d;
      return span <= 0 ? a.t : a.t + ((x - a.d) / span) * (b.t - a.t);
    }
  }
  return last.t;
}
function brute(pts: TrackPoint[], D: number, step = 0.0005): number | null {
  const total = pts[pts.length - 1].d - pts[0].d;
  if (total < D) return null;
  let best = Infinity;
  const end = pts[pts.length - 1].d - D;
  for (let x = pts[0].d; x <= end + 1e-9; x += step) {
    best = Math.min(best, Tref(pts, x + D) - Tref(pts, x));
  }
  best = Math.min(best, Tref(pts, pts[pts.length - 1].d) - Tref(pts, end)); // 끝 경계
  return best;
}

describe('bestEffortSec — 엣지', () => {
  test('빈/1점/총거리<D 는 null', () => {
    expect(bestEffortSec([], 5)).toBeNull();
    expect(bestEffortSec([{d: 0, t: 0}], 5)).toBeNull();
    expect(bestEffortSec([{d: 0, t: 0}, {d: 3, t: 900}], 5)).toBeNull();
    expect(bestEffortSec([{d: 0, t: 0}, {d: 5, t: 1500}], 0)).toBeNull();
  });

  test('일정 페이스 = D × 페이스 정확히', () => {
    // 300초/km 일정.
    const t: TrackPoint[] = [{d: 0, t: 0}, {d: 1, t: 300}, {d: 2, t: 600}, {d: 5, t: 1500}];
    expect(bestEffortSec(t, 1)).toBeCloseTo(300, 6);
    expect(bestEffortSec(t, 5)).toBeCloseTo(1500, 6);
  });
});

describe('bestEffortSec — 양끝 앵커가 둘 다 필요(한쪽만이면 틀림)', () => {
  // 느림→빠름: 최적 1km 는 [1.0, 2.0](시작이 데이터점 아님, 끝=데이터점) → 앵커 B 필요.
  // 시작 데이터점만 보는 순진한 방식은 150 을 답해 틀린다(정답 125).
  test('끝 데이터점 앵커라야 잡히는 최적', () => {
    const t: TrackPoint[] = [{d: 0, t: 0}, {d: 0.5, t: 100}, {d: 1.5, t: 250}, {d: 2.0, t: 300}];
    expect(bestEffortSec(t, 1)).toBeCloseTo(125, 6);
    expect(brute(t, 1)).toBeCloseTo(125, 3);
  });

  // 빠름→느림: 최적 1km 는 [0, 1.0](끝이 데이터점 아님, 시작=데이터점) → 앵커 A 필요.
  test('시작 데이터점 앵커라야 잡히는 최적', () => {
    const t: TrackPoint[] = [{d: 0, t: 0}, {d: 0.5, t: 50}, {d: 1.5, t: 200}, {d: 2.0, t: 300}];
    expect(bestEffortSec(t, 1)).toBeCloseTo(125, 6);
    expect(brute(t, 1)).toBeCloseTo(125, 3);
  });
});

describe('bestEffortSec — 느린 롱런 속 빠른 구간을 집어낸다', () => {
  test('평균이 아니라 최고 구간', () => {
    // 10km 런: 앞뒤 6분/km(360s), 가운데 4~5km 구간만 4분/km(240s).
    const t: TrackPoint[] = [
      {d: 0, t: 0}, {d: 4, t: 1440}, {d: 5, t: 1680}, {d: 6, t: 1920}, {d: 10, t: 3360},
    ];
    // 최고 1km = 가운데 4→5 또는 5→6 = 240s. 평균 페이스(336s)보다 빠름.
    expect(bestEffortSec(t, 1)).toBeCloseTo(240, 6);
    expect(bestEffortSec(t, 1)).toBeLessThan(336);
  });
});

describe('bestEffortSec — 비단조 노이즈 필터', () => {
  test('거리 후진/정지 노이즈가 결과를 안 흔든다', () => {
    const clean: TrackPoint[] = [{d: 0, t: 0}, {d: 1, t: 300}, {d: 2, t: 600}];
    const noisy: TrackPoint[] = [
      {d: 0, t: 0}, {d: 0.5, t: 150}, {d: 0.4, t: 160}, // 후진(무시)
      {d: 1, t: 300}, {d: 1, t: 320}, // 정지(거리 그대로, 무시)
      {d: 2, t: 600},
    ];
    expect(bestEffortSec(noisy, 1)).toBeCloseTo(bestEffortSec(clean, 1)!, 6);
  });
});

describe('bestEffortSec — 브루트포스 교차검증(정확성)', () => {
  test('가변 페이스 트랙에서 미세 브루트포스와 일치', () => {
    // 다구간 가변 페이스(초/구간). 누적으로 (d,t) 생성.
    const segs = [
      {km: 1, sec: 360}, {km: 1, sec: 300}, {km: 0.5, sec: 120}, {km: 2, sec: 660},
      {km: 1, sec: 240}, {km: 1.5, sec: 540}, {km: 3, sec: 900},
    ];
    const pts: TrackPoint[] = [{d: 0, t: 0}];
    let d = 0, t = 0;
    for (const s of segs) { d += s.km; t += s.sec; pts.push({d, t}); }
    for (const D of [1, 2, 5]) {
      const exact = bestEffortSec(pts, D)!;
      const ref = brute(pts, D)!;
      expect(exact).toBeLessThanOrEqual(ref + 1e-6); // 정확해는 브루트포스 이하(더 촘촘히 최적)
      expect(exact).toBeCloseTo(ref, 2);             // 그리고 사실상 같다
    }
  });
});

describe('집계 — 거리 PB + 삭제 안전', () => {
  test('runBestEfforts: 표준 거리별, 못 채운 거리는 생략', () => {
    const t: TrackPoint[] = [{d: 0, t: 0}, {d: 6, t: 1800}]; // 6km, 300s/km
    const eff = runBestEfforts(t);
    expect(eff['5k']).toBeCloseTo(1500, 3);
    expect(eff['10k']).toBeUndefined();
    expect(eff.half).toBeUndefined();
  });

  test('aggregateDistancePBs: 런별 최소 = PB, PB 런 제거 시 자동 복구', () => {
    const all = [{'5k': 1500}, {'5k': 1400}, {'10k': 3200}];
    expect(aggregateDistancePBs(all)['5k']).toBe(1400);
    // 1400 런 삭제 → 남은 것만 집계하면 1500 으로 복구(전역 캐시 함정 회피).
    const afterDelete = [{'5k': 1500}, {'10k': 3200}];
    expect(aggregateDistancePBs(afterDelete)['5k']).toBe(1500);
  });
});
