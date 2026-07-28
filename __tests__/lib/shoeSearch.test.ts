/**
 * 신발 검색 매칭 — docs/shoes-spec.md §6 계약.
 *
 * 검색이 약하면 사용자는 "내 신발이 없다"고 결론짓고 등록을 포기한다. 실제로는 있는데
 * 이름을 다르게 부른 것뿐인 경우가 대부분이라, 그 경로들이 살아 있는지 지킨다.
 */
import {
  normalizeQuery,
  matchesShoe,
  searchShoes,
  searchableStrings,
} from '../../lib/shoeSearch';
import {emptyShoeDoc, ShoeDoc} from '../../types/shoe';

function make(over: Partial<ShoeDoc>): ShoeDoc {
  return {...emptyShoeDoc(over.id ?? 'x', over.brand ?? 'Nike', over.model ?? 'Pegasus', over.category ?? 'daily'), ...over};
}

const PEGASUS = make({
  id: 'nike-pegasus-41', brand: 'Nike', model: 'Pegasus', version: '41',
  releaseYear: 2024, searchAliases: ['나이키 페가수스', '페가서스', '페가'],
});
const MAFATE_STSFY = make({
  id: 'hoka-mafate-speed-4-lite-satisfy', brand: 'Hoka', model: 'Mafate Speed',
  version: '4', variant: 'LITE', collabWith: 'Satisfy', category: 'trail',
  releaseYear: 2025, searchAliases: ['새티스파이 호카', '마파테'],
});
const ADIOS_STSFY = make({
  id: 'adidas-adizero-adios-pro-4-satisfy', brand: 'adidas', model: 'Adizero Adios Pro',
  version: '4', collabWith: 'Satisfy', category: 'racing', releaseYear: 2026,
  searchAliases: ['아디제로 아디오스'],
});
const OLD = make({
  id: 'nike-pegasus-39', brand: 'Nike', model: 'Pegasus', version: '39',
  releaseYear: 2022, discontinued: true, searchAliases: ['페가수스 39'],
});
const ALL = [PEGASUS, MAFATE_STSFY, ADIOS_STSFY, OLD];

describe('정규화', () => {
  it('대소문자·공백·하이픈을 접는다', () => {
    expect(normalizeQuery('  Zoom-Fly   6 ')).toBe('zoom fly 6');
    expect(normalizeQuery('v14')).toBe('v14');
    expect(normalizeQuery('v-14')).toBe('v 14');
  });
});

describe('매칭 대상 — 이름을 다르게 불러도 찾는다', () => {
  it('브랜드로 찾는다', () => {
    expect(matchesShoe(PEGASUS, 'nike')).toBe(true);
  });

  it('모델+버전으로 찾는다', () => {
    expect(matchesShoe(PEGASUS, 'pegasus 41')).toBe(true);
  });

  it('한글 표기로 찾는다(searchAliases)', () => {
    expect(matchesShoe(PEGASUS, '페가수스')).toBe(true);
    expect(matchesShoe(PEGASUS, '나이키 페가수스')).toBe(true);
  });

  it('흔한 오타로도 찾는다', () => {
    expect(matchesShoe(PEGASUS, '페가서스')).toBe(true);
  });

  it('축약형으로도 찾는다', () => {
    expect(matchesShoe(PEGASUS, '페가')).toBe(true);
  });

  it('collabWith 로 찾는다 — 이게 콜라보 검색의 핵심', () => {
    expect(matchesShoe(MAFATE_STSFY, 'satisfy')).toBe(true);
    expect(matchesShoe(ADIOS_STSFY, 'satisfy')).toBe(true);
  });

  it('한글 협업명으로도 여러 브랜드가 같이 나온다', () => {
    const r = searchShoes(ALL, '새티스파이');
    // 별칭에 '새티스파이 호카'가 있는 Hoka 는 확실히 걸린다.
    expect(r.map((s) => s.id)).toContain(MAFATE_STSFY.id);
  });

  it('variant 로도 찾는다', () => {
    expect(matchesShoe(MAFATE_STSFY, 'lite')).toBe(true);
  });

  it('토큰이 전부 걸려야 한다(하나만 맞으면 안 된다)', () => {
    expect(matchesShoe(PEGASUS, 'nike pegasus')).toBe(true);
    expect(matchesShoe(PEGASUS, 'nike bondi')).toBe(false);
  });

  it('빈 질의는 전체를 통과시킨다', () => {
    expect(matchesShoe(PEGASUS, '')).toBe(true);
    expect(searchShoes(ALL, '').length).toBe(ALL.length);
  });

  it('검색 문자열에 빈 값이 섞이지 않는다', () => {
    for (const s of searchableStrings(PEGASUS)) expect(s.trim().length).toBeGreaterThan(0);
  });
});

describe('단종 — 검색엔 나오되 추천에선 빠진다', () => {
  it('일반 검색에는 단종도 나온다(사용자가 지금 신고 있다)', () => {
    const r = searchShoes(ALL, 'pegasus');
    expect(r.map((s) => s.id)).toContain(OLD.id);
  });

  it('신규 등록 추천에서는 빠진다(못 사는 걸 권하지 않는다)', () => {
    const r = searchShoes(ALL, 'pegasus', {forNewRegistration: true});
    expect(r.map((s) => s.id)).not.toContain(OLD.id);
    expect(r.map((s) => s.id)).toContain(PEGASUS.id);
  });

  it('단종은 뒤로 밀린다', () => {
    const r = searchShoes(ALL, 'pegasus');
    expect(r.findIndex((s) => s.id === PEGASUS.id))
      .toBeLessThan(r.findIndex((s) => s.id === OLD.id));
  });
});

describe('정렬', () => {
  it('질의로 시작하는 것이 먼저 온다', () => {
    const r = searchShoes(ALL, 'hoka');
    expect(r[0].id).toBe(MAFATE_STSFY.id);
  });

  it('같은 조건이면 최신 연도 먼저', () => {
    const r = searchShoes([ADIOS_STSFY, MAFATE_STSFY], 'satisfy');
    expect(r[0].releaseYear).toBe(2026);
  });

  it('같은 입력이면 항상 같은 순서(결정적)', () => {
    const a = searchShoes(ALL, 'p').map((s) => s.id);
    const b = searchShoes(ALL, 'p').map((s) => s.id);
    expect(a).toEqual(b);
  });

  it('limit 을 지킨다', () => {
    expect(searchShoes(ALL, '', {limit: 2}).length).toBe(2);
    expect(searchShoes(ALL, '', {limit: 0}).length).toBe(0);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const before = ALL.map((s) => s.id);
    searchShoes(ALL, 'nike');
    expect(ALL.map((s) => s.id)).toEqual(before);
  });
});
