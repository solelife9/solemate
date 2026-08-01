// ============================================================================
// 랭킹 엔트리의 신발 요약 — 「1, 2, 3위는 뭘 신나」
//
// 이 값은 **남들이 보는 순위표**에 실린다. 그래서 두 가지를 본다:
//   · 쓰레기가 안 실리는가(빈 이름·음수·NaN)
//   · 상한을 넘지 않는가(엔트리는 100개씩 읽히므로 한 명의 큰 배열이 남을 느리게 한다)
// ============================================================================
import {
  sanitizeEntryShoes,
  buildStoredEntry,
  MAX_ENTRY_SHOES,
} from '../../lib/progression/firestoreRanking';

const stats = {distance: 10, consistency: 0.5, shoeHealth: 0.4, collection: 2, progressPoints: 100};
const build = (shoes?: unknown) =>
  buildStoredEntry({
    uid: 'u1', nickname: '민우', rankTier: 'gold' as never, rankColor: '#FF8000',
    stats: stats as never, updatedAt: 1, shoes: shoes as never,
  });

describe('sanitizeEntryShoes', () => {
  test('많이 신은 순으로 정렬한다', () => {
    const out = sanitizeEntryShoes([
      {brand: 'A', model: 'x', usedKm: 10},
      {brand: 'B', model: 'y', usedKm: 500},
    ]);
    expect(out.map(s => s.brand)).toEqual(['B', 'A']);
  });

  test('상한을 넘지 않는다', () => {
    const many = Array.from({length: MAX_ENTRY_SHOES + 3}, (_, i) => ({brand: 'B', model: `M${i}`, usedKm: i}));
    expect(sanitizeEntryShoes(many)).toHaveLength(MAX_ENTRY_SHOES);
  });

  test('이름이 아예 없는 항목은 버린다(빈 칸이 순위표에 뜨지 않게)', () => {
    expect(sanitizeEntryShoes([{brand: '', model: '', usedKm: 100}])).toHaveLength(0);
  });

  test('브랜드만 있어도 남긴다(직접 등록한 신발)', () => {
    expect(sanitizeEntryShoes([{brand: '내신발', model: '', usedKm: 5}])).toHaveLength(1);
  });

  test('거리는 정수로 — 순위표에 소수 자리는 잡음이다', () => {
    expect(sanitizeEntryShoes([{brand: 'A', model: 'x', usedKm: 412.47}])[0].usedKm).toBe(412);
  });

  test('이상한 거리는 0으로(음수·NaN 이 남의 화면에 안 나가게)', () => {
    const out = sanitizeEntryShoes([
      {brand: 'A', model: 'x', usedKm: -5},
      {brand: 'B', model: 'y', usedKm: NaN},
    ] as never);
    expect(out.every(s => s.usedKm === 0)).toBe(true);
  });

  test('배열이 아니면 빈 결과', () => {
    for (const bad of [null, undefined, '신발', 42, {}]) {
      expect(sanitizeEntryShoes(bad as never)).toEqual([]);
    }
  });
});

describe('buildStoredEntry — 신발 필드', () => {
  test('신발이 없으면 **필드 자체를 안 만든다**(규칙이 단순해진다)', () => {
    expect('shoes' in build()).toBe(false);
    expect('shoes' in build([])).toBe(false);
  });

  test('신발이 있으면 정규화해 싣는다', () => {
    const e = build([{brand: 'Nike', model: 'Pegasus 41', usedKm: 412.9}]);
    expect(e.shoes).toEqual([{brand: 'Nike', model: 'Pegasus 41', usedKm: 413}]);
  });

  test('스펙(무게·드롭)은 싣지 않는다 — 보는 사람 앱이 카탈로그에서 붙인다', () => {
    const e = build([{brand: 'Nike', model: 'Pegasus 41', usedKm: 1, weight: 280, drop: 10} as never]);
    expect(Object.keys(e.shoes![0]).sort()).toEqual(['brand', 'model', 'usedKm']);
  });

  test('나머지 필드는 그대로다(회귀 방어)', () => {
    const e = build();
    expect(e.uid).toBe('u1');
    expect(e.distance).toBe(10);
    expect(e.progressPoints).toBe(100);
  });
});
