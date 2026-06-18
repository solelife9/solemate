// ============================================================================
// lib/progression/points.ts — 진척 포인트 헬퍼 (업데이트)
// ============================================================================
// XP 시스템 재설계 후: 각 업적이 명시적 xp 값을 보유한다. 이 모듈은 역호환 유지용으로
// 남겨 두며, 새 코드는 computeTotalXp(achievements.ts)를 직접 사용한다.
//
// POINTS_BY_RARITY: 구 시스템 값 유지(테스트/레거시 코드 참조용).
// totalPoints: def.xp 우선, 없으면 def.points 폴백, 그래도 없으면 rarity 폴백.
// ============================================================================
import {AchievementDef, AchievementRarity, RankTier} from './types';

/** 구 희귀도별 포인트(레거시 역호환). */
export const POINTS_BY_RARITY: Readonly<Record<RankTier, number>> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
  diamond: 250,
  master: 500,
  legend: 1000,
};

/** 새 희귀도(AchievementRarity) → 참고 포인트(표시용 기준치). */
export const XP_BY_RARITY: Readonly<Record<AchievementRarity, number>> = {
  common: 20,
  rare: 50,
  epic: 150,
  legendary: 400,
};

/** rarity → 포인트(구 시스템 역호환). */
export function pointsForRarity(tier: RankTier): number {
  const p = POINTS_BY_RARITY[tier];
  return Number.isFinite(p) ? p : 0;
}

/**
 * 언락된 업적들의 XP 총합. def.xp 우선, 없으면 def.points, 없으면 rarity 폴백.
 * PURE: 입력 배열/요소를 변형하지 않는다.
 * @deprecated 새 코드는 computeTotalXp(context 2-pass)를 사용한다.
 */
export function totalPoints(
  unlockedAchievements: readonly AchievementDef[] | null | undefined,
): number {
  if (!Array.isArray(unlockedAchievements)) return 0;
  let sum = 0;
  for (const a of unlockedAchievements) {
    if (!a || typeof a !== 'object') continue;
    // xp 우선(새 시스템), 없으면 points(구 시스템), 없으면 rarity 폴백
    const xp = Number((a as any).xp);
    const pts = Number((a as any).points ?? 0);
    const raw = xp > 0 ? xp : pts > 0 ? pts : pointsForRarity((a as any).rarity ?? 'bronze');
    if (Number.isFinite(raw) && raw > 0) sum += raw;
  }
  return sum;
}
