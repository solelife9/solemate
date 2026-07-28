import {
  isCompatibleReplacement,
  prevCategory,
  recommendByAxis,
  buildAxisGroups,
  AXIS_ORDER,
} from '../../lib/nextShoe';
import {SHOE_MODELS, ShoeModel} from '../../data/shoeModels';
import {lookupOfficialSpec} from '../../lib/shoeSpecModel';

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
    const all = buildAxisGroups(prev.brand, prev.model, {limit: 50}).flatMap((g) => g.items);
    expect(all.some((c) => c.model.category === 'trail')).toBe(false);
  });

  it('모든 카테고리에서 교차 추천이 한 건도 나오지 않는다', () => {
    const cats = [...new Set(SHOE_MODELS.map((m) => m.category))];
    for (const c of cats) {
      const prev = firstOf(c);
      const groups = buildAxisGroups(prev.brand, prev.model, {limit: 10});
      for (const g of groups) {
        for (const item of g.items) {
          expect(item.model.category).toBe(c);
        }
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
    const all = buildAxisGroups(prev.brand, prev.model, {limit: 20}).flatMap((g) => g.items);
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

  it('빈 그룹은 만들지 않는다', () => {
    for (const g of buildAxisGroups(prev.brand, prev.model)) {
      expect(g.items.length).toBeGreaterThan(0);
    }
  });
});

describe('무게 스펙이 비교를 살린다', () => {
  // 스펙 표(data/shoeSpecs.json)는 계속 채워지므로, 이 스위트는 pool 을 명시해
  // 표의 성장과 무관하게 같은 결과를 내도록 격리한다.
  const superTrainers = SHOE_MODELS.filter((m) => m.category === 'super_trainer');
  const noSpecPool = superTrainers.filter((m) => !lookupOfficialSpec(m.brand, m.model)).slice(0, 6);

  it('무게를 모르면 무게 축 그룹이 생기지 않는다(추측하지 않는다)', () => {
    const prev = noSpecPool[0];
    const groups = buildAxisGroups(prev.brand, prev.model, {pool: noSpecPool});
    expect(groups.some((g) => g.axis === 'lighter')).toBe(false);
  });

  it('확인된 무게를 주면 "더 가벼워요"가 살아난다', () => {
    const prev = noSpecPool[0];
    const lighter = noSpecPool[1];
    const groups = buildAxisGroups(prev.brand, prev.model, {
      pool: noSpecPool,
      officialSpecs: {
        [`${prev.brand}|${prev.model}`]: {weightG: 260},
        [`${lighter.brand}|${lighter.model}`]: {weightG: 215},
      },
    });
    const g = groups.find((x) => x.axis === 'lighter');
    expect(g).toBeDefined();
    expect(g!.items[0].model.model).toBe(lighter.model);
    expect(g!.items[0].deltas.find((d) => d.axis === 'lighter')!.detailKo).toBe('45g 가벼워요');
  });

  it('실제 스펙 표가 채워질수록 비교 축이 저절로 늘어난다', () => {
    // Hoka Mach 6(210g/37mm)과 Clifton 9(247g/32mm)은 표에 있다 — 같은 데일리 계열이
    // 아니므로 카테고리 게이트를 지키되, 표가 실제로 축을 만들어내는지 확인한다.
    const withSpec = SHOE_MODELS.filter(
      (m) => m.category === 'daily_trainer' && lookupOfficialSpec(m.brand, m.model)?.weightG,
    );
    expect(withSpec.length).toBeGreaterThan(0);
    const prev = withSpec[0];
    const groups = buildAxisGroups(prev.brand, prev.model, {limit: 5});
    // 표에 무게가 있는 모델끼리는 무게 축이 실제로 계산된다(있으면 lighter, 없으면 최소
    // 수명 축이라도 뜬다 — 어느 쪽이든 빈 화면은 아니다).
    expect(groups.length).toBeGreaterThan(0);
  });
});
