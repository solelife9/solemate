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

// ============================================================================
// 모르는 시간을 존에 몰아주지 않는다 + 평균은 시간가중 (2026-08-07 감사)
//
// ① 계단 적분에 상한이 없었다. 워치 배터리가 죽었다가 25분 뒤 되살아나면 **그 25분이
//    통째로 직전 표본의 존에 적립된다.** 그 사이 무슨 일이 있었는지 모르는데, 모르는
//    시간을 특정 존에 몰아주면 "Z2 에서 40분" 같은 있지도 않은 훈련이 기록된다.
// ② 평균이 시간을 아예 안 봤다(산술평균). 표본이 고르지 않으면 촘촘한 구간이 과대
//    대표되고, 바로 옆 존 구간시간은 시간 적분이라 **같은 카드의 두 숫자가 서로 다른
//    러닝을 말했다.**
// ============================================================================
describe('신호 공백은 어느 존에도 넣지 않는다', () => {
  test('25분 공백이 직전 존에 적립되지 않는다', () => {
    const track = [
      {t: 0, bpm: 150},      // Z3 대역
      {t: 30, bpm: 150},
      {t: 30 + 25 * 60, bpm: 150}, // 워치가 죽었다 살아났다
      {t: 30 + 25 * 60 + 30, bpm: 150},
    ];
    const z = timeInZones(track, 200);
    const total = Object.values(z).reduce((a, b) => a + b, 0);
    // 실제로 심박이 있던 구간은 60초뿐이다. 25분이 섞이면 안 된다.
    expect(total).toBeLessThanOrEqual(60);
    expect(total).toBeGreaterThan(0);
  });

  test('상한 이내 간격은 그대로 센다 — 정상 구간을 자르지 않는다', () => {
    const track = Array.from({length: 61}, (_, i) => ({t: i * 5, bpm: 150}));
    const z = timeInZones(track, 200);
    expect(Object.values(z).reduce((a, b) => a + b, 0)).toBe(300);
  });
});

describe('평균 심박은 시간가중이다', () => {
  test('앞부분만 촘촘한 트랙에서 촘촘한 구간이 과대 대표되지 않는다', () => {
    // 앞 10초는 1초 간격 120bpm(11표본), 뒤 100초는 10초 간격 180bpm(10표본).
    const dense = Array.from({length: 11}, (_, i) => ({t: i, bpm: 120}));
    const sparse = Array.from({length: 11}, (_, i) => ({t: 10 + i * 10, bpm: 180}));
    const track = [...dense, ...sparse.slice(1)];

    const {avg} = hrSummary(track);
    // 산술평균이면 표본 수가 비슷해 ~150 근처. 시간가중이면 180 쪽으로 크게 기운다.
    expect(avg).toBeGreaterThan(165);
  });

  test('고르게 표집된 트랙에서는 산술평균과 같다 — 회귀 없음', () => {
    const track = Array.from({length: 61}, (_, i) => ({t: i, bpm: 140 + (i % 2 ? 20 : 0)}));
    const arithmetic = Math.round(track.reduce((a, p) => a + p.bpm, 0) / track.length);
    expect(Math.abs(hrSummary(track).avg - arithmetic)).toBeLessThanOrEqual(1);
  });

  test('표본이 하나뿐이면 그 값을 쓴다(간격이 없어도 빈칸으로 두지 않는다)', () => {
    expect(hrSummary([{t: 0, bpm: 155}]).avg).toBe(155);
  });

  test('공백은 평균에서도 빠진다 — 존과 같은 구간을 덮는다', () => {
    const a = hrSummary([{t: 0, bpm: 120}, {t: 10, bpm: 120}, {t: 10 + 30 * 60, bpm: 190}]);
    // 공백 뒤 표본이 평균을 끌어올리면 안 된다(그 30분은 모르는 시간이다).
    expect(a.avg).toBe(120);
  });
});
