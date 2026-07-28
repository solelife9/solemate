// ─── lib/shoeStore.ts — 러닝화 구매처 정책 (순수 로직) ────────────────────────────
//
// keego 는 "이 신발 언제 갈아야 한다"를 말하는 앱이다. 그 말을 믿은 사람을 가품이 섞인
// 판매처로 보내면 앱 전체의 신뢰가 무너진다. 커미션 몇 %와 바꿀 수 없다.
// 그래서 구매처는 **정품 보증 등급으로 정렬하고, 보증되지 않는 채널은 아예 노출하지
// 않는다**(커미션 요율은 정렬에 개입하지 못한다 — 아래 불가침 규칙).
//
// 불가침 규칙(머지 게이트 — 이 셋을 어기는 변경은 머지 금지):
//   ① 정품 보증이 안 되는 판매처는 커미션이 아무리 높아도 노출하지 않는다.
//   ② 커미션이 판매처 순서를 바꾸지 못한다(정렬 키에 요율·태그가 들어가지 않는다).
//   ③ 이 모듈은 순수하다 — 네트워크·네이티브 0. 가격 조회는 별도 포트가 담당한다.
//
// 채널 판단 근거(2026-07-28 조사):
//   · 쿠팡  — 로켓직구/오픈마켓 셀러가 혼재해 병행수입·가품 리스크가 있다. 제휴 승인은
//             가장 쉽지만(그래서 함정) 정품을 보증할 수 없어 **제외**한다.
//   · 네이버쇼핑 — 한국 러너의 사실상 표준 진입점이고 검색 API 가 판매처명(mallName)을
//             주므로 **공식 스토어만 통과시키는 화이트리스트**가 기술적으로 가능하다.
//   · 무신사·29CM — 플랫폼 차원의 정품 검수를 운영한다. 러닝화 구색도 늘고 있다.

/**
 * 판매처 정품 보증 등급.
 *  · official — 브랜드 공식몰 / 공식 스토어. 정품이 확실하다.
 *  · verified — 플랫폼이 정품 검수를 운영한다(무신사·29CM).
 *  · mixed    — 오픈마켓/셀러 혼재. 정품을 보증할 수 없다 → **노출 금지**.
 */
export type AuthenticityTier = 'official' | 'verified' | 'mixed';

/** 등급별 정렬 가중치(작을수록 먼저). 커미션은 이 계산에 등장하지 않는다(불가침 ②). */
const TIER_RANK: Record<AuthenticityTier, number> = {
  official: 0,
  verified: 1,
  mixed: 2,
};

/** 등급별 한국어 배지 문구(사용자에게 왜 이 순서인지 보이게). */
export const tierLabelKo: Record<AuthenticityTier, string> = {
  official: '공식 스토어',
  verified: '정품 검수',
  mixed: '판매처 혼재',
};

export interface StoreChannel {
  /** 안정적 식별자(분석·설정 키). */
  id: string;
  /** 사용자 표시명. */
  name: string;
  tier: AuthenticityTier;
  /** 검색 URL 빌더 — 인코딩된 질의를 받는다(순수). */
  searchUrl: (encodedQuery: string) => string;
}

/**
 * 노출 후보 채널 정본. 순서는 '기본 나열 순서'일 뿐이고 실제 정렬은 rankChannels 가
 * 등급으로 다시 매긴다(데이터 순서에 정책을 의존하지 않게).
 */
export const STORE_CHANNELS: readonly StoreChannel[] = [
  {
    id: 'naver',
    name: '네이버쇼핑',
    // 네이버 자체는 중개자라 검색 결과에 병행수입 셀러가 섞인다. 개별 상품의 판매처가
    // 공식으로 확인될 때만 official 로 승격한다(isOfficialNaverMall). 채널 기본값은
    // 보수적으로 verified 가 아니라 mixed 다 — 즉 **필터 없이는 노출되지 않는다**.
    tier: 'mixed',
    searchUrl: (q) => `https://search.shopping.naver.com/search/all?query=${q}`,
  },
  {
    id: 'musinsa',
    name: '무신사',
    tier: 'verified',
    searchUrl: (q) => `https://www.musinsa.com/search/musinsa/integration?q=${q}`,
  },
  {
    id: '29cm',
    name: '29CM',
    tier: 'verified',
    searchUrl: (q) => `https://www.29cm.co.kr/search?keyword=${q}`,
  },
];

