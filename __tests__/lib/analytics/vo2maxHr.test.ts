// lib/analytics/vo2maxHr — 심박 기반 VO2max 추정(가민·애플 방식의 공개 코어).
//
// 왜 이 파일이 있나: 기존 추정은 페이스만 봤고, 그래서 **2.56km 를 2'53"/km 로 달린
// 조각 하나가 VO2max 67.9(엘리트 구간)** 를 만들었다(같은 사용자 2위 기록 48.8).
// 페이스만으로는 "체력이 좋아 빠른 것"과 "짧게 스퍼트한 것"이 구별되지 않는다.
// 여기서는 그 구별을 심박이 하도록 만든 계약을 고정한다.

import {
  vo2AtSpeed,
  estimateHrMax,
  vo2maxFromSample,
  sampleRejection,
  hrFitness,
  HRR_MIN,
  HRR_MAX,
  MIN_SAMPLE_SEC,
} from '../../../lib/analytics/vo2maxHr';

const TODAY = '2026-08-04';

/** 10km 를 5'00"/km 로, 평균심박 hr 로 달린 표본. */
const run = (hr: number, over: Partial<{km: number; durationS: number; runDate: string; gapSec: number}> = {}) => ({
  km: 10,
  durationS: 3000,
  hrAvg: hr,
  runDate: TODAY,
  ...over,
});

describe('vo2AtSpeed — Daniels 속도→VO2', () => {
  test('200 m/min(5\'00"/km) ≈ 36 ml/kg/min', () => {
    const v = vo2AtSpeed(200);
    expect(v).toBeGreaterThan(35);
    expect(v).toBeLessThan(37);
  });
  test('비유효 입력은 0', () => {
    expect(vo2AtSpeed(0)).toBe(0);
    expect(vo2AtSpeed(NaN)).toBe(0);
    expect(vo2AtSpeed(-100)).toBe(0);
  });
});

describe('estimateHrMax — 관측값 우선, 없으면 Tanaka', () => {
  test('관측 최대가 있으면 그것을 쓴다(추정식보다 정확하다)', () => {
    expect(estimateHrMax(191, 40)).toBe(191);
  });
  test('관측이 없으면 Tanaka(208 − 0.7×나이)', () => {
    expect(estimateHrMax(0, 40)).toBe(180); // 208 - 28
    expect(estimateHrMax(0, 30)).toBe(187);
  });
  test('둘 다 없으면 0 — 추정하지 않는다', () => {
    expect(estimateHrMax(0, 0)).toBe(0);
  });
});

describe('표본 품질 게이트', () => {
  const REST = 50;
  const MAX = 190;

  test('10분 미만은 버린다 — 심박이 정상상태에 못 든다', () => {
    expect(sampleRejection(run(150, {km: 1.5, durationS: MIN_SAMPLE_SEC - 1}), REST, MAX)).toBe('too_short');
  });

  test('강도가 너무 낮으면 버린다 — 심박이 기온·카페인에 휘둘린다', () => {
    // %HRR < 0.55 가 되는 심박
    const low = Math.round(REST + (MAX - REST) * (HRR_MIN - 0.05));
    expect(sampleRejection(run(low), REST, MAX)).toBe('intensity_low');
  });

  test('강도가 너무 높으면 버린다 — 심박이 먼저 천장에 닿아 과대추정된다', () => {
    const high = Math.round(REST + (MAX - REST) * (HRR_MAX + 0.05));
    expect(sampleRejection(run(high), REST, MAX)).toBe('intensity_high');
  });

  test('안정시·최대가 불량하면 버린다', () => {
    expect(sampleRejection(run(150), 0, MAX)).toBe('hr_bounds');
    expect(sampleRejection(run(150), 170, 190)).toBe('hr_bounds'); // 폭 40 미만
  });

  test('비현실 페이스는 버린다', () => {
    expect(sampleRejection(run(150, {km: 10, durationS: 1500}), REST, MAX)).toBe('pace_range'); // 2'30"/km
  });

  test('정상 표본은 통과한다', () => {
    expect(sampleRejection(run(150), REST, MAX)).toBeNull();
  });
});

describe('vo2maxFromSample — 서브맥시멀 역산', () => {
  test('같은 페이스라도 심박이 낮을수록 체력이 높게 나온다', () => {
    const easy = vo2maxFromSample(run(140), 50, 190);
    const hard = vo2maxFromSample(run(170), 50, 190);
    expect(easy).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(0);
  });

  test('같은 심박이라도 빠를수록 체력이 높게 나온다', () => {
    const slow = vo2maxFromSample(run(150, {durationS: 3600}), 50, 190); // 6'00"/km
    const fast = vo2maxFromSample(run(150, {durationS: 2700}), 50, 190); // 4'30"/km
    expect(fast).toBeGreaterThan(slow);
  });

  test('경사 보정 페이스가 있으면 그것을 쓴다 — 언덕이 체력을 부풀리지 않게', () => {
    // 실제 5'00"/km 인데 오르막이라 평지 환산은 5'30"/km(느림) → 추정이 낮아져야 한다
    const raw = vo2maxFromSample(run(150), 50, 190);
    const gap = vo2maxFromSample(run(150, {gapSec: 330}), 50, 190);
    expect(gap).toBeLessThan(raw);
  });

  test('사람 범위 밖(20~90)이면 버린다', () => {
    // 심박이 안정시 바로 위 → %HRR 극소 → 발산. 게이트가 먼저 잡아 0.
    expect(vo2maxFromSample(run(52), 50, 190)).toBe(0);
  });
});

