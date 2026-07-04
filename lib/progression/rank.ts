// ============================================================================
// lib/progression/rank.ts — XP 기반 랭크 엔진 (재설계)
// ============================================================================
// 랭크 = 총 획득 XP(업적 합산). 계단식 7단계 티어.
//
//   bronze   0 XP ~ silver  100 XP ~ gold    400 XP ~ platinum  700 XP
//   diamond  2,000 XP ~ master  3,000 XP ~ legend  5,000 XP
//
// 임계는 주 30km 페르소나의 서사적 순간에 정렬(2026-07-04 XP 감사): 실버=첫 주,
// 골드=첫 신발 반환점(~2.5개월), 플래티넘=하프마라톤(~4개월), 다이아=1주년(1년의
// 리듬+킵고잉 1년, w52), 마스터=5켤레 은퇴(~2년), 레전드=명예의 전당(10켤레, ~3.75년).
//
// 총 최대 XP ≈ 6,410(마라톤 + 10켤레 은퇴·동행 + 모든 experience 포함, 10켤레 기준).
// PURE: 입력 불변, NaN/음수/누락 → 0, throw 금지.
// ============================================================================
import {TIER_COLORS} from '../../theme';
import {ProgressionContext, RankResult, RankTier} from './types';

/** 티어별 XP 하한(bronze 기준점). */
export const RANK_XP: Readonly<Record<RankTier, number>> = {
  bronze: 0,
  silver: 100,
  gold: 400,
  platinum: 700,
  diamond: 2000,
  master: 3000,
  legend: 5000,
};

const TIER_ORDER: readonly RankTier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'legend',
];

/** XP → 티어(최고 달성 티어 반환). */
export function tierForXp(xp: number): RankTier {
  const safe = Number.isFinite(xp) && xp > 0 ? xp : 0;
  for (let i = TIER_ORDER.length - 1; i >= 0; i--) {
    if (safe >= RANK_XP[TIER_ORDER[i]]) return TIER_ORDER[i];
  }
  return 'bronze';
}

/** 티어 → 색(theme.TIER_COLORS). */
export function colorForTier(tier: RankTier): string {
  return TIER_COLORS[tier];
}

/**
 * XP 기반 합성 랭크. ctx.achievementPoints 를 총 XP 로 사용.
 * PURE·방어적: 어떤 입력에서도 throw 금지.
 */
export function computeRank(ctx: ProgressionContext): RankResult {
  const xp = Math.max(
    0,
    Number.isFinite(ctx?.achievementPoints) ? (ctx.achievementPoints as number) : 0,
  );
  const tier = tierForXp(xp);
  const color = TIER_COLORS[tier];

  const tierIdx = TIER_ORDER.indexOf(tier);
  const nextTier: RankTier | null =
    tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;

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
    color,
    nextTier,
    xpForNext,
    progressPercent,
    score: xp, // backward-compat
  };
}
