// ────────────────────────────────────────────────────────────
// Keego 신발 분류(사용자 정리) — 종류(type) + 추천 용도(recommended)
// 단일 소스: data/shoes.json (사용자가 직접 관리·확장하는 226모델 분류).
//   type        : 카본화 / 슈퍼트레이너 / 데일리 / 안정화 / 트레일 / 맥스쿠셔닝
//   recommended : 데일리 / 장거리 / 템포 / 인터벌 / 레이스 / 회복 / 트레일 (러닝 종류)
// 화면(홈 현재상태·신발 카드/상세)은 이 헬퍼만 참조한다. '종류'는 칩으로, '추천 용도'는
// recommended(러닝 종류)로 표시한다 — 종류(카본화 등)는 추천 용도가 아니다.
// ────────────────────────────────────────────────────────────
import shoesData from './shoes.json';

export interface ShoeClass {
  brand: string;
  model: string;
  /** 신발 종류 — 카본화/슈퍼트레이너/데일리/안정화/트레일/맥스쿠셔닝 */
  type: string;
  /** 추천 용도(러닝 종류) — 데일리/장거리/템포/인터벌/레이스/회복/트레일 */
  recommended: string[];
}

/** 종류별 한 줄 설명(예: 카본화 → '기록·레이스용 러닝화') */
export const TYPE_DESCRIPTIONS: Record<string, string> =
  shoesData.typeDescriptions as Record<string, string>;

/**
 * 사용자 분류 type(카본화 등) → 화면 표시용 라벨(카본 레이싱 등). 사용자가 선호한 표기.
 * 미정의 type 은 원문 그대로 사용(graceful).
 */
export const TYPE_LABEL_KO: Record<string, string> = {
  '카본화': '카본 레이싱',
  '슈퍼트레이너': '슈퍼 트레이너',
  '데일리': '데일리 트레이너',
  '안정화': '안정화',
  '트레일': '트레일',
  '맥스쿠셔닝': '맥스 쿠션',
};

/** 신발 종류 표시 라벨(매핑 없으면 원문 type). */
export function typeLabel(type?: string): string | undefined {
  if (!type) return undefined;
  return TYPE_LABEL_KO[type] ?? type;
}

const ROWS = shoesData.shoes as ShoeClass[];

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
// 모델명 끝의 버전 숫자(들)를 떼어 패밀리명만 남긴다. 'Clifton 9'→'clifton'.
function family(model: string): string {
  return norm(model).replace(/\s+\d+(\.\d+)?$/, '').trim();
}

/**
 * 브랜드+모델로 사용자 분류를 찾는다. 정확 매칭 우선, 없으면 같은 브랜드의 동일 모델
 * 패밀리(끝 버전 숫자 무시 — 예: Clifton 9 ↔ Clifton 10)로 폴백. 미매칭은 undefined.
 */
export function findShoeClass(brand?: string, model?: string): ShoeClass | undefined {
  if (!brand || !model) return undefined;
  const b = norm(brand);
  const m = norm(model);
  const exact = ROWS.find((r) => norm(r.brand) === b && norm(r.model) === m);
  if (exact) return exact;
  const f = family(model);
  return f ? ROWS.find((r) => norm(r.brand) === b && family(r.model) === f) : undefined;
}
