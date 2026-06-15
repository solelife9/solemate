// lib/progression — 은퇴(Retirement) 업적 + 타이틀 카탈로그.
//
// 관찰 가능한 동작(behavioral):
//   · 은퇴 업적은 각자의 임계에서 정확히 언락된다(1/5/10 은퇴, smart/perfect 등급 ≥1).
//   · 은퇴 타이틀은 은퇴 수 + 등급 품질로 사다리를 따라 언락된다.
//   · progress current/target 이 실제 은퇴 수와 일치한다(진행바·언락 모순 불가).
//   · 은퇴 0건이면 어떤 은퇴 업적/타이틀도 언락되지 않는다(날조 금지 — 실제 은퇴만).
//   · 은퇴 업적 포인트는 rarity 권위(POINTS_BY_RARITY)와 일치한다.
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
import {POINTS_BY_RARITY} from '../../../lib/progression/points';
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
// 1) 카운트 업적 — First Retirement(1) / Shoe Curator(5) / Hall of Shoes(10)
// ============================================================================
describe('은퇴 카운트 업적: 임계 경계', () => {
  const cases: Array<[string, number]> = [
    ['ach_first_retirement', 1],
    ['ach_retire_5', 5],
    ['ach_retire_10', 10],
  ];

  test.each(cases)('%s: 은퇴 %d건에서 언락(경계: 1건 모자라면 잠금)', (key, n) => {
    const def = achievementDef(key)!;
    expect(def.unlocked(ctxWithRetired(retiredRecords(n)))).toBe(true);
    expect(def.unlocked(ctxWithRetired(retiredRecords(n - 1)))).toBe(false);
  });

  test('progress current/target 이 실제 은퇴 수와 일치(미달·초과 캡)', () => {
    const curator = achievementDef('ach_retire_5')!;
    expect(achievementProgress(curator, ctxWithRetired(retiredRecords(3)))).toEqual({
      current: 3,
      target: 5,
    });
    // 초과는 target 으로 캡(진행바·언락 일치).
    expect(achievementProgress(curator, ctxWithRetired(retiredRecords(8)))).toEqual({
      current: 5,
      target: 5,
    });
  });

  test('Hall of Shoes 진행: 7/10', () => {
    const hall = achievementDef('ach_retire_10')!;
    expect(achievementProgress(hall, ctxWithRetired(retiredRecords(7)))).toEqual({
      current: 7,
      target: 10,
    });
    expect(hall.unlocked(ctxWithRetired(retiredRecords(7)))).toBe(false);
  });
});

// ============================================================================
// 2) 제때 교체(타이밍) 업적 — 권장수명 근처(good 이상)에 교체한 수(히든 보너스, 랭크 제외)
// ============================================================================
describe('제때 교체 타이밍 업적', () => {
  test('제때 교체 1: good/smart/perfect/hallOfFame ≥1 이면 언락(standard 는 불가)', () => {
    const def = achievementDef('ach_good_timing_1')!;
    for (const g of ['good', 'smart', 'perfect', 'hallOfFame'] as RetirementGrade[]) {
      expect(def.unlocked(ctxWithRetired(retiredRecords(1, g)))).toBe(true);
    }
    // standard(너무 일찍/늦게)만으로는 아무리 많아도 미언락.
    expect(def.unlocked(ctxWithRetired(retiredRecords(9, 'standard')))).toBe(false);
  });

  test('제때 교체 3: good 이상 3건 필요', () => {
    const def = achievementDef('ach_good_timing_3')!;
    expect(
      def.unlocked(ctxWithRetired(recordsByGrade({good: 2, smart: 1, standard: 5}))),
    ).toBe(true);
    expect(
      def.unlocked(ctxWithRetired(recordsByGrade({smart: 2, standard: 9}))),
    ).toBe(false);
  });

  test('진행: good 이상 수 / target (초과 캡)', () => {
    const def = achievementDef('ach_good_timing_3')!;
    expect(
      achievementProgress(def, ctxWithRetired(recordsByGrade({good: 2, standard: 1}))),
    ).toEqual({current: 2, target: 3});
    expect(
      achievementProgress(def, ctxWithRetired(recordsByGrade({perfect: 5}))),
    ).toEqual({current: 3, target: 3});
  });
});

// ============================================================================
// 3) 은퇴 0건 — 어떤 은퇴 업적도 언락 안 함(날조 금지)
// ============================================================================
describe('anti-scenario: 은퇴 0건 무언락', () => {
  const RETIREMENT_ACH_KEYS = [
    'ach_first_retirement',
    'ach_retire_3',
    'ach_retire_5',
    'ach_retire_10',
    'ach_good_timing_1',
  ];

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
// 4) 은퇴 업적 포인트 = rarity 권위
// ============================================================================
describe('은퇴 업적 포인트 = rarity 권위', () => {
  // 은퇴 그룹은 '개수' 업적만 보유한다. 교체 타이밍 품질(좋은 타이밍/완벽한 타이밍)은
  // 부상 예방 그룹으로 이동했다 — 카테고리 단언은 부상 예방 쪽 케이스 참조.
  const expected: Array<[string, keyof typeof POINTS_BY_RARITY]> = [
    ['ach_first_retirement', 'bronze'],
    ['ach_retire_3', 'silver'],
    ['ach_retire_5', 'gold'],
    ['ach_retire_10', 'diamond'],
  ];

  test.each(expected)('%s points == POINTS_BY_RARITY[%s]', (key, rarity) => {
    const def = ACHIEVEMENTS_BY_KEY[key];
    expect(def).toBeDefined();
    expect(def.category).toBe('retirement');
    expect(def.rarity).toBe(rarity);
    expect(def.points).toBe(POINTS_BY_RARITY[rarity]);
  });
});

// ============================================================================
// 4-b) 그룹 정합: 은퇴 그룹 = 개수만 / 교체 타이밍 품질 = 부상 예방으로 이동
// ============================================================================
describe('업적 그룹 정합(은퇴=개수 / 타이밍품질=부상예방)', () => {
  test('은퇴 그룹은 개수 업적(첫·3·5·10)만 보유한다', () => {
    const retireGroup = Object.values(ACHIEVEMENTS_BY_KEY).filter(
      d => d.group === 'retirement',
    );
    expect(retireGroup.map(d => d.key).sort()).toEqual([
      'ach_first_retirement',
      'ach_retire_10',
      'ach_retire_3',
      'ach_retire_5',
    ]);
  });

  test('제때 교체 타이밍 업적은 히든(group)·부상예방(category)이며 랭크 제외', () => {
    for (const key of ['ach_good_timing_1', 'ach_good_timing_3', 'ach_good_timing_5']) {
      const def = achievementDef(key)!;
      expect(def.category).toBe('injuryPrevention');
      expect(def.group).toBe('hidden'); // 히든 보너스 — 랭크 축(신발관리)엔 안 들어감
    }
    expect(achievementDef('ach_good_timing_1')!.name).toBe('제때 교체');
  });

  test('옛 등급 업적(스마트/완벽 타이밍·현명한 교체)은 제거됐다', () => {
    expect(achievementDef('ach_smart_replacement')).toBeUndefined();
    expect(achievementDef('ach_perfect_timing')).toBeUndefined();
    expect(achievementDef('ach_smart_swap')).toBeUndefined();
    expect(achievementDef('ach_smart_5')).toBeUndefined();
  });
});

// ============================================================================
// 5) 은퇴 타이틀 사다리 — 은퇴 수 + 등급 품질
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
