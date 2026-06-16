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
  '슈퍼트레이너': '트레이너',
  '데일리': '데일리',
  '안정화': '안정화',
  '트레일': '트레일',
  '맥스쿠셔닝': '맥스 쿠션',
};

/** 신발 종류 표시 라벨(매핑 없으면 원문 type). */
export function typeLabel(type?: string): string | undefined {
  if (!type) return undefined;
  return TYPE_LABEL_KO[type] ?? type;
}

// ── 추천 용도 → 자연어 문장 ────────────────────────────────────────────────────
// 핸드오프(data.js)의 purpose 는 손으로 쓴 자연 문장('레이스와 빠른 템포 런에 적합해요').
// 우리 DB 는 recommended 태그 배열만 가지므로, 태그를 자연스러운 명사구로 풀어
// '…에 적합해요' 문장으로 합성한다(사용자 요청: 신발탭/상세 용도를 풀어서 설명).
const RUN_PHRASE: Record<string, string> = {
  '데일리': '데일리 러닝',
  '장거리': '장거리 훈련',
  '템포': '빠른 템포 런',
  '인터벌': '인터벌 훈련',
  '레이스': '레이스',
  '회복': '회복 러닝',
  '트레일': '트레일 러닝',
};

// 한글 마지막 글자에 받침이 있으면 true(조사 와/과 선택용).
function hasFinalConsonant(word: string): boolean {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return false; // 한글 음절이 아니면 받침 없음 취급
  return (ch - 0xac00) % 28 !== 0;
}

/**
 * 추천 용도(러닝 종류) 배열 → '…에 적합해요' 자연 문장. 빈 배열이면 undefined.
 *   [레이스, 템포]      → '레이스와 빠른 템포 런에 적합해요'
 *   [데일리, 장거리]    → '데일리 러닝과 장거리 훈련에 적합해요'
 *   [회복]              → '회복 러닝에 적합해요'
 *   3개 이상            → '데일리 러닝, 장거리 훈련, 빠른 템포 런에 적합해요'
 */
export function purposeSentenceKo(recommended?: string[]): string | undefined {
  if (!recommended || recommended.length === 0) return undefined;
  const ps = recommended.map((r) => RUN_PHRASE[r] ?? r);
  let subject: string;
  if (ps.length === 1) {
    subject = ps[0];
  } else if (ps.length === 2) {
    subject = `${ps[0]}${hasFinalConsonant(ps[0]) ? '과' : '와'} ${ps[1]}`;
  } else {
    subject = ps.join(', ');
  }
  return `${subject}에 적합해요`;
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
