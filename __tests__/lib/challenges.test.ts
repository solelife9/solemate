/**
 * lib/challenges 단위 테스트 — 개인 챌린지 진행률(거리·스트릭).
 *
 * 관찰 가능한 계약을 검증한다:
 *   1) distance — 기간 내 런 거리 합산으로 current/pct/completed 산출(기간 밖 제외).
 *   2) cap — 목표 초과여도 pct 는 1 로 캡되고 completed=true.
 *   3) streak — 기간 내 끊김 없는 최대 연속일 수로 진행/달성 판정(같은 날 중복=1일).
 *   4) 미달성/빈입력 — 런이 없으면 current 0 · completed false.
 *
 * @format
 */
import {challengeProgress, Challenge, ChallengeRun} from '../../lib/challenges';

describe('challengeProgress · distance', () => {
  const ch: Challenge = {
    id: 'c1',
    kind: 'distance',
    targetKm: 100,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  };

  test('기간 내 거리만 합산하고 기간 밖 런은 제외한다', () => {
    const runs: ChallengeRun[] = [
      {date: '2026-06-03', dist: 40},
      {date: '2026-06-10', dist: 30},
      {date: '2026-05-30', dist: 99}, // 시작 전 → 제외
      {date: '2026-07-01', dist: 50}, // 종료 후 → 제외
    ];
    const p = challengeProgress(ch, runs);
    expect(p.current).toBeCloseTo(70, 5);
    expect(p.target).toBe(100);
    expect(p.pct).toBeCloseTo(0.7, 5);
    expect(p.completed).toBe(false);
  });

  test('양끝 날짜(startDate·endDate)는 기간에 포함한다', () => {
    const runs: ChallengeRun[] = [
      {date: '2026-06-01', dist: 10},
      {date: '2026-06-30', dist: 10},
    ];
    expect(challengeProgress(ch, runs).current).toBeCloseTo(20, 5);
  });

  test('음수/0/NaN 거리는 0으로 방어한다(데이터 안전)', () => {
    const runs: ChallengeRun[] = [
      {date: '2026-06-05', dist: 10},
      {date: '2026-06-06', dist: -5},
      {date: '2026-06-07', dist: 0},
      {date: '2026-06-08', dist: NaN as unknown as number},
    ];
    expect(challengeProgress(ch, runs).current).toBeCloseTo(10, 5);
  });

  test('목표 도달/초과 시 completed=true 이고 pct 는 1 로 캡된다', () => {
    const c2: Challenge = {...ch, id: 'c2', targetKm: 50};
    const p = challengeProgress(c2, [{date: '2026-06-05', dist: 60}]);
    expect(p.completed).toBe(true);
    expect(p.pct).toBe(1);
  });

  test('런이 없으면 진행 0 · 미달성', () => {
    const p = challengeProgress({...ch, targetKm: 30}, []);
    expect(p.current).toBe(0);
    expect(p.completed).toBe(false);
    expect(p.pct).toBe(0);
  });
});

describe('challengeProgress · streak', () => {
  const ch: Challenge = {
    id: 's1',
    kind: 'streak',
    targetDays: 3,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  };

  test('끊김 없는 최대 연속일 수를 current 로 센다', () => {
    const runs: ChallengeRun[] = [
      {date: '2026-06-02', dist: 5},
      {date: '2026-06-03', dist: 5},
      {date: '2026-06-05', dist: 5}, // 04 건너뜀 → 연속 끊김
    ];
    const p = challengeProgress(ch, runs);
    expect(p.current).toBe(2); // 02~03 = 2일이 최대
    expect(p.target).toBe(3);
    expect(p.completed).toBe(false);
  });

  test('목표 연속일 도달 시 completed=true, pct 1 로 캡', () => {
    const runs: ChallengeRun[] = [
      {date: '2026-06-10', dist: 3},
      {date: '2026-06-11', dist: 3},
      {date: '2026-06-12', dist: 3},
      {date: '2026-06-13', dist: 3}, // 4연속 > 목표 3
    ];
    const p = challengeProgress(ch, runs);
    expect(p.current).toBe(4);
    expect(p.completed).toBe(true);
    expect(p.pct).toBe(1);
  });

  test('같은 날 여러 런은 1일로만 센다', () => {
    const runs: ChallengeRun[] = [
      {date: '2026-06-04', dist: 2},
      {date: '2026-06-04', dist: 3},
      {date: '2026-06-05', dist: 4},
    ];
    expect(challengeProgress(ch, runs).current).toBe(2);
  });

  test('기간 밖 연속은 세지 않는다', () => {
    const runs: ChallengeRun[] = [
      {date: '2026-05-29', dist: 5},
      {date: '2026-05-30', dist: 5},
      {date: '2026-05-31', dist: 5},
      {date: '2026-06-01', dist: 5}, // 기간 시작일 — 단독 1일
    ];
    expect(challengeProgress(ch, runs).current).toBe(1);
  });

  test('런이 없으면 진행 0 · 미달성', () => {
    const p = challengeProgress(ch, []);
    expect(p.current).toBe(0);
    expect(p.completed).toBe(false);
  });
});
