import {
  buildShoeSpec,
  categoryAxes,
  cushionFromStack,
  lookupOfficialSpec,
  officialSpecCount,
  basisOf,
  dropWarningKo,
  SPEC_BASIS_KO,
} from '../../lib/shoeSpecModel';
import shoeSpecs from '../../data/shoeSpecs.json';
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
    // 스펙 표(data/shoeSpecs.json)에 아직 없는 모델을 골라 확인한다.
    const unknown = SHOE_MODELS.find((m) => !lookupOfficialSpec(m.brand, m.model))!;
    expect(unknown).toBeDefined();
    const spec = buildShoeSpec(unknown.brand, unknown.model);
    expect('weightG' in spec).toBe(false);
    expect('dropMm' in spec).toBe(false);
    expect('stackHeelMm' in spec).toBe(false);
  });

  it('스펙 표에 실린 모델은 표의 값을 자동으로 쓴다', () => {
    const spec = buildShoeSpec('Nike', 'Pegasus 41');
    expect(spec.weightG).toBe(281);
    expect(spec.stackHeelMm).toBe(37);
    expect(spec.dropMm).toBe(10);
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

describe('스펙 표(data/shoeSpecs.json) 무결성', () => {
  const keys = Object.keys((shoeSpecs as any).specs || {});

  it('모든 키가 카탈로그 표기와 정확히 일치한다(오타는 조용히 무시되므로)', () => {
    expect(keys.length).toBeGreaterThan(0);
    const catalog = new Set(SHOE_MODELS.map((m) => `${m.brand}|${m.model}`));
    const orphans = keys.filter((k) => !catalog.has(k));
    expect(orphans).toEqual([]);
  });

  it('값이 러닝화로서 말이 되는 범위 안이다', () => {
    for (const k of keys) {
      const s = (shoeSpecs as any).specs[k];
      if (s.weightG !== undefined) {
        expect(s.weightG).toBeGreaterThan(120);   // 어떤 레이싱화도 이보다 가볍지 않다
        expect(s.weightG).toBeLessThan(450);      // 이보다 무거우면 러닝화가 아니다
      }
      if (s.stackHeelMm !== undefined) {
        expect(s.stackHeelMm).toBeGreaterThan(10);
        expect(s.stackHeelMm).toBeLessThanOrEqual(50); // World Athletics 로드 상한 40mm + 여유
      }
      if (s.dropMm !== undefined) {
        expect(s.dropMm).toBeGreaterThanOrEqual(0);
        expect(s.dropMm).toBeLessThanOrEqual(15);
      }
    }
  });

  // 스펙은 두 곳에서 온다: 손으로 확인한 shoeSpecs.json 과, 공홈·아카이브에서 수확한
  // shoeCatalog.json. 카탈로그가 훨씬 넓어서 조회 대상은 표보다 많다.
  it('조회 대상은 손으로 넣은 표보다 넓다 — 카탈로그가 바닥에 깔린다', () => {
    expect(officialSpecCount()).toBeGreaterThan(keys.length);
  });

  it('겹치면 손으로 확인한 표가 이긴다 — 화면에 뜨던 값이 바뀌면 안 된다', () => {
    for (const k of keys) {
      const [brand, ...rest] = k.split('|');
      const got = lookupOfficialSpec(brand, rest.join('|'));
      expect(got).toEqual((shoeSpecs as any).specs[k]);
    }
  });

  it('없는 모델은 여전히 undefined', () => {
    expect(lookupOfficialSpec('없는브랜드', '없는모델')).toBeUndefined();
  });
});

describe('스택 → 쿠션 산정', () => {
  it('두꺼울수록 푹신하다(단조 증가)', () => {
    const stacks = [24, 30, 35, 39, 44];
    const vals = stacks.map(cushionFromStack);
    expect(vals).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
  });

  it('같은 카테고리 안에서도 스택이 다르면 쿠션이 갈린다(이게 도입 이유)', () => {
    // 슈퍼트레이너 두 켤레: 스택 45mm vs 33mm
    const a = buildShoeSpec('ASICS', 'Superblast 2');            // 표에 45mm
    const b = buildShoeSpec('ASICS', 'Superblast 2', {stackHeelMm: 33});
    expect(a.cushion).toBeGreaterThan(b.cushion!);
  });

  it('이상한 스택 값은 중간값으로 안전 처리한다', () => {
    expect(cushionFromStack(0)).toBe(3);
    expect(cushionFromStack(NaN)).toBe(3);
    expect(cushionFromStack(-5)).toBe(3);
  });
});

describe('근거 표기 — 출처를 사실대로', () => {
  it('등급을 매긴 주체가 keego 임을 밝힌다(브랜드가 매긴 게 아니다)', () => {
    expect(SPEC_BASIS_KO).toContain('keego');
    expect(SPEC_BASIS_KO).not.toContain('실측');
    // "브랜드 데이터"로 뭉뚱그리면 출처 허위 표시가 된다 — 브랜드는 '쿠션 4단계'라고
    // 말한 적이 없다. 이 회귀 테스트가 그 문구로 되돌아가는 걸 막는다.
    expect(SPEC_BASIS_KO).not.toContain('브랜드 데이터');
  });

  it('축마다 실제 근거를 숫자로 말한다', () => {
    const withStack = basisOf({weightG: 281, stackHeelMm: 42});
    expect(withStack.weight).toBe('브랜드 공식 스펙');
    expect(withStack.cushion).toBe('스택 42mm 기준');

    // 스택을 모르면 숫자를 지어내지 않고 종류 기준이라고 밝힌다.
    const noStack = basisOf({});
    expect(noStack.cushion).toBe('신발 종류 기준');
    expect(noStack.weight).toBe('');
  });
});

describe('드롭 경고 — 부상 위험을 먼저 말한다', () => {
  it('드롭이 4mm 이상 낮아지면 경고한다', () => {
    const w = dropWarningKo(12, 5);
    expect(w).toContain('7mm 낮아요');
    expect(w).toContain('아킬레스건');
  });

  it('적응 범위(4mm 미만)는 경고하지 않는다', () => {
    expect(dropWarningKo(10, 8)).toBe('');
    expect(dropWarningKo(10, 10)).toBe('');
  });

  it('드롭이 높아지는 쪽은 경고하지 않는다(부상 위험이 낮다)', () => {
    expect(dropWarningKo(4, 12)).toBe('');
  });

  it('한쪽이라도 모르면 경고하지 않는다(추측 금지)', () => {
    expect(dropWarningKo(undefined, 4)).toBe('');
    expect(dropWarningKo(12, undefined)).toBe('');
    expect(dropWarningKo(NaN, 4)).toBe('');
  });
});
