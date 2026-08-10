/**
 * 임시 계측 — 걷기 속도에서 (1) 거리 오차 (2) 거리 표시의 '끊김'.
 * (진단용. 수치를 확인한 뒤 정식 가드로 바꾸거나 지운다.)
 * @format
 */
import {
  NOISE_TYPICAL, NOISE_OPEN, NOISE_URBAN,
  sampleTruth, makeFixes, truthKm, runEngine, NoiseProfile,
} from '../helpers/gpsSynthetic';
import {RunTracker} from '../../lib/runTracker';

jest.setTimeout(180000);
const SEEDS = [11, 22, 33, 44];

const WALK = [{durS: 600, speedMps: 1.2, headingDeg: 0}];
const SLOW_WALK = [{durS: 600, speedMps: 0.9, headingDeg: 0}];
const RUN = [{durS: 600, speedMps: 1000 / 360, headingDeg: 0}];

function meanErrPct(legs: any, profile: NoiseProfile): number {
  const samples = sampleTruth(legs);
  const truth = truthKm(samples);
  let s = 0;
  for (const seed of SEEDS) {
    const {distKm} = runEngine(makeFixes(samples, profile, seed));
    s += ((distKm - truth) / truth) * 100;
  }
  return s / SEEDS.length;
}

/** 거리 표시가 '멈춰 있는' 최장 구간(초)과, 한 번에 뛰는 최대 증분(m). */
function rampStats(legs: any, profile: NoiseProfile, seed: number) {
  const samples = sampleTruth(legs);
  const fixes = makeFixes(samples, profile, seed);
  const t = new RunTracker();
  let clock = fixes[0].timestamp;
  t.setNow(() => clock);
  t.start({goalKm: 99, shoe: {id: 's', name: 'X'}, t0: fixes[0].timestamp});
  let last = 0;
  let lastChangeMs = fixes[0].timestamp;
  let maxStallS = 0;
  let maxJumpM = 0;
  for (const f of fixes) {
    clock = f.timestamp;
    t.ingestFix(f);
    const d = t.getDistanceKm();
    if (d !== last) {
      maxJumpM = Math.max(maxJumpM, (d - last) * 1000);
      maxStallS = Math.max(maxStallS, (f.timestamp - lastChangeMs) / 1000);
      last = d;
      lastChangeMs = f.timestamp;
    }
  }
  return {maxStallS, maxJumpM};
}

test('걷기 vs 러닝 — 오차와 끊김 계측', () => {
  const rows: string[] = ['', '속도                      환경      오차      최장정지   최대점프'];
  for (const [label, legs] of [
    ['러닝 6:00/km (2.78 m/s)', RUN],
    ['걷기 (1.2 m/s)', WALK],
    ['느린걷기 (0.9 m/s)', SLOW_WALK],
  ] as const) {
    for (const p of [NOISE_OPEN, NOISE_TYPICAL, NOISE_URBAN]) {
      const e = meanErrPct(legs, p);
      const r = rampStats(legs, p, SEEDS[0]);
      rows.push(
        `${label.padEnd(24)} ${p.name.padEnd(8)} ${e.toFixed(1).padStart(6)}%  ` +
        `${r.maxStallS.toFixed(0).padStart(6)}s  ${r.maxJumpM.toFixed(1).padStart(7)}m`,
      );
    }
  }
  // eslint-disable-next-line no-console
  console.log(rows.join('\n') + '\n');
  expect(true).toBe(true);
});
