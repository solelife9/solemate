// ============================================================================
// lib/progression/points.ts — 진척 포인트(Progress Points) (Slice A)
// ============================================================================
// rarity(RankTier) → 포인트의 **단일 권위 매핑**과, 언락된 업적들의 총합 계산.
// achievements.ts 는 이 맵에서 각 정의의 points 를 끌어오므로(중복 정의 금지),
// "Bronze 10 … Legend 1000" 라는 spec 권위 수치가 이 파일 한곳에만 존재한다.
//
// 포인트는 rank.engagement 평가축에 환산되고 화면에 표시되지만, **RPG 레벨이 아니다**
// (spec: "they are NOT an RPG level"). 그저 누적 달성의 합.
//
// PURE(iron law): 입력 불변, NaN/음수/누락 → 0, 어떤 입력에서도 throw 금지.
// ============================================================================
import {AchievementDef, RankTier} from './types';

/**
 * 희귀도(rarity)별 포인트 — spec 권위(Bronze 10 · Silver 25 · Gold 50 ·
 * Platinum 100 · Diamond 250 · Master 500 · Legend 1000).
 */
export const POINTS_BY_RARITY: Readonly<Record<RankTier, number>> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
  diamond: 250,
  master: 500,
  legend: 1000,
};

/** rarity → 포인트(미지의 티어/비정상 → 0). */
export function pointsForRarity(tier: RankTier): number {
  const p = POINTS_BY_RARITY[tier];
  return Number.isFinite(p) ? p : 0;
}

/**
 * 언락된 업적들의 포인트 총합. 입력은 **이미 언락된** 업적 정의 배열이어야 한다
 * (날조 금지 — 호출자가 unlocked 판정을 통과한 정의만 넘긴다).
 * 각 정의의 points 가 비정상이면 rarity 로부터 복구하고, 그래도 안 되면 0 으로 친다.
 * PURE: 입력 배열/요소를 변형하지 않는다.
 */
export function totalPoints(
  unlockedAchievements: readonly AchievementDef[] | null | undefined,
): number {
  if (!Array.isArray(unlockedAchievements)) return 0;
  let sum = 0;
  for (const a of unlockedAchievements) {
    if (!a || typeof a !== 'object') continue;
    const raw = Number((a as AchievementDef).points);
    const pts =
      Number.isFinite(raw) && raw > 0 ? raw : pointsForRarity((a as AchievementDef).rarity);
    if (Number.isFinite(pts) && pts > 0) sum += pts;
  }
  return sum;
}
