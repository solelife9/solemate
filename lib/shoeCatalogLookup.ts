// ─── lib/shoeCatalogLookup.ts — 카탈로그에서 신발 찾기 (순수) ────────────────────
//
// 비교 화면은 두 종류의 신발을 다룬다: 사용자가 등록한 내 신발(brand/model 문자열만
// 있다)과 카탈로그 문서(스펙이 붙어 있다). 이 모듈이 둘을 잇는다.
//
// 내 신발은 사용자가 직접 입력했을 수도 있어서 표기가 흔들린다("Pegasus 42" /
// "페가수스 42" / "pegasus42"). 그래서 정규화 후 **별칭까지** 훑는다. 못 찾으면
// null 을 준다 — 억지로 비슷한 걸 고르면 남의 스펙을 내 신발이라고 보여주게 된다.

import catalogData from '../data/shoeCatalog.json';
import type {ShoeCategory, ShoeDoc} from '../types/shoe';
import type {CompareShoe} from './shoeCompareTable';

const CATALOG = catalogData as unknown as ShoeDoc[];

const norm = (s: string): string =>
  String(s ?? '').toLowerCase().replace(/[\s\-_.]/g, '');

/** 화면에 뜨는 이름 — 모델 + 버전 + variant + 콜라보. */
export function displayName(d: ShoeDoc): string {
  const base = [d.model, d.version, d.variant].filter(Boolean).join(' ');
  return d.collabWith ? `${base} ×${d.collabWith}` : base;
}

/** 전체 카탈로그(읽기 전용). */
export function allCatalogShoes(): readonly ShoeDoc[] {
  return CATALOG;
}

/**
 * brand + model 로 카탈로그 문서를 찾는다. 못 찾으면 null.
 *
 * 순서: ① 브랜드+표시명 완전일치 → ② 브랜드 안에서 별칭 일치 → ③ 없음.
 * 브랜드가 다르면 절대 매칭하지 않는다 — "페가수스"는 나이키에만 있어야 한다.
 */
export function findCatalogShoe(brand: string, model: string): ShoeDoc | null {
  const b = norm(brand);
  const m = norm(model);
  if (!m) return null;

  const sameBrand = CATALOG.filter((d) => norm(d.brand) === b);
  const pool = sameBrand.length ? sameBrand : [];

  for (const d of pool) {
    if (norm(displayName(d)) === m) return d;
  }
  for (const d of pool) {
    if (norm([d.model, d.version].filter(Boolean).join(' ')) === m) return d;
  }
  for (const d of pool) {
    if ((d.searchAliases ?? []).some((a) => norm(a) === m)) return d;
  }
  return null;
}

/** 카탈로그 문서를 비교 표가 쓰는 형태로. */
export function toCompareShoe(
  d: ShoeDoc,
  mine?: {usedKm: number; lifespanKm: number} | null,
): CompareShoe {
  return {
    id: d.id,
    brand: d.brand,
    name: displayName(d),
    category: d.category,
    weight: d.weight,
    weightBasis: d.weightBasis,
    drop: d.drop,
    plate: d.plate,
    stackHeight: d.stackHeight,
    lifespanKm: d.defaultLifespanKm,
    mine: mine ?? null,
  };
}

/**
 * 카탈로그에 없는 내 신발도 비교에 세울 수 있어야 한다. 스펙은 전부 비고 이름만 남는다
 * — 사용자가 직접 넣은 신발이 비교 화면에서 통째로 사라지면 그게 더 이상하다.
 */
export function unknownCompareShoe(
  brand: string,
  model: string,
  mine?: {usedKm: number; lifespanKm: number} | null,
): CompareShoe {
  return {
    id: `unknown:${norm(brand)}:${norm(model)}`,
    brand,
    name: model,
    weight: null,
    weightBasis: null,
    drop: null,
    plate: null,
    stackHeight: null,
    lifespanKm: mine?.lifespanKm ?? null,
    mine: mine ?? null,
  };
}

/**
 * 카테고리 → 한국어. **짧게** 쓴다 — 3열 비교 표의 한 칸이 70px 남짓이라
 * '데일리 트레이너'는 두 줄로 깨져 표를 흐트러뜨린다.
 * (lib/rotation 의 CATEGORY_LABEL 은 data/shoeModels 의 다른 어휘라 별개다.)
 */
export const SHOE_CATEGORY_KO: Record<ShoeCategory, string> = {
  daily: '데일리',
  tempo: '템포',
  racing: '레이싱',
  trail: '트레일',
  stability: '안정화',
  recovery: '맥스쿠션',
};
