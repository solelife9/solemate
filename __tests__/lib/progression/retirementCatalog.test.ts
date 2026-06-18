// lib/progression — 은퇴(Retirement) 업적 + 타이틀 카탈로그.
//
// 재설계 후 동작(behavioral):
//   · 은퇴 카운트 업적(retire_1/3/5/10)은 각자의 임계에서 정확히 언락된다.
//   · 은퇴 카운트 업적은 shoeJourney 카테고리이며 명시적 xp 를 보유한다(첫은퇴=signature).
//   · progress current/target 이 실제 은퇴 수와 일치한다(진행바·언락 모순 불가, 초과 캡).
//   · 은퇴 0건이면 어떤 은퇴 업적도 언락되지 않는다(날조 금지 — 실제 은퇴만).
//   · 등급(grade) 품질은 업적이 아닌 **타이틀 사다리**(retire_*)로만 구동된다(재설계).
//   · 은퇴 타이틀은 은퇴 수 + 등급 품질로 사다리를 따라 언락된다.
//   · buildContext 가 progression_v1.retiredShoes 를 retirementCount/grades 로 표면화한다.
//
// 와이어링까지 못박기 위해 가능한 곳은 buildContext(영속 레코드 → ctx)로 end-to-end 구성한다.
import {
  ACHIEVEMENTS_BY_KEY,
  achievementDef,
  achievementProgress,
  evaluateAchievements,
} from '../../../lib/progression/achievements';
import {buildContext} from '../../../lib/progression/context';
import {evaluateTitles} from '../../../lib/progression/titles';
import {
  ProgressionContext,
  RetiredShoeRecord,
  RetirementGrade,
} from '../../../lib/progression/types';

const NOW = new Date(2026, 5, 12).getTime();

/** 등급 g 의 은퇴 레코드 n개(고유 shoeId). buildContext 입력용. */
function retiredRecords(n: number, grade: RetirementGrade = 'standard'): RetiredShoeRecord[] {
  const out: RetiredShoeRecord[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      shoeId: `s${i}`,
      name: `Shoe ${i}`,
      km: 500,
      retiredAt: '2026-05-01T00:00:00.000Z',
      retireYear: 2026,
      grade,
    });
  }
  return out;
}

/** 등급 분포(grade→count)로 은퇴 레코드를 만든다. */
function recordsByGrade(dist: Partial<Record<RetirementGrade, number>>): RetiredShoeRecord[] {
  const out: RetiredShoeRecord[] = [];
  let i = 0;
  for (const [grade, count] of Object.entries(dist)) {
    for (let k = 0; k < (count ?? 0); k++) {
      out.push({
        shoeId: `s${i++}`,
        name: `Shoe ${i}`,
        km: 500,
        retiredAt: '2026-05-01T00:00:00.000Z',
        retireYear: 2026,
        grade: grade as RetirementGrade,
      });
    }
  }
  return out;
}

/** 영속 은퇴 레코드만 가진 컨텍스트(런/신발 없음 — 은퇴 축만 격리 검증). */
function ctxWithRetired(records: RetiredShoeRecord[]): ProgressionContext {
  return buildContext([], [], [], [], NOW, records);
}

// ============================================================================
// 0) buildContext 와이어링 — retiredShoes → retirementCount/grades
// ============================================================================
describe('buildContext: progression_v1.retiredShoes 표면화', () => {
  test('레코드 수/등급이 retirementCount/retirementGrades 로 노출된다', () => {
    const ctx = ctxWithRetired(recordsByGrade({perfect: 2, smart: 1, standard: 1}));
    expect(ctx.retirementCount).toBe(4);
    expect(ctx.retirementGrades).toEqual(['perfect', 'perfect', 'smart', 'standard']);
  });

  test('은퇴 레코드 없으면 0/[](생략 인자 하위호환)', () => {
    const none = buildContext([], [], [], [], NOW);
    expect(none.retirementCount).toBe(0);
    expect(none.retirementGrades).toEqual([]);
  });

  test('무효 레코드(shoeId 누락)는 카운트에서 제외, 등급 누락 → standard', () => {
    const ctx = buildContext([], [], [], [], NOW, [
      {shoeId: '', name: 'x', km: 0, retiredAt: '', retireYear: 0, grade: 'perfect'},
      // grade 누락 — standard 로 정규화.
      {shoeId: 's1', name: 'y', km: 100, retiredAt: '', retireYear: 0} as RetiredShoeRecord,
    ]);
    expect(ctx.retirementCount).toBe(1);
    expect(ctx.retirementGrades).toEqual(['standard']);
  });
});

