// lib/progression/challengesExt — 확장 챌린지 로직(weekly/shoe/rotation/smart).
//
// 관찰 가능한 계약을 검증한다(모두 순수·결정적):
//   1) weekly   — 이번 주(월~일) 거리만 합산 / count 는 이번 주 런 수.
//   2) shoe     — 지정한 shoeId 의 런 거리만 합산('새 신발'은 최근 등록 활성 신발).
//   3) rotation — distinct(주간 활성 신발 N켤레 이상) / balance(한 신발 X% 이하).
//   4) smart    — 평균 런 거리 × 3 기반 주간 목표, 런 없으면 null.
//   5) 완료가 buildContext 의 completedChallengeCount(참여도)로 흐른다.
//
// @format
import {
  challengeExtProgress,
  generateSmartChallenge,
  extChallengesToContext,
  ExtChallenge,
  ExtRun,
  ExtShoe,
} from '../../../lib/progression/challengesExt';
import {buildContext} from '../../../lib/progression/context';

const NOW = '2026-06-13'; // 토요일, 이번 주 = 06-08(월)~06-14(일)

const SHOES: ExtShoe[] = [
  {id: 's1', name: 'Alphafly 3', retired: false, createdAt: '2026-01-01', targetKm: 300},
  {id: 's2', name: 'Novablast 5', retired: false, createdAt: '2026-03-01', targetKm: 800},
  {id: 's3', name: 'Old Trainer', retired: true, createdAt: '2025-01-01', targetKm: 700},
];

describe('challengeExtProgress · weekly', () => {
  test('이번 주(월~일) 거리만 합산하고 다른 주 런은 제외한다', () => {
    const ch: ExtChallenge = {id: 'w1', kind: 'weekly', metric: 'distance', targetKm: 30};
    const runs: ExtRun[] = [
      {date: '2026-06-10', dist: 10}, // 이번 주 → 포함
      {date: '2026-06-12', dist: 15}, // 이번 주 → 포함
      {date: '2026-06-07', dist: 20}, // 지난 주 일요일 → 제외
      {date: '2026-06-16', dist: 10}, // 다음 주 → 제외
    ];
    const p = challengeExtProgress(ch, runs, SHOES, NOW);
    expect(p.current).toBeCloseTo(25, 5);
    expect(p.target).toBe(30);
    expect(p.pct).toBeCloseTo(25 / 30, 5);
    expect(p.completed).toBe(false);
  });

  test('이번 주 목표 초과 시 pct=1·completed=true', () => {
    const ch: ExtChallenge = {id: 'w2', kind: 'weekly', metric: 'distance', targetKm: 20};
    const p = challengeExtProgress(ch, [{date: '2026-06-10', dist: 25}], SHOES, NOW);
    expect(p.completed).toBe(true);
    expect(p.pct).toBe(1);
  });

  test('count 메트릭은 이번 주 실제 달린(dist>0) 런 수를 센다', () => {
    const ch: ExtChallenge = {id: 'w3', kind: 'weekly', metric: 'count', targetRuns: 3};
    const runs: ExtRun[] = [
      {date: '2026-06-09', dist: 5},
      {date: '2026-06-11', dist: 8},
      {date: '2026-06-12', dist: 0}, // 거리 0 → 런 아님
      {date: '2026-06-07', dist: 10}, // 지난 주 일요일 → 제외
    ];
    const p = challengeExtProgress(ch, runs, SHOES, NOW);
    expect(p.current).toBe(2);
    expect(p.target).toBe(3);
    expect(p.completed).toBe(false);
  });
});

describe('challengeExtProgress · shoe', () => {
  test('지정한 shoeId 의 런 거리만 합산한다', () => {
    const ch: ExtChallenge = {id: 'sh1', kind: 'shoe', shoeId: 's2', targetKm: 50};
    const runs: ExtRun[] = [
      {date: '2026-06-01', dist: 20, shoeId: 's2'},
      {date: '2026-06-05', dist: 15, shoeId: 's2'},
      {date: '2026-06-06', dist: 99, shoeId: 's1'}, // 다른 신발 → 제외
      {date: '2026-06-07', dist: 12}, // 신발 미귀속 → 제외
    ];
    const p = challengeExtProgress(ch, runs, SHOES, NOW);
    expect(p.current).toBeCloseTo(35, 5);
    expect(p.target).toBe(50);
    expect(p.completed).toBe(false);
  });

  test("'새로 등록한 신발'은 가장 최근 등록 활성 신발(s2)을 대상으로 한다", () => {
    const ch: ExtChallenge = {id: 'sh2', kind: 'shoe', newShoe: true, targetKm: 10};
    const runs: ExtRun[] = [
      {date: '2026-06-02', dist: 12, shoeId: 's2'}, // 최근 등록 활성 = s2
      {date: '2026-06-02', dist: 50, shoeId: 's1'},
    ];
    const p = challengeExtProgress(ch, runs, SHOES, NOW);
    expect(p.current).toBeCloseTo(12, 5);
    expect(p.completed).toBe(true);
  });
});

