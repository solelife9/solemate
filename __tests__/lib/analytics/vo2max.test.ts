import {vdot, vo2maxUth, currentVdot, vdotLabel} from '../../../lib/analytics/vo2max';

describe('vdot (Daniels & Gilbert)', () => {
  test('5km 20:00 → VDOT ≈ 49.8 (Daniels 표 일치)', () => {
    expect(vdot(5, 20 * 60)).toBeCloseTo(49.8, 1);
  });
  test('10km 40:00 → VDOT ≈ 51.9', () => {
    expect(vdot(10, 40 * 60)).toBeCloseTo(51.9, 1);
  });
  test('마라톤 3:00:00 → VDOT ≈ 53.5', () => {
    expect(vdot(42.195, 3 * 3600)).toBeCloseTo(53.5, 0);
  });
  test('더 빠른 같은 거리 = 더 높은 VDOT', () => {
    expect(vdot(5, 18 * 60)).toBeGreaterThan(vdot(5, 22 * 60));
  });
  test('단거리/단시간(공식 범위 밖)은 0', () => {
    expect(vdot(0.3, 90)).toBe(0); // <400m
    expect(vdot(2, 90)).toBe(0); // <2min
    expect(vdot(0, 600)).toBe(0);
  });
});

describe('vo2maxUth (Uth-Sørensen 15.3×HRmax/HRrest)', () => {
  test('max190 rest50 → 58.1', () => {
    expect(vo2maxUth(190, 50)).toBeCloseTo(58.1, 1);
  });
  test('비유효(rest≥max, 0)는 0', () => {
    expect(vo2maxUth(190, 190)).toBe(0);
    expect(vo2maxUth(0, 50)).toBe(0);
  });
});

describe('currentVdot (최근 최고 노력)', () => {
  const runs = [
    {km: 5, durationS: 20 * 60, runDate: '2026-06-20'}, // VDOT ~49.8
    {km: 10, durationS: 40 * 60, runDate: '2026-06-25'}, // VDOT ~51.9 (최고)
    {km: 3, durationS: 18 * 60, runDate: '2026-06-28'}, // 이지런 더 낮음
  ];
  test('윈도우 내 최고 VDOT 채택', () => {
    expect(currentVdot(runs, '2026-06-30', 42)).toBeCloseTo(51.9, 1);
  });
  test('윈도우 밖 런은 제외', () => {
    // 7일 윈도우면 06-20 런(10일전) 제외, 06-25·06-28만
    expect(currentVdot(runs, '2026-06-30', 7)).toBeCloseTo(51.9, 1);
    // 1일 윈도우면 06-28 런만(VDOT 낮음)
    const v = currentVdot(runs, '2026-06-30', 1);
    expect(v).toBeLessThan(51);
  });
  test('표본 없으면 0', () => {
    expect(currentVdot([], '2026-06-30')).toBe(0);
  });
});

test('vdotLabel 등급', () => {
  expect(vdotLabel(0)).toBe('측정 전');
  expect(vdotLabel(52)).toBe('매우 우수');
  expect(vdotLabel(45)).toBe('우수');
  expect(vdotLabel(20)).toBe('입문');
});