// ============================================================================
// 1) 은퇴 카운트 업적 — retire_1(첫) / retire_3 / retire_5 / retire_10(명예의 전당)
// ============================================================================
describe('은퇴 카운트 업적: 임계 경계', () => {
  const cases: Array<[string, number]> = [
    ['retire_1', 1],
    ['retire_3', 3],
    ['retire_5', 5],
    ['retire_10', 10],
  ];

  test.each(cases)('%s: 은퇴 %d건에서 언락(경계: 1건 모자라면 잠금)', (key, n) => {
    const def = achievementDef(key)!;
    expect(def.unlocked(ctxWithRetired(retiredRecords(n)))).toBe(true);
    expect(def.unlocked(ctxWithRetired(retiredRecords(n - 1)))).toBe(false);
  });

  test('progress current/target 이 실제 은퇴 수와 일치(미달·초과 캡)', () => {
    const r5 = achievementDef('retire_5')!;
    expect(achievementProgress(r5, ctxWithRetired(retiredRecords(3)))).toEqual({
      current: 3,
      target: 5,
    });
    // 초과는 target 으로 캡(진행바·언락 일치).
    expect(achievementProgress(r5, ctxWithRetired(retiredRecords(8)))).toEqual({
      current: 5,
      target: 5,
    });
  });

  test('명예의 전당(retire_10) 진행: 7/10', () => {
    const hall = achievementDef('retire_10')!;
    expect(achievementProgress(hall, ctxWithRetired(retiredRecords(7)))).toEqual({
      current: 7,
      target: 10,
    });
    expect(hall.unlocked(ctxWithRetired(retiredRecords(7)))).toBe(false);
  });
});

// ============================================================================
// 2) 등급(grade) 품질은 업적이 아닌 타이틀로만 구동된다(재설계)
// ============================================================================
describe('은퇴 카운트 업적은 등급(grade)을 보지 않는다', () => {
  test('카운트 업적은 등급과 무관하게 수(count)만으로 언락된다', () => {
    // 전부 standard 여도 5건이면 retire_5 언락(품질 게이트 없음 — 카운트 업적).
    const allStandard = ctxWithRetired(retiredRecords(5, 'standard'));
    expect(achievementDef('retire_5')!.unlocked(allStandard)).toBe(true);
    // 전부 perfect 여도 4건뿐이면 retire_5 잠금(등급이 카운트를 못 메운다).
    const fewPerfect = ctxWithRetired(retiredRecords(4, 'perfect'));
    expect(achievementDef('retire_5')!.unlocked(fewPerfect)).toBe(false);
  });
});

// ============================================================================
// 3) 은퇴 0건 — 어떤 은퇴 업적도 언락 안 함(날조 금지)
// ============================================================================
describe('anti-scenario: 은퇴 0건 무언락', () => {
  const RETIREMENT_ACH_KEYS = ['retire_1', 'retire_3', 'retire_5', 'retire_10'];

  test('은퇴 레코드 0건이면 모든 은퇴 업적이 잠금', () => {
    const ctx = ctxWithRetired([]);
    const unlocked = evaluateAchievements(ctx);
    for (const key of RETIREMENT_ACH_KEYS) {
      expect(unlocked).not.toContain(key);
      expect(achievementDef(key)!.unlocked(ctx)).toBe(false);
    }
  });

  test('retiredShoes 인자를 생략한 ctx 에서도 은퇴 업적 미언락', () => {
    const ctx = buildContext([], [], [], [], NOW);
    for (const key of RETIREMENT_ACH_KEYS) {
      expect(achievementDef(key)!.unlocked(ctx)).toBe(false);
    }
  });
});

// ============================================================================
// 4) 은퇴 업적 메타데이터 — shoeJourney 카테고리 · 명시적 xp · 희귀도
// ============================================================================
describe('은퇴 업적 메타데이터(카테고리·희귀도·xp)', () => {
  // 재설계: 은퇴 업적은 '신발 여정(shoeJourney)' 카테고리로 통합됐고 명시적 xp 를 보유한다.
  const expected: Array<[string, string, number]> = [
    ['retire_1', 'epic', 150],
    ['retire_3', 'epic', 250],
    ['retire_5', 'legendary', 400],
    ['retire_10', 'legendary', 700],
  ];

  test.each(expected)('%s: shoeJourney · %s · xp=%d', (key, rarity, xp) => {
    const def = ACHIEVEMENTS_BY_KEY[key];
    expect(def).toBeDefined();
    expect(def.category).toBe('shoeJourney');
    expect(def.rarity).toBe(rarity);
    expect(def.xp).toBe(xp);
  });

  test('첫 은퇴(retire_1)와 명예의 전당(retire_10)은 signature 카드다', () => {
    expect(achievementDef('retire_1')!.signature).toBe(true);
    expect(achievementDef('retire_10')!.signature).toBe(true);
  });

  test('옛 은퇴/타이밍 업적 키(ach_*)는 제거됐다(타이밍은 타이틀로 이동)', () => {
    for (const key of [
      'ach_first_retirement',
      'ach_retire_3',
      'ach_retire_5',
      'ach_retire_10',
      'ach_good_timing_1',
      'ach_good_timing_3',
      'ach_smart_replacement',
      'ach_perfect_timing',
    ]) {
      expect(achievementDef(key)).toBeUndefined();
    }
  });
});

