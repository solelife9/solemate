/**
 * lib/records — 개인 기록(PR, 탑티어 1-3).
 *
 * 전체 런에서 최장 거리·최고(최소) 평균 페이스·최장 시간을 올바르게 뽑고, 엣지
 * (빈 배열·1km 미만·결측 durationS·0/음수)에서 NaN/Infinity 없이 graceful 한지 단언.
 *
 * @format
 */
import {personalRecords} from '../lib/records';
import {Run} from '../theme';

const mk = (over: Partial<Run>): Run => ({
  id: 'r', date: '', day: '', dateNum: '', dist: 5, pace: '', time: '', shoe: 0,
  cal: 0, cadence: 0, bpm: 0, elev: 0, durationS: 1500, ...over,
});

describe('personalRecords', () => {
  test('빈 배열 → 0/null/0, count 0', () => {
    expect(personalRecords([])).toEqual({
      longestKm: 0,
      fastestPaceSec: null,
      longestDurationS: 0,
      count: 0,
    });
  });

  test('최장 거리·최장 시간은 단일 런 최댓값', () => {
    const pr = personalRecords([
      mk({dist: 5, durationS: 1500}),
      mk({dist: 21.1, durationS: 7000}),
      mk({dist: 10, durationS: 3000}),
    ]);
    expect(pr.longestKm).toBe(21.1);
    expect(pr.longestDurationS).toBe(7000);
    expect(pr.count).toBe(3);
  });

  test('최고 페이스 = 가장 빠른(작은) sec/km, 1km 미만은 제외', () => {
    const pr = personalRecords([
      mk({dist: 10, durationS: 3000}), // 300 s/km
      mk({dist: 5, durationS: 1200}), // 240 s/km ← 최고
      mk({dist: 0.4, durationS: 60}), // 150 s/km 지만 1km 미만 → 제외
    ]);
    expect(pr.fastestPaceSec).toBe(240);
  });

  test('durationS 결측/0 런은 페이스 후보에서 제외(거리 기록엔 포함)', () => {
    const pr = personalRecords([
      mk({dist: 12, durationS: 0}), // 페이스 후보 아님, 거리 기록엔 반영
      mk({dist: 8, durationS: 2400}), // 300 s/km
    ]);
    expect(pr.longestKm).toBe(12);
    expect(pr.fastestPaceSec).toBe(300);
  });

  test('측정 가능한 페이스 런이 없으면 fastestPaceSec=null', () => {
    const pr = personalRecords([mk({dist: 0.5, durationS: 0})]);
    expect(pr.fastestPaceSec).toBeNull();
  });
});
