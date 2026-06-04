import {
  recommendNextShoes,
  buildShopLinks,
  categoryLabelKo,
  AFFILIATE,
  AFFILIATE_DISCLOSURE,
} from '../../lib/affiliate';
import { findShoeModel } from '../../data/shoeModels';

describe('recommendNextShoes', () => {
  it('recommends same-category models and excludes the worn-out shoe itself', () => {
    const recs = recommendNextShoes({ brand: 'Nike', model: 'Pegasus 41' }, 3);
    expect(recs.length).toBe(3);
    // 모두 같은 카테고리(daily_trainer)
    for (const r of recs) expect(r.category).toBe('daily_trainer');
    // 자기 자신은 제외
    expect(recs.some((r) => r.brand === 'Nike' && r.model === 'Pegasus 41')).toBe(false);
  });

  it('matches the category of the current shoe (carbon racing → carbon racing)', () => {
    const recs = recommendNextShoes({ brand: 'Nike', model: 'Alphafly 3' }, 5);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(r.category).toBe('carbon_racing');
  });

  it('prefers the same brand first when the category has same-brand alternatives', () => {
    // Hoka trail 카테고리는 같은 브랜드 모델이 여러 개 → 첫 추천은 Hoka
    const recs = recommendNextShoes({ brand: 'Hoka', model: 'Speedgoat 6' }, 3);
    expect(recs[0].brand).toBe('Hoka');
    expect(recs[0].model).not.toBe('Speedgoat 6');
  });

  it('falls back to daily_trainer recommendations for an unknown shoe', () => {
    const recs = recommendNextShoes({ brand: 'Unknown', model: 'Custom Shoe' }, 3);
    expect(recs.length).toBe(3);
    for (const r of recs) expect(r.category).toBe('daily_trainer');
  });

  it('clamps a negative/zero limit to an empty list', () => {
    expect(recommendNextShoes({ brand: 'Nike', model: 'Pegasus 41' }, 0)).toEqual([]);
    expect(recommendNextShoes({ brand: 'Nike', model: 'Pegasus 41' }, -2)).toEqual([]);
  });

  it('every recommended model exists in the seed DB', () => {
    const recs = recommendNextShoes({ brand: 'Asics', model: 'Gel-Nimbus 27' }, 4);
    for (const r of recs) {
      expect(findShoeModel(r.brand, r.model)).toBeDefined();
    }
  });
});

describe('buildShopLinks', () => {
  it('builds coupang + naver + musinsa + 29cm search links with the encoded query', () => {
    const links = buildShopLinks({ brand: 'Hoka', model: 'Clifton 10' });
    const shops = links.map((l) => l.shop);
    expect(shops).toContain('쿠팡');
    expect(shops).toContain('네이버쇼핑');
    expect(shops).toContain('무신사');
    expect(shops).toContain('29CM');
    expect(links.length).toBe(4);
    for (const l of links) {
      expect(l.url).toContain(encodeURIComponent('Hoka Clifton 10'));
      expect(l.url.startsWith('https://')).toBe(true);
    }
  });

  it('points musinsa and 29cm at their correct search endpoints with the encoded query', () => {
    const q = encodeURIComponent('Nike Pegasus 41');
    const links = buildShopLinks({ brand: 'Nike', model: 'Pegasus 41' });
    expect(links.find((l) => l.shop === '무신사')!.url).toBe(
      `https://www.musinsa.com/search/musinsa/integration?q=${q}`,
    );
    expect(links.find((l) => l.shop === '29CM')!.url).toBe(
      `https://www.29cm.co.kr/search?keyword=${q}`,
    );
  });

  it('does not leak an affiliate channel/tag when no tag is configured (secrets-0)', () => {
    // 기본 AFFILIATE 는 전부 빈 값 — 4개 URL 어디에도 채널/태그가 붙지 않아야 한다.
    expect(AFFILIATE.coupang).toBe('');
    expect(AFFILIATE.naver).toBe('');
    expect(AFFILIATE.musinsa).toBe('');
    expect(AFFILIATE.twentyninecm).toBe('');
    const links = buildShopLinks({ brand: 'Nike', model: 'Vaporfly 4' });
    expect(links.find((l) => l.shop === '쿠팡')!.url).not.toContain('channel=');
    expect(links.find((l) => l.shop === '네이버쇼핑')!.url).not.toContain('NaPm=');
    expect(links.find((l) => l.shop === '무신사')!.url).not.toContain('affiliate=');
    expect(links.find((l) => l.shop === '29CM')!.url).not.toContain('affiliate=');
  });
});

describe('disclosure + labels', () => {
  it('exposes a transparency disclosure mentioning runner-first', () => {
    expect(AFFILIATE_DISCLOSURE).toContain('러너');
  });
  it('has a Korean label for every category', () => {
    expect(categoryLabelKo.daily_trainer).toBe('데일리 트레이너');
    expect(categoryLabelKo.carbon_racing).toBe('카본 레이싱');
    expect(categoryLabelKo.trail).toBe('트레일');
  });
});
