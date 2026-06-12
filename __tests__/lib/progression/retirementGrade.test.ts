// lib/progression/retirementGrade — Smart Retirement Grade 밴드/특별등급.
//
// 관찰 가능한 동작:
//   · closeness(usedKm/recommendedKm) 가 정확히 밴드 경계에서 등급을 가른다
//     (±5% perfect, ±10% smart, 권장범위 good, 그 외 standard).
//   · Hall of Fame 은 healthy lifecycle(smart+) + 뛰어난 관리 + 실제 PB 를 모두
//     충족할 때만(특별 승격), 하나라도 빠지면 기본 등급 그대로.
//   · recommendedKm≤0/usedKm 음수 등 비정상 입력에서도 throw 없이 안전.
//
// 순수 엔진(AsyncStorage 미사용) — 키 격리 자명.
import {
  gradeRetirement,
  retirementCloseness,
} from '../../../lib/progression/retirementGrade';
import {RETIREMENT_HIGHLIGHT_KEYS} from '../../../lib/progression/retirement';
import {
  PerShoeStats,
  ProgressionContext,
  RetirementSummary,
} from '../../../lib/progression/types';

const NOW = new Date(2026, 5, 12).getTime();
const REC = 500; // 권장 수명(km)

function emptyCtx(over: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    now: NOW,
    cumulativeKm: 0,
    runCount: 0,
    totalDurationS: 0,
    longestRunKm: 0,
    bestPaceSec: null,
    avgPaceSec: null,
    currentStreak: 0,
    longestStreak: 0,
    weeklyActiveRatio: 0,
    earlyRunCount: 0,
    nightRunCount: 0,
    longestGapDays: 0,
    registeredShoeCount: 0,
    retiredShoeCount: 0,
    perShoe: {},
    earnedTitleKeys: [],
    earnedTitleCount: 0,
    completedChallengeCount: 0,
    ...over,
  };
}

function shoe(over: Partial<PerShoeStats> & {id: string}): PerShoeStats {
  return {
    id: over.id,
    name: over.name ?? over.id,
    km: over.km ?? 0,
    runs: over.runs ?? 0,
    firstWorn: over.firstWorn ?? null,
    lastWorn: over.lastWorn ?? null,
    retired: over.retired ?? false,
    maxKm: over.maxKm ?? 0,
  };
}

function summary(over: Partial<RetirementSummary> = {}): RetirementSummary {
  return {
    shoeId: 's1',
    name: 'Test Shoe',
    totalKm: 0,
    runCount: 0,
    totalDurationS: 0,
    avgPaceSec: null,
    bestPaceSec: null,
    longestRunKm: 0,
    firstRunDate: null,
    lastRunDate: null,
    usageDays: 0,
    grade: 'standard',
    highlights: [],
    mostMemorable: null,
    ...over,
  };
}

// mgmt pillar 높은 ctx(활성·수명알려진 신발이 전부 건강 → shoeManagement=1.0).
const HIGH_MGMT = emptyCtx({
  perShoe: {s1: shoe({id: 's1', km: 100, runs: 5, maxKm: 500, retired: false})},
});

describe('retirementCloseness', () => {
  test('c = usedKm / recommendedKm', () => {
    expect(retirementCloseness(500, 500)).toBe(1);
    expect(retirementCloseness(250, 500)).toBe(0.5);
  });
  test('recommendedKm ≤ 0/미상 → null(판정 불가)', () => {
    expect(retirementCloseness(500, 0)).toBeNull();
    expect(retirementCloseness(500, -10)).toBeNull();
    expect(retirementCloseness(500, NaN)).toBeNull();
  });
  test('usedKm 음수/NaN → 0 으로 정규화', () => {
    expect(retirementCloseness(-100, 500)).toBe(0);
    expect(retirementCloseness(NaN, 500)).toBe(0);
  });
});

describe('grade 밴드 경계', () => {
  const g = (usedKm: number) => gradeRetirement(usedKm, REC, summary(), emptyCtx());

  test('±5% 이내 → perfect (양/음 모두)', () => {
    expect(g(REC * 1.049)).toBe('perfect'); // +4.9%
    expect(g(REC * 0.951)).toBe('perfect'); // −4.9%
    expect(g(REC * 1.05)).toBe('perfect'); // 정확히 +5%(포함)
    expect(g(REC * 0.95)).toBe('perfect'); // 정확히 −5%(포함)
    expect(g(REC)).toBe('perfect'); // 정확히 권장
  });

  test('±5% 밖 ±10% 이내 → smart', () => {
    expect(g(REC * 1.051)).toBe('smart'); // +5.1%
    expect(g(REC * 1.099)).toBe('smart'); // +9.9%
    expect(g(REC * 1.1)).toBe('smart'); // 정확히 +10%(포함)
    expect(g(REC * 0.9)).toBe('smart'); // 정확히 −10%(포함)
  });

  test('−10.1% (권장 범위 내, ±10% 밖) → good', () => {
    expect(g(REC * 0.899)).toBe('good'); // c=0.899
    expect(g(REC * 0.85)).toBe('good'); // c=0.85
    expect(g(REC * 0.7)).toBe('good'); // 정확히 하한 0.70(포함)
  });

  test('+10.1% (한참 초과) → standard', () => {
    expect(g(REC * 1.101)).toBe('standard'); // c=1.101
    expect(g(REC * 1.5)).toBe('standard'); // 한참 초과
  });

  test('아주 이른 교체(하한 미만) → standard', () => {
    expect(g(REC * 0.699)).toBe('standard'); // c<0.70
    expect(g(REC * 0.2)).toBe('standard'); // 거의 새 신발
  });

  test('recommendedKm 미상 → standard(판정 불가)', () => {
    expect(gradeRetirement(500, 0, summary(), emptyCtx())).toBe('standard');
  });
});

describe('Hall of Fame 특별 등급', () => {
  const pbSummary = summary({
    highlights: [RETIREMENT_HIGHLIGHT_KEYS.pbFastestPace],
  });

  test('healthy lifecycle(perfect) + 뛰어난 관리 + 실제 PB → hallOfFame', () => {
    expect(gradeRetirement(REC, REC, pbSummary, HIGH_MGMT)).toBe('hallOfFame');
  });

  test('smart 라이프사이클이어도 세 조건 충족 시 hallOfFame 으로 승격', () => {
    expect(gradeRetirement(REC * 1.09, REC, pbSummary, HIGH_MGMT)).toBe(
      'hallOfFame',
    );
  });

  test('PB 없음 → 승격 안 함(기본 perfect)', () => {
    expect(gradeRetirement(REC, REC, summary(), HIGH_MGMT)).toBe('perfect');
  });

  test('관리 점수 낮음 → 승격 안 함(기본 perfect)', () => {
    // 활성·수명알려진 신발이 overdue(초과 마모) → shoeManagement 낮음.
    const lowMgmt = emptyCtx({
      perShoe: {s1: shoe({id: 's1', km: 490, maxKm: 500, retired: false})},
    });
    expect(gradeRetirement(REC, REC, pbSummary, lowMgmt)).toBe('perfect');
  });

  test('healthy lifecycle 아님(good) → 세 조건 일부만이면 승격 안 함', () => {
    expect(gradeRetirement(REC * 0.85, REC, pbSummary, HIGH_MGMT)).toBe('good');
  });
});

describe('순수/방어', () => {
  test('null summary/ctx 에서도 throw 없이 등급 산출', () => {
    expect(gradeRetirement(REC, REC, null, null)).toBe('perfect');
  });
});
