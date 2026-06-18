// lib/progression/achievements — 업적 카탈로그(라이브 진행 + 정직 언락).
//
// 관찰 가능한 동작(behavioral):
//   · progress(ctx) 의 current/target 이 실제 데이터와 일치한다(예: 누적 거리 640/1000km).
//   · 진행이 target 에 닿는 순간이 정확히 언락 순간(진행바·언락 모순 불가).
//   · 미충족 업적은 절대 unlocked 를 보고하지 않는다(anti-scenario 1 — 날조 금지).
//   · 6개 카테고리를 모두 커버한다.
//   · 빈/비정상 컨텍스트 → 아무 업적도 언락 안 함, throw 없음.
//   · 업적 XP(반복형 포함)가 카탈로그 정의와 일치한다.
//
// 순수 엔진(ctx 만 읽음)이라 AsyncStorage 를 쓰지 않는다 — 키 격리 자명.

import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_KEY,
  achievementDef,
  achievementProgress,
  computeTotalXp,
  earnedXpFor,
  evaluateAchievements,
  unlockedAchievements,
} from '../../../lib/progression/achievements';
import {
  AchievementCategory,
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
// 1) progress current/target — 실제 데이터와 정합
// ============================================================================
describe('progress current/target', () => {
  test('누적 거리 진행: 1000km 가 실제 누적과 일치', () => {
    const ctx = emptyCtx({cumulativeKm: 640});
    expect(progressOf('dist_1000', ctx)).toEqual({
      current: 640,
      target: 1000,
    });
  });

  test('누적 거리 진행: 5000km 도달 → 언락 + current=target(초과 캡)', () => {
    const at = emptyCtx({cumulativeKm: 5200});
    expect(progressOf('dist_5000', at)).toEqual({current: 5000, target: 5000});
    expect(achievementDef('dist_5000')!.unlocked(at)).toBe(true);
  });

  test('누적 거리 진행: 100km 가 실제 누적과 일치', () => {
    expect(progressOf('dist_100', emptyCtx({cumulativeKm: 73}))).toEqual({
      current: 73,
      target: 100,
    });
  });
});

// ============================================================================
// 2) 진행이 target 에 닿는 순간 = 언락 순간(경계 일관성)
// ============================================================================
describe('진행·언락 경계 일관성', () => {
  test('마라톤 완주: 42.195km 경계', () => {
    const def = achievementDef('first_marathon')!;
    expect(def.unlocked(emptyCtx({longestRunKm: 42.195}))).toBe(true);
    expect(def.unlocked(emptyCtx({longestRunKm: 42.19}))).toBe(false);
    // 미달 진행은 current<target.
    const p = progressOf('first_marathon', emptyCtx({longestRunKm: 40}));
    expect(p.current).toBeCloseTo(40);
    expect(p.target).toBeCloseTo(42.195);
  });

  test('모든 metric 업적: unlocked ⟺ progress.current ≥ target', () => {
    // 충분히 큰 사실로 모두 채운 컨텍스트 — 닿은 업적은 모두 언락이어야.
    // (반복형 shoeMemory 업적은 target=신발수로 동작이 달라 별도 검증; 여기선 제외.)
    const rich = emptyCtx({
      runCount: 500,
      cumulativeKm: 9000,
      longestRunKm: 50,
      longestStreak: 200,
      weeklyActiveRatio: 1,
      registeredShoeCount: 12,
      bestPaceSec: 250,
      earlyRunCount: 30,
      nightRunCount: 30,
      hasWinterRun: true,
      hasSummerRun: true,
      completedChallengeCount: 20,
      retirementCount: 12,
      perShoe: perShoeMap(
        shoe({id: 'a', km: 1200, maxKm: 1500, runs: 100}),
        shoe({id: 'b', km: 1100, maxKm: 1500, runs: 90}),
        shoe({id: 'c', km: 1000, maxKm: 1500, runs: 80}),
        shoe({id: 'd', km: 900, maxKm: 1500, runs: 70}),
        shoe({id: 'e', km: 800, maxKm: 1500, runs: 60}),
      ),
    });
    for (const def of ACHIEVEMENTS) {
      if (def.repeatablePerShoe) continue;
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

  test('≥42km 런 없는 유저는 마라톤 완주를 절대 보고하지 않는다', () => {
    const ctx = emptyCtx({runCount: 300, cumulativeKm: 4000, longestRunKm: 30});
    expect(evaluateAchievements(ctx)).not.toContain('first_marathon');
  });

  test('각 업적: 진행이 target 미만이면 unlocked=false (개별)', () => {
    // 누적 거리만 약간 미달(499 < 500) → dist_500 언락 금지.
    const ctx = emptyCtx({cumulativeKm: 499});
    expect(achievementDef('dist_500')!.unlocked(ctx)).toBe(false);
    expect(evaluateAchievements(ctx)).not.toContain('dist_500');
  });

  test('shoeMemory(함께 500km): 모든 신발 미달이면 미언락, 도달 신발 있으면 언락', () => {
    const def = achievementDef('together_500')!;
    // 가장 먼 신발도 499km → 미언락, 진행은 best/threshold.
    const below = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}),
        shoe({id: 'b', km: 499, maxKm: 600}),
      ),
    });
    expect(def.unlocked(below)).toBe(false);
    expect(progressOf('together_500', below)).toEqual({current: 499, target: 500});

    // 한 켤레라도 500km 이상이면 언락.
    const reached = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}),
        shoe({id: 'b', km: 500, maxKm: 600}),
      ),
    });
    expect(def.unlocked(reached)).toBe(true);
  });

  test('shoeMemory 반복 적립: earnedCount = 임계 충족 신발 수', () => {
    const def = achievementDef('together_100')!;
    const ctx = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 120}),
        shoe({id: 'b', km: 300}),
        shoe({id: 'c', km: 50}), // 100km 미달
      ),
    });
    expect(def.repeatablePerShoe).toBe(true);
    expect(def.earnedCount!(ctx)).toBe(2);
    // 적립 XP = xp × earnedCount.
    expect(earnedXpFor(def, ctx)).toBe(def.xp * 2);
    // 진행 바는 충족 신발 수.
    expect(progressOf('together_100', ctx)).toEqual({current: 2, target: 2});
  });

  test('나이트 런: 야간 런 ≥1 에서만 언락', () => {
    const def = achievementDef('night_run')!;
    expect(def.unlocked(emptyCtx({nightRunCount: 1}))).toBe(true);
    expect(def.unlocked(emptyCtx({nightRunCount: 0}))).toBe(false);
  });

  test('일출 런: 새벽 런 ≥1 에서만 언락', () => {
    const def = achievementDef('sunrise_run')!;
    expect(def.unlocked(emptyCtx({earlyRunCount: 1}))).toBe(true);
    expect(def.unlocked(emptyCtx({earlyRunCount: 0}))).toBe(false);
  });

  test('계절 런: 겨울/여름 플래그가 정확히 언락을 좌우', () => {
    expect(achievementDef('winter_run')!.unlocked(emptyCtx({hasWinterRun: true}))).toBe(true);
    expect(achievementDef('winter_run')!.unlocked(emptyCtx({hasWinterRun: false}))).toBe(false);
    expect(achievementDef('summer_run')!.unlocked(emptyCtx({hasSummerRun: true}))).toBe(true);
    expect(achievementDef('summer_run')!.unlocked(emptyCtx({hasSummerRun: false}))).toBe(false);
  });

  test('데이터 없는 경험 업적(트레일·빗속)은 항상 잠금', () => {
    const rich = emptyCtx({
      cumulativeKm: 99999,
      longestRunKm: 99,
      earlyRunCount: 99,
      nightRunCount: 99,
      hasWinterRun: true,
      hasSummerRun: true,
    });
    expect(achievementDef('trail_run')!.unlocked(rich)).toBe(false);
    expect(achievementDef('rain_run')!.unlocked(rich)).toBe(false);
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
// 4) XP — 카탈로그 정의 일치 + 총합(2-pass)
// ============================================================================
describe('업적 XP 정합', () => {
  test('단발 업적: 언락 시 정확히 def.xp 적립, 미언락이면 0', () => {
    const def = achievementDef('first_marathon')!;
    expect(earnedXpFor(def, emptyCtx({longestRunKm: 42.195}))).toBe(def.xp);
    expect(earnedXpFor(def, emptyCtx({longestRunKm: 10}))).toBe(0);
  });

  test('computeTotalXp = 언락 업적 XP 합(반복형은 신발수 배수)', () => {
    const ctx = emptyCtx({
      cumulativeKm: 120,
      longestRunKm: 6,
      runCount: 3,
      registeredShoeCount: 1,
      perShoe: perShoeMap(shoe({id: 'a', km: 120})),
    });
    // 직접 합산과 일치해야 한다(권위 단일).
    const manual = ACHIEVEMENTS.reduce((s, d) => s + earnedXpFor(d, ctx), 0);
    expect(computeTotalXp(ctx)).toBe(manual);
    expect(manual).toBeGreaterThan(0);
  });

  test('빈/비정상 컨텍스트의 총 XP 는 0', () => {
    expect(computeTotalXp(emptyCtx())).toBe(0);
    // @ts-expect-error 의도적 비정상 입력.
    expect(computeTotalXp(null)).toBe(0);
  });

  test('모든 업적의 xp 는 양의 유한값', () => {
    for (const def of ACHIEVEMENTS) {
      expect(Number.isFinite(def.xp)).toBe(true);
      expect(def.xp).toBeGreaterThan(0);
    }
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

  test('6개 카테고리를 모두 커버한다', () => {
    const cats = new Set(ACHIEVEMENTS.map(a => a.category));
    (
      [
        'runningMilestone',
        'distanceMilestone',
        'shoeJourney',
        'shoeMemory',
        'experience',
        'keego',
      ] as AchievementCategory[]
    ).forEach(c => expect(cats.has(c)).toBe(true));
  });

  test('모든 rarity 는 신규 4단계 집합에 속한다', () => {
    const allowed = new Set(['common', 'rare', 'epic', 'legendary']);
    for (const def of ACHIEVEMENTS) {
      expect(allowed.has(def.rarity)).toBe(true);
    }
  });

  test('반복형 업적은 earnedCount 를 제공한다(계약 보장)', () => {
    for (const def of ACHIEVEMENTS) {
      if (def.repeatablePerShoe) {
        expect(typeof def.earnedCount).toBe('function');
      }
    }
  });

  test('마라톤 완주가 카탈로그에 존재한다(단일 런 이정표·legendary)', () => {
    const def = achievementDef('first_marathon');
    expect(def?.name).toBe('마라톤 완주');
    expect(def?.category).toBe('runningMilestone');
    expect(def?.rarity).toBe('legendary');
  });
});

// ============================================================================
// 6) keego — 오랜 동반자(여정 일수 기반)
// ============================================================================
describe('keego: 오랜 동반자', () => {
  test('한 켤레와 ≥365일 동행하면 언락, 미만이면 미언락', () => {
    const def = achievementDef('longtime_partner')!;
    const old = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 200, maxKm: 600, firstWorn: daysAgoISO(366)}),
      ),
    });
    expect(def.unlocked(old)).toBe(true);

    const young = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 200, maxKm: 600, firstWorn: daysAgoISO(300)}),
      ),
    });
    expect(def.unlocked(young)).toBe(false);
  });

  test('진행 바는 일수/365 로 캡된다', () => {
    const def = achievementDef('longtime_partner')!;
    const ctx = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 200, firstWorn: daysAgoISO(100)}),
      ),
    });
    const p = achievementProgress(def, ctx);
    expect(p.target).toBe(365);
    expect(p.current).toBeCloseTo(100, 0);
    expect(p.current).toBeLessThan(p.target);
  });
});

/** NOW 기준 n일 전 'YYYY-MM-DD'. */
function daysAgoISO(n: number): string {
  const d = new Date(NOW - n * 86400000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
