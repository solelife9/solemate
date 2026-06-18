// lib/progression/guidance — rankGuidance 파생 안내.
//
// 관찰 가능한 동작: XP 기반 RankResult로부터 다음 티어·티어 내 진행도·다음 티어 XP 하한·
// 필요 추가 XP를 정확히 파생하고, 누락/비정상/legend 경계에서 throw 없이 안전 기본값을 돌려준다.

import {rankGuidance} from '../../../lib/progression/guidance';
import {RANK_XP} from '../../../lib/progression/rank';
import {TIER_COLORS} from '../../../theme';
import {RankResult, RankTier} from '../../../lib/progression/types';

// 새 XP 기반 RankResult 빌더(computeRank 와 동일한 파생식 사용).
const TIER_ORDER: RankTier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'legend',
];

function rank(tier: RankTier, xp: number): RankResult {
  const idx = TIER_ORDER.indexOf(tier);
  const nextTier = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
  const tierStart = RANK_XP[tier];
  const tierEnd = nextTier ? RANK_XP[nextTier] : RANK_XP.legend;
  const tierSpan = tierEnd - tierStart;
  const xpForNext = nextTier ? Math.max(0, RANK_XP[nextTier] - xp) : 0;
  const progressPercent =
    tierSpan > 0
      ? Math.min(100, Math.round(((xp - tierStart) / tierSpan) * 100))
      : 100;
  return {
    xp,
    tier,
    color: TIER_COLORS[tier],
    nextTier,
    xpForNext,
    progressPercent,
    score: xp,
  };
}

describe('rankGuidance', () => {
  test('다음 티어와 티어 내 진행도(Silver 100~300 의 중간 200 → 0.5)', () => {
    const g = rankGuidance(rank('silver', 200));
    expect(g.tier).toBe('silver');
    expect(g.nextTier).toBe('gold');
    expect(g.progressToNext).toBeCloseTo(0.5, 5);
    expect(g.nextXp).toBe(RANK_XP.gold);
    expect(g.xpForNext).toBe(100); // 300 - 200
  });

  test('Bronze 하한 0 XP → 다음 Silver, 진행 0', () => {
    const g = rankGuidance(rank('bronze', 0));
    expect(g.tier).toBe('bronze');
    expect(g.nextTier).toBe('silver');
    expect(g.progressToNext).toBe(0);
    expect(g.nextXp).toBe(RANK_XP.silver);
    expect(g.xpForNext).toBe(RANK_XP.silver);
  });

  test('티어 내 진행도는 1 로 클램프(progressPercent 100 → 1)', () => {
    // Silver 상한(다음 티어 직전) → progressPercent 100 → progressToNext 1.
    const g = rankGuidance(rank('silver', RANK_XP.gold - 1));
    expect(g.tier).toBe('silver');
    expect(g.progressToNext).toBe(1);
    expect(g.xpForNext).toBe(1);
  });

  test('Legend 는 다음 티어 없음(null) · 진행 1 · 추가 XP 0', () => {
    const g = rankGuidance(rank('legend', 6000));
    expect(g.nextTier).toBeNull();
    expect(g.progressToNext).toBe(1);
    expect(g.xpForNext).toBe(0);
    expect(g.nextXp).toBe(RANK_XP.legend);
    expect(g.xp).toBe(6000);
  });

  test('실제 총 XP 를 그대로 전달', () => {
    const g = rankGuidance(rank('gold', 450));
    expect(g.xp).toBe(450);
    expect(g.nextTier).toBe('platinum');
    expect(g.nextXp).toBe(RANK_XP.platinum);
  });

  test('null 입력 → Bronze 안전 기본값, throw 없음', () => {
    const g = rankGuidance(null);
    expect(g.tier).toBe('bronze');
    expect(g.nextTier).toBeNull(); // RankResult.nextTier 부재 → null
    expect(g.xp).toBe(0);
    expect(g.progressToNext).toBe(0);
    expect(g.xpForNext).toBe(0);
    expect(g.nextXp).toBe(RANK_XP.legend); // nextTier null → legend 하한
  });

  test('undefined 입력 → Bronze 안전 기본값, throw 없음', () => {
    expect(() => rankGuidance(undefined)).not.toThrow();
    const g = rankGuidance(undefined);
    expect(g.tier).toBe('bronze');
    expect(g.xp).toBe(0);
  });

  test('비정상 수치(NaN xp/progressPercent/xpForNext) → 0 으로 안전화', () => {
    const broken = {
      xp: NaN,
      tier: 'gold',
      color: TIER_COLORS.gold,
      nextTier: 'platinum',
      xpForNext: NaN,
      progressPercent: NaN,
      score: NaN,
    } as unknown as RankResult;
    const g = rankGuidance(broken);
    expect(g.tier).toBe('gold');
    expect(g.nextTier).toBe('platinum');
    expect(g.xp).toBe(0);
    expect(g.progressToNext).toBe(0);
    expect(g.xpForNext).toBe(0);
    expect(g.nextXp).toBe(RANK_XP.platinum);
  });
});
