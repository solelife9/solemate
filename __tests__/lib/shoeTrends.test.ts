/**
 * 「이번 달 많이 신는 러닝화」 — 순수 계산.
 *
 * 지키는 것:
 *  · 세는 건 **켤레가 아니라 사람**이다(신발 부자 한 명이 순위를 흔들면 안 된다)
 *  · 표본이 적으면 **아예 말하지 않는다**(1명이 신는 걸 유행이라 부르면 거짓말)
 *  · 같은 입력이면 항상 같은 순서(동률은 이름순)
 *
 * @format
 */
import {shoeTrends, MIN_TREND_SAMPLE} from '../../lib/shoeTrends';

const e = (...shoes: [string, string, number?][]) => ({
  shoes: shoes.map(([brand, model, usedKm]) => ({brand, model, usedKm: usedKm ?? 0})),
});
/** 표본 하한을 넘기기 위한 채움 — 서로 다른 신발이라 순위에 끼어들지 않는다. */
const filler = (n: number) =>
  Array.from({length: n}, (_, i) => e(['Filler', `M${i}`, 100]));

describe('표본이 모자라면 말하지 않는다', () => {
  test(`${MIN_TREND_SAMPLE}명 미만이면 top 이 비어 있다`, () => {
    const r = shoeTrends(filler(MIN_TREND_SAMPLE - 1));
    expect(r.top).toEqual([]);
    expect(r.sampleSize).toBe(MIN_TREND_SAMPLE - 1);   // 몇 명인지는 알려준다
  });

  test('딱 하한이면 말한다', () => {
    expect(shoeTrends(filler(MIN_TREND_SAMPLE)).top.length).toBeGreaterThan(0);
  });

  test('빈 입력·null 도 깨지지 않는다', () => {
    for (const bad of [null, undefined, []]) {
      expect(shoeTrends(bad as never)).toEqual({top: [], sampleSize: 0});
    }
  });

  test('신발을 안 실어 보낸 사람은 표본에 안 들어간다 — 옛 엔트리엔 신발이 없다', () => {
    expect(shoeTrends([...filler(MIN_TREND_SAMPLE), {}, {shoes: []}]).sampleSize)
      .toBe(MIN_TREND_SAMPLE);
  });
});

describe('세는 건 사람이다', () => {
  test('한 사람이 같은 모델을 두 켤레 가져도 1명', () => {
    const r = shoeTrends([
      e(['Nike', 'Pegasus 41', 100], ['Nike', 'Pegasus 41', 200]),
      ...filler(MIN_TREND_SAMPLE - 1),
    ], 50);
    expect(r.top.find(t => t.model === 'Pegasus 41')!.runners).toBe(1);
  });

  test('표기가 달라도(대소문자·여백) 같은 신발로 본다', () => {
    const r = shoeTrends([
      e(['Nike', 'Pegasus 41']), e([' nike ', 'PEGASUS 41']),
      ...filler(MIN_TREND_SAMPLE - 2),
    ]);
    expect(r.top[0].runners).toBe(2);
  });

  test('두 사람이 신으면 2명이고 비율이 따라온다', () => {
    const r = shoeTrends([
      e(['Nike', 'Pegasus 41']), e(['Nike', 'Pegasus 41']),
      ...filler(MIN_TREND_SAMPLE - 2),
    ]);
    const t = r.top[0];
    expect(t.runners).toBe(2);
    expect(t.share).toBeCloseTo(2 / MIN_TREND_SAMPLE);
  });
});

describe('순서와 상한', () => {
  test('많이 신는 순', () => {
    const r = shoeTrends([
      e(['A', 'x']), e(['A', 'x']), e(['A', 'x']),
      e(['B', 'y']), e(['B', 'y']),
      ...filler(MIN_TREND_SAMPLE),
    ]);
    expect(r.top.slice(0, 2).map(t => t.model)).toEqual(['x', 'y']);
  });

  test('동률이면 이름순 — 같은 입력이면 항상 같은 화면', () => {
    const rows = [e(['Zeta', 'z']), e(['Alpha', 'a']), ...filler(MIN_TREND_SAMPLE)];
    const a = shoeTrends(rows, 50).top.map(t => t.brand);
    const b = shoeTrends([...rows].reverse(), 50).top.map(t => t.brand);
    expect(a).toEqual(b);
    expect(a.indexOf('Alpha')).toBeLessThan(a.indexOf('Zeta'));
  });

  test('limit 을 넘지 않는다', () => {
    expect(shoeTrends(filler(20), 3).top).toHaveLength(3);
  });
});

describe('평균 거리 — 모르면 비운다', () => {
  test('아는 값만으로 평균을 낸다', () => {
    const r = shoeTrends([
      e(['Nike', 'Pegasus 41', 100]), e(['Nike', 'Pegasus 41', 300]),
      ...filler(MIN_TREND_SAMPLE - 2),
    ]);
    expect(r.top.find(t => t.model === 'Pegasus 41')!.avgKm).toBe(200);
  });

  test('아무도 거리를 모르면 null — 0km 라고 말하지 않는다', () => {
    const r = shoeTrends([
      e(['Nike', 'Pegasus 41', 0]), e(['Nike', 'Pegasus 41', 0]),
      ...filler(MIN_TREND_SAMPLE - 2),
    ]);
    expect(r.top.find(t => t.model === 'Pegasus 41')!.avgKm).toBeNull();
  });

  test('망가진 거리는 무시한다', () => {
    const r = shoeTrends([
      {shoes: [{brand: 'Nike', model: 'P', usedKm: NaN as number}]},
      {shoes: [{brand: 'Nike', model: 'P', usedKm: 200}]},
      ...filler(MIN_TREND_SAMPLE - 2),
    ]);
    expect(r.top.find(t => t.model === 'P')!.avgKm).toBe(200);
  });
});

describe('입력을 건드리지 않는다', () => {
  test('원본 배열·객체가 그대로다', () => {
    const rows = [e(['Nike', 'Pegasus 41', 100]), ...filler(MIN_TREND_SAMPLE)];
    const snap = JSON.stringify(rows);
    shoeTrends(rows);
    expect(JSON.stringify(rows)).toBe(snap);
  });
});
