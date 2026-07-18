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

/** 안정 대사율(1 MET ≈ kcal/kg/시). 러닝 시간 동안 '가만히 있어도 태울' 기초 소모. */
export const REST_KCAL_PER_KG_PER_HR = 1.05;

/**
 * 순수 활동 계수(net, kcal/kg/km) — 안정 대사를 **뺀** 러닝 자체의 소모.
 * 1.036 은 안정 대사가 이미 포함된 총(gross) 계수라(ACSM: net ≈ 0.86~0.9),
 * 총합 공식에서 1.036 + 안정 대사를 쓰면 기초 소모가 이중 계산된다 — 실측 비교런
 * (2026-07-17, Garmin 대비 +18%)의 근본 원인. 0.88 = ACSM net 범위 중앙값이자
 * 실측 격차(1.036/1.18 ≈ 0.878)와 일치하는 캘리브레이션 값.
 */
export const KCAL_NET_PER_KG_PER_KM = 0.88;

/**
 * 총 소모 칼로리(kcal) = 활동(net·거리 기반) + 안정 대사(시간 기반). Garmin·Apple
 * '총 칼로리'와 같은 총량 정의라 경쟁앱과 눈높이가 맞는다. 활동분은 net 계수(위 주석 —
 * gross 1.036 을 쓰면 안정 대사 이중 계산으로 +18% 과대). 심박·워치 없이 폰만으로도
 * 동작한다(거리·시간·체중만 필요). durationS 누락/0이면 활동분만.
 */
export function estimateCaloriesTotal(distanceKm: number, durationS: number, weightKg: number): number {
  const w = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  const active = Number.isFinite(distanceKm) && distanceKm > 0 ? w * distanceKm * KCAL_NET_PER_KG_PER_KM : 0;
  const hours = Number.isFinite(durationS) && durationS > 0 ? durationS / 3600 : 0;
  const resting = w * hours * REST_KCAL_PER_KG_PER_HR;
  return Math.round(active + resting);
}