// ============================================================================
// 5) 은퇴 타이틀 사다리 — 은퇴 수 + 등급 품질(grade quality)
// ============================================================================
describe('은퇴 타이틀 사다리', () => {
  test('Shoe Care Starter: 은퇴 1건에서 언락(0건은 잠금)', () => {
    expect(evaluateTitles(ctxWithRetired(retiredRecords(1)))).toContain('retire_starter');
    expect(evaluateTitles(ctxWithRetired([]))).not.toContain('retire_starter');
  });

  test('Mindful Retirer: 은퇴 3건 경계', () => {
    expect(evaluateTitles(ctxWithRetired(retiredRecords(3)))).toContain('retire_mindful');
    expect(evaluateTitles(ctxWithRetired(retiredRecords(2)))).not.toContain('retire_mindful');
  });

  test('Smart Retirer: 5건 은퇴 + smart 이상 ≥1 (둘 다 필요)', () => {
    // 5건이지만 전부 standard → 품질 미충족.
    expect(evaluateTitles(ctxWithRetired(retiredRecords(5, 'standard')))).not.toContain(
      'retire_smart',
    );
    // 5건 중 1건 smart → 충족.
    const five = recordsByGrade({smart: 1, standard: 4});
    expect(evaluateTitles(ctxWithRetired(five))).toContain('retire_smart');
    // smart 가 있어도 4건뿐이면 카운트 미충족.
    expect(
      evaluateTitles(ctxWithRetired(recordsByGrade({smart: 1, standard: 3}))),
    ).not.toContain('retire_smart');
  });

  test('Curation Pro: 5건 은퇴 + smart 이상 ≥3', () => {
    expect(
      evaluateTitles(ctxWithRetired(recordsByGrade({smart: 3, standard: 2}))),
    ).toContain('retire_curator');
    expect(
      evaluateTitles(ctxWithRetired(recordsByGrade({smart: 2, standard: 3}))),
    ).not.toContain('retire_curator');
  });

  test('Hall of Shoes Keeper: 은퇴 10건 경계', () => {
    expect(evaluateTitles(ctxWithRetired(retiredRecords(10)))).toContain('retire_hall');
    expect(evaluateTitles(ctxWithRetired(retiredRecords(9)))).not.toContain('retire_hall');
  });

  test('Perfect Curator: 10건 은퇴 + perfect ≥1', () => {
    const ten = recordsByGrade({perfect: 1, standard: 9});
    expect(evaluateTitles(ctxWithRetired(ten))).toContain('retire_perfect');
    // perfect 없이 smart 만이면 미충족(perfect 게이트).
    expect(
      evaluateTitles(ctxWithRetired(recordsByGrade({smart: 10}))),
    ).not.toContain('retire_perfect');
  });

  test('Keep Going(최상위): 10건 은퇴 + perfect ≥3', () => {
    const top = recordsByGrade({perfect: 3, standard: 7});
    const keys = evaluateTitles(ctxWithRetired(top));
    expect(keys).toContain('retire_keep_going');
    // perfect 2건이면 최상위는 잠금(하위 사다리는 열림).
    const near = recordsByGrade({perfect: 2, standard: 8});
    const nearKeys = evaluateTitles(ctxWithRetired(near));
    expect(nearKeys).not.toContain('retire_keep_going');
    expect(nearKeys).toContain('retire_perfect');
    expect(nearKeys).toContain('retire_hall');
  });

  test('hallOfFame 등급은 perfect 게이트도 통과(최상위 등급 포함)', () => {
    const top = recordsByGrade({hallOfFame: 3, standard: 7});
    expect(evaluateTitles(ctxWithRetired(top))).toContain('retire_keep_going');
  });

  test('은퇴 0건 → 어떤 은퇴 타이틀도 언락 안 함', () => {
    const keys = evaluateTitles(ctxWithRetired([]));
    [
      'retire_starter',
      'retire_mindful',
      'retire_smart',
      'retire_curator',
      'retire_hall',
      'retire_perfect',
      'retire_keep_going',
    ].forEach(k => expect(keys).not.toContain(k));
  });
});
