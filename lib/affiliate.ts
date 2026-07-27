// ─── 수익화 v1: 교체 시점 '다음 러닝화' 추천 (순수 로직) ──────────────────────────
// Keego 차별점(내구도 관리)의 자연스러운 수익화 지점: 신발 수명이 다해 교체할 때
// 같은 카테고리의 다음 러닝화를 추천한다. 구매 의도가 가장 높은 순간의 contextual
// 추천이라 스팸이 아니다(배너광고 지양). 추천 자산은 검증된 시드 DB(data/shoeModels).
//
// 가드레일(스펙 수익화 메모):
//  - 시크릿 0: 실제 제휴 태그는 빌드에 하드코딩하지 않는다(AFFILIATE 는 빈 주입 지점).
//  - '러너에게 최선' 우선: 커미션이 아니라 같은 카테고리 동급 모델을 추천한다(투명성=신뢰).
//  - 이 모듈은 순수하다(네트워크/네이티브 0). 화면이 Linking.openURL 로 외부 쇼핑몰 검색을 연다.

import {
  SHOE_MODELS, ShoeModel, ShoeCategory, findShoeModel,
} from '../data/shoeModels';
import {visibleChannels} from './shoeStore';

/** 카테고리 → 한국어 표기(추천 카드 라벨용). */
export const categoryLabelKo: Record<ShoeCategory, string> = {
  daily_trainer: '데일리 트레이너',
  max_cushion: '쿠션화',
  stability: '안정화',
  super_trainer: '슈퍼 트레이너',
  carbon_racing: '카본 레이싱',
  trail: '트레일',
};

/**
 * 제휴(어필리에이트) 태그 주입 지점 — 기본은 빈 값(시크릿 0 원칙).
 * 실제 파트너스 태그가 생기면 환경/설정에서 주입한다(여기에 평문 하드코딩 금지).
 */
export const AFFILIATE: { coupang: string; naver: string; musinsa: string; twentyninecm: string } =
  { coupang: '', naver: '', musinsa: '', twentyninecm: '' };

export interface NextShoeInput {
  brand?: string;
  model?: string;
}

export interface ShopLink {
  /** 쇼핑몰 표시명(예: '쿠팡'). */
  shop: string;
  /** 검색 결과로 바로 가는 URL. */
  url: string;
}

/**
 * 정직 고지 — 커머스 표면의 **단일 소스**(2026-07-28 확정). 추천·비교·구매처 어디서든
 * 이 문장 하나만 쓴다(문구가 화면마다 갈리면 그 자체가 불신의 근거가 된다).
 *
 * "어떤 대가도 받지 않아요" 류의 자화자찬은 쓰지 않는다 — 커미션을 받으면 그건 거짓말이고
 * Truth only 위반이다. 받는다는 사실을 밝히되, 그것이 순서를 못 바꾼다는 걸 함께 말한다.
 */
export const AFFILIATE_DISCLOSURE =
  '추천은 당신의 주행 데이터로만 골라요 — 어떤 브랜드도 순서를 살 수 없어요. ' +
  '구매 링크로 사면 keego가 소액 수수료를 받을 수 있고, 추천·순위엔 영향 없어요.';

/**
 * 교체 대상 신발과 같은 카테고리의 '다음 러닝화' 후보를 추천한다(순수 함수).
 *
 * 규칙:
 *  - 현재 신발을 시드 DB에서 매칭해 카테고리를 얻는다(미매칭 → daily_trainer 기본).
 *  - 같은 카테고리의 다른 모델만 후보(자기 자신 제외).
 *  - 정렬: 같은 브랜드 우선(익숙함) → 최신 연도 → 모델명. 커미션이 아니라
 *    '같은 용도 동급'을 먼저 보여줘 신뢰를 지킨다.
 *  - limit 개수만 반환(기본 3, 음수는 0으로 클램프).
 */
export function recommendNextShoes(current: NextShoeInput, limit = 3): ShoeModel[] {
  const matched = findShoeModel(current.brand, current.model);
  const category: ShoeCategory = matched?.category ?? 'daily_trainer';
  const curBrand = (current.brand || '').trim().toLowerCase();
  const curModel = (current.model || '').trim().toLowerCase();

  const candidates = SHOE_MODELS.filter(
    (m) =>
      m.category === category &&
      !(m.brand.toLowerCase() === curBrand && m.model.toLowerCase() === curModel),
  );

  const sorted = [...candidates].sort((a, b) => {
    const aSame = a.brand.toLowerCase() === curBrand ? 0 : 1;
    const bSame = b.brand.toLowerCase() === curBrand ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;          // 같은 브랜드 먼저
    if (a.year !== b.year) return b.year - a.year;      // 최신 연도 먼저
    return a.model.localeCompare(b.model);              // 안정적 tie-break
  });

  return sorted.slice(0, Math.max(0, limit));
}

/** 채널 id → 제휴 태그 키(태그가 있으면 URL 에 부착). 없으면 순수 검색 URL. */
const TAG_PARAM: Record<string, {key: keyof typeof AFFILIATE; param: string}> = {
  musinsa: {key: 'musinsa', param: 'affiliate'},
  '29cm': {key: 'twentyninecm', param: 'affiliate'},
  naver: {key: 'naver', param: 'NaPm'},
};

/**
 * 한국 쇼핑몰 검색 링크를 만든다 — **정품 보증 채널만**(lib/shoeStore 정책).
 *
 * 쿠팡은 오픈마켓 셀러 혼재로 제외한다(shoeStore.EXCLUDED_CHANNELS). 네이버쇼핑도
 * '검색 결과 페이지 통째로' 보내는 링크는 뺀다 — 그 페이지에 병행수입 셀러가 섞이므로
 * 한 클릭 뒤로 미룰 뿐 신뢰 문제는 그대로다. 네이버는 가격 조회에서 **판매처가 공식
 * 스토어로 확인된 개별 상품**일 때만 등장한다(shoeStore.isOfficialNaverMall).
 *
 * AFFILIATE 태그가 채워지면 그때 쿼리에 부착한다(기본은 순수 검색 URL — 시크릿 0).
 * 태그 유무는 **순서에 영향을 주지 않는다**(불가침 ② — 정렬은 정품 등급만 본다).
 */
export function buildShopLinks(m: { brand: string; model: string }): ShopLink[] {
  const q = encodeURIComponent(`${m.brand} ${m.model}`.trim());
  return visibleChannels().map((c) => {
    const base = c.searchUrl(q);
    const tag = TAG_PARAM[c.id];
    const value = tag ? AFFILIATE[tag.key] : '';
    return {
      shop: c.name,
      url: value ? `${base}&${tag!.param}=${encodeURIComponent(value)}` : base,
    };
  });
}
