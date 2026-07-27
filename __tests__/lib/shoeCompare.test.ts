import {
  compareAxes,
  groupByImprovedAxis,
  actualWonPerKm,
  expectedWonPerKm,
  wonPerKmLabelKo,
  wonPerKmVerdictKo,
  axisLabelKo,
  ShoeSpec,
} from '../../lib/shoeCompare';

const base: ShoeSpec = {
  brand: 'Nike', model: 'Pegasus 41',
  lifespanKm: 650, weightG: 280, dropMm: 10,
  cushion: 3, responsiveness: 3, stability: 3,
};

describe('compareAxes — 모르는 축은 비교하지 않는다', () => {
  it('양쪽 다 값이 있어야 축이 생긴다', () => {
    const noSpec: ShoeSpec = {brand: 'X', model: 'Y'};
    expect(compareAxes(base, noSpec)).toEqual([]);
    expect(compareAxes(noSpec, base)).toEqual([]);
  });

  it('한쪽만 결측인 축은 조용히 빠진다(기본값으로 추측하지 않는다)', () => {
    const partial: ShoeSpec = {brand: 'X', model: 'Y', weightG: 240}; // 무게만 있음
    const axes = compareAxes(base, partial).map((d) => d.axis);
    expect(axes).toEqual(['lighter']);
  });

  it('더 가벼우면 lighter 를 better 로 잡고 차이를 g 로 말한다', () => {
    const lighter = {...base, weightG: 240};
    const d = compareAxes(base, lighter).find((x) => x.axis === 'lighter')!;
    expect(d.better).toBe(true);
    expect(d.detailKo).toBe('40g 가벼워요');
  });

  it('더 무거우면 better=false 이고 문구도 반대다', () => {
    const heavier = {...base, weightG: 330};
    const d = compareAxes(base, heavier).find((x) => x.axis === 'lighter')!;
    expect(d.better).toBe(false);
    expect(d.detailKo).toBe('50g 무거워요');
  });

  it('체감 못 하는 차이는 축으로 세우지 않는다(무게 30g 미만)', () => {
    const almostSame = {...base, weightG: 265}; // 15g 차이
    expect(compareAxes(base, almostSame).map((d) => d.axis)).not.toContain('lighter');
  });

  it('1~5 스케일은 1칸 미만 차이를 노이즈로 본다', () => {
    const tiny = {...base, cushion: 3.5};
    expect(compareAxes(base, tiny).map((d) => d.axis)).not.toContain('softer');
    const real = {...base, cushion: 4};
    expect(compareAxes(base, real).map((d) => d.axis)).toContain('softer');
  });

  it('수명 50km 미만 차이는 무시한다', () => {
    expect(compareAxes(base, {...base, lifespanKm: 680}).map((d) => d.axis)).not.toContain('longer');
    expect(compareAxes(base, {...base, lifespanKm: 750}).map((d) => d.axis)).toContain('longer');
  });

  it('여러 축이 동시에 잡히고 순서가 결정적이다', () => {
    const better = {...base, cushion: 5, weightG: 230, lifespanKm: 800, stability: 5, responsiveness: 5};
    expect(compareAxes(base, better).map((d) => d.axis)).toEqual([
      'softer', 'lighter', 'longer', 'stabler', 'snappier',
    ]);
  });

  it('입력을 변형하지 않는다', () => {
    const snapshot = JSON.stringify(base);
    compareAxes(base, {...base, weightG: 200});
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('모든 축에 한국어 라벨이 있다', () => {
    for (const a of ['softer', 'lighter', 'longer', 'stabler', 'snappier'] as const) {
      expect(axisLabelKo[a]).toBeTruthy();
    }
  });
});

describe('groupByImprovedAxis — 방향별 추천 그룹', () => {
  const cands = [
    {id: 'soft', spec: {...base, cushion: 5}},
    {id: 'light', spec: {...base, weightG: 230}},
    {id: 'both', spec: {...base, cushion: 5, weightG: 230}},
    {id: 'worse', spec: {...base, cushion: 1, weightG: 340}},
  ];

  it('나아진 축에만 담는다(나빠진 축은 그룹을 만들지 않는다)', () => {
    const groups = groupByImprovedAxis(base, cands);
    const soft = groups.find((g) => g.axis === 'softer')!;
    expect(soft.items.map((i) => i.id).sort()).toEqual(['both', 'soft']);
    const light = groups.find((g) => g.axis === 'lighter')!;
    expect(light.items.map((i) => i.id).sort()).toEqual(['both', 'light']);
  });

  it('한 신발이 여러 그룹에 등장할 수 있다', () => {
    const groups = groupByImprovedAxis(base, cands);
    const appearsIn = groups.filter((g) => g.items.some((i) => i.id === 'both'));
    expect(appearsIn.length).toBe(2);
  });

  it('빈 그룹은 만들지 않는다', () => {
    const groups = groupByImprovedAxis(base, [{id: 'worse', spec: {...base, cushion: 1}}]);
    expect(groups).toEqual([]);
  });

  it('후보가 없으면 빈 배열', () => {
    expect(groupByImprovedAxis(base, [])).toEqual([]);
  });
});

describe('원/km — 근거를 반드시 함께 나른다', () => {
  it('내 신발은 실제 주행 기반으로 계산한다', () => {
    const v = actualWonPerKm(169000, 800)!;
    expect(v.wonPerKm).toBe(211);
    expect(v.km).toBe(800);
    expect(v.actual).toBe(true);
  });

  it('구매가가 없으면 계산하지 않는다(추정으로 채우지 않는다)', () => {
    expect(actualWonPerKm(undefined, 800)).toBeNull();
    expect(actualWonPerKm(0, 800)).toBeNull();
    expect(actualWonPerKm(-1000, 800)).toBeNull();
  });

  it('주행거리가 0이면 계산하지 않는다(0으로 나누지 않는다)', () => {
    expect(actualWonPerKm(169000, 0)).toBeNull();
    expect(actualWonPerKm(169000, undefined)).toBeNull();
  });

  it('후보 신발은 권장 수명 기반 예상치이며 그렇게 표시된다', () => {
    const v = expectedWonPerKm(200000, 650)!;
    expect(v.wonPerKm).toBe(308);
    expect(v.actual).toBe(false);
    expect(wonPerKmLabelKo(v)).toContain('권장 수명 기준');
  });

  it('실측 라벨은 실제 주행 기준이라고 밝힌다', () => {
    expect(wonPerKmLabelKo(actualWonPerKm(169000, 800))).toBe('1km당 211원 · 실제 주행 기준');
  });

  it('계산 불가면 빈 문자열(가짜 숫자를 만들지 않는다)', () => {
    expect(wonPerKmLabelKo(null)).toBe('');
  });

  it('NaN/Infinity 는 계산하지 않는다', () => {
    // 분자·분모 어느 쪽이든 유한하지 않으면 계산하지 않는다.
    expect(actualWonPerKm(NaN, 800)).toBeNull();
    expect(actualWonPerKm(169000, NaN)).toBeNull();
    expect(actualWonPerKm(169000, Infinity)).toBeNull();
    expect(expectedWonPerKm(Infinity, 650)).toBeNull();
    expect(expectedWonPerKm(200000, Infinity)).toBeNull();
  });
});

describe('원/km 판정 — 얼버무리지 않는다', () => {
  const prev = actualWonPerKm(240000, 800); // 300원/km

  it('싸지면 얼마 아끼는지 말한다', () => {
    const next = expectedWonPerKm(130000, 650); // 200원/km
    expect(wonPerKmVerdictKo(prev, next)).toBe('1km당 100원 아껴요');
  });

  it('비싸지면 얼마 더 드는지 말한다', () => {
    const next = expectedWonPerKm(260000, 650); // 400원/km
    expect(wonPerKmVerdictKo(prev, next)).toBe('1km당 100원 더 들어요');
  });

  it('10% 이내 차이는 우열을 말하지 않는다(추정 오차 범위)', () => {
    const next = expectedWonPerKm(208000, 650); // 320원/km = +6.7%
    expect(wonPerKmVerdictKo(prev, next)).toBe('1km당 비용은 지난 신발과 거의 같아요');
  });

  it('한쪽이라도 계산 불가면 판정하지 않는다', () => {
    expect(wonPerKmVerdictKo(prev, null)).toBe('');
    expect(wonPerKmVerdictKo(null, prev)).toBe('');
  });
});
