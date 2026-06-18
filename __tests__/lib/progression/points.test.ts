// lib/progression/points — rarity→포인트 권위(레거시) + 언락 업적 XP 총합.
//
// 관찰 가능한 동작(재설계 후):
//   · POINTS_BY_RARITY 가 구 spec 사다리(Bronze10…Legend1000)와 정확히 일치.
//   · totalPoints 가 언락 업적들의 XP(def.xp 우선)를 정확히 합산.
//   · def.xp 누락/손상 시 def.rarity 폴백으로 복구해 합산.
//   · 비정상 입력(null/비배열/손상 요소)에서 throw 없이 0/부분합.
//
// 순수 함수 — AsyncStorage 미사용.

import {
  POINTS_BY_RARITY,
  pointsForRarity,
  totalPoints,
} from '../../../lib/progression/points';
import {
  ACHIEVEMENTS,
  unlockedAchievements,
} from '../../../lib/progression/achievements';
import {
  AchievementCategory,
  AchievementDef,
  AchievementRarity,
  PerShoeStats,
  ProgressionContext,
  RankTier,
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
    name: over.id,
    km: over.km ?? 0,
    runs: over.runs ?? 0,
    firstWorn: null,
    lastWorn: null,
    retired: over.retired ?? false,
    maxKm: over.maxKm ?? 0,
  };
}

/**
 * 더미 업적 정의: XP 는 구 rarity 사다리(RankTier)에서 끌어와 totalPoints 의
 * 실제 합산 경로(def.xp 우선)를 검증한다. category/rarity 는 새 타입 계약을
 * 만족시키는 임의 유효값(합산 수치와 무관).
 */
const CAT: AchievementCategory = 'distanceMilestone';
const RAR: AchievementRarity = 'common';

function ach(tier: RankTier, key = `k_${tier}`): AchievementDef {
  return {
    key,
    name: key,
    description: key,
    category: CAT,
    rarity: RAR,
    xp: pointsForRarity(tier),
    progress: () => ({current: 1, target: 1}),
    unlocked: () => true,
  };
}

describe('POINTS_BY_RARITY 권위', () => {
  test('Bronze10 · Silver25 · Gold50 · Platinum100 · Diamond250 · Master500 · Legend1000', () => {
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

  test('pointsForRarity 가 맵과 일치', () => {
    (Object.keys(POINTS_BY_RARITY) as RankTier[]).forEach(t =>
      expect(pointsForRarity(t)).toBe(POINTS_BY_RARITY[t]),
    );
  });
});

describe('totalPoints: rarity 합산', () => {
  test('빈 목록 → 0', () => {
    expect(totalPoints([])).toBe(0);
  });

  test('rarity 별 합 = 각 포인트의 합(10+25+50+100+250+500+1000=1935)', () => {
    const all = (
      ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'legend'] as RankTier[]
    ).map(t => ach(t));
    expect(totalPoints(all)).toBe(1935);
  });

  test('중복 rarity 도 각각 합산(silver×3 = 75)', () => {
    expect(totalPoints([ach('silver', 'a'), ach('silver', 'b'), ach('silver', 'c')])).toBe(
      75,
    );
  });

  test('xp 손상(NaN)이면 레거시 points 폴백으로 복구해 합산', () => {
    const broken = {
      ...ach('gold'),
      xp: NaN as unknown as number,
      points: 50,
    } as unknown as AchievementDef;
    expect(totalPoints([broken])).toBe(50);
  });

  test('xp·points 모두 없으면 RankTier rarity 폴백으로 복구해 합산', () => {
    const broken = {
      ...ach('gold'),
      xp: 0 as unknown as number,
      rarity: 'gold' as unknown as AchievementRarity,
    } as AchievementDef;
    expect(totalPoints([broken])).toBe(50);
  });

  test('비배열/null 입력 → 0 (throw 없음)', () => {
    expect(totalPoints(null)).toBe(0);
    expect(totalPoints(undefined)).toBe(0);
    // @ts-expect-error 의도적 비정상(비배열).
    expect(totalPoints('x')).toBe(0);
  });
});

describe('totalPoints ∘ unlockedAchievements (end-to-end)', () => {
  test('빈 유저 → 언락 0개 → 0점', () => {
    expect(totalPoints(unlockedAchievements(emptyCtx()))).toBe(0);
  });

  test('첫 런(first_run, xp=10)만 언락 → 10점', () => {
    const ctx = emptyCtx({runCount: 1});
    const unlocked = unlockedAchievements(ctx);
    expect(unlocked.map(a => a.key)).toEqual(['first_run']);
    expect(totalPoints(unlocked)).toBe(10);
  });

  test('누적 1,000km(dist_1000, xp=100) 달성 시 총합이 정확히 그만큼 증가', () => {
    const before = emptyCtx({cumulativeKm: 999});
    const after = emptyCtx({cumulativeKm: 1000});
    const delta =
      totalPoints(unlockedAchievements(after)) -
      totalPoints(unlockedAchievements(before));
    expect(delta).toBe(100);
  });

  test('총합은 언락된 업적 xp 의 단순 합과 같다(불변식)', () => {
    const ctx = emptyCtx({
      runCount: 1,
      longestRunKm: 25,
      perShoe: {a: shoe({id: 'a', km: 500, maxKm: 600})},
    });
    const unlocked = unlockedAchievements(ctx);
    // 반복형(shoeMemory) 업적은 earnedCount 배수로 적립되므로 단순 def.xp 합과
    // 어긋날 수 있다 → 1회성 업적만으로 불변식을 검증한다.
    const oneShot = unlocked.filter(a => !a.repeatablePerShoe);
    expect(oneShot.length).toBeGreaterThan(0);
    const manual = oneShot.reduce((s, a) => s + a.xp, 0);
    expect(totalPoints(oneShot)).toBe(manual);
    // 카탈로그 전체 XP 합보다는 작아야(부분 언락).
    const catalogTotal = ACHIEVEMENTS.reduce((s, a) => s + a.xp, 0);
    expect(totalPoints(unlocked)).toBeLessThan(catalogTotal);
  });
});
