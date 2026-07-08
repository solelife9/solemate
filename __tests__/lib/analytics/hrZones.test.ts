import {
  estimateMaxHR, zoneOf, zoneBoundaries, timeInZones, hrSummary, HR_ZONE_LABEL,
} from '../../../lib/analytics/hrZones';

describe('estimateMaxHR (Tanaka 208 − 0.7×age)', () => {
  test('30세 = 187, 40세 = 180', () => {
    expect(estimateMaxHR(30)).toBe(187);
    expect(estimateMaxHR(40)).toBe(180);
  });
  test('비유효 나이는 190 폴백', () => {
    expect(estimateMaxHR(0)).toBe(190);
    expect(estimateMaxHR(NaN)).toBe(190);
    expect(estimateMaxHR(200)).toBe(190);
  });
});

describe('zoneOf (%HRmax 표준 5존)', () => {
  const MAX = 200;
  test('경계: 90%+→Z5, 80%+→Z4, 70%+→Z3, 60%+→Z2, 그 외 Z1', () => {
    expect(zoneOf(190, MAX)).toBe(5); // 0.95
    expect(zoneOf(180, MAX)).toBe(5); // 0.90 경계
    expect(zoneOf(170, MAX)).toBe(4); // 0.85
    expect(zoneOf(160, MAX)).toBe(4); // 0.80 경계
    expect(zoneOf(150, MAX)).toBe(3); // 0.75
    expect(zoneOf(130, MAX)).toBe(2); // 0.65
    expect(zoneOf(110, MAX)).toBe(1); // 0.55
    expect(zoneOf(90, MAX)).toBe(1);  // 0.45 → 바닥 Z1
  });
  test('비유효(bpm·max ≤0)는 0(미분류)', () => {
    expect(zoneOf(0, MAX)).toBe(0);
    expect(zoneOf(150, 0)).toBe(0);
    expect(zoneOf(NaN, MAX)).toBe(0);
  });
  test('HRR(Karvonen): rest=50,max=200 → Z4 하한 = 50+0.8*150 = 170', () => {
    expect(zoneOf(170, 200, 50)).toBe(4);
    expect(zoneOf(169, 200, 50)).toBe(3);
    expect(zoneOf(185, 200, 50)).toBe(5); // (185-50)/150=0.9
  });
});

describe('zoneBoundaries', () => {
  test('%HRmax 200 → {100,120,140,160,180}', () => {
    expect(zoneBoundaries(200)).toEqual({1: 100, 2: 120, 3: 140, 4: 160, 5: 180});
  });
  test('HRR rest=50,max=200 → {125,140,155,170,185}', () => {
    expect(zoneBoundaries(200, 50)).toEqual({1: 125, 2: 140, 3: 155, 4: 170, 5: 185});
  });
});

describe('timeInZones (계단 적분)', () => {
  test('구간별 시간을 앞 표본 존에 귀속', () => {
    // 0s@190(Z5) → 10s@150(Z3) → 30s@130(Z2) → 60s
    const track = [
      {t: 0, bpm: 190},   // Z5, 다음까지 10s
      {t: 10, bpm: 150},  // Z3, 다음까지 20s
      {t: 30, bpm: 130},  // Z2, 다음까지 30s
      {t: 60, bpm: 130},
    ];
    const z = timeInZones(track, 200);
    expect(z[5]).toBe(10);
    expect(z[3]).toBe(20);
    expect(z[2]).toBe(30);
    expect(z[1]).toBe(0);
    expect(z[4]).toBe(0);
  });
  test('시간 역행/비유효는 무시', () => {
    const z = timeInZones([{t: 10, bpm: 150}, {t: 5, bpm: 150}], 200);
    expect(z[3]).toBe(0);
  });
});

describe('hrSummary', () => {
  test('평균·최대(유효 표본만)', () => {
    expect(hrSummary([{t: 0, bpm: 140}, {t: 1, bpm: 160}, {t: 2, bpm: 0}])).toEqual({avg: 150, max: 160});
  });
  test('표본 없으면 0', () => {
    expect(hrSummary([])).toEqual({avg: 0, max: 0});
  });
  test('초대형 트랙에서도 최댓값 정확 — Math.max(...arr) 스택초과 방어', () => {
    // 20만 표본: Math.max(...bpms) 는 RangeError(스택초과)로 던졌다 → reduce 로 방어.
    const big = Array.from({length: 200000}, (_, i) => ({t: i, bpm: 120 + (i % 60)}));
    expect(() => hrSummary(big)).not.toThrow();
    expect(hrSummary(big).max).toBe(179); // 120 + 59
  });
});

test('HR_ZONE_LABEL 5존 한국어', () => {
  expect(HR_ZONE_LABEL[1]).toBe('회복');
  expect(HR_ZONE_LABEL[4]).toBe('역치');
  expect(HR_ZONE_LABEL[5]).toBe('무산소');
});
