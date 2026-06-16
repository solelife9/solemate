// ============================================================================
// data/shoeModels.ts — 신발 시드 DB + 권장수명 추천 순수함수 단위 테스트
//
// 행위(관찰 가능한 결과) 검증: 알려진 모델 → 권장 km, per-model 오버라이드,
// 카테고리 fallback, daily 기본값, 체중 보정, 브랜드 파생.
// ============================================================================
import {
  SHOE_MODELS,
  BRANDS,
  categoryLifespanKm,
  DEFAULT_LIFESPAN_KM,
  LIFESPAN_OVERRIDES,
  getRecommendedLifespanKm,
  findShoeModel,
  modelsForBrand,
  weightAdjustmentFactor,
  type ShoeModel,
} from '../../data/shoeModels';

describe('SHOE_MODELS 시드 데이터', () => {
  test('164개(≥100) 모델을 제공한다', () => {
    expect(Array.isArray(SHOE_MODELS)).toBe(true);
    expect(SHOE_MODELS.length).toBe(164);
  });

  test('모든 레코드가 brand·model·category·recommendedKm·year를 갖는다', () => {
    for (const m of SHOE_MODELS) {
      expect(typeof m.brand).toBe('string');
      expect(m.brand.length).toBeGreaterThan(0);
      expect(typeof m.model).toBe('string');
      expect(m.model.length).toBeGreaterThan(0);
      expect(Object.keys(categoryLifespanKm)).toContain(m.category);
      expect(m.recommendedKm).toBeGreaterThan(0);
      expect(m.year).toBeGreaterThanOrEqual(2023);
    }
  });

  test('(brand+model) 조합은 고유하다(중복 시드 없음)', () => {
    const keys = SHOE_MODELS.map((m) => `${m.brand}::${m.model}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('각 모델 recommendedKm은 (유명모델 override ?? 카테고리 기본값)과 일치한다', () => {
    for (const m of SHOE_MODELS) {
      const key = `${m.brand}::${m.model}`;
      const expected = LIFESPAN_OVERRIDES[key] ?? categoryLifespanKm[m.category];
      expect(m.recommendedKm).toBe(expected);
    }
  });

  test('유명 모델 개별 보정(override)이 실제로 적용된다', () => {
    expect(getRecommendedLifespanKm({brand: 'Nike', model: 'Alphafly 3'})).toBe(400); // 초경량 카본↓
    expect(getRecommendedLifespanKm({brand: 'Adidas', model: 'Adizero Adios Pro 4'})).toBe(550);
    expect(getRecommendedLifespanKm({brand: 'Asics', model: 'Superblast 2'})).toBe(700);
    expect(getRecommendedLifespanKm({brand: 'Asics', model: 'Gel-Kayano 32'})).toBe(750);
    expect(getRecommendedLifespanKm({brand: 'New Balance', model: 'FuelCell Rebel v5'})).toBe(600);
    // override 키는 모두 실제 시드 모델과 매칭(오타 방지)
    for (const key of Object.keys(LIFESPAN_OVERRIDES)) {
      const [brand, model] = key.split('::');
      expect(findShoeModel(brand, model)).toBeDefined();
    }
  });
});

describe('categoryLifespanKm 매핑(스펙 값)', () => {
  test.each([
    ['daily_trainer', 650],
    ['max_cushion', 700],
    ['stability', 700],
    ['super_trainer', 650],
    ['carbon_racing', 450],
    ['trail', 650],
  ] as const)('%s → %i km', (cat, km) => {
    expect(categoryLifespanKm[cat]).toBe(km);
  });

  test('DEFAULT_LIFESPAN_KM은 daily(650)', () => {
    expect(DEFAULT_LIFESPAN_KM).toBe(650);
  });
});

describe('BRANDS 파생', () => {
  test('13개 브랜드를 중복 없이 제공한다', () => {
    expect(new Set(BRANDS).size).toBe(BRANDS.length);
    expect(BRANDS.length).toBe(13);
  });

  test('SHOE_MODELS의 brand 집합과 정확히 일치한다', () => {
    expect(new Set(BRANDS)).toEqual(new Set(SHOE_MODELS.map((m) => m.brand)));
  });

  test('대표 브랜드를 포함한다', () => {
    expect(BRANDS).toEqual(
      expect.arrayContaining(['Nike', 'Adidas', 'New Balance', 'Salomon', 'On']),
    );
  });
});

describe('modelsForBrand', () => {
  test('해당 브랜드의 모델만 반환한다', () => {
    const nike = modelsForBrand('Nike');
    expect(nike).toContain('Pegasus 41');
    expect(nike).toContain('Alphafly 3');
    expect(nike).not.toContain('Speedgoat 6'); // Hoka 모델
  });

  test('대소문자 차이를 무시한다', () => {
    expect(modelsForBrand('hoka')).toContain('Speedgoat 6');
  });

  test('없는 브랜드는 빈 배열', () => {
    expect(modelsForBrand('NoSuchBrand')).toEqual([]);
  });
});

describe('findShoeModel', () => {
  test('brand/model 미지정 시 undefined', () => {
    expect(findShoeModel('Nike')).toBeUndefined();
    expect(findShoeModel(undefined, 'Pegasus 41')).toBeUndefined();
  });

  test('존재하는 모델을 정확히 찾는다', () => {
    const found = findShoeModel('Hoka', 'Speedgoat 6') as ShoeModel;
    expect(found).toBeDefined();
    expect(found.category).toBe('trail');
    expect(found.recommendedKm).toBe(700); // Speedgoat 6 = 유명 모델 개별 보정(700)
    expect(found.year).toBe(2024);
  });

  test('없는 모델은 undefined', () => {
    expect(findShoeModel('Nike', 'Nonexistent 99')).toBeUndefined();
  });
});

describe('weightAdjustmentFactor 경계값', () => {
  test.each([
    [undefined, 1],
    [95, 0.85],
    [90, 0.85],
    [60, 1.1],
    [55, 1.1],
    [75, 1],
  ] as const)('weight=%s → factor %s', (w, f) => {
    expect(weightAdjustmentFactor(w)).toBe(f);
  });
});

describe('getRecommendedLifespanKm 추천 로직', () => {
  test('brand+model 매칭 → 모델 권장 km', () => {
    expect(getRecommendedLifespanKm({ brand: 'Nike', model: 'Pegasus 41' })).toBe(650);
    expect(getRecommendedLifespanKm({ brand: 'Saucony', model: 'Peregrine 15' })).toBe(650);
    expect(getRecommendedLifespanKm({ brand: 'Asics', model: 'Metaspeed Sky Paris' })).toBe(450);
  });

  test('대문자 브랜드/여백 차이도 매칭한다(App parseShoeName 호환)', () => {
    expect(getRecommendedLifespanKm({ brand: 'NIKE', model: 'Pegasus 41' })).toBe(650);
    expect(getRecommendedLifespanKm({ brand: 'nike', model: '  vaporfly 4 ' })).toBe(450);
  });

  test('카본 레이싱 기본값 → 450km(개별 보정 없는 모델)', () => {
    expect(getRecommendedLifespanKm({ brand: 'Nike', model: 'Vaporfly 4' })).toBe(450);
    expect(getRecommendedLifespanKm({ brand: 'Asics', model: 'Metaspeed Sky Paris' })).toBe(450);
  });

  test('미매칭 + category → 카테고리 기본값', () => {
    expect(getRecommendedLifespanKm({ brand: 'X', model: 'Y', category: 'trail' })).toBe(650);
    expect(getRecommendedLifespanKm({ category: 'carbon_racing' })).toBe(450);
  });

  test('모델·category 모두 없으면 daily 650', () => {
    expect(getRecommendedLifespanKm({ brand: 'Nike' })).toBe(650);
    expect(getRecommendedLifespanKm({})).toBe(650);
  });

  test('체중 보정 적용(반올림)', () => {
    expect(getRecommendedLifespanKm({ brand: 'Nike', model: 'Pegasus 41', weightKg: 95 })).toBe(553); // 650×0.85=552.5→553
    expect(getRecommendedLifespanKm({ brand: 'Nike', model: 'Pegasus 41', weightKg: 55 })).toBe(715); // 650×1.1
    expect(getRecommendedLifespanKm({ brand: 'Nike', model: 'Pegasus 41', weightKg: 72 })).toBe(650);
    expect(getRecommendedLifespanKm({ category: 'carbon_racing', weightKg: 95 })).toBe(383); // 450×0.85=382.5→383
  });
});
