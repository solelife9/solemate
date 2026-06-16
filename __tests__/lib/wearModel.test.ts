/**
 * lib/wearModel 단위 테스트 — 실효 마모 모델(순수 함수 + 얇은 노면 IO).
 *
 * 관찰 가능한 계약을 검증한다(휴리스틱 계수 자체가 아니라 *방향성*과 *안전성*):
 *   S6-1 체중 85kg 실효 마모 > 70kg, 체중 미설정이면 weightFactor 1.0.
 *   S6-2 trail > road, race 페이스 > easy 페이스, 노면 미태그는 road 로 동작.
 *   S6-3 저주행이라도 오래된 신발은 ageWearKm 가 누적된다.
 *   A6-1 원본 shoe/run 객체는 변경되지 않는다(파생값만).
 *   A6-2 결측·0·음수·비유한 입력에서 NaN/Infinity/음수를 절대 반환하지 않는다.
 *
 * 순수 단위 — react-test-renderer 불요. 노면 IO 만 AsyncStorage(공식 인메모리 mock).
 *
 * @format
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  runEffectiveWear,
  targetKmFor,
  ageWearKm,
  effectiveWearKm,
  weightFactorFor,
  paceFactor,
  parseSurface,
  getRunSurface,
  setRunSurface,
  SURFACE_FACTOR,
  type WearRun,
  type WearShoe,
} from '../../lib/wearModel';
import {DEFAULT_LIFESPAN_KM, categoryLifespanKm} from '../../data/shoeModels';

// easy 페이스(6:00/km = 360초/km) 5km 런.
const easyRun: WearRun = {id: 'r1', distance_km: 5, duration_s: 5 * 360};
// race 페이스(3:30/km = 210초/km) 5km 런.
const raceRun: WearRun = {id: 'r2', distance_km: 5, duration_s: 5 * 210};

describe('S6-1 체중 보정(weightFactor)', () => {
  test('체중 85kg 의 실효 마모가 70kg 보다 크다', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const runs = [easyRun];
    const at70 = effectiveWearKm(shoe, runs, {weightKg: 70});
    const at85 = effectiveWearKm(shoe, runs, {weightKg: 85});
    expect(at85).toBeGreaterThan(at70);
  });

  test('체중 미설정이면 weightFactor 1.0 (= 기준 70kg 와 동일)', () => {
    expect(weightFactorFor(undefined)).toBe(1.0);
    expect(weightFactorFor(70)).toBe(1.0);
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const runs = [easyRun];
    expect(effectiveWearKm(shoe, runs, {})).toBe(
      effectiveWearKm(shoe, runs, {weightKg: 70}),
    );
  });

  test('weightFactor 는 [0.8, 1.6] 으로 클램프된다', () => {
    expect(weightFactorFor(40)).toBe(0.8); // 40/70 < 0.8 → 클램프
    expect(weightFactorFor(140)).toBe(1.6); // 140/70 > 1.6 → 클램프
  });
});

describe('S6-2 노면·페이스 방향성', () => {
  test('trail 마모 > road 마모(동일 런)', () => {
    const trail = runEffectiveWear(easyRun, {surface: 'trail'});
    const road = runEffectiveWear(easyRun, {surface: 'road'});
    expect(trail).toBeGreaterThan(road);
    expect(road).toBeCloseTo(5 * SURFACE_FACTOR.road * 1.0, 6);
  });

  test('race 페이스 마모 > easy 페이스 마모(동일 거리·노면)', () => {
    const race = runEffectiveWear(raceRun, {surface: 'road'});
    const easy = runEffectiveWear(easyRun, {surface: 'road'});
    expect(race).toBeGreaterThan(easy);
  });

  test('노면 미태그/미지원 값은 road 로 동작', () => {
    const tagged = runEffectiveWear(easyRun, {surface: 'road'});
    expect(runEffectiveWear(easyRun)).toBe(tagged); // surface 미지정
    expect(runEffectiveWear(easyRun, {surface: 'bogus' as never})).toBe(tagged);
  });

  test('paceFactor 경계: ≥300→1.0, 240–300→1.05, <240→1.10', () => {
    expect(paceFactor(360)).toBe(1.0);
    expect(paceFactor(300)).toBe(1.0);
    expect(paceFactor(270)).toBe(1.05);
    expect(paceFactor(240)).toBe(1.05);
    expect(paceFactor(210)).toBe(1.1);
  });
});

describe('S6-3 시간 기반 마모(ageWearKm)', () => {
  test('저주행이라도 오래된 신발은 ageWearKm 가 누적된다', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    // 12개월 전 구매, 거의 안 신음(런 0).
    const oldShoe: WearShoe = {
      id: 's-old',
      target_km: 720,
      created_at: '2025-06-04T00:00:00.000Z',
    };
    const age = ageWearKm(oldShoe, now);
    // 약 12개월 × (720/24 = 30km/월) ≈ 360km. 정확한 휴리스틱 값보다 *누적*을 본다.
    expect(age).toBeGreaterThan(300);

    // 빈 runs → effectiveWearKm 는 ageWearKm 만.
    expect(effectiveWearKm(oldShoe, [], {now})).toBeCloseTo(age, 6);

    // 갓 산 신발(같은 날)은 ageWearKm 0.
    const newShoe: WearShoe = {...oldShoe, created_at: now.toISOString()};
    expect(ageWearKm(newShoe, now)).toBe(0);
  });

  test('purchase_date 폴백, 미래 날짜·결측은 0', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    const byPurchase: WearShoe = {id: 's', target_km: 240, purchase_date: '2025-06-04'};
    expect(ageWearKm(byPurchase, now)).toBeGreaterThan(0);
    // 미래 구매일 → 0(음수 개월 금지).
    expect(ageWearKm({id: 's', purchase_date: '2099-01-01'}, now)).toBe(0);
    // 날짜 결측 → 0.
    expect(ageWearKm({id: 's', target_km: 700}, now)).toBe(0);
  });
});

describe('targetKmFor', () => {
  test('명시 target_km(유한·>0)이면 그것을 쓴다', () => {
    expect(targetKmFor({id: 's', target_km: 450})).toBe(450);
  });

  test('모델명 파싱 → 카테고리 수명', () => {
    // Nike Pegasus 41 = daily_trainer → 700.
    expect(targetKmFor({id: 's', name: 'Nike Pegasus 41'})).toBe(
      categoryLifespanKm.daily_trainer,
    );
    // Hoka Speedgoat 6 = trail → 700.
    expect(targetKmFor({id: 's', name: 'Hoka Speedgoat 6'})).toBe(
      categoryLifespanKm.trail,
    );
  });

  test('target_km 0/음수·미지 모델 → DEFAULT_LIFESPAN_KM(700)', () => {
    expect(targetKmFor({id: 's', target_km: 0})).toBe(DEFAULT_LIFESPAN_KM);
    expect(targetKmFor({id: 's', target_km: -100})).toBe(DEFAULT_LIFESPAN_KM);
    expect(targetKmFor({id: 's', name: 'Totally Unknown Shoe'})).toBe(
      DEFAULT_LIFESPAN_KM,
    );
    expect(targetKmFor({id: 's'})).toBe(DEFAULT_LIFESPAN_KM);
  });
});

describe('A6-1 원본 불변', () => {
  test('effectiveWearKm 는 shoe/run 객체를 변경하지 않는다', () => {
    const shoe: WearShoe = {id: 's1', total_km: 123, target_km: 700, name: 'Nike Pegasus 41'};
    const run: WearRun = {id: 'r1', shoe_id: 's1', km: 5, distance_km: 5, duration_s: 1800};
    const shoeSnap = JSON.parse(JSON.stringify(shoe));
    const runSnap = JSON.parse(JSON.stringify(run));

    effectiveWearKm(shoe, [run], {weightKg: 80, now: new Date('2026-06-04T00:00:00.000Z')});

    expect(shoe).toEqual(shoeSnap); // total_km 등 원본 그대로
    expect(run).toEqual(runSnap); // distance_km 등 원본 그대로
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
    // 거리 유효·시간 결측/0 → 페이스 보정 없이 거리×노면.
    finiteNonNeg(runEffectiveWear({distance_km: 5, duration_s: 0}));
    finiteNonNeg(runEffectiveWear({distance_km: 5, duration_s: -10}));
  });

  test('effectiveWearKm: 온갖 결손 입력에서도 유한·비음수', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    finiteNonNeg(effectiveWearKm({} as WearShoe, [], {now}));
    finiteNonNeg(effectiveWearKm({id: 's'}, null as never, {now}));
    finiteNonNeg(
      effectiveWearKm(
        {id: 's', target_km: -1, created_at: 'not-a-date'},
        [{distance_km: NaN}, null as never, {distance_km: -3}],
        {weightKg: NaN, now},
      ),
    );
    finiteNonNeg(effectiveWearKm({id: 's'}, [{distance_km: 5}], {weightKg: 0, now}));
  });

  test('ageWearKm: 비정상 날짜·target 에서도 0 이상 유한', () => {
    const now = new Date('2026-06-04T00:00:00.000Z');
    finiteNonNeg(ageWearKm({id: 's', created_at: 'garbage'}, now));
    finiteNonNeg(ageWearKm({id: 's', target_km: NaN, created_at: '2025-01-01'}, now));
    finiteNonNeg(ageWearKm({id: 's'}, now));
  });
});

describe('노면 IO (AsyncStorage)', () => {
  test('미저장 런은 road 로 읽힌다', async () => {
    await expect(getRunSurface('never-set')).resolves.toBe('road');
  });

  test('set→get 라운드트립으로 노면이 보존된다', async () => {
    await setRunSurface('run-42', 'trail');
    await expect(getRunSurface('run-42')).resolves.toBe('trail');
    // 키 형식 확인.
    await expect(AsyncStorage.getItem('surface_run-42')).resolves.toBe('trail');
  });

  test('미지원 값을 저장하면 road 로 정규화되어 영속된다', async () => {
    await setRunSurface('run-bad', 'bogus' as never);
    await expect(getRunSurface('run-bad')).resolves.toBe('road');
  });

  test('parseSurface: 유효 4종 통과, 그 외/결측 → road', () => {
    expect(parseSurface('treadmill')).toBe('treadmill');
    expect(parseSurface('track')).toBe('track');
    expect(parseSurface(null)).toBe('road');
    expect(parseSurface('xyz')).toBe('road');
  });
});
