/**
 * lib/wearModel 단위 테스트 — 마모 모델(2026-08-04 단일화 이후).
 *
 * 이 파일이 지키는 핵심 계약은 하나다: **한 신발은 한 숫자가 설명한다.**
 * 예전엔 수명 링(lib/shoe.shoeHealth = 실제 달린 거리)과 이 모듈(노면·페이스·체중·시간
 * 보정)이 같은 신발을 다르게 봤고, 몸무게 기준마저 65kg/70kg 으로 갈렸다.
 * 이제 누적 마모는 실제 달린 거리이고, 보정은 전부 수명(targetKmFor) 쪽에 있으며
 * 몸무게 규칙은 lib/shoe.weightDurabilityFactor 하나뿐이다.
 *
 *   S6-1 몸무게는 **수명(분모)** 을 줄인다 — 링과 같은 규칙·같은 기준(65kg).
 *   S6-2 누적 마모 = start_km + Σ 실제 달린 거리(노면·페이스 보정 없음).
 *   S6-3 저주행이라도 오래된 신발은 ageWearKm 가 누적된다(예측 속도용).
 *   A6-1 원본 shoe/run 객체는 변경되지 않는다(파생값만).
 *   A6-2 결측·0·음수·비유한 입력에서 NaN/Infinity/음수를 절대 반환하지 않는다.
 *
 * @format
 */
import {
  runEffectiveWear,
  targetKmFor,
  ageWearKm,
  effectiveWearKm,
  type WearRun,
  type WearShoe,
} from '../../lib/wearModel';
import {shoeHealth, weightDurabilityFactor, effectiveMaxKm} from '../../lib/shoe';
import {DEFAULT_LIFESPAN_KM, categoryLifespanKm} from '../../data/shoeModels';

// easy 페이스(6:00/km) 5km 런.
const easyRun: WearRun = {id: 'r1', distance_km: 5, duration_s: 5 * 360};
// race 페이스(3:30/km) 5km 런 — 같은 거리다.
const raceRun: WearRun = {id: 'r2', distance_km: 5, duration_s: 5 * 210};

describe('S6-1 몸무게는 수명(분모)을 줄인다 — 링과 같은 규칙', () => {
  test('무거울수록 유효 수명이 짧다', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    expect(targetKmFor(shoe, 85)).toBeLessThan(targetKmFor(shoe, 65));
  });

  test('수명 링(effectiveMaxKm)과 **같은 값**을 낸다 — 기준 체중이 갈리지 않는다', () => {
    // 예전 버그: 링은 65kg 기준으로 분모를, 예측은 70kg 기준으로 분자를 보정했다.
    // 그래서 68kg 인 사람이 한쪽에선 무거운 편, 다른 쪽에선 가벼운 편이 됐다.
    for (const w of [0, 55, 65, 68, 70, 85, 120]) {
      expect(targetKmFor({id: 's', target_km: 600}, w)).toBe(effectiveMaxKm(600, w));
    }
  });

  test('몸무게 미설정이면 보정 없음(계수 1) — 기존 사용자 수치가 무단 변동하지 않는다', () => {
    expect(weightDurabilityFactor(undefined)).toBe(1);
    expect(targetKmFor({id: 's', target_km: 600})).toBe(600);
  });
});

describe('S6-2 누적 마모 = 실제 달린 거리 (노면·페이스 보정 없음)', () => {
  test('같은 거리면 페이스가 달라도 마모가 같다', () => {
    // 예전엔 race 페이스에 1.10 을 곱했다 — 출처 없는 휴리스틱이었다.
    expect(runEffectiveWear(raceRun)).toBe(runEffectiveWear(easyRun));
    expect(runEffectiveWear(easyRun)).toBe(5);
  });

  test('수명 링(shoeHealth.usedKm)과 **같은 값**을 낸다', () => {
    const runs = [
      {id: 'r1', distance_km: 5, duration_s: 1800},
      {id: 'r2', distance_km: 7.5, duration_s: 2700},
    ];
    const worn = effectiveWearKm({id: 's1', target_km: 600, start_km: 30}, runs);
    const ring = shoeHealth(
      {id: 's1', max_km: 600, start_km: 30},
      [
        {shoe_id: 's1', km: 5},
        {shoe_id: 's1', km: 7.5},
      ],
    ).usedKm;
    expect(worn).toBe(ring);
    expect(worn).toBe(30 + 12.5);
  });

  test('등록 시 이미 쌓여 있던 거리(start_km)를 포함한다', () => {
    expect(effectiveWearKm({id: 's', start_km: 100}, [])).toBe(100);
    expect(effectiveWearKm({id: 's'}, [])).toBe(0);
  });
});

