/**
 * Keego 러닝화 권장 내구도 시드 데이터베이스 (single source of truth)
 *
 * 출처: .tenet/spec/shoe-database-2026-05-31.md (web-verified, 2026-05-31)
 *       + 2026-06-16 최신 모델 보강(web-verified): 슈퍼블래스트3 등 30개 추가, Altra·Topo 신규.
 * 7개 카테고리 · 13개 브랜드 · 164개 모델.
 *
 * 이 모듈은 화면(AddShoeScreen 등)의 인라인 MODELS/BRANDS와 App.tsx의
 * parseShoeName 브랜드 목록을 대체하는 데이터·로직 단일 소스다.
 */

// ────────────────────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────────────────────

/** 러닝화 카테고리 (스펙 §카테고리 매핑 표 참조) */
// 통합 단일 소스: data/shoes.json — 카탈로그(여기)와 분류(shoeClass)가 같은 파일을 읽는다.
import shoesData from './shoes.json';

export type ShoeCategory =
  | 'daily_trainer'
  | 'max_cushion'
  | 'stability'
  | 'super_trainer'
  | 'carbon_racing'
  | 'trail';

/** 시드 DB의 단일 신발 모델 레코드 */
export interface ShoeModel {
  brand: string;
  model: string;
  category: ShoeCategory;
  /** 권장 수명(km) — 기본은 카테고리 값, 필요 시 per-model 오버라이드 가능 */
  recommendedKm: number;
  /** 출시연도 */
  year: number;
}

/** getRecommendedLifespanKm 인자 (모든 필드 선택적 — 정보가 적어도 합리적 기본값 반환) */
export interface RecommendInput {
  brand?: string;
  model?: string;
  category?: ShoeCategory;
  /** 선택적 체중(kg) — 권장값 보정용(가이드, 과학적 정밀치 아님) */
  weightKg?: number;
}

// ────────────────────────────────────────────────────────────
// 카테고리 → 권장 수명(km) 매핑
// ────────────────────────────────────────────────────────────

/**
 * 카테고리별 기본 교체 권장 거리(km) = 쿠셔닝(성능)이 유지되는 기준(실착 한계가 아님).
 * 안정화 700·쿠션화 700: 단단한 지지 폼 / 두꺼운 폼 볼륨으로 비교적 오래.
 * 데일리 650·슈퍼트레이너 650: 기준. 카본 450: PEBA 폼의 반발 수명(요즘 1세대보다 내구성↑).
 * 트레일 650: 지형 의존(로드화와 비슷). (경량 업템포화는 별도 카테고리 없이 슈퍼트레이너로 묶는다.)
 */
export const categoryLifespanKm: Record<ShoeCategory, number> = {
  daily_trainer: 650,
  max_cushion: 700,
  stability: 700,
  super_trainer: 650,
  carbon_racing: 450,
  trail: 650,
};

/** category 미지정·미매칭 시 사용하는 최종 기본값 (daily_trainer 기준) */
export const DEFAULT_LIFESPAN_KM = categoryLifespanKm.daily_trainer; // 650

// 용도/태그(추천 러닝)는 사용자 정리 DB(data/shoes.json → data/shoeClass.ts)를 단일 소스로
// 쓴다. 여기서 카테고리→문구를 임의로 만들던 매핑은 제거(사용자 데이터로 대체).

// ────────────────────────────────────────────────────────────
// 시드 데이터 (164 모델)
// ────────────────────────────────────────────────────────────

export const SHOE_MODELS: ShoeModel[] = (
  shoesData.shoes as Array<{brand: string; model: string; category: ShoeCategory; recommendedKm?: number; year?: number}>
).map((s) => ({
  brand: s.brand,
  model: s.model,
  category: s.category,
  recommendedKm: Number.isFinite(s.recommendedKm as number)
    ? (s.recommendedKm as number)
    : (categoryLifespanKm[s.category] ?? DEFAULT_LIFESPAN_KM),
  year: s.year ?? 0,
}));

