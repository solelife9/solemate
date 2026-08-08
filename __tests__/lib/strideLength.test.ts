/**
 * 보폭 추정 — 안드로이드 실내 러닝이 0.00km 로 끝나던 것을 고치는 계산.
 *
 * 2026-08-08: 실내 러닝은 GPS 를 안 켜고 만보계가 거리 정본인데, 그 모듈이 iOS 전용이라
 * **안드로이드는 무조건 0.00km 였다.** 안드로이드엔 OS 가 주는 이동거리 API 가 없어서
 * 걸음 × 보폭으로 낸다(가민·폴라와 같은 방식). 이 스위트가 고정하는 것:
 *   · 개인 GPS 러닝으로 보폭을 보정한다 — 밖에서 뛸수록 정확해진다
 *   · **실내 러닝으로는 보정하지 않는다** — 자기 추정으로 자기를 보정하는 순환
 *   · 표본이 모자라면 기본값을 쓰되 **추정이라고 말한다**(source)
 * @format
 */
import {
  strideFromRun, calibrateStride, stepsToMeters,
  DEFAULT_STRIDE_M, STRIDE_MIN_M, STRIDE_MAX_M,
  MIN_CALIBRATION_RUNS, CAL_MIN_KM, CAL_MIN_SEC, CAL_CADENCE_MIN, CAL_CADENCE_MAX,
  type StrideCalRun,
} from '../../lib/strideLength';

/** 보폭 1.0m 가 나오는 표준 러닝: 10km · 60분 · 166.67spm → 10000 걸음. */
const good = (over: Partial<StrideCalRun> = {}): StrideCalRun => ({
  km: 10, durationS: 3600, cadence: 10000 / 60, gpsMeasured: true, ...over,
});

describe('한 건에서 보폭 역산', () => {
  test('거리 ÷ (케이던스 × 이동시간)', () => {
    expect(strideFromRun(good())).toBeCloseTo(1.0, 3);
  });

  test('보폭이 크면 큰 값이 나온다 — 같은 걸음으로 더 멀리 갔다', () => {
    // 12km 를 같은 걸음수로 → 1.2m
    expect(strideFromRun(good({km: 12}))!).toBeCloseTo(1.2, 3);
  });

  test('실내 러닝(GPS 아님)은 쓰지 않는다 — 순환 보정 금지', () => {
    expect(strideFromRun(good({gpsMeasured: false}))).toBeNull();
  });
});

describe('못 쓰는 표본은 조용히 버린다', () => {
  test.each([
    ['짧은 거리', {km: CAL_MIN_KM - 0.1}],
    ['짧은 시간', {durationS: CAL_MIN_SEC - 1}],
    ['케이던스 없음', {cadence: 0}],
    ['케이던스 누락', {cadence: undefined}],
    ['케이던스 너무 낮음(걷기)', {cadence: CAL_CADENCE_MIN - 1}],
    ['케이던스 너무 높음(센서 오류)', {cadence: CAL_CADENCE_MAX + 1}],
    ['거리 NaN', {km: NaN}],
    ['시간 음수', {durationS: -100}],
  ])('%s', (_label, over) => {
    expect(strideFromRun(good(over as Partial<StrideCalRun>))).toBeNull();
  });

  test('사람 범위를 벗어난 보폭은 버린다 — 계산이 잘못된 것이다', () => {
    // 60분 10000걸음에 100km → 10m/걸음. 사람이 아니다(GPS 튐·단위 오류).
    expect(strideFromRun(good({km: 100}))).toBeNull();
    // 60분 10000걸음에 1.5km → 0.15m/걸음. 달리기가 아니다.
    expect(strideFromRun(good({km: 1.5}))).toBeNull();
  });

  test('입력이 없어도 죽지 않는다', () => {
    expect(() => strideFromRun(null as never)).not.toThrow();
    expect(strideFromRun(null as never)).toBeNull();
  });
});

