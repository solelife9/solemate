// ─── lib/shoeSearch.ts — 신발 검색 매칭 (순수 로직) ────────────────────────────
//
// 규칙 문서: docs/shoes-spec.md §6
//
// 검색이 약하면 사용자는 "내 신발이 없다"고 결론짓고 등록을 포기한다. 실제로는 있는데
// 이름을 다르게 부른 것뿐인 경우가 대부분이다 — 한글로 치거나("나이키 페가수스"),
// 오타를 내거나("페가서스"), 줄여 부른다("페가"). 그래서 매칭 대상을 넓힌다.
//
// 매칭 대상:
//   1) brand
//   2) model + version + variant (표시명)
//   3) searchAliases — 한글표기·오타·축약형
//   4) collabWith — "새티스파이"로 찾으면 Hoka·adidas·norda 결과가 같이 나온다
//
// 단종 처리:
//   · 검색에는 **나온다** — 사용자가 지금도 그 신발을 신고 있다.
//   · 신규 등록 '추천' 목록에서는 **빠진다** — 이제 못 사는 걸 권할 이유가 없다.

import type {ShoeDoc} from '../types/shoe';
import {shoeDisplayName} from '../types/shoe';

/** 검색 비교용 정규화 — 소문자 + 공백 접기. 하이픈·점은 공백으로 본다(`v14` vs `v-14`). */
export function normalizeQuery(v: string): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** 한 신발이 가진 모든 검색 가능한 문자열. */
export function searchableStrings(s: ShoeDoc): string[] {
  const out: string[] = [
    s.brand,
    s.model,
    shoeDisplayName(s),
    `${s.brand} ${shoeDisplayName(s)}`,
  ];
  if (s.version) out.push(`${s.model} ${s.version}`);
  if (s.variant) out.push(s.variant);
  if (s.collabWith) {
    out.push(s.collabWith);
    // 협업 상대 + 베이스 조합으로도 찾게 한다("새티스파이 호카").
    out.push(`${s.collabWith} ${s.brand}`);
  }
  for (const a of s.searchAliases ?? []) out.push(a);
  return out.filter((v) => typeof v === 'string' && v.trim().length > 0);
}

/** 질의가 이 신발에 걸리는가 — 부분일치(포함). */
export function matchesShoe(s: ShoeDoc, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true; // 빈 질의는 전체
  // 공백으로 나눈 토큰이 **모두** 어딘가에 걸려야 한다("호카 클리프톤" → 둘 다 만족).
  const tokens = q.split(' ').filter(Boolean);
  const hay = searchableStrings(s).map(normalizeQuery);
  return tokens.every((t) => hay.some((h) => h.includes(t)));
}

export interface SearchOptions {
  /**
   * 신규 등록 추천 목록인가. true 면 단종 모델을 **뺀다**(이제 못 사는 걸 권하지 않는다).
   * 기본 false — 일반 검색에서는 단종도 보여야 한다(사용자가 지금 신고 있다).
   */
  forNewRegistration?: boolean;
  limit?: number;
}

/**
 * 검색 — 관련도 순 정렬.
 *
 * 정렬 규칙(결정적):
 *  1) 브랜드/표시명이 질의로 **시작**하는 것 먼저(사용자가 앞부터 친다)
 *  2) 단종이 아닌 것 먼저
 *  3) 최신 출시연도
 *  4) 표시명 사전순(동률 tie-break — 같은 입력이면 항상 같은 순서)
 */
export function searchShoes(
  shoes: readonly ShoeDoc[],
  query: string,
  opts: SearchOptions = {},
): ShoeDoc[] {
  const q = normalizeQuery(query);
  const pool = opts.forNewRegistration
    ? shoes.filter((s) => !s.discontinued)
    : shoes;
  const hit = pool.filter((s) => matchesShoe(s, query));

  const startsWith = (s: ShoeDoc) => {
    if (!q) return false;
    const name = normalizeQuery(`${s.brand} ${shoeDisplayName(s)}`);
    return name.startsWith(q) || normalizeQuery(s.model).startsWith(q);
  };

  const sorted = hit.sort((a, b) => {
    const sa = startsWith(a) ? 0 : 1;
    const sb = startsWith(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    const da = a.discontinued ? 1 : 0;
    const db = b.discontinued ? 1 : 0;
    if (da !== db) return da - db;
    const ya = a.releaseYear ?? 0;
    const yb = b.releaseYear ?? 0;
    if (ya !== yb) return yb - ya;
    return shoeDisplayName(a).localeCompare(shoeDisplayName(b));
  });

  return typeof opts.limit === 'number' ? sorted.slice(0, Math.max(0, opts.limit)) : sorted;
}

/** 단종 뱃지 문구 — 검색 결과에 붙는다(왜 이게 뒤에 있는지 알려준다). */
export const DISCONTINUED_BADGE_KO = '단종';
