// 신발 피커 — **막다른 길을 만들지 않는다.**
//
// 왜 있나 (2026-08-11)
// ----------------------------------------------------------------------------
// 민우님: *"앱에서 러닝화 검색할 때 한글로 쳐도 그 러닝화 나오게 할 수 있어?"*
//
// 한글 검색 자체는 전날 살렸다(별칭 매칭 — __tests__/shoePickerKoreanSearch.test.ts).
// 그런데도 안 나오는 경우가 남아 있었다: **검색이 선택된 브랜드 안에서만** 되기 때문이다.
// 피커를 열면 Nike 가 기본으로 선택돼 있어서, 사용자는 자기가 브랜드를 고른 적이 없는데도
// Nike 안에서만 찾게 된다. "호카 클리프톤" → 0건(전체에는 6켤레가 있다).
//
// 게다가 그 0건이 `logSearchMiss` 로 서버에 '없는 신발' 신호로 적재됐다 —
// **카탈로그에 있는 신발을 없다고 집계**하고 있었던 것이다.
//
// 브랜드 우선 검색은 2026-07-07 민우님 결정이고 업계 표준이기도 하다(스트라바도
// 브랜드를 고른 뒤 모델을 넣는다). 그래서 규칙은 그대로 두고, **0건일 때만** 다른
// 브랜드를 보여준다(2026-08-11 민우님 확정).
import {SHOE_MODELS} from '../data/shoeModels';
import {matchesTokens} from '../lib/shoeSearch';

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

/** ShoePicker.brandModels 와 같은 규칙. */
const inBrand = (brand: string, q: string) =>
  SHOE_MODELS.filter(m => norm(m.brand) === norm(brand)).filter(m =>
    matchesTokens([m.model, ...(m.aliases ?? [])], q),
  );

/** ShoePicker.otherBrandHits 와 같은 규칙(브랜드도 매칭 대상). */
const otherBrands = (brand: string, q: string) =>
  SHOE_MODELS.filter(m => norm(m.brand) !== norm(brand)).filter(m =>
    matchesTokens([m.brand, m.model, ...(m.aliases ?? [])], q),
  );

describe('브랜드를 안 고르고 한글로 쳐도 찾을 수 있다', () => {
  // 피커를 열면 이 브랜드가 선택돼 있다(BRANDS[0]).
  const DEFAULT_BRAND = 'Nike';

  it.each([
    ['호카 클리프톤', 'Hoka'],
    ['아디다스 보스턴', 'Adidas'],
    ['아식스 노바블라스트', 'ASICS'],
  ])('기본 브랜드에 없는 "%s" 가 다른 브랜드에서 잡힌다', (q, expectBrand) => {
    expect(inBrand(DEFAULT_BRAND, q)).toHaveLength(0); // 여기까진 예전과 같다
    const others = otherBrands(DEFAULT_BRAND, q);
    expect(others.length).toBeGreaterThan(0);
    expect(others.some(m => norm(m.brand) === norm(expectBrand))).toBe(true);
  });

  it('브랜드만 한글로 쳐도 잡힌다 — 그 섹션엔 브랜드가 안 보이니까', () => {
    expect(otherBrands('Nike', '호카').length).toBeGreaterThan(0);
    expect(otherBrands('Nike', '아식스').length).toBeGreaterThan(0);
  });

  it('선택된 브랜드에 결과가 있으면 다른 브랜드는 뜨지 않는다 — 브랜드 우선 유지', () => {
    // "페가수스"는 Nike 안에서 잡히므로 폴백이 열리면 안 된다(2026-07-07 결정).
    expect(inBrand('Nike', '페가수스').length).toBeGreaterThan(0);
  });
});

describe('있는 신발을 "없다"고 집계하지 않는다', () => {
  it('다른 브랜드에서 찾았으면 검색 0건이 아니다', () => {
    // noResult = brandModels 0건 **그리고** otherBrand 0건일 때만 true 여야 한다.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'ShoePicker.tsx'),
      'utf8',
    ) as string;
    expect(src).toMatch(
      /noResult\s*=\s*q\.length > 0 && brandModels\.length === 0 && otherBrandModels\.length === 0/,
    );
  });

  it('진짜 없는 것은 여전히 0건이다 — 폴백이 아무거나 통과시키지 않는다', () => {
    expect(inBrand('Nike', '자동차부품')).toHaveLength(0);
    expect(otherBrands('Nike', '자동차부품')).toHaveLength(0);
  });
});

describe('다른 브랜드 섹션은 목록이 아니라 보조 장치다', () => {
  it('상한이 있고, 넘치면 몇 개가 더 있는지 말한다', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'ShoePicker.tsx'),
      'utf8',
    ) as string;
    expect(src).toMatch(/OTHER_BRAND_LIMIT = \d+/);
    // 조용히 자르면 "이게 전부"로 읽힌다.
    expect(src).toMatch(/otherBrandCount > OTHER_BRAND_LIMIT/);
  });

  it('그 섹션의 행에는 브랜드가 붙는다 — 레일이 말해주지 않으므로', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'ShoePicker.tsx'),
      'utf8',
    ) as string;
    expect(src).toMatch(/withBrand \? `\$\{brand\} \$\{model\}` : model/);
  });
});