describe('개인 보정', () => {
  test(`표본이 ${MIN_CALIBRATION_RUNS}건 미만이면 기본값 — 개인값이라 주장하지 않는다`, () => {
    const r = calibrateStride([good(), good()]);
    expect(r.source).toBe('default');
    expect(r.strideM).toBe(DEFAULT_STRIDE_M);
    expect(r.samples).toBe(0);
  });

  test(`${MIN_CALIBRATION_RUNS}건 이상이면 개인값을 쓴다`, () => {
    const r = calibrateStride([good({km: 11}), good({km: 11}), good({km: 11})]);
    expect(r.source).toBe('personal');
    expect(r.strideM).toBeCloseTo(1.1, 3);
    expect(r.samples).toBe(3);
  });

  test('중앙값이라 이상치 한 건에 끌려가지 않는다', () => {
    // 1.0 · 1.0 · 1.0 · 1.0 + 튄 1.9 → 중앙값은 1.0 근처에 남는다(평균이면 1.18)
    const runs = [good(), good(), good(), good(), good({km: 19})];
    const r = calibrateStride(runs);
    expect(r.source).toBe('personal');
    expect(r.strideM).toBeCloseTo(1.0, 2);
  });

  test('실내 러닝만 있으면 보정되지 않는다 — 기본값으로 남는다', () => {
    const indoor = [good({gpsMeasured: false}), good({gpsMeasured: false}), good({gpsMeasured: false})];
    expect(calibrateStride(indoor).source).toBe('default');
  });

  test('빈 입력·null 도 안전하다', () => {
    expect(calibrateStride([]).source).toBe('default');
    expect(calibrateStride(null).strideM).toBe(DEFAULT_STRIDE_M);
    expect(calibrateStride(undefined).strideM).toBe(DEFAULT_STRIDE_M);
  });

  test('결과 보폭은 항상 사람 범위 안이다', () => {
    const r = calibrateStride([good(), good(), good()]);
    expect(r.strideM).toBeGreaterThanOrEqual(STRIDE_MIN_M);
    expect(r.strideM).toBeLessThanOrEqual(STRIDE_MAX_M);
  });
});

describe('걸음 → 거리', () => {
  test('누적 걸음을 누적 미터로 환산한다', () => {
    expect(stepsToMeters(1000, 1.0)).toBe(1000);
    expect(stepsToMeters(1000, 1.2)).toBeCloseTo(1200, 6);
  });

  test('Iron Law — 음수·NaN 어디서도 음수 거리가 나오지 않는다', () => {
    for (const [s, st] of [[-1, 1], [NaN, 1], [1000, -1], [1000, NaN], [1000, 0]] as const) {
      const m = stepsToMeters(s, st);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(m)).toBe(true);
    }
  });

  test('말도 안 되는 보폭이 들어와도 결과가 폭주하지 않는다', () => {
    expect(stepsToMeters(1000, 99)).toBe(1000 * STRIDE_MAX_M);
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
// 계산만 맞고 호출부에 안 붙으면 안드로이드 실내는 여전히 0.00km 다. 이 저장소가 반복해
// 겪은 "만들었는데 배선이 안 된" 사고와 같은 계열이라 소스 레벨로 못 박는다.
describe('배선 — 안드로이드 실내에서 실제로 거리를 먹인다', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../..', 'screens/RunEngine.tsx'), 'utf8');

  test('RunEngine 이 이 모듈을 쓴다', () => {
    expect(src).toContain('strideLength');
    expect(src).toContain('stepsToMeters');
  });

  test('환산 결과를 엔진의 거리 입구로 보낸다', () => {
    expect(src).toContain('feedPedometerDistance');
  });

  test('안드로이드 실내에서만 돈다 — 실외 GPS 거리와 이중계산하지 않는다', () => {
    // iOS 는 CMPedometer 가 거리를 직접 주므로 이 경로를 타면 안 되고,
    // 실외는 GPS 가 정본이라 걸음 거리를 더하면 이중계산이다.
    expect(src).toMatch(/Platform\.OS\s*===\s*'android'/);
    expect(src).toContain('indoor');
  });
});
