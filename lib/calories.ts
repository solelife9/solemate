// ─── 러닝 칼로리 추정 (순수 함수) ──────────────────────────────────────────────
// 러닝 소모 칼로리의 표준 1차 근사: kcal ≈ 체중(kg) × 거리(km) × 1.036.
// (속도·경사 무관한 가이드 값 — 정밀 측정이 아니라 '대략 이만큼 태웠다'는 동기 지표.)
// 체중은 설정(lib/settings)에서 받으며, 누락/비정상 시 기본 체중으로 폴백한다.

import {DEFAULT_WEIGHT_KG} from './settings';

/** km당 체중 1kg 소모 계수(러닝). */
export const KCAL_PER_KG_PER_KM = 1.036;

/**
 * 거리(km) + 체중(kg) → 추정 소모 칼로리(kcal, 정수).
 * 거리/체중이 비정상이면 0(거리) 또는 기본 체중으로 안전 폴백한다.
 */
export function estimateCalories(distanceKm: number, weightKg: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const w = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  return Math.round(w * distanceKm * KCAL_PER_KG_PER_KM);
}
