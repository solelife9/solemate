// ─── GPS 거리 정확도 회귀 가드 (2026-07-11 재튜닝 고정) ─────────────────────
// 배경: 실측 비교런(폰 Keego vs NRC 동시 주행)에서 Keego +9% 과대 확정 →
// 합성 GPS 하네스(__tests__/helpers/gpsSynthetic — 시드 RNG, 시간상관 노이즈,
// 실제 RunTracker 주행)로 재현·튜닝했다. 확정 파라미터:
//   • kalman ACCEL_PSD 1.4²→0.7²  • PHANTOM_ACC_FLOOR_FACTOR 0.35→0.8
//   • 거리 적산 5점 중심 평활(lib/distanceSmoother — 실측 궤적 재계산으로 검증)
// 결과(16시드): 보통 환경 전 시나리오 |오차| ≤ ~1.7% (튜닝 전 +9~29%).
// 남은 갭(의도된 잔여, v2 후보): 도심 장기(300s) 정지 +7~8%(가속도계 정지감지
// 필요), 턴어라운드당 ~10-20m 라운딩(전 GPS 앱 공통).
//
// 이 테스트는 시드 고정이라 완전 결정론 — 경계는 4시드 평균 실측값 + 여유다.
// 실패하면 엔진(칼만/게이트/평활) 회귀를 의심하라. 파라미터를 다시 만질 때는
// 반드시 하네스 스윕(gpsSweepEngine)으로 전 시나리오를 재측정할 것.

import {
  SCENARIOS,
  NOISE_TYPICAL,
  NOISE_OPEN,
  NOISE_URBAN,
  sampleTruth,
  makeFixes,
  truthKm,
  makeStepSamples,
  runEngine,
  NoiseProfile,
} from '../helpers/gpsSynthetic';
import {runTunableEngine, DEFAULT_ACCEL_PSD} from '../helpers/gpsSweepEngine';
import {PHANTOM_ACC_FLOOR_FACTOR} from '../../lib/engineConstants';

jest.setTimeout(180000);

const SEEDS = [11, 22, 33, 44];

function meanErrPct(scenario: string, profile: NoiseProfile): number {
  const samples = sampleTruth(SCENARIOS[scenario]);
  const truth = truthKm(samples);
  let s = 0;
  for (const seed of SEEDS) {
    const {distKm} = runEngine(makeFixes(samples, profile, seed));
    s += ((distKm - truth) / truth) * 100;
  }
  return s / SEEDS.length;
}

describe('보통(공원/도심 혼합) 환경 — 실측 비교런과 같은 조건', () => {
  test.each([
    ['straight2k', -1.5, 2.5],
    ['squareLoop', -2.0, 2.0],
    ['intervals', -1.5, 2.5],
    ['circle', -2.5, 3.0], // 반경 30m 지속 곡선 — 과소(코너 깎기) 금지 가드
    ['outback', -3.5, 1.5], // 180° 턴 라운딩(~15m/턴)은 허용, 그 이상 깎기 금지
    ['runWalk', -2.0, 3.0], // 걷기 구간 유실 금지(하한은 '유예'만 한다)
    ['slowStraight', -1.5, 3.0],
  ])('%s: 평균 오차 %d%% ~ +%d%% 이내', (scenario, lo, hi) => {
    const e = meanErrPct(scenario as string, NOISE_TYPICAL);
    expect(e).toBeGreaterThanOrEqual(lo as number);
    expect(e).toBeLessThanOrEqual(hi as number);
  });

  test('stopGo(300s 신호대기): 정지 팬텀 잔여 ≤ +6.5% (튜닝 전 +29%)', () => {
    const e = meanErrPct('stopGo', NOISE_TYPICAL);
    expect(e).toBeGreaterThanOrEqual(-2);
    expect(e).toBeLessThanOrEqual(6.5);
  });
});

describe('환경 극단 가드', () => {
  test('탁 트인 하늘(트랙/강변): 직선 |오차| ≤ 1.5% — 좋은 조건에서 과소로 뒤집히지 않는다', () => {
    const e = meanErrPct('straight2k', NOISE_OPEN);
    expect(Math.abs(e)).toBeLessThanOrEqual(1.5);
  });

  test('탁 트인 하늘: 곡선(circle)도 깎지 않는다', () => {
    const e = meanErrPct('circle', NOISE_OPEN);
    expect(e).toBeGreaterThanOrEqual(-2);
    expect(e).toBeLessThanOrEqual(2.5);
  });

  test('도심 협곡: 직선 ≤ +4% (튜닝 전 +20%)', () => {
    const e = meanErrPct('straight2k', NOISE_URBAN);
    expect(e).toBeGreaterThanOrEqual(-2);
    expect(e).toBeLessThanOrEqual(4);
  });

  test('도심 협곡 + 300s 정지: ≤ +11% (튜닝 전 +49% — 잔여 갭은 v2 가속도계 정지감지)', () => {
    const e = meanErrPct('stopGo', NOISE_URBAN);
    expect(e).toBeGreaterThanOrEqual(-2);
    expect(e).toBeLessThanOrEqual(11);
  });
});

