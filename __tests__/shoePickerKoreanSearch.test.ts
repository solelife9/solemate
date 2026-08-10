// 신발 등록 검색 — **한국어 앱인데 한글로는 찾을 수 없었다.**
//
// 왜 있나 (2026-08-10)
// ----------------------------------------------------------------------------
// 카탈로그(data/shoeCatalog.json) 618켤레는 **전부** `searchAliases` 를 갖고 있다 —
// "보스턴"·"에보"·"페가수스" 같은 한글 표기·축약형이다. 그리고 `lib/shoeSearch.ts` 는
// 그걸 쓰는 매칭 로직을 갖고 있었고 단위 테스트도 초록이었다.
//
// **그런데 등록 피커가 그 모듈을 안 썼다.** ShoePicker 는 자기 검색을 따로 갖고 있었고
// (`norm(m.model).includes(q)`), 그 경로에는 별칭이 없었다. 게다가 별칭은 `ShoeModel`
// 타입에서 아예 탈락해 화면까지 오지도 않았다.
//
// 결과: 한글로 치면 **0건**. 그리고 앱은 그 질의를 '없는 신발' 신호로 기록했다
// (logSearchMiss) — 있는 신발을 없다고 집계하고 있었던 셈이다.
//
// 실측(수정 전 → 후): 보스턴 0→6 · 에보 0→9 · 페가수스 0→11 · 클리프톤 0→6 · 노바블라스트 0→4
import {SHOE_MODELS} from '../data/shoeModels';
import {matchesTokens} from '../lib/shoeSearch';

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');

/** 피커와 같은 방식으로 고른다(ShoePicker.tsx brandModels). */
const search = (brand: string, q: string) =>
  SHOE_MODELS.filter(m => norm(m.brand) === norm(brand)).filter(m =>
    matchesTokens([m.model, ...(m.aliases ?? [])], q),
  );

describe('한글로 신발을 찾을 수 있다', () => {
  const CASES: [string, string][] = [
    ['Adidas', '보스턴'],
    ['Adidas', '에보'],
    ['Nike', '페가수스'],
    ['Hoka', '클리프톤'],
    ['Asics', '노바블라스트'],
  ];

  it.each(CASES)('%s 에서 "%s" 가 잡힌다', (brand, q) => {
    expect(search(brand, q).length).toBeGreaterThan(0);
  });

  it('영문 검색은 그대로다 — 별칭을 더한 것이지 바꾼 게 아니다', () => {
    expect(search('Nike', 'pegasus').length).toBeGreaterThan(0);
    expect(search('Hoka', 'clifton').length).toBeGreaterThan(0);
  });

  it('빈 질의는 전체를 준다(브랜드 목록 그대로)', () => {
    const all = SHOE_MODELS.filter(m => norm(m.brand) === 'nike');
    expect(search('Nike', '').length).toBe(all.length);
  });

  it('엉뚱한 질의는 여전히 0건 — 별칭이 아무거나 통과시키지 않는다', () => {
    expect(search('Nike', '자동차부품')).toHaveLength(0);
  });
});

describe('별칭이 모델까지 실려 온다', () => {
  it('카탈로그의 한글 별칭이 ShoeModel 에 남아 있다', () => {
    // 여기가 끊기면 위 검색은 조용히 영문 전용으로 되돌아간다 — 화면엔 아무 표시도 없다.
    const withAliases = SHOE_MODELS.filter(m => (m.aliases?.length ?? 0) > 0);
    expect(withAliases.length).toBeGreaterThan(100);
  });

  it('별칭은 표시용이 아니다 — 모델명에 섞여 들어가지 않았다', () => {
    // 별칭을 model 에 이어 붙이는 '쉬운 수정'을 하면 목록에 한글이 튀어나온다.
    const leaked = SHOE_MODELS.filter(m => /[가-힣]/.test(m.model));
    expect(leaked.map(m => `${m.brand}|${m.model}`)).toEqual([]);
  });
});

// ── 스윕: 피커가 다시 자기 검색을 갖지 못하게 ────────────────────────────────
describe('매칭 규칙은 한 곳에만 있다', () => {
  it('ShoePicker 가 lib/shoeSearch 를 쓴다', () => {
    const {readFileSync} = require('fs');
    const {join} = require('path');
    const src = readFileSync(join(__dirname, '..', 'ShoePicker.tsx'), 'utf8') as string;
    expect(src).toMatch(/from '\.\/lib\/shoeSearch'/);
    // 옛 형태(`norm(m.model).includes(q)`)가 되살아나면 별칭이 다시 죽는다.
    expect(src).not.toMatch(/norm\(m\.model\)\.includes\(q\)/);
  });
});
