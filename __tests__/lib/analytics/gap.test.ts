import {minettiCost, gradeFactor, gradeAdjustedPaceSec, buildGapSeries, smoothElevation, resampleByDistance} from '../../../lib/analytics/gap';

// 표시단이 쓰는 정밀 파이프라인: 이동평균 스무딩 → 지형스케일 빈평균 → Minetti GAP.
const robustGap = (track: {d: number; t: number; e: number}[]) =>
  gradeAdjustedPaceSec(resampleByDistance(smoothElevation(track, 60), 0.1));

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

describe('smoothElevation (GPS 고도 노이즈 억제)', () => {
  const variance = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
  };

  test('표본<3은 원본 복사(스무딩 불가)', () => {
    expect(smoothElevation([{d: 0, t: 0, e: 5}])).toEqual([{d: 0, t: 0, e: 5}]);
  });

  test('d·t 는 보존하고 e 만 평활한다', () => {
    const track = Array.from({length: 9}, (_, i) => ({d: i * 0.025, t: i * 8, e: i % 2 ? 110 : 90}));
    const sm = smoothElevation(track, 60);
    expect(sm.map(p => p.d)).toEqual(track.map(p => p.d));
    expect(sm.map(p => p.t)).toEqual(track.map(p => p.t));
  });

  test('평지 위 ±8m 톱니 노이즈 → 분산 급감(노이즈 억제)', () => {
    // 25m 간격, 실제 고도는 100m 평탄, 측정에 ±8 톱니가 섞임.
    const track = Array.from({length: 21}, (_, i) => ({d: i * 0.025, t: i * 8, e: 100 + (i % 2 ? 8 : -8)}));
    const sm = smoothElevation(track, 60);
    expect(variance(sm.map(p => p.e))).toBeLessThan(variance(track.map(p => p.e)) * 0.25);
  });

  test('노이즈 낀 평지: 스무딩+리샘플이 GAP 를 실제 평균페이스로 되돌린다', () => {
    // 1km/300s 평지인데 고도에 ±8m 표본주파수 톱니(최악 GPS 수직 노이즈). raw GAP 는 가짜
    // 경사로 크게 부풀지만(등가페이스↓), 지형스케일 빈평균까지 거치면 진실(300)로 복원된다.
    const track = Array.from({length: 41}, (_, i) => ({d: i * 0.025, t: i * 7.5, e: 50 + (i % 2 ? 8 : -8)}));
    const rawGap = gradeAdjustedPaceSec(track)!;
    expect(rawGap).toBeLessThan(290); // 노이즈가 '오르내림 노력'으로 위조돼 등가페이스 빨라짐
    expect(Math.abs(robustGap(track)! - 300)).toBeLessThan(5); // 진실에 근접 복원
  });

  test('진짜 언덕(선형 상승)은 리샘플해도 경사 신호 보존', () => {
    // 1km 동안 60m 선형 상승(6%). 빈평균은 단조 추세를 유지하므로 GAP 는 여전히 빠르다.
    const track = Array.from({length: 41}, (_, i) => ({d: i * 0.025, t: i * 7.5, e: i * 1.5}));
    expect(robustGap(track)!).toBeLessThan(290); // 6% 오르막 보정으로 등가페이스 빠름
  });

  test('리샘플 비유효 입력은 [] (표본<2 / 잘못된 bin)', () => {
    expect(resampleByDistance([{d: 0, t: 0, e: 5}])).toEqual([]);
    expect(resampleByDistance([{d: 0, t: 0, e: 5}, {d: 1, t: 9, e: 9}], 0)).toEqual([]);
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
