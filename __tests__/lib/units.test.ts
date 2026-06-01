// lib/units 거리 환산 수학 단위테스트.
// 관찰 가능한 동작: km↔mi 환산이 정해진 계수(1mi=1.60934km)로 정확히 계산되고,
// 표시 숫자가 지정 소수 자리수로 반올림되며, mi→km 라운드트립이 원값을 보존한다.
// (이전엔 라벨만 단언하고 환산된 *숫자*는 미검증이었다 — 그 갭을 메운다.)

import {
  KM_PER_MI, kmToDisplay, displayToKm, displayNum, fmtDistance, unitKorean,
} from '../../lib/units';

describe('환산 계수', () => {
  test('KM_PER_MI는 1.60934 (1mi)', () => {
    expect(KM_PER_MI).toBe(1.60934);
  });
});

describe('kmToDisplay (km → 표시 단위)', () => {
  test('km은 항등(변환 없음)', () => {
    expect(kmToDisplay(5, 'km')).toBe(5);
    expect(kmToDisplay(0, 'km')).toBe(0);
    expect(kmToDisplay(595, 'km')).toBe(595);
  });

  test('mi는 1.60934로 나눈다', () => {
    expect(kmToDisplay(1.60934, 'mi')).toBeCloseTo(1, 10);
    // 595km ≈ 369.717mi
    expect(kmToDisplay(595, 'mi')).toBeCloseTo(369.7168, 3);
    // 10km ≈ 6.2137mi
    expect(kmToDisplay(10, 'mi')).toBeCloseTo(6.2137, 3);
  });
});

describe('displayNum (환산 + 반올림한 숫자)', () => {
  test('digits=0: km 항등, mi 정수 반올림', () => {
    expect(displayNum(600, 'km')).toBe(600);
    expect(displayNum(600, 'mi')).toBe(373); // 600/1.60934 = 372.83 → 373
    expect(displayNum(5, 'mi')).toBe(3); // 3.107 → 3
    expect(displayNum(595, 'mi')).toBe(370); // 369.71 → 370
  });

  test('digits=1: 소수 1자리 (예 595km → 약 369.7mi)', () => {
    expect(displayNum(595, 'mi', 1)).toBe(369.7);
    expect(displayNum(5, 'km', 1)).toBe(5); // km 항등
    expect(displayNum(10, 'mi', 1)).toBe(6.2); // 6.2137 → 6.2
  });

  test('digits=2: 더 정밀한 표시', () => {
    expect(displayNum(595, 'mi', 2)).toBe(369.72);
    expect(displayNum(5, 'mi', 2)).toBe(3.11); // 3.1069 → 3.11
  });
});

describe('displayToKm 라운드트립 (표시 → km 복원)', () => {
  test('km은 항등', () => {
    expect(displayToKm(30, 'km')).toBe(30);
  });

  test('mi → km 라운드트립이 원래 km를 보존한다', () => {
    for (const km of [5, 10, 30, 595, 600]) {
      expect(displayToKm(kmToDisplay(km, 'mi'), 'mi')).toBeCloseTo(km, 9);
    }
  });

  test('displayToKm(mi)는 1.60934를 곱한다', () => {
    expect(displayToKm(10, 'mi')).toBeCloseTo(16.0934, 6);
  });
});

describe('fmtDistance (소수 1자리 + 단위 라벨)', () => {
  test('km/mi 문자열', () => {
    expect(fmtDistance(5, 'km')).toBe('5.0 km');
    expect(fmtDistance(5, 'mi')).toBe('3.1 mi'); // 3.107 → 3.1
    expect(fmtDistance(595, 'mi')).toBe('369.7 mi');
  });
});

describe('unitKorean', () => {
  test('km→킬로미터, mi→마일', () => {
    expect(unitKorean('km')).toBe('킬로미터');
    expect(unitKorean('mi')).toBe('마일');
  });
});