// ────────────────────────────────────────────────────────────
// 파생 데이터
// ────────────────────────────────────────────────────────────

/**
 * 시드 DB에서 파생한 브랜드 목록 (단일 소스).
 * 시드 등장 순서를 보존(중복 제거). App.tsx / AddShoeScreen 등 화면 코드가 import 한다.
 */
// 브랜드 칩/기본 선택 노출 순서 — 인기 브랜드를 앞에(알파벳순보다 사용자 친화). 우선순위
// 목록에 없는 브랜드는 뒤에 알파벳순으로 붙인다. (등록 화면 기본 브랜드 = BRANDS[0])
const BRAND_PRIORITY = [
  'Nike', 'Adidas', 'Asics', 'New Balance', 'Hoka', 'Saucony',
  'Brooks', 'Puma', 'On', 'Mizuno', 'Salomon', 'Altra',
];
const brandRank = (b: string): number => {
  const i = BRAND_PRIORITY.findIndex((p) => p.toLowerCase() === b.toLowerCase());
  return i === -1 ? BRAND_PRIORITY.length : i;
};
export const BRANDS: string[] = SHOE_MODELS.reduce<string[]>((acc, m) => {
  if (!acc.includes(m.brand)) acc.push(m.brand);
  return acc;
}, []).sort((a, b) => brandRank(a) - brandRank(b) || a.localeCompare(b));

// ────────────────────────────────────────────────────────────
// 매칭 헬퍼
// ────────────────────────────────────────────────────────────

/** 브랜드/모델 문자열 정규화(대소문자·여백 무시) */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 특정 브랜드의 모델명 목록(시드 순서) — AddShoe 모델 선택 UI용 */
export function modelsForBrand(brand: string): string[] {
  const b = normalize(brand);
  return SHOE_MODELS.filter((m) => normalize(m.brand) === b).map((m) => m.model);
}

/**
 * 주어진 brand(+model) 에 해당하는 시드 모델을 찾는다.
 * brand/model 미지정 시 undefined. 대소문자/여백 차이는 무시.
 */
export function findShoeModel(brand?: string, model?: string): ShoeModel | undefined {
  if (!brand || !model) return undefined;
  const b = normalize(brand);
  const m = normalize(model);
  return SHOE_MODELS.find(
    (s) => normalize(s.brand) === b && normalize(s.model) === m,
  );
}

// ────────────────────────────────────────────────────────────
// 추천 로직 (순수 함수)
// ────────────────────────────────────────────────────────────

/**
 * 체중 보정 계수 (가이드, 과학적 정밀치 아님 — 스펙 §추천 로직).
 * ≥90kg → ×0.85, ≤60kg → ×1.1, 그 외 → ×1.
 */
export function weightAdjustmentFactor(weightKg?: number): number {
  if (weightKg === undefined) return 1;
  if (weightKg >= 90) return 0.85;
  if (weightKg <= 60) return 1.1;
  return 1;
}

/**
 * 권장 수명(km)을 계산하는 순수 함수.
 *
 * 우선순위:
 *  1) brand + model 매칭 → 해당 모델의 recommendedKm (per-model 오버라이드 포함)
 *  2) 미매칭이지만 category 제공 → categoryLifespanKm[category]
 *  3) 둘 다 없으면 → DEFAULT_LIFESPAN_KM (daily_trainer 700)
 *
 * weightKg 가 주어지면 위 결과에 체중 보정 계수를 곱한 뒤 정수(km)로 반올림한다.
 */
export function getRecommendedLifespanKm(input: RecommendInput = {}): number {
  const { brand, model, category, weightKg } = input;

  const matched = findShoeModel(brand, model);
  let baseKm: number;
  if (matched) {
    baseKm = matched.recommendedKm;
  } else if (category && category in categoryLifespanKm) {
    baseKm = categoryLifespanKm[category];
  } else {
    baseKm = DEFAULT_LIFESPAN_KM;
  }

  const factor = weightAdjustmentFactor(weightKg);
  return Math.round(baseKm * factor);
}
