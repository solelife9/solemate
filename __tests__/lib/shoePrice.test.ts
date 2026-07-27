import {
  pickOfficialQuote,
  checkedAtLabel,
  fetchShoePrice,
  __resetPriceCacheForTests,
  PRICE_CACHE_MS,
  RawPriceItem,
} from '../../lib/shoePrice';

const T = 1753700000000; // 결정적 조회 시각

function item(over: Partial<RawPriceItem> = {}): RawPriceItem {
  return {
    title: '나이키 페가수스 41',
    lprice: '169000',
    mallName: '나이키공식스토어',
    link: 'https://shopping.naver.com/p/1',
    ...over,
  };
}

describe('pickOfficialQuote — 공식 스토어만 통과시킨다', () => {
  it('공식 스토어 상품을 고른다', () => {
    const q = pickOfficialQuote([item()], T)!;
    expect(q.priceKrw).toBe(169000);
    expect(q.mallName).toBe('나이키공식스토어');
    expect(q.checkedAtMs).toBe(T);
  });

  it('공식이 아닌 판매처는 더 싸도 버린다(가격으로 가품 위험을 상쇄하지 않는다)', () => {
    const q = pickOfficialQuote([
      item({mallName: '슈즈창고', lprice: '99000'}),
      item({mallName: '나이키공식스토어', lprice: '169000'}),
    ], T)!;
    expect(q.mallName).toBe('나이키공식스토어');
    expect(q.priceKrw).toBe(169000);
  });

  it('공식이 하나도 없으면 null — 그나마 싼 걸로 타협하지 않는다', () => {
    expect(pickOfficialQuote([
      item({mallName: '슈즈창고'}),
      item({mallName: '병행수입정품샵'}),
    ], T)).toBeNull();
  });

  it('공식 중에서는 최저가를 고른다', () => {
    const q = pickOfficialQuote([
      item({mallName: '나이키공식스토어', lprice: '169000'}),
      item({mallName: '아디다스공식스토어', lprice: '139000'}),
    ], T)!;
    expect(q.priceKrw).toBe(139000);
  });

  it('빈 입력·결측은 null', () => {
    expect(pickOfficialQuote([], T)).toBeNull();
    expect(pickOfficialQuote(null, T)).toBeNull();
    expect(pickOfficialQuote(undefined, T)).toBeNull();
  });

  it('가격이 없거나 0이면 버린다', () => {
    expect(pickOfficialQuote([item({lprice: '0'})], T)).toBeNull();
    expect(pickOfficialQuote([item({lprice: undefined})], T)).toBeNull();
    expect(pickOfficialQuote([item({lprice: '가격문의'})], T)).toBeNull();
  });

  it('링크가 http(s) 가 아니면 버린다(딥링크 안전)', () => {
    // eslint-disable-next-line no-script-url -- 이 스킴을 실제로 거부하는지가 검증 대상이다.
    expect(pickOfficialQuote([item({link: 'javascript:alert(1)'})], T)).toBeNull();
    expect(pickOfficialQuote([item({link: 'data:text/html,x'})], T)).toBeNull();
    expect(pickOfficialQuote([item({link: ''})], T)).toBeNull();
  });

  it('판매처명의 HTML 태그를 벗기고 판정한다', () => {
    const q = pickOfficialQuote([item({mallName: '<b>나이키</b>공식스토어'})], T)!;
    expect(q.mallName).toBe('나이키공식스토어');
  });
});

describe('checkedAtLabel — 언제 기준 가격인지', () => {
  it('MM/DD HH:mm 로 만든다', () => {
    const d = new Date(2026, 6, 28, 14, 5); // 2026-07-28 14:05 (local)
    expect(checkedAtLabel(d.getTime(), d)).toBe('07/28 14:05');
  });

  it('유한하지 않은 값은 빈 문자열', () => {
    expect(checkedAtLabel(NaN)).toBe('');
  });
});

describe('fetchShoePrice — 절대 throw 하지 않는다', () => {
  beforeEach(() => __resetPriceCacheForTests());

  it('정상 응답에서 공식 최저가를 돌려준다', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({items: [item()]}),
    });
    const q = await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T});
    expect(q!.priceKrw).toBe(169000);
  });

  it('서버가 503(키 미설정)이면 null — 화면은 가격 칸만 비운다', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ok: false, status: 503, json: async () => ({})});
    expect(await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T})).toBeNull();
  });

  it('망이 끊겨도 throw 하지 않는다', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T}),
    ).resolves.toBeNull();
  });

  it('응답이 깨져도 throw 하지 않는다', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('bad json'); },
    });
    await expect(
      fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T}),
    ).resolves.toBeNull();
  });

  it('캐시 안에서는 다시 부르지 않는다(무료 호출 한도 보호)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ok: true, json: async () => ({items: [item()]})});
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T});
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T + 1000});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('실패도 캐시한다 — 매 렌더마다 재시도하지 않는다', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T});
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T + 1000});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('캐시가 만료되면 다시 부른다', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ok: true, json: async () => ({items: [item()]})});
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T});
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T + PRICE_CACHE_MS + 1});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('모델이 다르면 캐시를 공유하지 않는다', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ok: true, json: async () => ({items: [item()]})});
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T});
    await fetchShoePrice('Nike', 'Vaporfly 4', {fetchImpl: fetchImpl as any, nowMs: T});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('브랜드·모델을 질의로 싣는다', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ok: true, json: async () => ({items: []})});
    await fetchShoePrice('Nike', 'Pegasus 41', {fetchImpl: fetchImpl as any, nowMs: T});
    expect(String(fetchImpl.mock.calls[0][0])).toContain(encodeURIComponent('Nike Pegasus 41'));
  });
});
