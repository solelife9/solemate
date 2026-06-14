// lib/progression/achievements — 업적 카탈로그(라이브 진행 + 정직 언락).
//
// 관찰 가능한 동작(behavioral):
//   · progress(ctx) 의 current/target 이 실제 데이터와 일치한다(예: Trusted Partner 348/500km).
//   · 진행이 target 에 닿는 순간이 정확히 언락 순간(진행바·언락 모순 불가).
//   · 미충족 업적은 절대 unlocked 를 보고하지 않는다(anti-scenario 1 — 날조 금지).
//   · 6개 필러 카테고리를 모두 커버한다.
//   · 빈/비정상 컨텍스트 → 아무 업적도 언락 안 함, throw 없음.
//   · 업적 포인트는 rarity 권위(POINTS_BY_RARITY)와 일치한다.
//
// 순수 엔진(ctx 만 읽음)이라 AsyncStorage 를 쓰지 않는다 — 키 격리 자명.

import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_KEY,
  ACHIEVEMENT_UNLOCKS_TITLE,
  achievementDef,
  achievementProgress,
  evaluateAchievements,
  unlockedAchievements,
} from '../../../lib/progression/achievements';
import {POINTS_BY_RARITY} from '../../../lib/progression/points';
import {TITLES_BY_KEY} from '../../../lib/progression/titles';
import {
  PerShoeStats,
  ProgressionContext,
} from '../../../lib/progression/types';

const NOW = new Date(2026, 5, 12).getTime();

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

function perShoeMap(...shoes: PerShoeStats[]): Record<string, PerShoeStats> {
  const m: Record<string, PerShoeStats> = {};
  for (const s of shoes) m[s.id] = s;
  return m;
}

/** 키로 업적 progress 단축 조회(정의는 반드시 존재). */
function progressOf(key: string, ctx: ProgressionContext) {
  const def = achievementDef(key);
  if (!def) throw new Error(`unknown achievement: ${key}`);
  return achievementProgress(def, ctx);
}

// ============================================================================
// 1) progress current/target — 명시 예시 Trusted Partner 348/500km
// ============================================================================
describe('progress current/target', () => {
  test('Trusted Partner: 한 켤레 348km → {current:348, target:500}, 미언락', () => {
    const ctx = emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 348, maxKm: 600, runs: 30})),
    });
    expect(progressOf('ach_trusted_partner', ctx)).toEqual({
      current: 348,
      target: 500,
    });
    expect(achievementDef('ach_trusted_partner')!.unlocked(ctx)).toBe(false);
  });

  test('Trusted Partner: 500km 도달 → 언락 + current=target(초과는 target 으로 캡)', () => {
    const at = emptyCtx({perShoe: perShoeMap(shoe({id: 'a', km: 500, maxKm: 600}))});
    expect(achievementDef('ach_trusted_partner')!.unlocked(at)).toBe(true);
    const over = emptyCtx({perShoe: perShoeMap(shoe({id: 'a', km: 720, maxKm: 800}))});
    expect(progressOf('ach_trusted_partner', over)).toEqual({
      current: 500,
      target: 500,
    });
    expect(achievementDef('ach_trusted_partner')!.unlocked(over)).toBe(true);
  });

  test('누적 거리 진행: 1000km Journey 가 실제 누적과 일치', () => {
    const ctx = emptyCtx({cumulativeKm: 640});
    expect(progressOf('ach_distance_1000', ctx)).toEqual({
      current: 640,
      target: 1000,
    });
  });

  test('스트릭 진행: Week Warrior current=longestStreak', () => {
    expect(progressOf('ach_streak_7', emptyCtx({longestStreak: 5}))).toEqual({
      current: 5,
      target: 7,
    });
  });

  test('로테이션 진행: Three\'s Company = 사용(런≥1) 신발 수', () => {
    const ctx = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', runs: 2, km: 10}),
        shoe({id: 'b', runs: 1, km: 5}),
        shoe({id: 'c', runs: 0, km: 0}), // 미사용 → 카운트 제외
      ),
    });
    expect(progressOf('ach_rotation_3', ctx)).toEqual({current: 2, target: 3});
  });
});

