/**
 * lib/pacePlan — 페이스 플랜 생성/조회 순수 로직.
 * @format
 */
import {
  buildPacePlan, planSegments, currentTargetPace, planAvgPace, clampPace,
  fmtPaceSec, PACE_MIN_SEC, PACE_MAX_SEC,
} from '../../lib/pacePlan';

describe('planSegments', () => {
  test('정수 km → 그 수, 부분 km → 올림, 최소 1', () => {
    expect(planSegments(5)).toBe(5);
    expect(planSegments(5.2)).toBe(6);
    expect(planSegments(0)).toBe(1);
    expect(planSegments(0.4)).toBe(1);
  });
});

describe('buildPacePlan', () => {
  test('even: 전 구간 동일 페이스', () => {
    expect(buildPacePlan(5, 360, 'even')).toEqual([360, 360, 360, 360, 360]);
  });

  test('negative: 첫 구간 느리고 마지막 빠르며 평균은 보존', () => {
    const plan = buildPacePlan(5, 360, 'negative');
    expect(plan.length).toBe(5);
    expect(plan[0]).toBeGreaterThan(plan[plan.length - 1]); // 초반 느리게(큰 초) → 후반 빠르게
    expect(plan[0]).toBe(360 + 15);
    expect(plan[plan.length - 1]).toBe(360 - 15);
    // 평균 보존(±1초)
    expect(Math.abs((planAvgPace(plan) as number) - 360)).toBeLessThanOrEqual(1);
  });

  test('negative + 단일 구간이면 평균 그대로', () => {
    expect(buildPacePlan(1, 360, 'negative')).toEqual([360]);
  });

  test('페이스는 합리 범위로 clamp 된다', () => {
    const plan = buildPacePlan(3, 100, 'even'); // 100s < 하한
    expect(plan.every(p => p >= PACE_MIN_SEC && p <= PACE_MAX_SEC)).toBe(true);
  });

  test('negative 스프레드가 하한을 뚫지 않는다', () => {
    const plan = buildPacePlan(4, PACE_MIN_SEC + 5, 'negative');
    expect(plan.every(p => p >= PACE_MIN_SEC)).toBe(true);
  });
});

describe('currentTargetPace', () => {
  const plan = [380, 360, 340, 320];
  test('진행 km 에 해당하는 구간 목표를 돌려준다', () => {
    expect(currentTargetPace(plan, 0)).toBe(380);   // 0~1km → 1구간
    expect(currentTargetPace(plan, 2.5)).toBe(340);  // 2~3km → 3구간
  });
  test('플랜 초과(완주 이후)면 마지막 구간 유지', () => {
    expect(currentTargetPace(plan, 9)).toBe(320);
  });
  test('빈 플랜이면 null', () => {
    expect(currentTargetPace([], 1)).toBeNull();
  });
});

describe('fmtPaceSec / clampPace', () => {
  test('초/km → M\'SS"', () => {
    expect(fmtPaceSec(360)).toBe("6'00\"");
    expect(fmtPaceSec(372)).toBe("6'12\"");
    expect(fmtPaceSec(0)).toBe('--');
    expect(fmtPaceSec(null)).toBe('--');
  });
  test('clampPace 범위/반올림', () => {
    expect(clampPace(100)).toBe(PACE_MIN_SEC);
    expect(clampPace(9999)).toBe(PACE_MAX_SEC);
    expect(clampPace(360.4)).toBe(360);
  });
});
