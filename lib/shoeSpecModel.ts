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
import specsData from '../data/shoeSpecs.json';

/**
 * 축의 근거를 화면에 밝히는 문구.
 *
 * ⚠️ "브랜드 데이터"라고 뭉뚱그리면 안 된다(2026-07-28 검토) — 축마다 근거가 다르다.
 * 무게는 브랜드 공표 스펙이지만, 쿠션은 브랜드가 공표한 **스택 수치를 우리가 1~5로
 * 등급화**한 것이고, 반발·안정은 카테고리에서 파생한 우리 판단이다. 브랜드는 "이 신발
 * 쿠션 4단계"라고 말한 적이 없다. 그렇게 적으면 출처 허위 표시가 된다.
 *
 * 대신 축마다 **실제 근거를 숫자로** 밝힌다(basisOf). 뭉뚱그린 라벨보다 숫자가 강하다.
 */
export const SPEC_BASIS_KO = '쿠션·반발·안정은 스펙과 신발 종류로 keego가 매긴 등급이에요';

/** 축별 근거 문구 — 그 값이 어디서 왔는지 한 줄로. */
export function basisOf(spec: {weightG?: number; stackHeelMm?: number}) {
  return {
    weight: spec.weightG !== undefined ? '브랜드 공식 스펙' : '',
    cushion: spec.stackHeelMm !== undefined ? `스택 ${spec.stackHeelMm}mm 기준` : '신발 종류 기준',
    others: '신발 종류 기준',
  };
}

/**
 * 드롭 차이 경고 — 갑자기 낮은 드롭으로 넘어가면 아킬레스건·종아리 부하가 급증한다.
 * 러너가 신발 바꾸고 다치는 흔한 경로라, 미션(부상 없이) 상 반드시 말해야 한다.
 *
 * 4mm 이상 낮아질 때만 경고한다(그 미만은 적응 범위). 높아지는 쪽은 부상 위험이 낮아
 * 경고하지 않는다.
 */
export function dropWarningKo(prevDropMm?: number, nextDropMm?: number): string {
  if (typeof prevDropMm !== 'number' || typeof nextDropMm !== 'number') return '';
  if (!Number.isFinite(prevDropMm) || !Number.isFinite(nextDropMm)) return '';
  const diff = prevDropMm - nextDropMm;
  if (diff < 4) return '';
  return `지난 신발보다 드롭이 ${Math.round(diff)}mm 낮아요 — 아킬레스건과 종아리에 부담이 늘어요. 처음 2주는 짧게 신어보세요.`;
}

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

/**
 * 브랜드·모델별로 **확인된** 공식 스펙. 눈으로 확인한 것만 넣는다 — 추측 금지.
 * 전부 제조사가 공표하는 사실이라 출처를 댈 수 있다.
 */
export interface OfficialSpec {
  /** 무게(g). 남성 US9/270mm 기준이 관례. */
  weightG?: number;
  /** 힐 스택 높이(mm) — 밑창 두께. 쿠션 산정의 실제 근거. */
  stackHeelMm?: number;
  /** 드롭(mm). */
  dropMm?: number;
}

/**
 * 힐 스택 높이(mm) → 쿠션 1~5.
 *
 * 카테고리 산정은 같은 카테고리 안에서 전부 같은 값이라 비교가 안 된다. 스택은 모델마다
 * 다른 실제 수치라, 같은 슈퍼트레이너끼리도 39mm와 33mm가 구분된다.
 *
 * 한계를 정직하게 적어두면: 스택은 '두께'지 '물렁함'이 아니다. 40mm 단단한 폼이 33mm
 * 말랑한 폼보다 덜 푹신할 수 있다. 그래도 공개된 사실 중에서는 가장 나은 근거이고,
 * 화면이 'keego 분류'라고 밝히므로 실측인 척하지 않는다.
 *
 * 구간은 현행 러닝화 스택 분포를 따른다(레이싱 플랫 ~20mm · 데일리 30~38mm ·
 * 맥스쿠션 40mm+, 2026 기준).
 */
export function cushionFromStack(stackHeelMm: number): number {
  if (!Number.isFinite(stackHeelMm) || stackHeelMm <= 0) return 3;
  if (stackHeelMm < 28) return 1;
  if (stackHeelMm < 33) return 2;
  if (stackHeelMm < 37) return 3;
  if (stackHeelMm < 41) return 4;
  return 5;
}

/**
 * 확인된 공식 스펙 표(data/shoeSpecs.json). 키는 'brand|model'.
 * 여기 없는 모델은 스펙을 모르는 것이고, 모르면 그 축은 비교에서 빠진다.
 */
const OFFICIAL_SPECS: Readonly<Record<string, OfficialSpec>> =
  (specsData as {specs?: Record<string, OfficialSpec>}).specs ?? {};

/** 확인된 스펙을 조회한다(없으면 undefined). 카탈로그 표기와 정확히 일치해야 잡힌다. */
export function lookupOfficialSpec(brand: string, model: string): OfficialSpec | undefined {
  return OFFICIAL_SPECS[`${brand}|${model}`];
}

/** 스펙 표에 실린 모델 수(커버리지 리포트·테스트용). */
export function officialSpecCount(): number {
  return Object.keys(OFFICIAL_SPECS).length;
}

/**
 * 카탈로그 + (있으면) 공식 스펙 → 비교용 ShoeSpec.
 *
 * 카테고리를 못 찾으면 daily_trainer 로 본다(권장수명 로직과 같은 폴백). 무게·드롭·스택은
 * 확인된 값이 있을 때만 싣는다 — 없으면 그 축은 비교에서 조용히 빠진다.
 *
 * official 인자를 주면 표보다 우선한다(테스트·호출부 주입용).
 */
export function buildShoeSpec(
  brand: string,
  model: string,
  officialArg?: OfficialSpec,
): ShoeSpec {
  const official = officialArg ?? lookupOfficialSpec(brand, model);
  const matched = findShoeModel(brand, model);
  const category: ShoeCategory = matched?.category ?? 'daily_trainer';
  const axes = CATEGORY_AXES[category];
  const weightG = typeof official?.weightG === 'number' && official.weightG > 0
    ? official.weightG
    : undefined;
  const dropMm = typeof official?.dropMm === 'number' && official.dropMm >= 0
    ? official.dropMm
    : undefined;
  const stackHeelMm = typeof official?.stackHeelMm === 'number' && official.stackHeelMm > 0
    ? official.stackHeelMm
    : undefined;

  // 쿠션: 스택을 알면 그 실제 수치로, 모르면 카테고리 기준값으로. 스택이 있어야 같은
  // 카테고리 안에서도 모델끼리 구분된다(카테고리 산정만으로는 전부 같은 값이라 비교 불가).
  const cushion = stackHeelMm !== undefined
    ? cushionFromStack(stackHeelMm)
    : clamp5(axes.cushion);

  return {
    brand: matched?.brand ?? brand,
    model: matched?.model ?? model,
    lifespanKm: getRecommendedLifespanKm({brand, model}),
    cushion,
    responsiveness: weightAdjust(clamp5(axes.responsiveness), weightG),
    stability: clamp5(axes.stability),
    ...(weightG !== undefined ? {weightG} : {}),
    ...(dropMm !== undefined ? {dropMm} : {}),
    ...(stackHeelMm !== undefined ? {stackHeelMm} : {}),
  };
}

/** 카테고리 축 기준값 조회(테스트·디버그용). */
export function categoryAxes(category: ShoeCategory) {
  return {...CATEGORY_AXES[category]};
}
