// lib/progression/points — rarity→포인트 권위 + 언락 업적 총합.
//
// 관찰 가능한 동작:
//   · POINTS_BY_RARITY 가 spec 사다리(Bronze10…Legend1000)와 정확히 일치.
//   · totalPoints 가 언락 업적들의 포인트를 rarity 기준으로 정확히 합산.
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
  AchievementDef,
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

/** rarity 로 더미 업적 정의(points 는 권위에서). */
function ach(rarity: RankTier, key = `k_${rarity}`): AchievementDef {
  return {
    key,
    name: key,
    category: 'running',
    rarity,
    points: pointsForRarity(rarity),
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

  test('points 손상(NaN/0)이면 rarity 로 복구해 합산', () => {
    const broken: AchievementDef = {...ach('gold'), points: NaN as unknown as number};
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

  test('첫 런(First Steps, bronze=10)만 언락 → 10점', () => {
    const ctx = emptyCtx({runCount: 1});
    const unlocked = unlockedAchievements(ctx);
    expect(unlocked.map(a => a.key)).toEqual(['ach_first_run']);
    expect(totalPoints(unlocked)).toBe(10);
  });

  test('Trusted Partner(gold=50) 달성 시 총합이 정확히 그만큼 증가', () => {
    const before = emptyCtx({
      perShoe: {a: shoe({id: 'a', km: 499, maxKm: 600})},
    });
    const after = emptyCtx({
      perShoe: {a: shoe({id: 'a', km: 500, maxKm: 600})},
    });
    const delta =
      totalPoints(unlockedAchievements(after)) -
      totalPoints(unlockedAchievements(before));
    expect(delta).toBe(50);
  });

  test('총합은 언락된 업적 points 의 단순 합과 같다(불변식)', () => {
    const ctx = emptyCtx({
      runCount: 1,
      longestRunKm: 25,
      perShoe: {a: shoe({id: 'a', km: 500, maxKm: 600})},
    });
    const unlocked = unlockedAchievements(ctx);
    const manual = unlocked.reduce((s, a) => s + a.points, 0);
    expect(totalPoints(unlocked)).toBe(manual);
    // 카탈로그 전체 합보다는 작아야(부분 언락).
    const catalogTotal = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
    expect(totalPoints(unlocked)).toBeLessThan(catalogTotal);
  });
});