describe('S6-3 시간 기반 마모(ageWearKm) — 예측 속도용', () => {
  test('저주행이라도 오래된 신발은 ageWearKm 가 누적된다', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    const oldShoe: WearShoe = {
      id: 's-old',
      target_km: 720,
      created_at: '2025-06-04T00:00:00.000Z',
    };
    expect(ageWearKm(oldShoe, now)).toBeGreaterThan(300); // 약 12개월 × 30km/월

    // 갓 산 신발(같은 날)은 0.
    expect(ageWearKm({...oldShoe, created_at: now.toISOString()}, now)).toBe(0);
  });

  test('**누적 마모에는 들어가지 않는다** — 그건 링이 모르는 값이라 섞으면 또 어긋난다', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    const oldShoe: WearShoe = {id: 's', target_km: 720, created_at: '2025-06-04T00:00:00.000Z'};
    expect(ageWearKm(oldShoe, now)).toBeGreaterThan(0);
    expect(effectiveWearKm(oldShoe, [])).toBe(0); // 안 신었으면 0
  });

  test('purchase_date 폴백, 미래 날짜·결측은 0', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    expect(ageWearKm({id: 's', target_km: 240, purchase_date: '2025-06-04'}, now)).toBeGreaterThan(0);
    expect(ageWearKm({id: 's', purchase_date: '2099-01-01'}, now)).toBe(0);
    expect(ageWearKm({id: 's', target_km: 700}, now)).toBe(0);
  });
});

describe('targetKmFor 기본 규칙', () => {
  test('명시 target_km(유한·>0)이면 그것을 쓴다', () => {
    expect(targetKmFor({id: 's', target_km: 450})).toBe(450);
  });

  test('모델명 파싱 → 카테고리 수명', () => {
    expect(targetKmFor({id: 's', name: 'Nike Pegasus 41'})).toBe(categoryLifespanKm.daily_trainer);
    expect(targetKmFor({id: 's', name: 'Hoka Speedgoat 6'})).toBe(categoryLifespanKm.trail);
  });

  test('target_km 0/음수·미지 모델 → DEFAULT_LIFESPAN_KM(700)', () => {
    expect(targetKmFor({id: 's', target_km: 0})).toBe(DEFAULT_LIFESPAN_KM);
    expect(targetKmFor({id: 's', target_km: -100})).toBe(DEFAULT_LIFESPAN_KM);
    expect(targetKmFor({id: 's', name: 'Totally Unknown Shoe'})).toBe(DEFAULT_LIFESPAN_KM);
    expect(targetKmFor({id: 's'})).toBe(DEFAULT_LIFESPAN_KM);
  });
});

describe('A6-1 원본 불변', () => {
  test('effectiveWearKm 는 shoe/run 객체를 변경하지 않는다', () => {
    const shoe: WearShoe = {id: 's1', total_km: 123, target_km: 700, name: 'Nike Pegasus 41'};
    const run: WearRun = {id: 'r1', shoe_id: 's1', km: 5, distance_km: 5, duration_s: 1800};
    const shoeSnap = JSON.parse(JSON.stringify(shoe));
    const runSnap = JSON.parse(JSON.stringify(run));

    effectiveWearKm(shoe, [run]);

    expect(shoe).toEqual(shoeSnap);
    expect(run).toEqual(runSnap);
  });
});

describe('A6-2 엣지(결측·0·음수·비유한) — 무NaN·무Infinity·무음수', () => {
  const finiteNonNeg = (n: number) => {
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  };

  test('runEffectiveWear: 거리 결측/0/음수/비유한 → 0', () => {
    finiteNonNeg(runEffectiveWear({} as WearRun));
    expect(runEffectiveWear({distance_km: 0})).toBe(0);
    expect(runEffectiveWear({distance_km: -5})).toBe(0);
    expect(runEffectiveWear({distance_km: NaN})).toBe(0);
    expect(runEffectiveWear({distance_km: Infinity})).toBe(0);
  });

  test('effectiveWearKm: 온갖 결손 입력에서도 유한·비음수', () => {
    finiteNonNeg(effectiveWearKm({} as WearShoe, []));
    finiteNonNeg(effectiveWearKm({id: 's'}, null as never));
    finiteNonNeg(
      effectiveWearKm({id: 's', target_km: -1, start_km: -5}, [
        {distance_km: NaN},
        null as never,
        {distance_km: -3},
      ]),
    );
  });

  test('targetKmFor: 비정상 몸무게에서도 양수 유한', () => {
    for (const w of [NaN, Infinity, -10, 0]) {
      const v = targetKmFor({id: 's', target_km: 600}, w as number);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  test('ageWearKm: 비정상 날짜·target 에서도 0 이상 유한', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    finiteNonNeg(ageWearKm({id: 's', created_at: 'garbage'}, now));
    finiteNonNeg(ageWearKm({id: 's', target_km: NaN, created_at: '2025-01-01'}, now));
    finiteNonNeg(ageWearKm({id: 's'}, now));
  });
});