describe('challengeExtProgress · rotation', () => {
  // 2026-06-13(토)이 속한 주 = 월(06-08)~일(06-14) → 실제 weekWindow 기준 06-09~06-15.
  test('distinct: 이번 주 사용한 서로 다른 활성 신발 수 ≥ N 이면 달성', () => {
    const ch: ExtChallenge = {id: 'r1', kind: 'rotation', rotationMode: 'distinct', targetShoes: 2};
    const runs: ExtRun[] = [
      {date: '2026-06-09', dist: 10, shoeId: 's1'},
      {date: '2026-06-10', dist: 8, shoeId: 's2'},
      {date: '2026-06-11', dist: 5, shoeId: 's3'}, // 은퇴 신발 → 비활성, 카운트 제외
      {date: '2026-06-01', dist: 9, shoeId: 's2'}, // 지난 주 → 제외
    ];
    const p = challengeExtProgress(ch, runs, SHOES, NOW);
    expect(p.current).toBe(2); // s1, s2 (s3 은퇴 제외)
    expect(p.target).toBe(2);
    expect(p.completed).toBe(true);
  });

  test('balance: 한 신발이 주간 거리의 X% 를 넘지 않으면 달성', () => {
    const ch: ExtChallenge = {id: 'r2', kind: 'rotation', rotationMode: 'balance', maxSharePct: 60};
    const balanced: ExtRun[] = [
      {date: '2026-06-09', dist: 10, shoeId: 's1'},
      {date: '2026-06-10', dist: 10, shoeId: 's2'},
    ];
    const ok = challengeExtProgress(ch, balanced, SHOES, NOW);
    expect(ok.current).toBeCloseTo(50, 5);
    expect(ok.target).toBe(60);
    expect(ok.completed).toBe(true);

    const skewed: ExtRun[] = [
      {date: '2026-06-09', dist: 16, shoeId: 's1'},
      {date: '2026-06-10', dist: 4, shoeId: 's2'},
    ];
    const bad = challengeExtProgress(ch, skewed, SHOES, NOW);
    expect(bad.current).toBeCloseTo(80, 5);
    expect(bad.completed).toBe(false);
    expect(bad.pct).toBeLessThan(1);
  });

  test('주간 런이 없으면 안전하게 0·미달(throw 없음)', () => {
    const ch: ExtChallenge = {id: 'r3', kind: 'rotation', rotationMode: 'balance', maxSharePct: 60};
    const p = challengeExtProgress(ch, [], SHOES, NOW);
    expect(p.current).toBe(0);
    expect(p.completed).toBe(false);
  });
});

