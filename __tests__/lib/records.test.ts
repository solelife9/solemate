/**
 * lib/records — 개인 기록(PR) + 완주 직후 신기록 감지(detectPRs) 단위 테스트.
 * @format
 */
import {detectPRs, PR_LABEL} from '../../lib/records';

const r = (dist: number, durationS: number, runDate = '2026-06-01') => ({dist, durationS, runDate});

describe('detectPRs — 완주 직후 신기록 감지', () => {
  test('첫 런(이전 기록 없음)은 PR 로 보지 않는다', () => {
    expect(detectPRs({dist: 5, durationS: 1500}, [])).toEqual([]);
  });

  test('이전보다 먼 거리 → 최장 거리 PR', () => {
    const prior = [r(5, 1500), r(8, 2600)];
    expect(detectPRs({dist: 10, durationS: 3300}, prior)).toContain('longestDist');
  });

  test('이전보다 긴 시간 → 최장 시간 PR', () => {
    const prior = [r(5, 1500)];
    expect(detectPRs({dist: 4, durationS: 1800}, prior)).toContain('longestTime');
  });

  test('이전보다 빠른 페이스(1km↑) → 최고 페이스 PR', () => {
    const prior = [r(5, 1500)]; // 300s/km
    // 5km/1400s = 280s/km < 300 → 페이스 PR
    expect(detectPRs({dist: 5, durationS: 1400}, prior)).toContain('fastestPace');
  });

  test('이전 기록을 못 넘으면 PR 없음', () => {
    const prior = [r(10, 2800)]; // 최장 10km, 280s/km
    expect(detectPRs({dist: 5, durationS: 1500}, prior)).toEqual([]);
  });

  test('1km 미만 런은 페이스 PR 후보 아님', () => {
    const prior = [r(5, 1500)];
    expect(detectPRs({dist: 0.5, durationS: 120}, prior)).not.toContain('fastestPace');
  });

  test('PR_LABEL 한국어 라벨 매핑', () => {
    expect(PR_LABEL.longestDist).toBe('최장 거리');
    expect(PR_LABEL.fastestPace).toBe('최고 페이스');
  });
});
