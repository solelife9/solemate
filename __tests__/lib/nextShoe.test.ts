import {
  isCompatibleReplacement,
  prevCategory,
  recommendByAxis,
  similarShoes,
  specDistance,
  AXIS_ORDER,
} from '../../lib/nextShoe';
import {SHOE_MODELS, ShoeModel} from '../../data/shoeModels';

/** 그 카테고리의 실제 시드 모델을 집어온다(합성 데이터로 눈속임하지 않게). */
function firstOf(category: ShoeModel['category']): ShoeModel {
  const m = SHOE_MODELS.find((s) => s.category === category);
  if (!m) throw new Error(`시드에 ${category} 가 없다`);
  return m;
}

describe('카테고리 게이트 — 이 모듈의 존재 이유', () => {
  it('같은 카테고리만 교체 후보로 성립한다', () => {
    expect(isCompatibleReplacement('super_trainer', 'super_trainer')).toBe(true);
    expect(isCompatibleReplacement('max_cushion', 'max_cushion')).toBe(true);
  });

  it('쿠션화를 졸업한 러너에게 카본 레이싱화를 권하지 않는다', () => {
    // 축만 보면 카본화는 '더 통통 튀어요'로 걸린다(반발 5 vs 2). 그런데 수명 450km에
    // 안정성이 가장 낮은 레이스 전용이라, 데일리로 신으면 부상·낭비로 직결된다.
    expect(isCompatibleReplacement('max_cushion', 'carbon_racing')).toBe(false);
    const prev = firstOf('max_cushion');
    for (const axis of AXIS_ORDER) {
      const got = recommendByAxis(prev.brand, prev.model, axis, {limit: 50});
      expect(got.every((c) => c.model.category === 'max_cushion')).toBe(true);
    }
  });

  it('로드 러너에게 트레일화를 권하지 않는다(노면이 다르다)', () => {
    expect(isCompatibleReplacement('daily_trainer', 'trail')).toBe(false);
    const prev = firstOf('daily_trainer');
    const all = similarShoes(prev.brand, prev.model, {limit: 50});
    expect(all.some((c) => c.model.category === 'trail')).toBe(false);
  });

  it('모든 카테고리에서 교차 추천이 한 건도 나오지 않는다', () => {
    const cats = [...new Set(SHOE_MODELS.map((m) => m.category))];
    for (const c of cats) {
      const prev = firstOf(c);
      for (const item of similarShoes(prev.brand, prev.model, {limit: 10})) {
        expect(item.model.category).toBe(c);
      }
    }
  });

  it('카탈로그에 없는 신발은 데일리로 본다(안전한 폴백)', () => {
    expect(prevCategory('없는브랜드', '없는모델')).toBe('daily_trainer');
  });
});