// ============================================================================
// 2) 진행이 target 에 닿는 순간 = 언락 순간(경계 일관성)
// ============================================================================
describe('진행·언락 경계 일관성', () => {
  test('Marathon Finisher: 42.195km 경계', () => {
    const def = achievementDef('ach_marathon')!;
    expect(def.unlocked(emptyCtx({longestRunKm: 42.195}))).toBe(true);
    expect(def.unlocked(emptyCtx({longestRunKm: 42.19}))).toBe(false);
    // 미달 진행은 current<target.
    const p = progressOf('ach_marathon', emptyCtx({longestRunKm: 40}));
    expect(p.current).toBeCloseTo(40);
    expect(p.target).toBeCloseTo(42.195);
  });

  test('모든 metric 업적: unlocked ⟺ progress.current ≥ target', () => {
    // 충분히 큰 사실로 모두 채운 컨텍스트 — 닿은 업적은 모두 언락이어야.
    const rich = emptyCtx({
      runCount: 500,
      cumulativeKm: 9000,
      longestRunKm: 50,
      longestStreak: 200,
      weeklyActiveRatio: 1,
      registeredShoeCount: 12,
      bestPaceSec: 250,
      perShoe: perShoeMap(
        shoe({id: 'a', km: 1200, maxKm: 1500, runs: 100}),
        shoe({id: 'b', km: 1100, maxKm: 1500, runs: 90}),
        shoe({id: 'c', km: 1000, maxKm: 1500, runs: 80}),
        shoe({id: 'd', km: 900, maxKm: 1500, runs: 70}),
        shoe({id: 'e', km: 800, maxKm: 1500, runs: 60}),
      ),
    });
    for (const def of ACHIEVEMENTS) {
      const p = achievementProgress(def, rich);
      const reached = p.current >= p.target && p.target > 0;
      expect(def.unlocked(rich)).toBe(reached);
    }
  });
});

