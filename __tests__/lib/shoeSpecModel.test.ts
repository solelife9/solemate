import {
  buildShoeSpec,
  categoryAxes,
  SPEC_BASIS_KO,
} from '../../lib/shoeSpecModel';
import {compareAxes} from '../../lib/shoeCompare';
import {SHOE_MODELS} from '../../data/shoeModels';

describe('축 산정은 카테고리(설계 의도)에서 나온다', () => {
  it('쿠션화는 푹신함이 최대이고 안정은 낮다', () => {
    const a = categoryAxes('max_cushion');
    expect(a.cushion).toBe(5);
    expect(a.stability).toBeLessThan(3);
  });

  it('안정화는 안정이 최대다', () => {
    expect(categoryAxes('stability').stability).toBe(5);
  });

  it('카본 레이싱은 반발이 최대이고 안정이 최저다', () => {
    const a = categoryAxes('carbon_racing');
    expect(a.responsiveness).toBe(5);
    expect(a.stability).toBe(1);
  });

  it('데일리 트레이너가 모든 축의 기준점이다', () => {
    expect(categoryAxes('daily_trainer')).toEqual({cushion: 3, responsiveness: 3, stability: 3});
  });
});

describe('buildShoeSpec — 아는 것만 싣는다', () => {
  it('카탈로그 모델의 축과 권장수명을 채운다', () => {
    const spec = buildShoeSpec('Nike', 'Pegasus 41');
    expect(spec.brand).toBe('Nike');
    expect(spec.cushion).toBeGreaterThan(0);
    expect(spec.lifespanKm).toBeGreaterThan(0);
  });

  it('공식 스펙이 없으면 무게·드롭을 싣지 않는다(추측 금지)', () => {
    const spec = buildShoeSpec('Nike', 'Pegasus 41');
    expect('weightG' in spec).toBe(false);
    expect('dropMm' in spec).toBe(false);
  });

  it('확인된 공식 스펙이 있으면 그대로 싣는다', () => {
    const spec = buildShoeSpec('Nike', 'Pegasus 41', {weightG: 281, dropMm: 10});
    expect(spec.weightG).toBe(281);
    expect(spec.dropMm).toBe(10);
  });

  it('말이 안 되는 공식 스펙은 버린다', () => {
    const spec = buildShoeSpec('Nike', 'Pegasus 41', {weightG: 0, dropMm: -3});
    expect('weightG' in spec).toBe(false);
    expect('dropMm' in spec).toBe(false);
  });

  it('가벼우면 반발이 한 칸 오른다', () => {
    const base = buildShoeSpec('Nike', 'Pegasus 41');
    const light = buildShoeSpec('Nike', 'Pegasus 41', {weightG: 220});
    expect(light.responsiveness!).toBe(Math.min(5, base.responsiveness! + 1));
  });

  it('무거우면 반발이 한 칸 내린다', () => {
    const base = buildShoeSpec('Nike', 'Pegasus 41');
    const heavy = buildShoeSpec('Nike', 'Pegasus 41', {weightG: 320});
    expect(heavy.responsiveness!).toBe(Math.max(1, base.responsiveness! - 1));
  });

  it('중간 무게는 보정하지 않는다', () => {
    const base = buildShoeSpec('Nike', 'Pegasus 41');
    const mid = buildShoeSpec('Nike', 'Pegasus 41', {weightG: 270});
    expect(mid.responsiveness).toBe(base.responsiveness);
  });

  it('카탈로그에 없는 모델도 안전하게 처리한다(데일리 트레이너 폴백)', () => {
    const spec = buildShoeSpec('없는브랜드', '없는모델');
    expect(spec.cushion).toBe(3);
    expect(spec.responsiveness).toBe(3);
    expect(spec.stability).toBe(3);
    expect(spec.lifespanKm).toBeGreaterThan(0);
  });
});

describe('전 카탈로그 건전성 — 332개 어디서도 깨지지 않는다', () => {
  it('모든 모델이 1~5 범위의 축과 양수 수명을 갖는다', () => {
    expect(SHOE_MODELS.length).toBeGreaterThan(100);
    for (const m of SHOE_MODELS) {
      const spec = buildShoeSpec(m.brand, m.model);
      for (const axis of [spec.cushion, spec.responsiveness, spec.stability]) {
        expect(axis).toBeGreaterThanOrEqual(1);
        expect(axis).toBeLessThanOrEqual(5);
        expect(Number.isInteger(axis)).toBe(true);
      }
      expect(spec.lifespanKm).toBeGreaterThan(0);
    }
  });

  it('실제 카탈로그 두 모델을 비교하면 축이 나온다(파이프라인 연결 확인)', () => {
    const cushioned = SHOE_MODELS.find((m) => m.category === 'max_cushion')!;
    const racer = SHOE_MODELS.find((m) => m.category === 'carbon_racing')!;
    const axes = compareAxes(
      buildShoeSpec(cushioned.brand, cushioned.model),
      buildShoeSpec(racer.brand, racer.model),
    );
    const byAxis = Object.fromEntries(axes.map((a) => [a.axis, a.better]));
    // 쿠션화 → 카본화: 푹신함은 줄고 반발은 는다.
    expect(byAxis.softer).toBe(false);
    expect(byAxis.snappier).toBe(true);
  });
});

describe('근거 표기', () => {
  it('실측이 아니라 keego 분류임을 밝히는 문구가 있다', () => {
    expect(SPEC_BASIS_KO).toContain('keego 분류');
    expect(SPEC_BASIS_KO).not.toContain('실측');
  });
});
