// ─── lib/shoePrice.ts — 러닝화 현재가 조회 포트 ────────────────────────────────────
//
// 정가(msrp)를 DB에 박아두지 않는다. 332개 모델의 국내 정가를 우리가 떠안으면 매년
// 갱신·단종 처리라는 부채가 되고, 그마저도 사용자가 실제로 낼 금액과 다르다.
// 대신 **비교하는 순간 파트너에서 현재가를 조회**한다.
//
// 신뢰 규칙(lib/shoeStore 와 한 몸):
//  · 판매처가 **공식 스토어로 확인된 상품만** 통과시킨다. 모르는 판매처는 버린다 —
//    가품이 섞인 결과를 '최저가'라며 보여주는 건 keego 가 절대 하면 안 되는 일이다.
//  · 표시는 '정가'가 아니라 '조회 시점 최저가'다. 출처·시각을 반드시 함께 나른다.
//  · 실패는 조용하다 — 네트워크·키 부재·형식 오류 어디서든 null 을 돌려주고 throw 하지
//    않는다. 가격을 못 구하면 그 칸을 비울 뿐, 화면이 깨지지 않는다.
//
// 키는 앱에 심지 않는다. 조회는 Cloud Functions(`/shop/price`)가 대신 부른다 —
// 클라이언트 번들에 API 시크릿을 넣지 않기 위해서다(시크릿 0 원칙).

import {isOfficialNaverMall} from './shoeStore';
import {SOCIAL_BACKEND} from './socialConfig';

/** 파트너에서 받은 상품 한 건(정규화 전 — 서버가 네이버 응답을 그대로 전달). */
export interface RawPriceItem {
  /** 상품명(HTML 태그가 섞여 올 수 있다). */
  title?: string;
  /** 최저가(원). 네이버는 문자열로 준다. */
  lprice?: string | number;
  /** 판매처명 — 공식 스토어 판정의 근거. */
  mallName?: string;
  /** 상품 링크. */
  link?: string;
  brand?: string;
  maker?: string;
}

/** 화면에 실제로 쓰는 가격 한 건. */
export interface ShoePriceQuote {
  priceKrw: number;
  mallName: string;
  productUrl: string;
  /** 조회 시각(epoch ms) — '언제 기준 가격인지' 표시에 쓴다. */
  checkedAtMs: number;
}

/** HTML 태그·엔티티를 벗긴다(네이버 title 은 검색어를 <b>로 감싸 온다). */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function toPrice(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '')) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * 조회 결과에서 **공식 스토어 상품 중 최저가** 한 건을 고른다(순수).
 *
 * 공식이 아닌 판매처는 전부 버린다 — 걸러낸 뒤 아무것도 안 남으면 null 이다.
 * '그나마 싼 것'으로 타협하지 않는다(가품 위험을 가격으로 상쇄할 수 없다).
 */
export function pickOfficialQuote(
  items: readonly RawPriceItem[] | null | undefined,
  checkedAtMs: number,
): ShoePriceQuote | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  let best: ShoePriceQuote | null = null;
  for (const it of items) {
    const mallName = stripTags(String(it?.mallName || ''));
    if (!isOfficialNaverMall(mallName)) continue;
    const priceKrw = toPrice(it?.lprice);
    if (priceKrw === null) continue;
    const productUrl = String(it?.link || '').trim();
    if (!/^https?:\/\//i.test(productUrl)) continue;
    if (!best || priceKrw < best.priceKrw) {
      best = {priceKrw, mallName, productUrl, checkedAtMs};
    }
  }
  return best;
}

/** 조회 시각을 '07/28 14:30' 형태로 — 가격 옆에 붙는 기준 시각. */
export function checkedAtLabel(ms: number, date: Date = new Date(ms)): string {
  if (!Number.isFinite(ms)) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** 가격 캐시 수명 — 같은 모델을 반복 조회해 무료 호출 한도를 태우지 않게. */
export const PRICE_CACHE_MS = 6 * 60 * 60 * 1000; // 6시간

type CacheEntry = {quote: ShoePriceQuote | null; atMs: number};
const cache = new Map<string, CacheEntry>();

/** 테스트용 캐시 초기화. */
export function __resetPriceCacheForTests(): void {
  cache.clear();
}

function cacheKey(brand: string, model: string): string {
  return `${(brand || '').trim().toLowerCase()}|${(model || '').trim().toLowerCase()}`;
}

export interface FetchPriceDeps {
  /** 주입 가능한 fetch(테스트). 기본은 전역 fetch. */
  fetchImpl?: typeof fetch;
  /** 현재 시각(테스트 결정성). */
  nowMs?: number;
}

/**
 * 러닝화 현재가를 조회한다 — 공식 스토어 최저가 한 건, 없으면 null.
 *
 * 절대 throw 하지 않는다. 서버가 키 미설정으로 503 을 주든, 망이 끊기든, 응답이
 * 이상하든 null 이다(호출부는 가격 칸을 비우면 된다).
 */
export async function fetchShoePrice(
  brand: string,
  model: string,
  deps: FetchPriceDeps = {},
): Promise<ShoePriceQuote | null> {
  const now = deps.nowMs ?? Date.now();
  const key = cacheKey(brand, model);
  const hit = cache.get(key);
  if (hit && now - hit.atMs < PRICE_CACHE_MS) return hit.quote;

  const doFetch = deps.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return null;

  let quote: ShoePriceQuote | null = null;
  try {
    const q = encodeURIComponent(`${brand} ${model}`.trim());
    const r = await doFetch(`${SOCIAL_BACKEND}/api/shop/price?q=${q}`, {method: 'GET'});
    if (r && r.ok) {
      const body: any = await r.json();
      quote = pickOfficialQuote(body?.items, now);
    }
  } catch {
    // 조용한 실패 — 가격을 못 구한 것뿐이다.
    quote = null;
  }
  // 실패(null)도 캐시한다 — 매 렌더마다 재시도해 한도를 태우지 않게.
  cache.set(key, {quote, atMs: now});
  return quote;
}
