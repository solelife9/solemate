// ─── lib/shoeSpecModel.ts — 카탈로그 → 비교용 스펙 (순수) ───────────────────────
//
// 쿠션·반발·안정(1~5)은 **실측이 아니라 keego 분류**다. 실험실 계측 데이터는 유료
// 라이선스 자산이라 무단으로 쓸 수 없고, 브랜드 공식 스펙에는 애초에 그런 수치가 없다.
// 그래서 우리가 이미 가진 사실 — 카테고리(설계 의도) — 에서 규칙으로 산정한다.
//
// 이게 정직한 이유: 카테고리는 제조사가 그 신발을 무엇으로 만들었는지를 담은 사실이다.
// '쿠션화'는 두꺼운 폼으로 충격 흡수를 노린 신발이고, '카본 레이싱'은 반발을 위해
// 안정성을 포기한 신발이다. 그 설계 의도를 축으로 옮기는 건 추측이 아니라 분류다.
//
// **화면은 반드시 'keego 분류'라고 밝혀야 한다**(SPEC_BASIS_KO). 실측인 척하면
// Truth only 위반이다. 나중에 실측 데이터를 정식으로 확보하면 이 모듈만 갈아끼운다.

import {ShoeCategory, findShoeModel, getRecommendedLifespanKm} from '../data/shoeModels';
import type {ShoeSpec} from './shoeCompare';

/** 축의 근거를 화면에 밝히는 문구(실측이 아님을 숨기지 않는다). */
export const SPEC_BASIS_KO = 'keego 분류 — 신발 카테고리 기준이에요';

/**
 * 카테고리별 축 기준값(1~5). 제조사가 그 카테고리를 만든 설계 의도를 옮긴 값이다.
 *  · max_cushion   두꺼운 폼 = 푹신함 최대, 대신 발이 높이 떠서 안정·반발은 낮다.
 *  · stability     지지 구조 우선 = 안정 최대, 쿠션은 중간, 반발은 낮다.
 *  · carbon_racing 반발 최대(카본 플레이트 + PEBA 폼), 안정은 가장 낮다.
 *  · super_trainer 반발·쿠션 둘 다 높은 절충(템포 훈련용).
 *  · daily_trainer 모든 축의 기준점(3).
 *  · trail         노면 대응 위해 안정이 높고 나머지는 중간.
 */
const CATEGORY_AXES: Record<ShoeCategory, {cushion: number; responsiveness: number; stability: number}> = {
  daily_trainer: {cushion: 3, responsiveness: 3, stability: 3},
  max_cushion: {cushion: 5, responsiveness: 2, stability: 2},
  stability: {cushion: 3, responsiveness: 2, stability: 5},
  super_trainer: {cushion: 4, responsiveness: 4, stability: 2},
  carbon_racing: {cushion: 3, responsiveness: 5, stability: 1},
  trail: {cushion: 3, responsiveness: 3, stability: 4},
};

/** 1~5 범위로 자른다(규칙이 어떤 조합에서도 범위를 벗어나지 않게). */
function clamp5(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * 무게로 반발 축을 한 칸 보정한다 — 가벼운 신발은 같은 카테고리 안에서도 경쾌하다.
 * 무게를 모르면 보정하지 않는다(모르는 걸로 추측하지 않는다).
 *
 * 기준: 240g 이하 = 경량(+1), 300g 이상 = 중량(-1). 남성 270mm 기준 통용 구간.
 */
function weightAdjust(responsiveness: number, weightG?: number): number {
  if (typeof weightG !== 'number' || !Number.isFinite(weightG) || weightG <= 0) {
    return responsiveness;
  }
  if (weightG <= 240) return clamp5(responsiveness + 1);
  if (weightG >= 300) return clamp5(responsiveness - 1);
  return responsiveness;
}

/** 브랜드·모델별로 확인된 공식 스펙(무게/드롭). 눈으로 확인한 것만 넣는다 — 추측 금지. */
export interface OfficialSpec {
  weightG?: number;
  dropMm?: number;
}

/**
 * 카탈로그 + (있으면) 공식 스펙 → 비교용 ShoeSpec.
 *
 * 카테고리를 못 찾으면 daily_trainer 로 본다(권장수명 로직과 같은 폴백). 무게·드롭은
 * 확인된 값이 있을 때만 싣는다 — 없으면 그 축은 비교에서 조용히 빠진다.
 */
export function buildShoeSpec(
  brand: string,
  model: string,
  official?: OfficialSpec,
): ShoeSpec {
  const matched = findShoeModel(brand, model);
  const category: ShoeCategory = matched?.category ?? 'daily_trainer';
  const axes = CATEGORY_AXES[category];
  const weightG = typeof official?.weightG === 'number' && official.weightG > 0
    ? official.weightG
    : undefined;
  const dropMm = typeof official?.dropMm === 'number' && official.dropMm >= 0
    ? official.dropMm
    : undefined;

  return {
    brand: matched?.brand ?? brand,
    model: matched?.model ?? model,
    lifespanKm: getRecommendedLifespanKm({brand, model}),
    cushion: clamp5(axes.cushion),
    responsiveness: weightAdjust(clamp5(axes.responsiveness), weightG),
    stability: clamp5(axes.stability),
    ...(weightG !== undefined ? {weightG} : {}),
    ...(dropMm !== undefined ? {dropMm} : {}),
  };
}

/** 카테고리 축 기준값 조회(테스트·디버그용). */
export function categoryAxes(category: ShoeCategory) {
  return {...CATEGORY_AXES[category]};
}
