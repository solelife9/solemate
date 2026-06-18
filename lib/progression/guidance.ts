// ============================================================================
// lib/progression/guidance.ts — XP 기반 랭크 안내 셀렉터 (재설계)
// ============================================================================
// rank.computeRank 결과(xp·tier·nextTier·xpForNext·progressPercent)만 읽어
// 화면에 바로 그릴 수 있는 안내 뷰를 만든다.
// 구 3축 필러(pillars) 시스템 → XP 기반 단일 지표로 대체.
//
// PURE/방어적: 입력 불변, 누락/비정상 → 안전 기본값, throw 금지.
// ============================================================================
import {RANK_XP} from './rank';
import {RankResult, RankTier} from './types';

/** XP 기반 랭크 안내 뷰. */
export interface RankGuidance {
  tier: RankTier;
  nextTier: RankTier | null;
  /** 현재 티어 내 진행도(0..1). legend → 1. */
  progressToNext: number;
  /** 현재 총 XP. */
  xp: number;
  /** 다음 티어 XP 하한. legend면 5000. */
  nextXp: number;
  /** 다음 티어까지 필요한 추가 XP. legend면 0. */
  xpForNext: number;
}

/**
 * 랭크 결과 → 안내 뷰.
 * PURE: 입력 불변, throw 금지.
 */
export function rankGuidance(rank: RankResult | null | undefined): RankGuidance {
  const tier: RankTier = rank && typeof rank.tier === 'string' ? rank.tier : 'bronze';
  const xp = rank && Number.isFinite(rank.xp) ? rank.xp : 0;
  const nextTier = rank?.nextTier ?? null;
  const progressPercent = rank && Number.isFinite(rank.progressPercent) ? rank.progressPercent : 0;
  const progressToNext = Math.min(1, progressPercent / 100);
  const nextXp = nextTier ? RANK_XP[nextTier] : RANK_XP.legend;
  const xpForNext = rank && Number.isFinite(rank.xpForNext) ? rank.xpForNext : 0;

  return {tier, nextTier, progressToNext, xp, nextXp, xpForNext};
}