describe('걸음 정지 게이트(2026-07-11) — 걸음수가 늘지 않으면 정지 팬텀 차단', () => {
  const errWithSteps = (scenario: string, p: NoiseProfile, frozen = false): number => {
    const samples = sampleTruth(SCENARIOS[scenario]);
    const truth = truthKm(samples);
    const steps = frozen
      ? makeStepSamples(samples).map(s => ({t: s.t, steps: 0})) // 센서 동결(값 고정) 모사
      : makeStepSamples(samples);
    let s = 0;
    for (const seed of [11, 22, 33]) {
      s += ((runEngine(makeFixes(samples, p, seed), steps).distKm - truth) / truth) * 100;
    }
    return s / 3;
  };

  test('stopGo(보통): 정지 팬텀 +4.7% → ≤ +2.5% (걸음 게이트)', () => {
    const e = errWithSteps('stopGo', NOISE_TYPICAL);
    expect(e).toBeGreaterThanOrEqual(-2);
    expect(e).toBeLessThanOrEqual(2.5);
  });

  test('stopGo(도심): +7~8% → ≤ +4.5%', () => {
    const e = errWithSteps('stopGo', NOISE_URBAN);
    expect(e).toBeGreaterThanOrEqual(-2);
    expect(e).toBeLessThanOrEqual(4.5);
  });

  test('걷뛰: 걸음 공급이 걷기 거리를 깎지 않는다(무손실 — 게이트는 정지에만 반응)', () => {
    const samples = sampleTruth(SCENARIOS.runWalk);
    const steps = makeStepSamples(samples);
    for (const seed of [11, 22]) {
      const fixes = makeFixes(samples, NOISE_TYPICAL, seed);
      const without = runEngine(fixes).distKm;
      const withSteps = runEngine(fixes, steps).distKm;
      // 걷기(105spm)는 폴링마다 걸음이 늘어 게이트가 한 번도 안 걸린다 → 거리 동일.
      expect(withSteps).toBeCloseTo(without, 6);
    }
  });

  test('안전선: 센서가 동결돼도(표본은 신선·걸음수 불변) 러닝 속도(≥2.5m/s)면 거리 유실 없음', () => {
    // straight2k @6'00"(2.78m/s) 내내 걸음수 0 고정 — 칼만 속도 상한이 게이트를 풀어
    // 거리가 정상 계상된다(자전거/센서 고장에서 거리계가 0 이 되는 사고 방지).
    const e = errWithSteps('straight2k', NOISE_TYPICAL, true);
    expect(e).toBeGreaterThanOrEqual(-2);
  });
});

describe('스윕 복제 엔진 패리티 — 하네스 신뢰성 가드', () => {
  // 파라미터 스윕(gpsSweepEngine)은 RunTracker 의 **위치 경로**(Kalman → acceptSegment →
  // 평활) 복제로 돌린다. 복제가 제품 기본값에서 실제 엔진과 거리 완전 일치해야 스윕 결과를
  // 믿을 수 있다.
  //
  // 2026-08-10: 거리 1순위가 도플러 속도 적분으로 바뀌었다. 복제는 그 경로를 모사하지
  // 않으므로(모사할 이유도 없다 — 스윕 대상 파라미터는 전부 위치 경로의 것이다), 패리티는
  // **도플러가 없는 fix**로 확인한다. 그것이 복제가 실제로 대신하는 경로이고, 폴백이
  // 살아 있는지까지 함께 지켜 준다.
  test('제품 기본 파라미터에서 RunTracker 와 거리 완전 일치 (도플러 없는 폴백 경로)', () => {
    for (const scenario of ['straight2k', 'stopGo', 'circle', 'runWalk']) {
      for (const p of [NOISE_TYPICAL, NOISE_URBAN]) {
        // speed 를 제거해 폴백(위치 차분) 경로를 강제한다 — 구형 기기·도플러 무효 상황.
        const fixes = makeFixes(sampleTruth(SCENARIOS[scenario]), p, 7)
          .map(f => ({...f, coords: {...f.coords, speed: null}}));
        const real = runEngine(fixes).distKm;
        const replica = runTunableEngine(fixes, {
          accelPsd: DEFAULT_ACCEL_PSD,
          floorFactor: PHANTOM_ACC_FLOOR_FACTOR,
          smoothW: 5,
        }).distKm;
        expect({scenario, p: p.name, d: replica}).toEqual({scenario, p: p.name, d: real});
      }
    }
  });
});
