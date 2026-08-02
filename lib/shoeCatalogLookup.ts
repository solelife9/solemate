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

/**
 * 버전 표기를 하나로 — `v14` · `V14` 를 `14` 로 본다.
 *
 * 같은 신발을 두 파일이 다르게 적고 있었다: data/shoes.json 은 뉴발란스식 `1080v14`,
 * data/shoeCatalog.json 은 `1080 14`. 그 결과 **34켤레가 서로를 못 찾아** 스펙 표에서
 * 무게·드롭이 통째로 빈칸이었다(2026-08-02 감사). 사용자도 두 표기를 다 쓰므로
 * 데이터를 한쪽으로 미는 것보다 조회가 흡수하는 게 맞다.
 *
 * `v` 뒤에 숫자가 올 때만 지운다 — 'Vomero'·'Vaporfly' 처럼 v로 시작하는 이름은 건드리지 않는다.
 */
const normVer = (s: string): string => norm(s).replace(/v(?=\d)/g, '');

/**
 * 브랜드+모델을 하나의 조회 키로. **표기가 흔들려도 같은 신발이면 같은 키**가 된다.
 *
 * 공개하는 이유: 손으로 검수한 스펙 표(data/shoeSpecs.json)도 'brand|model' 문자열을
 * 키로 쓰는데, 그쪽은 정확 일치라 `1080v14`(표) 와 `1080 14`(카탈로그)가 안 맞아
 * **검수한 값이 조용히 무시되고 있었다**(2026-08-02 AUDIT 4 Q-1 수정 중 발견).
 * 규칙을 두 벌 만들지 않으려고 여기 하나만 두고 내보낸다.
 */
export const shoeKey = (brand: string, model: string): string =>
  `${norm(brand)}|${normVer(model)}`;

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
  const mv = normVer(model);

  for (const d of pool) {
    if (norm(displayName(d)) === m) return d;
  }
  for (const d of pool) {
    if (norm([d.model, d.version].filter(Boolean).join(' ')) === m) return d;
  }
  for (const d of pool) {
    if ((d.searchAliases ?? []).some((a) => norm(a) === m)) return d;
  }
  // 버전 표기만 다른 경우(1080v14 ↔ 1080 14). 위 완전일치가 모두 실패한 뒤에만 본다.
  for (const d of pool) {
    if (normVer([d.model, d.version].filter(Boolean).join(' ')) === mv) return d;
  }
  for (const d of pool) {
    if ((d.searchAliases ?? []).some((a) => normVer(a) === mv)) return d;
  }
  // 브랜드 라인 접두사가 빠진 경우(Boston 12 ↔ Adizero Boston 12). 접두사만 다르고
  // 뒤가 통째로 같을 때만 — 'Pro 3' 같은 짧은 조각이 아무거나 물지 않게 4자 이상으로 막는다.
  if (mv.length >= 4) {
    const tail = pool.filter((d) => normVer([d.model, d.version].filter(Boolean).join(' ')).endsWith(mv));
    if (tail.length === 1) return tail[0];
    // 여럿이면 콜라보가 아닌 본판을 고른다(Adios Pro 4 ↔ Adios Pro 4 ×Satisfy).
    // 그래도 여럿이면 포기한다 — 억지로 고르면 남의 스펙을 내 신발이라 보여주게 된다.
    const plain = tail.filter((d) => !d.collabWith);
    if (plain.length === 1) return plain[0];
  }
  return null;
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
