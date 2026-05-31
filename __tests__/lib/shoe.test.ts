import {
  parseShoeName,
  BRANDS,
  shoeHealth,
  isRetired,
  conditionForPercent,
  DEFAULT_MAX_KM,
  SHOE_CAUTION_PCT,
  SHOE_REPLACE_PCT,
} from '../../lib/shoe';

describe('parseShoeName', () => {
  test('empty name → empty brand & model', () => {
    expect(parseShoeName('')).toEqual({brand: '', model: ''});
  });

  test('known single-word brand (case-insensitive prefix)', () => {
    expect(parseShoeName('nike Pegasus 41')).toEqual({brand: 'NIKE', model: 'Pegasus 41'});
  });

  test('known multi-word brand wins over first-space split', () => {
    expect(parseShoeName('New Balance 1080v13')).toEqual({
      brand: 'NEW BALANCE',
      model: '1080v13',
    });
  });

  test('unknown brand → first token is the brand, uppercased', () => {
    expect(parseShoeName('Topo Phantom')).toEqual({brand: 'TOPO', model: 'Phantom'});
  });

  test('single token with no space → brand only', () => {
    expect(parseShoeName('Cloudmonster')).toEqual({brand: 'CLOUDMONSTER', model: ''});
  });

  test('BRANDS catalog is exported and non-empty', () => {
    expect(BRANDS.length).toBeGreaterThan(0);
    expect(BRANDS).toContain('New Balance');
  });
});

describe('shoeHealth — used = start_km + Σ(this shoe runs)', () => {
  const shoe = {id: 's1', max_km: 700, start_km: 0};

  test('새 신발: usedKm 0, remaining 전체, percentUsed 0, 양호', () => {
    const h = shoeHealth(shoe, []);
    expect(h.usedKm).toBe(0);
    expect(h.remainingKm).toBe(700);
    expect(h.percentUsed).toBe(0);
    expect(h.condition).toBe('양호');
  });

  test('해당 shoe_id 런만 누적하고 다른 신발은 무시한다', () => {
    const runs = [
      {shoe_id: 's1', km: 5},
      {shoe_id: 's1', km: 5},
      {shoe_id: 's2', km: 99},
    ];
    const h = shoeHealth(shoe, runs);
    expect(h.usedKm).toBeCloseTo(10, 5);
    expect(h.remainingKm).toBeCloseTo(690, 5);
  });

  test('start_km(기등록 거리)가 used에 더해진다', () => {
    const h = shoeHealth({id: 's1', max_km: 700, start_km: 120}, [{shoe_id: 's1', km: 30}]);
    expect(h.usedKm).toBeCloseTo(150, 5);
    expect(h.remainingKm).toBeCloseTo(550, 5);
  });

  test('문자열 km도 합산된다(백엔드 직렬화 대응)', () => {
    const h = shoeHealth(shoe, [{shoe_id: 's1', km: '12.5'}]);
    expect(h.usedKm).toBeCloseTo(12.5, 5);
  });

  test('수명을 넘기면 remainingKm은 0으로 클램프되지만 percentUsed는 100을 넘는다', () => {
    const h = shoeHealth(shoe, [{shoe_id: 's1', km: 800}]);
    expect(h.remainingKm).toBe(0);
    expect(h.percentUsed).toBeGreaterThan(100);
    expect(h.condition).toBe('교체');
  });

  test('max_km가 없으면 기본 카테고리 수명을 쓴다', () => {
    const h = shoeHealth({id: 's1'}, []);
    expect(h.remainingKm).toBe(DEFAULT_MAX_KM);
  });

  test('UI 별칭 max도 받아들인다', () => {
    const h = shoeHealth({id: 1, max: 400, start_km: 0}, [{shoe_id: 1, km: 200}]);
    expect(h.percentUsed).toBeCloseTo(50, 5);
  });
});

describe('shoeHealth — 카테고리 수명 비례 condition 티어', () => {
  const shoe = {id: 1, max_km: 700, start_km: 0};
  const tierAt = (km: number) => shoeHealth(shoe, [{shoe_id: 1, km}]).condition;

  test('75% 미만은 양호', () => {
    expect(tierAt(0)).toBe('양호');
    expect(tierAt(520)).toBe('양호'); // ~74.3%
  });
  test('75% 이상 90% 미만은 주의', () => {
    expect(tierAt(540)).toBe('주의'); // ~77.1%
    expect(tierAt(626)).toBe('주의'); // ~89.4%
  });
  test('90% 이상은 교체', () => {
    expect(tierAt(640)).toBe('교체'); // ~91.4%
    expect(tierAt(700)).toBe('교체'); // 100%
  });
  test('티어 경계는 임계값 이상에서 즉시 전환된다', () => {
    expect(conditionForPercent(SHOE_CAUTION_PCT - 0.01)).toBe('양호');
    expect(conditionForPercent(SHOE_CAUTION_PCT)).toBe('주의');
    expect(conditionForPercent(SHOE_REPLACE_PCT - 0.01)).toBe('주의');
    expect(conditionForPercent(SHOE_REPLACE_PCT)).toBe('교체');
  });
});

describe('isRetired — 보관 플래그', () => {
  test('retired:true → true', () => {
    expect(isRetired({id: 1, retired: true})).toBe(true);
  });
  test('플래그 없으면 false (기본 활성)', () => {
    expect(isRetired({id: 1})).toBe(false);
    expect(isRetired({})).toBe(false);
  });
  test('null/undefined 입력도 안전하게 false', () => {
    expect(isRetired(null)).toBe(false);
    expect(isRetired(undefined)).toBe(false);
  });
});
