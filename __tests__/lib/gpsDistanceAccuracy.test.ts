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

describe('스윕 복제 엔진 패리티 — 하네스 신뢰성 가드', () => {
  // 파라미터 스윕(gpsSweepEngine)은 RunTracker 의 거리 결정 경로 복제로 돌린다.
  // 복제가 제품 기본값에서 실제 엔진과 거리 완전 일치해야 스윕 결과를 믿을 수 있다.
  test('제품 기본 파라미터에서 RunTracker 와 거리 완전 일치', () => {
    for (const scenario of ['straight2k', 'stopGo', 'circle', 'runWalk']) {
      for (const p of [NOISE_TYPICAL, NOISE_URBAN]) {
        const fixes = makeFixes(sampleTruth(SCENARIOS[scenario]), p, 7);
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