describe('추천 목록 규칙', () => {
  const prev = firstOf('daily_trainer');

  it('자기 자신은 후보에 없다', () => {
    const all = similarShoes(prev.brand, prev.model, {limit: 20});
    expect(
      all.some((c) => c.model.brand === prev.brand && c.model.model === prev.model),
    ).toBe(false);
  });

  it('한 브랜드가 목록을 독차지하지 않는다', () => {
    const got = recommendByAxis(prev.brand, prev.model, 'longer', {limit: 3});
    if (got.length >= 2) {
      const brands = new Set(got.map((c) => c.model.brand.toLowerCase()));
      expect(brands.size).toBeGreaterThan(1);
    }
  });

  it('limit 을 넘지 않고, 0이면 빈 배열', () => {
    expect(recommendByAxis(prev.brand, prev.model, 'longer', {limit: 2}).length).toBeLessThanOrEqual(2);
    expect(recommendByAxis(prev.brand, prev.model, 'longer', {limit: 0})).toEqual([]);
  });

  it('같은 입력이면 항상 같은 순서다(결정적)', () => {
    const a = recommendByAxis(prev.brand, prev.model, 'longer', {limit: 5}).map((c) => c.model.model);
    const b = recommendByAxis(prev.brand, prev.model, 'longer', {limit: 5}).map((c) => c.model.model);
    expect(a).toEqual(b);
  });

  it('브랜드가 골고루 섞인다(한 브랜드가 앞을 독차지하지 않는다)', () => {
    const got = similarShoes(prev.brand, prev.model, {limit: 6, maxPerBrand: 2});
    const counts = new Map<string, number>();
    for (const c of got) {
      const k = c.model.brand.toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
    if (got.length >= 3) expect(counts.size).toBeGreaterThan(1);
  });

  it('similarShoes 도 limit·결정성을 지킨다', () => {
    expect(similarShoes(prev.brand, prev.model, {limit: 3}).length).toBeLessThanOrEqual(3);
    expect(similarShoes(prev.brand, prev.model, {limit: 0})).toEqual([]);
    const a = similarShoes(prev.brand, prev.model, {limit: 5}).map((c) => c.model.model);
    const b = similarShoes(prev.brand, prev.model, {limit: 5}).map((c) => c.model.model);
    expect(a).toEqual(b);
  });
});

describe('specDistance — 비슷함의 근거', () => {
  it('아는 축이 하나도 없으면 null(비슷하다고 말할 근거가 없다)', () => {
    expect(specDistance({brand: 'A', model: 'a'}, {brand: 'B', model: 'b'})).toBeNull();
  });

  it('스펙이 같으면 0에 가깝다', () => {
    const a = {brand: 'A', model: 'a', weightG: 260, cushion: 3, lifespanKm: 650};
    const b = {brand: 'B', model: 'b', weightG: 260, cushion: 3, lifespanKm: 650};
    expect(specDistance(a, b)).toBe(0);
  });

  it('많이 다를수록 값이 커진다', () => {
    const base = {brand: 'A', model: 'a', weightG: 260, cushion: 3, lifespanKm: 650};
    const near = {brand: 'B', model: 'b', weightG: 270, cushion: 3, lifespanKm: 650};
    const far = {brand: 'C', model: 'c', weightG: 340, cushion: 5, lifespanKm: 450};
    expect(specDistance(base, near)!).toBeLessThan(specDistance(base, far)!);
  });

  it('한쪽만 아는 축은 세지 않는다', () => {
    const a = {brand: 'A', model: 'a', weightG: 260, lifespanKm: 650};
    const b = {brand: 'B', model: 'b', lifespanKm: 650};
    expect(specDistance(a, b)).toBe(0); // 수명만 비교됨
  });
});

describe('비슷한 순 정렬', () => {
  it('스펙이 비슷한 쪽이 먼저 온다', () => {
    // 실제 스펙 표를 쓰는 대신 주입해 결정적으로 확인한다.
    const pool = SHOE_MODELS.filter((m) => m.category === 'super_trainer').slice(0, 4);
    const [prev, near, far] = pool;
    const got = similarShoes(prev.brand, prev.model, {
      pool,
      limit: 5,
      // 브랜드 라운드로빈이 순서에 끼어들지 않게 풀어둔다 — 여기서 보는 건 유사도 정렬이다.
      maxPerBrand: 10,
      officialSpecs: {
        [`${prev.brand}|${prev.model}`]: {weightG: 250},
        [`${near.brand}|${near.model}`]: {weightG: 255},
        [`${far.brand}|${far.model}`]: {weightG: 340},
      },
    });
    const order = got.map((c) => c.model.model);
    expect(order.indexOf(near.model)).toBeLessThan(order.indexOf(far.model));
  });

  it('스펙을 모르는 후보도 버리지 않는다(같은 종류면 후보 자격은 있다)', () => {
    const pool = SHOE_MODELS.filter((m) => m.category === 'stability').slice(0, 5);
    const got = similarShoes(pool[0].brand, pool[0].model, {pool, limit: 10, maxPerBrand: 10});
    expect(got.length).toBe(pool.length - 1);
  });
});
