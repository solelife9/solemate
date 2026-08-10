/**
 * 걷기 속도 거리 정확도 + 화면 갱신 연속성 회귀 가드 (2026-08-10 신설)
 *
 * 왜 신설했나
 * ----------------------------------------------------------------------------
 * 민우님이 천천히 걸었는데 0.19km/51초(시속 13.4km)에 평균 페이스 4'28" 이 찍혔다.
 * 검증을 그렇게 많이 하고도 못 잡은 이유가 이 파일이 없어서다:
 *
 *  · `gpsDistanceAccuracy` 의 시나리오 7개는 **전부 달리는 속도**였다(6'00"~8'30"/km).
 *  · 느린 축(runWalk·slowStraight)의 단언은 "거리가 **깎이지** 않는가"만 봤다.
 *    **부푸는지는 한 번도 묻지 않았다** — 정확히 터진 방향이다.
 *
 * 이 파일이 지키는 것 두 가지:
 *  1) 걷기 속도에서 거리가 **부풀지 않는다**(양쪽 경계).
 *  2) 거리 표시가 **오래 멈춰 있지 않는다** — 6~18초 멈췄다 한 번에 뛰던 '허접티'.
 *     정확도만 맞고 뚝뚝 끊기면 사용자에겐 고장으로 보인다.
 *
 * ⚠️ 경계는 실측이 아니라 **합성 모델** 위의 값이다. 2026-08-10 실기기(+170%)가 이 모델의
 * urban 프로파일(+15.7%)보다 나빴다 — 이 가드를 통과한다고 실기기가 통과하는 건 아니다.
 * @format
 */
import {
  NOISE_OPEN, NOISE_TYPICAL, NOISE_URBAN,
  sampleTruth, makeFixes, truthKm, runEngine, NoiseProfile, Leg,
} from '../helpers/gpsSynthetic';
import {RunTracker} from '../../lib/runTracker';

jest.setTimeout(180000);
const SEEDS = [11, 22, 33, 44];

/** 천천히 걷기 1.2 m/s(≈시속 4.3km) 직선 10분. */
const WALK: Leg[] = [{durS: 600, speedMps: 1.2, headingDeg: 0}];
/** 아주 느린 걷기 0.9 m/s — 진짜 이동이 GPS 잡음과 비슷해지는 최악 구간. */
const SLOW_WALK: Leg[] = [{durS: 600, speedMps: 0.9, headingDeg: 0}];

function meanErrPct(legs: Leg[], profile: NoiseProfile): number {
  const samples = sampleTruth(legs);
  const truth = truthKm(samples);
  let s = 0;
  for (const seed of SEEDS) {
    s += ((runEngine(makeFixes(samples, profile, seed)).distKm - truth) / truth) * 100;
  }
  return s / SEEDS.length;
}

/** 거리 표시가 '멈춰 있는' 최장 구간(초). 워밍업(첫 3fix)은 어느 앱이나 있다. */
function maxStallSec(legs: Leg[], profile: NoiseProfile, seed: number): number {
  const fixes = makeFixes(sampleTruth(legs), profile, seed);
  const t = new RunTracker();
  let clock = fixes[0].timestamp;
  t.setNow(() => clock);
  t.start({goalKm: 99, shoe: {id: 's', name: 'X'}, t0: fixes[0].timestamp});
  let last = 0;
  let lastChangeMs = fixes[0].timestamp;
  let worst = 0;
  for (const f of fixes) {
    clock = f.timestamp;
    t.ingestFix(f);
    const d = t.getDistanceKm();
    if (d !== last) {
      worst = Math.max(worst, (f.timestamp - lastChangeMs) / 1000);
      last = d;
      lastChangeMs = f.timestamp;
    }
  }
  return worst;
}

