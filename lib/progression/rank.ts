// ============================================================================
// lib/progression/rank.ts — 업적 기반 3축 연속 랭크 엔진 (재설계)
// ============================================================================
// 랭크는 **업적 진행률**의 가중합이다(이중 계산 없음·투명). 3축:
//   · 거리(running)        가중 0.35
//   · 꾸준함(consistency)  가중 0.30
//   · 신발관리(shoeManagement) 가중 0.35
// 각 축 = achievements.axisProgress(ctx) (그 축 업적들의 진행률 가중합, 0..1, 연속).
// 업적을 다 안 깨도 달린 만큼 매끄럽게 오른다(계단 아님).
//
//   score = 100 × (0.35·거리 + 0.30·꾸준함 + 0.35·신발관리)
//
// 티어 컷오프(3축 보정): 한 축 마스터(≈0.35)=골드, 두 축 강함=플래티넘, 세 축 고루=다이아,
// 세 축 강함=마스터, 세 축 거의 만점=레전드. 거리만으론 골드가 천장(다차원 철학 유지).
//
// 신규(3.5km) → 업적 진행률 거의 0 → 브론즈. 공짜 점수 없음.
// PURE: 입력 불변, NaN/음수/누락 → 0, throw 금지. achievements.ts 만 의존(순환 없음).
// ============================================================================
import {TIER_COLORS} from '../../theme';
import {axisProgress, RankAxisKey} from './achievements';
import {PillarScores, ProgressionContext, RankResult, RankTier} from './types';

/** 축 가중치(합 1.0). PillarScores 키(3축)와 일치. */
export const WEIGHTS: Readonly<Record<keyof PillarScores, number>> = {
  running: 0.35,
  consistency: 0.3,
  shoeManagement: 0.35,
};

/**
 * 티어 컷오프(점수 하한, 높은 티어부터). 3축 모델 보정:
 * Bronze<15 · Silver 15–32 · Gold 33–54 · Platinum 55–71 · Diamond 72–85 ·
 * Master 86–94 · Legend ≥95. 첫 매칭(점수 ≥ 하한)이 그 티어.
 */
export const TIER_CUTOFFS: ReadonlyArray<readonly [number, RankTier]> = [
  [95, 'legend'],
  [86, 'master'],
  [72, 'diamond'],
  [55, 'platinum'],
  [33, 'gold'],
  [15, 'silver'],
  [0, 'bronze'],
];

function clampScore(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 100 ? 100 : n;
}
function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}

/** 점수(0..100) → 티어. */
export function tierForScore(score: number): RankTier {
  const s = clampScore(score);
  for (const [cut, tier] of TIER_CUTOFFS) {
    if (s >= cut) return tier;
  }
  return 'bronze';
}

/** 티어 → 색(theme.TIER_COLORS). */
export function colorForTier(tier: RankTier): string {
  return TIER_COLORS[tier];
}

/** 축 진행도(각 0..1) → 0..100 가중 점수. */
function scoreFromPillars(p: PillarScores): number {
  const raw =
    100 *
    (WEIGHTS.running * clamp01(p.running) +
      WEIGHTS.consistency * clamp01(p.consistency) +
      WEIGHTS.shoeManagement * clamp01(p.shoeManagement));
  return clampScore(raw);
}

function zeroPillars(): PillarScores {
  return {running: 0, consistency: 0, shoeManagement: 0};
}

/**
 * 업적 기반 합성 랭크. 빈/비정상 컨텍스트 → score 0, Bronze, 축 0.
 * PURE·방어적: 어떤 입력에서도 throw 금지.
 */
export function computeRank(ctx: ProgressionContext): RankResult {
  if (!ctx || typeof ctx !== 'object') {
    return {score: 0, tier: 'bronze', color: TIER_COLORS.bronze, pillars: zeroPillars()};
  }
  const ax: Record<RankAxisKey, number> = axisProgress(ctx);
  const pillars: PillarScores = {
    running: clamp01(ax.running),
    consistency: clamp01(ax.consistency),
    shoeManagement: clamp01(ax.shoeManagement),
  };
  const score = scoreFromPillars(pillars);
  const tier = tierForScore(score);
  return {score, tier, color: TIER_COLORS[tier], pillars};
}