// ============================================================================
// 3) anti-scenario 1 — 미충족 업적은 절대 언락되지 않는다(날조 금지)
// ============================================================================
describe('anti-scenario 1: 미충족 무언락', () => {
  test('빈 컨텍스트 → 아무 업적도 언락 안 함', () => {
    expect(evaluateAchievements(emptyCtx())).toEqual([]);
    expect(unlockedAchievements(emptyCtx())).toEqual([]);
  });

  test('≥42km 런 없는 유저는 Marathon Finisher 를 절대 보고하지 않는다', () => {
    const ctx = emptyCtx({runCount: 300, cumulativeKm: 4000, longestRunKm: 30});
    expect(evaluateAchievements(ctx)).not.toContain('ach_marathon');
  });

  test('각 업적: 진행이 target 미만이면 unlocked=false (개별)', () => {
    // Trusted Partner 만 약간 미달(499) → 언락 금지.
    const ctx = emptyCtx({perShoe: perShoeMap(shoe({id: 'a', km: 499, maxKm: 600}))});
    expect(achievementDef('ach_trusted_partner')!.unlocked(ctx)).toBe(false);
    expect(evaluateAchievements(ctx)).not.toContain('ach_trusted_partner');
  });

  test('Clean Rotation: 한 켤레라도 초과(overdue)면 미언락', () => {
    const def = achievementDef('ach_clean_rotation')!;
    const dirty = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}),
        shoe({id: 'b', km: 590, maxKm: 600}), // ratio≈0.98 ≥0.9 → overdue
      ),
    });
    expect(def.unlocked(dirty)).toBe(false);
    const clean = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}),
        shoe({id: 'b', km: 200, maxKm: 600}),
      ),
    });
    expect(def.unlocked(clean)).toBe(true);
  });

  // 회귀(code_critic): 진행바·언락 모순 금지(spec 시나리오5 — target 도달 ⟺ 언락).
  // 혼합(건강2+초과1) 컨텍스트에서 바가 가득 차면(2/2) 언락은 false 인 모순이 났었다.
  // 이제 바는 healthy/total 로 읽혀 overdue 가 하나라도 있으면 절대 가득 차지 않는다.
  test('Clean Rotation: 혼합(건강/초과)이면 바가 가득 차지 않고 미언락', () => {
    const def = achievementDef('ach_clean_rotation')!;
    const mixed = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}), // ratio≈0.17 건강
        shoe({id: 'b', km: 200, maxKm: 600}), // ratio≈0.33 건강
        shoe({id: 'c', km: 590, maxKm: 600}), // ratio≈0.98 ≥0.9 초과
      ),
    });
    const p = progressOf('ach_clean_rotation', mixed);
    expect(p.current).toBeLessThan(p.target); // 바가 가득 차지 않음(2/3)
    expect(def.unlocked(mixed)).toBe(false);
    // 불변: current===target ⟺ unlocked.
    expect(p.current === p.target).toBe(def.unlocked(mixed));
  });

  test('Clean Rotation: 전부 건강이면 바가 가득 차고(current===target) 언락', () => {
    const def = achievementDef('ach_clean_rotation')!;
    const allHealthy = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}),
        shoe({id: 'b', km: 200, maxKm: 600}),
        shoe({id: 'c', km: 300, maxKm: 600}),
      ),
    });
    const p = progressOf('ach_clean_rotation', allHealthy);
    expect(p.current).toBe(p.target); // 3/3 가득 참
    expect(def.unlocked(allHealthy)).toBe(true);
    expect(p.current === p.target).toBe(def.unlocked(allHealthy));
  });

  test('Speedster: 5km 이상 단일 런 평균 ≤5:00/km 한 번이면 언락(런 수 무관)', () => {
    const def = achievementDef('ach_speedster')!;
    // 5km+ 런 평균 300s(=5:00/km) → 단 1회로도 언락.
    expect(def.unlocked(emptyCtx({bestPace5kSec: 300, runCount: 1}))).toBe(true);
    // 5:00/km 보다 느리면 미언락.
    expect(def.unlocked(emptyCtx({bestPace5kSec: 301, runCount: 50}))).toBe(false);
    // 5km+ 빠른 런 없음(짧은 질주만) → 미언락. bestPaceSec 가 빨라도 거리 바닥 미충족.
    expect(
      def.unlocked(emptyCtx({bestPace5kSec: null, bestPaceSec: 200, runCount: 50})),
    ).toBe(false);
  });

  test('비정상 입력에서 throw 없이 [] 반환', () => {
    // @ts-expect-error 의도적 비정상 입력.
    expect(evaluateAchievements(null)).toEqual([]);
    // @ts-expect-error 의도적 비정상 입력.
    expect(unlockedAchievements(undefined)).toEqual([]);
  });

  test('NaN/음수 필드는 0 으로 클램프되어 언락되지 않는다', () => {
    const ctx = emptyCtx({
      cumulativeKm: NaN,
      longestRunKm: -10,
      longestStreak: Number.POSITIVE_INFINITY,
    });
    expect(evaluateAchievements(ctx)).toEqual([]);
  });
});

// ============================================================================
// 4) 포인트 — rarity 권위 일치
// ============================================================================
describe('업적 포인트 = rarity 권위', () => {
  test('모든 업적의 points 가 POINTS_BY_RARITY[rarity] 와 일치', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.points).toBe(POINTS_BY_RARITY[def.rarity]);
    }
  });

  test('rarity 별 포인트 사다리(Bronze10…Legend1000)', () => {
    expect(POINTS_BY_RARITY).toEqual({
      bronze: 10,
      silver: 25,
      gold: 50,
      platinum: 100,
      diamond: 250,
      master: 500,
      legend: 1000,
    });
  });
});