describe('걷기 속도 — 거리가 부풀지 않는다', () => {
  // 2026-08-10 실측(도플러 적분 도입 후, 4시드 평균):
  //   걷기      open -0.0% · typical +0.2% · urban +1.5%
  //   느린걷기   open  0.0% · typical +0.5% · urban +1.4%
  // 경계는 그 값 + 여유. 도입 전에는 각각 +3.2%/+9.1%, +4.7%/+15.7% 였다.
  const CASES: {label: string; legs: Leg[]; profile: NoiseProfile; hi: number}[] = [
    {label: '걷기 1.2m/s', legs: WALK, profile: NOISE_OPEN, hi: 1.5},
    {label: '걷기 1.2m/s', legs: WALK, profile: NOISE_TYPICAL, hi: 2.0},
    {label: '걷기 1.2m/s', legs: WALK, profile: NOISE_URBAN, hi: 3.5},
    {label: '느린걷기 0.9m/s', legs: SLOW_WALK, profile: NOISE_OPEN, hi: 1.5},
    {label: '느린걷기 0.9m/s', legs: SLOW_WALK, profile: NOISE_TYPICAL, hi: 2.5},
    {label: '느린걷기 0.9m/s', legs: SLOW_WALK, profile: NOISE_URBAN, hi: 3.5},
  ];
  for (const {label, legs, profile, hi} of CASES) {
    test(`${label} · ${profile.name}: 오차가 -2% ~ +${hi}% 이내`, () => {
      const e = meanErrPct(legs, profile);
      expect(e).toBeGreaterThanOrEqual(-2);   // 깎여도 안 된다
      expect(e).toBeLessThanOrEqual(hi);      // **부풀어도 안 된다** — 이 파일의 신설 이유
    });
  }
});

describe('화면 갱신 — 거리가 오래 멈춰 있지 않는다', () => {
  // 도입 전에는 걷기 15초·느린걷기 18초씩 멈췄다가 한 번에 8~15m 를 뛰었다.
  // 지금은 워밍업(3fix)을 빼면 매 fix 갱신된다. 8초는 GPS 死구간 임계와 같은 값 —
  // 그보다 오래 멈추면 그건 '느린 갱신'이 아니라 '신호 두절'이라는 뜻이다.
  for (const [label, legs] of [['걷기 1.2m/s', WALK], ['느린걷기 0.9m/s', SLOW_WALK]] as const) {
    test(`${label}: 최장 정지가 8초 이내`, () => {
      for (const p of [NOISE_OPEN, NOISE_TYPICAL, NOISE_URBAN]) {
        // 환경 이름을 함께 단언한다 — 실패했을 때 어느 환경인지 바로 보이게.
        const stallS = maxStallSec(legs, p, SEEDS[0]);
        expect({env: p.name, ok: stallS <= 8}).toEqual({env: p.name, ok: true});
      }
    });
  }
});

describe('도플러가 없는 기기에서도 거리는 멈추지 않는다 (안드로이드 안전선)', () => {
  // 안드로이드 `Location.getSpeed()` 는 값이 없으면 **0.0 을 돌려준다**(있는지는 hasSpeed()
  // 로만 안다). 0 을 '정지'로 읽으면 그런 기기에서 거리가 통째로 멈춘다 — 잘못된 거리보다
  // 비교할 수 없이 나쁘다. 그래서 정확히 0 은 '모름'으로 보고 위치 경로가 이어받는다.
  /** 원래 도플러 값을 받아 그 fix 에 실제로 실을 speed 를 정한다. */
  const run = (speedOf: (original: number | null | undefined, i: number) => number | null) => {
    const samples = sampleTruth(WALK);
    const fixes = makeFixes(samples, NOISE_TYPICAL, 11).map((f, i) => ({
      ...f, coords: {...f.coords, speed: speedOf(f.coords.speed, i)},
    }));
    return {km: runEngine(fixes).distKm, truth: truthKm(samples)};
  };

  test('speed 가 항상 0 이어도(안드로이드 미제공) 거리가 쌓인다', () => {
    const {km, truth} = run(() => 0);
    expect(km).toBeGreaterThan(truth * 0.7); // 위치 경로로 정상 계상
  });

  test('speed 가 항상 null 이어도(구형/무효) 거리가 쌓인다', () => {
    const {km, truth} = run(() => null);
    expect(km).toBeGreaterThan(truth * 0.7);
  });

  test('도플러가 중간에 끊겼다 돌아와도 오차가 커지지 않는다 — 전환에 구멍/이중계산이 없다', () => {
    // 200~400초 구간만 도플러 무효(터널·신호불량). 앞뒤는 정상 도플러.
    const {km, truth} = run((orig, i) => (i > 200 && i < 400 ? null : orig ?? null));
    const errPct = ((km - truth) / truth) * 100;
    // 구멍이 있으면 크게 깎이고, 이중계산이 있으면 크게 부푼다. 둘 다 아니어야 한다.
    expect(errPct).toBeGreaterThanOrEqual(-3);
    expect(errPct).toBeLessThanOrEqual(3);
  });
});