/**
 * 정품 보증 때문에 의도적으로 제외한 채널과 그 사유(문서화 — 나중에 "왜 쿠팡이 없지?"
 * 라는 질문에 코드가 답하게). 노출 목록에는 절대 들어가지 않는다.
 */
export const EXCLUDED_CHANNELS: readonly {id: string; name: string; reason: string}[] = [
  {
    id: 'coupang',
    name: '쿠팡',
    reason: '오픈마켓 셀러 혼재로 정품을 보증할 수 없어요.',
  },
];

/** 해당 등급이 사용자에게 노출 가능한가(불가침 ①). */
export function isVisibleTier(tier: AuthenticityTier): boolean {
  return tier !== 'mixed';
}

/**
 * 네이버 검색 API 가 준 판매처명(mallName)이 '공식 스토어'인지 판정한다.
 *
 * 보수적으로 설계한다 — **모르는 판매처는 공식이 아니다**. 화이트리스트에 없으면
 * false 를 돌려주고, 호출부는 그 상품을 정품 보증으로 표시하지 않는다. 가품을 정품으로
 * 잘못 표시하는 쪽이, 진짜 공식몰을 놓치는 쪽보다 훨씬 큰 피해다.
 */
export function isOfficialNaverMall(mallName: string | null | undefined): boolean {
  const raw = (mallName || '').trim();
  if (!raw) return false;
  // 공백·중점 제거 후 소문자 비교(같은 스토어가 '나이키 공식스토어'/'나이키공식스토어'
  // 처럼 표기 요동이 있다).
  const norm = raw.toLowerCase().replace(/[\s·・_-]+/g, '');
  return OFFICIAL_MALL_PATTERNS.some((re) => re.test(norm));
}

/**
 * 브랜드 공식 스토어 판정 패턴(정규화된 소문자 문자열 기준).
 *
 * 두 갈래만 통과시킨다:
 *  (1) '<브랜드>공식…' — 네이버 브랜드스토어의 관용 표기.
 *  (2) 브랜드 코리아 법인명 — 공식 직영으로 확인된 표기.
 * 신규 브랜드를 넣을 때는 **실제 mallName 을 눈으로 확인한 뒤** 추가한다(추측 금지).
 */
const OFFICIAL_MALL_PATTERNS: readonly RegExp[] = [
  // (1) 브랜드명으로 **시작**해서 '공식'이 오는 조합 — 네이버 브랜드스토어 표준 표기.
  //     실측(2026-07-28)으로 확인된 실제 판매처명: '나이키공식홈페이지', '아식스공식몰'.
  //     ⚠️ 브랜드명 시작을 강제하는 게 핵심이다. 'POIZON공식온라인스토어'(중국 리셀
  //     플랫폼)처럼 이름에 '공식'만 넣은 곳이 실제로 검색에 섞여 나온다 — 브랜드 공식이
  //     아닌데 공식을 참칭한다. 시작 앵커가 없으면 그대로 뚫린다.
  /^(나이키|아디다스|아식스|asics|뉴발란스|newbalance|호카|hoka|브룩스|brooks|써코니|saucony|미즈노|mizuno|퓨마|puma|살로몬|salomon|알트라|altra)공식/,
  // (2) 확인된 코리아 법인 직영 표기.
  /^(나이키코리아|아디다스코리아|아식스코리아|뉴발란스코리아|호카코리아)$/,
];

/**
 * 채널을 정품 보증 등급으로 정렬한다. **커미션·요율은 정렬 키에 들어가지 않는다**
 * (불가침 ②). 동률이면 입력 순서를 보존해 결과가 결정적이다.
 */
export function rankChannels(channels: readonly StoreChannel[]): StoreChannel[] {
  return [...channels]
    .map((c, i) => ({c, i}))
    .sort((a, b) => {
      const d = TIER_RANK[a.c.tier] - TIER_RANK[b.c.tier];
      return d !== 0 ? d : a.i - b.i;
    })
    .map(({c}) => c);
}

/** 사용자에게 실제로 보여줄 채널 목록 — mixed 제외 후 등급순 정렬. */
export function visibleChannels(
  channels: readonly StoreChannel[] = STORE_CHANNELS,
): StoreChannel[] {
  return rankChannels(channels.filter((c) => isVisibleTier(c.tier)));
}

/** 가격 표시에 붙일 출처·시각 고지(정가가 아니라 '조회 시점 최저가'임을 밝힌다). */
export function priceSourceNoteKo(shopName: string, checkedAtLabel: string): string {
  return `${shopName} 최저가 · ${checkedAtLabel} 기준`;
}
