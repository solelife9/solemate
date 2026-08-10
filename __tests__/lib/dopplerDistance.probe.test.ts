/**
 * 임시 계측 — 거리를 '위치 차분' 대신 '도플러 속도 적분'으로 내면 얼마나 좋아지는가.
 *
 * 위치 차분은 |Δp| 라 **평균 0 인 잡음도 항상 양의 거리로 정류된다**(제자리에 서 있어도
 * 거리가 쌓이는 이유). 속도는 위성 주파수로 직접 재므로 위치 오차와 독립이고 훨씬 작다.
 * 다만 속도도 크기(|v|)라 같은 정류가 있으므로 **정직하게 벡터 잡음 → 크기**로 모사한다.
 * @format
 */
import {
  NOISE_OPEN, NOISE_TYPICAL, NOISE_URBAN,
  sampleTruth, makeFixes, truthKm, runEngine, mulberry32, makeGaussian, NoiseProfile,
} from '../helpers/gpsSynthetic';

jest.setTimeout(180000);
const SEEDS = [11, 22, 33, 44];

const RUN = [{durS: 600, speedMps: 1000 / 360, headingDeg: 0}];
const WALK = [{durS: 600, speedMps: 1.2, headingDeg: 0}];
const SLOW_WALK = [{durS: 600, speedMps: 0.9, headingDeg: 0}];
const STAND = [{durS: 300, speedMps: 0, headingDeg: 0}]; // 제자리 — 팬텀 거리 시험

/** 도플러 속도 잡음(축별 m/s). GNSS 실측 통상치 0.05~0.15; 도심 반사까지 감안해 넉넉히. */
const DOPPLER_SIGMA: Record<string, number> = {open: 0.06, typical: 0.12, urban: 0.25};

/** 참 속도 벡터에 축별 가우스 잡음 → 크기(|v|). OS 가 주는 speed 와 같은 성질. */
function dopplerSpeeds(legs: any, profile: NoiseProfile, seed: number): number[] {
  const s = sampleTruth(legs);
  const gauss = makeGaussian(mulberry32(seed ^ 0x5eed));
  const sigma = DOPPLER_SIGMA[profile.name] ?? 0.12;
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const vx = s[i].x - s[i - 1].x; // 1Hz 라 m/s
    const vy = s[i].y - s[i - 1].y;
    out.push(Math.hypot(vx + gauss() * sigma, vy + gauss() * sigma));
  }
  return out;
}

function dopplerKm(legs: any, profile: NoiseProfile, seed: number): number {
  // dt=1s 이므로 Σ|v|·dt = Σ|v| (m) → km
  return dopplerSpeeds(legs, profile, seed).reduce((a, b) => a + b, 0) / 1000;
}

function gpsKm(legs: any, profile: NoiseProfile, seed: number): number {
  return runEngine(makeFixes(sampleTruth(legs), profile, seed)).distKm;
}

const pct = (got: number, truth: number) => (truth > 0 ? ((got - truth) / truth) * 100 : got * 1000);

test('위치 차분 vs 도플러 적분', () => {
  const rows: string[] = ['', '시나리오            환경     위치차분(현행)   도플러적분'];
  for (const [label, legs] of [
    ['러닝 6:00/km', RUN],
    ['걷기 1.2m/s', WALK],
    ['느린걷기 0.9m/s', SLOW_WALK],
  ] as const) {
    for (const p of [NOISE_OPEN, NOISE_TYPICAL, NOISE_URBAN]) {
      const truth = truthKm(sampleTruth(legs));
      let a = 0, b = 0;
      for (const s of SEEDS) { a += pct(gpsKm(legs, p, s), truth); b += pct(dopplerKm(legs, p, s), truth); }
      rows.push(`${label.padEnd(18)} ${p.name.padEnd(8)} ${(a / SEEDS.length).toFixed(1).padStart(9)}%  ${(b / SEEDS.length).toFixed(1).padStart(10)}%`);
    }
  }
  // 제자리 300초 — 참값 0 이라 %가 무의미하므로 '유령 미터'로 본다.
  rows.push('', '제자리 300초 (참값 0m) — 쌓이는 유령 거리');
  for (const p of [NOISE_OPEN, NOISE_TYPICAL, NOISE_URBAN]) {
    let a = 0, b = 0;
    for (const s of SEEDS) { a += gpsKm(STAND, p, s) * 1000; b += dopplerKm(STAND, p, s) * 1000; }
    rows.push(`  ${p.name.padEnd(8)} 위치차분 ${(a / SEEDS.length).toFixed(1).padStart(7)}m   도플러 ${(b / SEEDS.length).toFixed(1).padStart(7)}m`);
  }
  // eslint-disable-next-line no-console
  console.log(rows.join('\n') + '\n');
  expect(true).toBe(true);
});