describe('generateSmartChallenge', () => {
  test('런 기록 없으면 null을 반환한다(빈 상태)', () => {
    expect(generateSmartChallenge([], SHOES, NOW)).toBeNull();
    expect(generateSmartChallenge([{date: '2026-06-01', dist: 0}], SHOES, NOW)).toBeNull();
  });

  test('평균 런 거리 × 3 = 주간 목표(5 단위 반올림)', () => {
    // avg=10 → 10×3=30 → target=30
    const runs: ExtRun[] = [
      {date: '2026-06-01', dist: 10},
      {date: '2026-06-05', dist: 10},
    ];
    const ch = generateSmartChallenge(runs, SHOES, NOW);
    expect(ch).not.toBeNull();
    expect(ch!.kind).toBe('weekly');
    expect(ch!.targetKm).toBe(30);
  });

  test('최솟값 5km 캡 — 평균 1km 이하라도 5km', () => {
    const runs: ExtRun[] = [{date: '2026-06-01', dist: 1}];
    const ch = generateSmartChallenge(runs, SHOES, NOW);
    expect(ch!.targetKm).toBe(5);
  });

  test('최댓값 50km 캡 — 평균 20km × 3 = 60 → 50', () => {
    const runs: ExtRun[] = [
      {date: '2026-06-01', dist: 20},
      {date: '2026-06-05', dist: 20},
    ];
    const ch = generateSmartChallenge(runs, SHOES, NOW);
    expect(ch!.targetKm).toBe(50);
  });

  test('id가 이번 주 월요일 기준으로 결정적이다', () => {
    const runs: ExtRun[] = [{date: '2026-06-01', dist: 10}];
    const a = generateSmartChallenge(runs, SHOES, NOW);
    const b = generateSmartChallenge(runs, SHOES, NOW);
    expect(a).toEqual(b);
    expect(a!.id).toBe('smart-weekly-2026-06-08'); // 이번 주 월요일
  });

  test('kind=weekly, metric=distance, startDate/endDate=이번 주 윈도우', () => {
    const runs: ExtRun[] = [{date: '2026-06-01', dist: 10}];
    const ch = generateSmartChallenge(runs, SHOES, NOW);
    expect(ch!.kind).toBe('weekly');
    expect(ch!.metric).toBe('distance');
    expect(ch!.startDate).toBe('2026-06-08'); // 이번 주 월요일
    expect(ch!.endDate).toBe('2026-06-14');   // 이번 주 일요일
  });

  test('사유(reason)에 평균 거리와 목표가 포함된다', () => {
    const runs: ExtRun[] = [
      {date: '2026-06-01', dist: 10},
      {date: '2026-06-05', dist: 10},
    ];
    const ch = generateSmartChallenge(runs, SHOES, NOW);
    expect(ch!.reason).toContain('10');
    expect(ch!.reason).toContain('30km');
  });

  test('신발 수와 무관하게 생성된다(1켤레도 ok)', () => {
    const runs: ExtRun[] = [{date: '2026-06-01', dist: 10}];
    const oneShoe: ExtShoe[] = [{id: 's1', name: 'Solo', retired: false}];
    const ch = generateSmartChallenge(runs, oneShoe, NOW);
    expect(ch).not.toBeNull();
    expect(ch!.kind).toBe('weekly');
  });
});

describe('확장 챌린지 완료 → 참여도(engagement) 카운트', () => {
  test('완료한 weekly 챌린지가 buildContext.completedChallengeCount 에 합산된다', () => {
    // 이번 주(06-09~06-15) 런 55km → 50km 목표 달성
    const runs: ExtRun[] = [
      {date: '2026-06-10', dist: 30},
      {date: '2026-06-12', dist: 25},
    ];
    const challenges: ExtChallenge[] = [
      {id: 'done', kind: 'weekly', metric: 'distance', targetKm: 50},
      {id: 'ongoing', kind: 'weekly', metric: 'distance', targetKm: 200},
    ];
    const ctxChallenges = extChallengesToContext(challenges, runs, SHOES, NOW);
    expect(ctxChallenges).toEqual([{completed: true}, {completed: false}]);
    const ctx = buildContext([], [], [], ctxChallenges, new Date(2026, 5, 13).getTime());
    expect(ctx.completedChallengeCount).toBe(1);
  });

  test('완료 0건이면 카운트도 0', () => {
    const challenges: ExtChallenge[] = [
      {id: 'x', kind: 'weekly', metric: 'distance', targetKm: 999},
    ];
    const ctxChallenges = extChallengesToContext(challenges, [], SHOES, NOW);
    const ctx = buildContext([], [], [], ctxChallenges, new Date(2026, 5, 13).getTime());
    expect(ctx.completedChallengeCount).toBe(0);
  });
});

describe('방어(NaN/누락/빈 입력)', () => {
  test('빈/누락 입력에서 throw 없이 안전한 0 진행을 반환', () => {
    expect(
      challengeExtProgress({id: 'z', kind: 'weekly'} as ExtChallenge, [], [], NOW),
    ).toEqual({current: 0, target: 0, pct: 0, completed: false});
    expect(
      challengeExtProgress(
        null as unknown as ExtChallenge,
        null as unknown as ExtRun[],
        null as unknown as ExtShoe[],
        NOW,
      ),
    ).toEqual({current: 0, target: 0, pct: 0, completed: false});
  });

  test('weekly 거리의 음수/NaN 은 0으로 방어', () => {
    const ch: ExtChallenge = {id: 'd', kind: 'weekly', metric: 'distance', targetKm: 100};
    const runs: ExtRun[] = [
      {date: '2026-06-10', dist: 10},
      {date: '2026-06-11', dist: -5},
      {date: '2026-06-12', dist: NaN as unknown as number},
    ];
    expect(challengeExtProgress(ch, runs, SHOES, NOW).current).toBeCloseTo(10, 5);
  });
});