// ============================================================================
// 5) 카탈로그 무결성 + 카테고리 커버리지
// ============================================================================
describe('카탈로그 무결성', () => {
  test('키는 고유하고 ACHIEVEMENTS_BY_KEY 와 일치한다', () => {
    const keys = ACHIEVEMENTS.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(ACHIEVEMENTS_BY_KEY).length).toBe(ACHIEVEMENTS.length);
  });

  test('5개 필러 카테고리를 모두 커버한다', () => {
    const cats = new Set(ACHIEVEMENTS.map(a => a.category));
    [
      'running',
      'consistency',
      'rotation',
      'shoeManagement',
      'injuryPrevention',
    ].forEach(c => expect(cats.has(c as never)).toBe(true));
  });

  test('Trusted Partner(명시 예시)가 카탈로그에 존재한다', () => {
    const def = achievementDef('ach_trusted_partner');
    expect(def?.name).toBe('믿음직한 파트너');
    expect(def?.category).toBe('shoeManagement');
  });

  test('ACHIEVEMENT_UNLOCKS_TITLE 의 타이틀 키는 모두 실재한다', () => {
    for (const [achKey, titleKey] of Object.entries(ACHIEVEMENT_UNLOCKS_TITLE)) {
      expect(ACHIEVEMENTS_BY_KEY[achKey]).toBeDefined();
      expect(TITLES_BY_KEY[titleKey]).toBeDefined();
    }
  });

  test('모든 표시 그룹이 카탈로그에 존재한다', () => {
    const groups = new Set(ACHIEVEMENTS.map(a => a.group));
    [
      'firstMilestone',
      'distance',
      'runCount',
      'consistency',
      'shoeCollection',
      'shoeLife',
      'rotation',
      'injuryPrevention',
      'retirement',
      'hidden',
    ].forEach(g => expect(groups.has(g as never)).toBe(true));
  });

  test('업적 수가 충분히 많다(타이틀보다 많은 수집 카탈로그)', () => {
    // 철학: 업적 = 많고 잘게, 타이틀 = 적고 어렵게. 업적이 타이틀(=42 미만으로 정리됨)보다 많아야 한다.
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(45);
  });
});

// ============================================================================
// 6) 히든 업적 — 달성 전 미노출, 실제 데이터로만 언락(날조 금지)
// ============================================================================
describe('히든 업적', () => {
  test('얼리버드: 새벽 런 ≥20 에서만 언락 + hidden:true', () => {
    const def = achievementDef('ach_hidden_early_bird')!;
    expect(def.hidden).toBe(true);
    expect(def.group).toBe('hidden');
    expect(def.unlocked(emptyCtx({earlyRunCount: 20}))).toBe(true);
    expect(def.unlocked(emptyCtx({earlyRunCount: 19}))).toBe(false);
  });

  test('나이트 러너: 야간 런 ≥20', () => {
    const def = achievementDef('ach_hidden_night_runner')!;
    expect(def.unlocked(emptyCtx({nightRunCount: 20}))).toBe(true);
    expect(def.unlocked(emptyCtx({nightRunCount: 19}))).toBe(false);
  });

  test('컴백 러너: 30일 이상 공백', () => {
    const def = achievementDef('ach_hidden_comeback')!;
    expect(def.unlocked(emptyCtx({longestGapDays: 30}))).toBe(true);
    expect(def.unlocked(emptyCtx({longestGapDays: 29}))).toBe(false);
  });

  test('오랜 동반자: 미은퇴 신발 보유 ≥365일', () => {
    const def = achievementDef('ach_hidden_long_relationship')!;
    const old = emptyCtx({
      perShoe: {
        a: shoe({id: 'a', km: 200, maxKm: 600, firstWorn: daysAgoISO(366)}),
      },
    });
    expect(def.unlocked(old)).toBe(true);
    // 은퇴 신발은 제외.
    const retired = emptyCtx({
      perShoe: {
        a: shoe({id: 'a', km: 200, maxKm: 600, retired: true, firstWorn: daysAgoISO(400)}),
      },
    });
    expect(def.unlocked(retired)).toBe(false);
  });

  test('Rain Runner 는 카탈로그에 없다(날씨 미추적)', () => {
    expect(ACHIEVEMENTS.some(a => /rain/i.test(a.key))).toBe(false);
  });
});

/** NOW 기준 n일 전 'YYYY-MM-DD'. */
function daysAgoISO(n: number): string {
  const d = new Date(NOW - n * 86400000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
