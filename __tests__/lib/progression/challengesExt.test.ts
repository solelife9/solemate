// lib/progression/challengesExt — 확장 챌린지 로직(monthly/shoe/rotation/smart).
//
// 관찰 가능한 계약을 검증한다(모두 순수·결정적):
//   1) monthly  — 이번 달 거리만 합산(다른 달 제외) / count 는 이번 달 런 수.
//   2) shoe     — 지정한 shoeId 의 런 거리만 합산('새 신발'은 최근 등록 활성 신발).
//   3) rotation — distinct(주간 활성 신발 N켤레 이상) / balance(한 신발 X% 이하).
//   4) smart    — 과사용 신발 → 가장 덜 신은 신발 추천 + 한국어 사유 + 결정적 + <2 → null.
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

const NOW = '2026-06-13'; // 토요일

const SHOES: ExtShoe[] = [
  {id: 's1', name: 'Alphafly 3', retired: false, createdAt: '2026-01-01', targetKm: 300},
  {id: 's2', name: 'Novablast 5', retired: false, createdAt: '2026-03-01', targetKm: 800},
  {id: 's3', name: 'Old Trainer', retired: true, createdAt: '2025-01-01', targetKm: 700},
];

describe('challengeExtProgress · monthly', () => {
  test('이번 달 거리만 합산하고 다른 달 런은 제외한다', () => {
    const ch: ExtChallenge = {id: 'm1', kind: 'monthly', metric: 'distance', targetKm: 100};
    const runs: ExtRun[] = [
      {date: '2026-06-02', dist: 30},
      {date: '2026-06-11', dist: 25},
      {date: '2026-05-31', dist: 99}, // 지난 달 → 제외
      {date: '2026-07-01', dist: 50}, // 다음 달 → 제외
    ];
    const p = challengeExtProgress(ch, runs, SHOES, NOW);
    expect(p.current).toBeCloseTo(55, 5);
    expect(p.target).toBe(100);
    expect(p.pct).toBeCloseTo(0.55, 5);
    expect(p.completed).toBe(false);
  });

  test('count 메트릭은 이번 달의 실제 달린(dist>0) 런 수를 센다', () => {
    const ch: ExtChallenge = {id: 'm2', kind: 'monthly', metric: 'count', targetRuns: 3};
    const runs: ExtRun[] = [
      {date: '2026-06-01', dist: 5},
      {date: '2026-06-05', dist: 8},
      {date: '2026-06-08', dist: 0}, // 거리 0 → 런 아님
      {date: '2026-05-20', dist: 10}, // 지난 달 → 제외
    ];
    const p = challengeExtProgress(ch, runs, SHOES, NOW);
    expect(p.current).toBe(2);
    expect(p.target).toBe(3);
    expect(p.completed).toBe(false);
  });

  test('month 오버라이드로 다른 달을 집계할 수 있다', () => {
    const ch: ExtChallenge = {
      id: 'm3',
      kind: 'monthly',
      metric: 'distance',
      targetKm: 50,
      month: '2026-05',
    };
    const runs: ExtRun[] = [
      {date: '2026-05-10', dist: 40},
      {date: '2026-06-10', dist: 40},
    ];
    expect(challengeExtProgress(ch, runs, SHOES, NOW).current).toBeCloseTo(40, 5);
  });

  test('목표 초과 시 pct=1·completed=true', () => {
    const ch: ExtChallenge = {id: 'm4', kind: 'monthly', metric: 'distance', targetKm: 20};
    const p = challengeExtProgress(ch, [{date: '2026-06-03', dist: 30}], SHOES, NOW);
    expect(p.completed).toBe(true);
    expect(p.pct).toBe(1);
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
  // 2026-06-13(토)이 속한 주 = 월(06-08)~일(06-14).
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
    // 균형: s1 50%, s2 50% → 최대 점유 50% ≤ 60% → 달성.
    const balanced: ExtRun[] = [
      {date: '2026-06-09', dist: 10, shoeId: 's1'},
      {date: '2026-06-10', dist: 10, shoeId: 's2'},
    ];
    const ok = challengeExtProgress(ch, balanced, SHOES, NOW);
    expect(ok.current).toBeCloseTo(50, 5);
    expect(ok.target).toBe(60);
    expect(ok.completed).toBe(true);
    expect(ok.pct).toBe(1);

    // 편중: s1 80%, s2 20% → 최대 80% > 60% → 미달.
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
  // s1(Alphafly)을 최근 많이 신고, s2(Novablast)는 거의 안 신었다.
  const runs: ExtRun[] = [
    {date: '2026-06-01', dist: 20, shoeId: 's1'},
    {date: '2026-06-05', dist: 20, shoeId: 's1'},
    {date: '2026-06-10', dist: 18, shoeId: 's1'},
    {date: '2026-06-08', dist: 3, shoeId: 's2'},
  ];

  test('과사용(s1) → 가장 덜 신은(s2) 신발 추천 + 투명한 한국어 사유', () => {
    const ch = generateSmartChallenge(runs, SHOES, NOW);
    expect(ch).not.toBeNull();
    expect(ch!.kind).toBe('shoe');
    expect(ch!.shoeId).toBe('s2'); // 덜 신은 신발이 대상
    expect(ch!.targetKm).toBeGreaterThan(0);
    expect(ch!.reason).toContain('Alphafly 3'); // 과사용
    expect(ch!.reason).toContain('Novablast 5'); // 덜 신음
    expect(ch!.reason).toMatch(/많이 신었어요/);
    expect(ch!.reason).toContain(`${ch!.targetKm}km`);
  });

  test('같은 입력에 대해 결정적이다(Math.random/Date.now 미사용)', () => {
    const a = generateSmartChallenge(runs, SHOES, NOW);
    const b = generateSmartChallenge(runs, SHOES, NOW);
    expect(a).toEqual(b);
  });

  test('추천 신발은 실제 등록된 활성 신발이다(날조 금지)', () => {
    const ch = generateSmartChallenge(runs, SHOES, NOW);
    const activeIds = SHOES.filter(s => !s.retired).map(s => s.id);
    expect(activeIds).toContain(ch!.shoeId);
  });

  test('활성 신발이 2켤레 미만이면 null', () => {
    const one: ExtShoe[] = [{id: 's1', name: 'Solo', retired: false}];
    expect(generateSmartChallenge(runs, one, NOW)).toBeNull();
    // 은퇴 신발은 활성으로 안 침 → 활성 1켤레만 있는 경우도 null.
    const oneActive: ExtShoe[] = [
      {id: 's1', name: 'Active', retired: false},
      {id: 's3', name: 'Retired', retired: true},
    ];
    expect(generateSmartChallenge(runs, oneActive, NOW)).toBeNull();
  });

  // 가드(product_bug 회귀 방지): 덜 신은 신발이 '평생' 거리는 targetKm 을 넘지만
  // 추천 이후엔 0km 인 경우, 추천 즉시 '완료'로 태어나면 안 된다(전진 윈도우).
  describe('전진 윈도우 가드 — 추천 이전 거리는 진행으로 세지 않는다', () => {
    // s1(Alphafly): 최근 28일 60km → 과사용. targetKm = clamp(roundTo5(60/2)) = 30.
    // s2(Novablast): 최근 0km(가장 덜 신음)인데 '평생' 누적 100km(> 30) — 모두 추천 이전.
    const lifetimeRuns: ExtRun[] = [
      {date: '2026-06-01', dist: 30, shoeId: 's1'}, // s1 최근
      {date: '2026-06-10', dist: 30, shoeId: 's1'}, // s1 최근 → 합 60
      {date: '2026-01-05', dist: 50, shoeId: 's2'}, // s2 과거(추천 이전)
      {date: '2026-02-05', dist: 50, shoeId: 's2'}, // s2 과거 → 평생 100km
    ];

    test('덜 신은 신발(s2)에 전진 윈도우(startDate=now)가 박힌다', () => {
      const ch = generateSmartChallenge(lifetimeRuns, SHOES, NOW);
      expect(ch).not.toBeNull();
      expect(ch!.shoeId).toBe('s2');
      expect(ch!.targetKm).toBe(30);
      expect(ch!.startDate).toBe(NOW); // 추천 시점부터
      expect(ch!.endDate).toBe('2026-06-30'); // 이번 달 말일
    });

    test('평생 100km(> target 30) 이지만 추천 이후 0km → current=0·미완(태어나자마자 완료 금지)', () => {
      const ch = generateSmartChallenge(lifetimeRuns, SHOES, NOW)!;
      const p = challengeExtProgress(ch, lifetimeRuns, SHOES, NOW);
      expect(p.current).toBe(0); // 추천 이전 100km 는 제외
      expect(p.completed).toBe(false);
      expect(p.pct).toBe(0);
    });

    test('추천 이후(now 이상) 달린 거리는 진행을 증가시킨다', () => {
      const ch = generateSmartChallenge(lifetimeRuns, SHOES, NOW)!;
      const after: ExtRun[] = [
        ...lifetimeRuns,
        {date: '2026-06-20', dist: 12, shoeId: 's2'}, // 추천 이후 12km
      ];
      const p = challengeExtProgress(ch, after, SHOES, NOW);
      expect(p.current).toBeCloseTo(12, 5);
      expect(p.completed).toBe(false); // 12 < 30
    });

    test('갓 생성된(미시작) 스마트 챌린지는 참여도(completedChallengeCount)를 부풀리지 않는다', () => {
      const ch = generateSmartChallenge(lifetimeRuns, SHOES, NOW)!;
      const ctxChallenges = extChallengesToContext([ch], lifetimeRuns, SHOES, NOW);
      expect(ctxChallenges).toEqual([{completed: false}]);
      const ctx = buildContext(
        [],
        [],
        [],
        ctxChallenges,
        new Date(2026, 5, 13).getTime(),
      );
      expect(ctx.completedChallengeCount).toBe(0); // 무활동 챌린지가 끼지 않음
    });
  });
});

describe('확장 챌린지 완료 → 참여도(engagement) 카운트', () => {
  test('완료한 확장 챌린지가 buildContext.completedChallengeCount 에 합산된다', () => {
    const runs: ExtRun[] = [
      {date: '2026-06-02', dist: 30, shoeId: 's1'}, // 이번 달 30km
      {date: '2026-06-05', dist: 25, shoeId: 's2'},
    ];
    const challenges: ExtChallenge[] = [
      {id: 'done', kind: 'monthly', metric: 'distance', targetKm: 50}, // 55km ≥ 50 → 완료
      {id: 'ongoing', kind: 'monthly', metric: 'distance', targetKm: 200}, // 미완
    ];
    const ctxChallenges = extChallengesToContext(challenges, runs, SHOES, NOW);
    expect(ctxChallenges).toEqual([{completed: true}, {completed: false}]);

    // Slice A 의 동일 카운트 경로(buildContext)로 흐른다.
    const ctx = buildContext([], [], [], ctxChallenges, new Date(2026, 5, 13).getTime());
    expect(ctx.completedChallengeCount).toBe(1);
  });

  test('완료 0건이면 카운트도 0', () => {
    const challenges: ExtChallenge[] = [
      {id: 'x', kind: 'monthly', metric: 'distance', targetKm: 999},
    ];
    const ctxChallenges = extChallengesToContext(challenges, [], SHOES, NOW);
    const ctx = buildContext([], [], [], ctxChallenges, new Date(2026, 5, 13).getTime());
    expect(ctx.completedChallengeCount).toBe(0);
  });
});

describe('방어(NaN/누락/빈 입력)', () => {
  test('빈/누락 입력에서 throw 없이 안전한 0 진행을 반환', () => {
    expect(
      challengeExtProgress({id: 'z', kind: 'monthly'} as ExtChallenge, [], [], NOW),
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

  test('monthly 거리의 음수/NaN 은 0으로 방어', () => {
    const ch: ExtChallenge = {id: 'd', kind: 'monthly', metric: 'distance', targetKm: 100};
    const runs: ExtRun[] = [
      {date: '2026-06-03', dist: 10},
      {date: '2026-06-04', dist: -5},
      {date: '2026-06-05', dist: NaN as unknown as number},
    ];
    expect(challengeExtProgress(ch, runs, SHOES, NOW).current).toBeCloseTo(10, 5);
  });
});
