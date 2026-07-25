/**
 * lib/goalEstimate — 목표 화면 추정치 개인화(심사 P2 #74) 계약.
 *   1) 이력 없음(빈/null) → 기존 기본값 폴백(5분/km·64kcal/km) — App 미배선 회귀 0.
 *   2) 거리가중 평균 페이스 — Σ시간/Σ거리(단순 평균의 짧은 런 편향 배제).
 *   3) 칼로리 개인화 — 기록에 칼로리가 있을 때만, 없으면 64kcal/km 폴백.
 *   4) 최근 N회 창(날짜 내림차순) + 비정상 레코드 필터.
 *   5) 입력 불변·throw 금지.
 * @format
 */
import {
  buildPaceProfile,
  estimateForGoal,
  estimateForDuration,
  DEFAULT_PACE_SEC_PER_KM,
  DEFAULT_KCAL_PER_KM,
  type EstimateRunLike,
} from '../../lib/goalEstimate';

const run = (km: number | string, sec: number, extra: Partial<EstimateRunLike> = {}): EstimateRunLike =>
  ({km, duration: sec, run_date: '2026-07-20', ...extra});

describe('폴백(이력 없음) — 기존 기본값과 동일', () => {
  test('빈 배열: 5km → 25분·320kcal (5분/km·64kcal/km)', () => {
    const e = estimateForGoal([], 5);
    expect(e).toEqual({minutes: 25, kcal: 320, personalized: false});
  });

  test('null/undefined 도 throw 없이 폴백', () => {
    expect(estimateForGoal(null, 5).minutes).toBe(25);
    expect(estimateForGoal(undefined, 5).minutes).toBe(25);
    expect(estimateForDuration(null, 30).km).toBeCloseTo(6, 5);
  });

  test('시간 목표 폴백: 30분 → 6.0km·384kcal (구 화면 val/5·val*12.8 과 동일)', () => {
    const e = estimateForDuration([], 30);
    expect(e.km).toBeCloseTo(6, 5);
    expect(e.kcal).toBe(384); // 30 * 12.8
    expect(e.personalized).toBe(false);
  });

  test('목표 0 이하/비수는 0 반환(throw 금지)', () => {
    expect(estimateForGoal([], 0)).toEqual({minutes: 0, kcal: 0, personalized: false});
    expect(estimateForGoal([], -3).kcal).toBe(0);
    expect(estimateForGoal([], NaN).minutes).toBe(0);
    expect(estimateForDuration([], 0).km).toBe(0);
  });
});

describe('거리가중 평균 페이스', () => {
  test('10km@3600s + 2km@600s → 4200/12 = 350s/km (단순 평균 330 아님)', () => {
    const p = buildPaceProfile([run(10, 3600), run(2, 600)]);
    expect(p.paceSecPerKm).toBeCloseTo(350, 5);
    expect(p.personalized).toBe(true);
    expect(p.sampleCount).toBe(2);
    // 6km 목표 = 6*350/60 = 35분 (단순 평균이면 33분).
    expect(estimateForGoal([run(10, 3600), run(2, 600)], 6).minutes).toBe(35);
  });

  test('서버 유래 문자열 km 도 수용', () => {
    const p = buildPaceProfile([run('5.0', 1500)]);
    expect(p.paceSecPerKm).toBeCloseTo(300, 5);
    expect(p.personalized).toBe(true);
  });

  test('시간 목표도 같은 프로필 사용: 350s/km 에서 35분 → 6.0km', () => {
    const e = estimateForDuration([run(10, 3600), run(2, 600)], 35);
    expect(e.km).toBeCloseTo(6, 5);
    expect(e.personalized).toBe(true);
  });
});

describe('칼로리 개인화', () => {
  test('칼로리 기록이 있으면 Σkcal/Σkm: 10km/700 + 5km/380 → 72kcal/km', () => {
    const runs = [run(10, 3600, {calories: 700}), run(5, 1500, {calories: 380})];
    const p = buildPaceProfile(runs);
    expect(p.kcalPerKm).toBeCloseTo(72, 5);
    expect(estimateForGoal(runs, 5).kcal).toBe(360);
  });

  test('칼로리 없는 이력은 페이스만 개인화, 칼로리는 64 폴백', () => {
    const p = buildPaceProfile([run(10, 3600)]);
    expect(p.paceSecPerKm).toBeCloseTo(360, 5);
    expect(p.kcalPerKm).toBe(DEFAULT_KCAL_PER_KM);
  });

  test('타당 범위 밖 칼로리(km당 20~200 밖)는 표본에서 제외', () => {
    // 5km 에 5000kcal(1000/km) = 오염 기록 — 칼로리는 폴백, 페이스는 유지.
    const p = buildPaceProfile([run(5, 1500, {calories: 5000})]);
    expect(p.kcalPerKm).toBe(DEFAULT_KCAL_PER_KM);
    expect(p.personalized).toBe(true);
  });
});

describe('최근 N회 창 + 비정상 필터', () => {
  test('최근 10회만 반영 — 11번째(가장 오래된) 느린 런은 제외', () => {
    const recent = Array.from({length: 10}, (_, i) =>
      run(5, 1500, {run_date: `2026-07-${String(20 - i).padStart(2, '0')}`})); // 300s/km
    const old = run(5, 5000, {run_date: '2026-01-01'}); // 1000s/km — 창 밖
    const p = buildPaceProfile([old, ...recent]); // 배열 순서 무관(날짜 정렬)
    expect(p.paceSecPerKm).toBeCloseTo(300, 5);
    expect(p.sampleCount).toBe(10);
  });

  test('비정상 레코드(초단거리·비현실 페이스·시간 0)는 걸러지고, 전부면 폴백', () => {
    const bad: EstimateRunLike[] = [
      run(0.2, 100), // 0.5km 미만
      run(5, 10), // 2s/km — 불가능
      run(8, 0), // 시간 없음
      {km: NaN, duration: 600},
      null as unknown as EstimateRunLike,
    ];
    expect(buildPaceProfile(bad)).toEqual({
      paceSecPerKm: DEFAULT_PACE_SEC_PER_KM,
      kcalPerKm: DEFAULT_KCAL_PER_KM,
      personalized: false,
      sampleCount: 0,
    });
    // 정상 1건이 섞여 있으면 그 1건으로 개인화.
    const p = buildPaceProfile([...bad, run(5, 1500)]);
    expect(p.paceSecPerKm).toBeCloseTo(300, 5);
    expect(p.sampleCount).toBe(1);
  });
});

describe('입력 불변', () => {
  test('원본 배열/원소를 변형하지 않는다(정렬은 복사본)', () => {
    const a = run(3, 900, {run_date: '2026-07-01'});
    const b = run(10, 3600, {run_date: '2026-07-19'});
    const runs = [a, b];
    const snapshot = JSON.stringify(runs);
    buildPaceProfile(runs);
    estimateForGoal(runs, 5);
    expect(runs[0]).toBe(a); // 순서 그대로(원본 미정렬)
    expect(runs[1]).toBe(b);
    expect(JSON.stringify(runs)).toBe(snapshot);
  });
});
