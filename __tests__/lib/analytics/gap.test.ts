import {minettiCost, gradeFactor, gradeAdjustedPaceSec, buildGapSeries} from '../../../lib/analytics/gap';

// Minetti(2002) 5차 다항식 정밀 검증 — 손계산 기준값과 일치해야 한다.
describe('minettiCost / gradeFactor (Minetti 2002)', () => {
  test('평지 C(0) = 3.6 (정확)', () => {
    expect(minettiCost(0)).toBeCloseTo(3.6, 10);
    expect(gradeFactor(0)).toBeCloseTo(1, 10);
  });

  test('+10% 오르막 C(0.1) ≈ 5.9681, 보정 ≈ 1.658', () => {
    // 0.001554 − 0.00304 − 0.0433 + 0.463 + 1.95 + 3.6 = 5.968214
    expect(minettiCost(0.1)).toBeCloseTo(5.968214, 5);
    expect(gradeFactor(0.1)).toBeCloseTo(1.657837, 5);
  });

  test('−10% 내리막 C(-0.1) ≈ 2.1517, 보정 ≈ 0.598 (가장 효율적 영역)', () => {
    expect(minettiCost(-0.1)).toBeCloseTo(2.151706, 5);
    expect(gradeFactor(-0.1)).toBeCloseTo(0.59770, 4);
  });

  test('완만한 내리막이 평지보다 효율적(보정<1), 급오르막은 보정>1', () => {
    expect(gradeFactor(-0.1)).toBeLessThan(1);
    expect(gradeFactor(0.2)).toBeGreaterThan(1.6);
  });

  test('측정범위 밖(|i|>0.45)은 클램프 — 폭주 방지', () => {
    expect(minettiCost(0.9)).toBe(minettiCost(0.45));
    expect(minettiCost(-2)).toBe(minettiCost(-0.45));
  });

  test('NaN 입력은 평지로 안전 처리', () => {
    expect(minettiCost(NaN)).toBeCloseTo(3.6, 10);
  });
});

describe('gradeAdjustedPaceSec', () => {
  test('평지(고도 일정)면 GAP = 실제 평균페이스 (항등)', () => {
    // 1km 를 300초 = 5:00/km, 고도 변화 0.
    const flat = [
      {d: 0, t: 0, e: 100},
      {d: 0.5, t: 150, e: 100},
      {d: 1, t: 300, e: 100},
    ];
    expect(gradeAdjustedPaceSec(flat)).toBeCloseTo(300, 6);
  });

  test('5% 오르막을 실제 5:00/km로 뛰면 GAP 는 더 빠르다(≈3:50/km)', () => {
    // 1km, 50m 상승(5% grade), 300초. equivKm = 1*gradeFactor(0.05).
    const up = [
      {d: 0, t: 0, e: 0},
      {d: 1, t: 300, e: 50},
    ];
    const gap = gradeAdjustedPaceSec(up)!;
    expect(gap).toBeLessThan(300); // 오르막 보정 → 등가 페이스 빠름
    // gradeFactor(0.05) ≈ 1.30144 → 300/1.30144 ≈ 230.5s
    expect(gap).toBeCloseTo(300 / gradeFactor(0.05), 4);
    expect(gap).toBeGreaterThan(225);
    expect(gap).toBeLessThan(235);
  });

  test('정지/역행 구간은 무시, 표본<2면 null', () => {
    expect(gradeAdjustedPaceSec([{d: 0, t: 0, e: 0}])).toBeNull();
    expect(gradeAdjustedPaceSec([])).toBeNull();
    // 역행(d 감소) 구간만 있으면 등가거리 0 → null
    expect(gradeAdjustedPaceSec([{d: 1, t: 0, e: 0}, {d: 0.5, t: 100, e: 0}])).toBeNull();
  });
});

describe('buildGapSeries', () => {
  test('평지 시계열 → 각 bin GAP = 실제 페이스', () => {
    const track = Array.from({length: 11}, (_, i) => ({d: i * 0.1, t: i * 30, e: 50}));
    const s = buildGapSeries(track, 0.1);
    expect(s.length).toBeGreaterThanOrEqual(2);
    // 0.1km당 30초 = 300s/km
    for (const p of s) expect(p.paceSec).toBeCloseTo(300, 0);
  });
});