describe('hrFitness — 여러 런의 중앙값', () => {
  test('이상치 한 건이 값을 끌고 가지 못한다(최고치가 아니라 중앙값)', () => {
    // 이상치 = 게이트를 **통과하면서도** 값이 크게 튀는 표본(%HRR 0.57 로 하한 바로 위).
    // 같은 페이스에 심박만 낮으니 단독 추정은 훨씬 높게 나온다 — 옛 방식(최고치 채택)
    // 이라면 이 한 건이 체력 전체를 정의했을 것이다. 그게 67.9 사건의 구조였다.
    const outlier = run(130);
    const samples = [run(150), run(152), run(148), run(151), outlier];
    const r = hrFitness({samples, hrRest: 50, observedHrMax: 190, today: TODAY});
    const solo = vo2maxFromSample(outlier, 50, 190);
    expect(solo).toBeGreaterThan(0); // 게이트는 통과한다(버려진 게 아니다)
    expect(r.vo2max).toBeLessThan(solo); // 그런데도 중앙값은 끌려가지 않는다
    expect(r.sampleCount).toBe(5);
    expect(r.confidence).toBe('high');
  });

  test('표본이 적으면 confidence=low — 화면이 참고치로 표기하도록', () => {
    const r = hrFitness({samples: [run(150)], hrRest: 50, observedHrMax: 190, today: TODAY});
    expect(r.vo2max).toBeGreaterThan(0);
    expect(r.confidence).toBe('low');
  });

  test('심박이 없으면 0 — 값을 지어내지 않는다', () => {
    const r = hrFitness({samples: [], hrRest: 50, observedHrMax: 190, today: TODAY});
    expect(r.vo2max).toBe(0);
    expect(r.confidence).toBe('none');
  });

  test('안정시 심박이 없으면 추정하지 않는다', () => {
    const r = hrFitness({samples: [run(150)], hrRest: 0, observedHrMax: 190, today: TODAY});
    expect(r.vo2max).toBe(0);
  });

  test('최대심박을 알 방법이 없으면(관측·나이 모두 부재) 추정하지 않는다', () => {
    const r = hrFitness({samples: [run(150)], hrRest: 50, today: TODAY});
    expect(r.vo2max).toBe(0);
    expect(r.hrMaxUsed).toBe(0);
  });

  test('윈도우 밖 런은 세지 않는다', () => {
    const old = run(150, {runDate: '2026-01-01'});
    const r = hrFitness({samples: [old], hrRest: 50, observedHrMax: 190, today: TODAY, windowDays: 90});
    expect(r.sampleCount).toBe(0);
  });
});

// ─── 실제로 있었던 사고를 고정한다 (2026-08-04) ────────────────────────────────
// 민우님 폰 데이터에서 나온 실제 런들이다. 예전 규칙(1km·4분 이상이면 VDOT 채택,
// 그중 최고치)에서는 첫 줄 하나가 VO2max 67.9(엘리트 구간)를 만들었고, 2위 기록은
// 48.8 이었다. 19 차이는 분포가 아니라 오염이다.
describe('회귀 — 2.56km 조각이 체력을 정의하지 못한다', () => {
  const {vdot, currentVdot} = require('../../../lib/analytics/vo2max');
  const REAL = [
    {km: 2.56, durationS: 444, runDate: '2026-06-25'},  // 2'53"/km — 문제의 조각
    {km: 12.1, durationS: 3100, runDate: '2026-06-13'}, // 4'16"/km — 진짜 최고 노력
    {km: 10.0, durationS: 3000, runDate: '2026-06-09'},
    {km: 8.2, durationS: 2460, runDate: '2026-06-17'},
  ];

  test('2.56km/7분24초는 이제 VDOT 표본이 아니다(3km·10분 문턱)', () => {
    expect(vdot(2.56, 444)).toBe(0);
  });

  test('그 결과 체력 추정이 67.9 가 아니라 48.8 대로 내려온다', () => {
    const v = currentVdot(REAL, '2026-06-26', 42);
    expect(v).toBeGreaterThan(45);
    expect(v).toBeLessThan(52);
  });

  test('12.1km 같은 진짜 장거리 노력은 그대로 인정된다', () => {
    expect(vdot(12.1, 3100)).toBeGreaterThan(45);
  });
});
