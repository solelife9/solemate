import {initElevState, feedAltitude, elevationGainFrom, ELEV_THRESHOLD_M} from '../../lib/elevation';

describe('elevation gain accumulation', () => {
  it('첫 표본은 기준만 설정하고 누적은 0', () => {
    const s = feedAltitude(initElevState(), 100);
    expect(s.ref).toBe(100);
    expect(s.gain).toBe(0);
  });

  it('임계 이상 오르막은 차이를 누적한다', () => {
    let s = feedAltitude(initElevState(), 100);
    s = feedAltitude(s, 110); // +10 ≥ 임계
    expect(s.gain).toBe(10);
    s = feedAltitude(s, 115); // +5 ≥ 임계
    expect(s.gain).toBe(15);
  });

  it('임계 이내 흔들림(노이즈)은 무시한다', () => {
    let s = feedAltitude(initElevState(), 100);
    s = feedAltitude(s, 100 + (ELEV_THRESHOLD_M - 1)); // 임계 미만
    s = feedAltitude(s, 100 - (ELEV_THRESHOLD_M - 1));
    expect(s.gain).toBe(0);
    expect(s.ref).toBe(100); // 기준도 안 움직임
  });

  it('내리막은 기준만 낮추고 누적하지 않는다', () => {
    let s = feedAltitude(initElevState(), 100);
    s = feedAltitude(s, 80); // -20: 내리막
    expect(s.gain).toBe(0);
    expect(s.ref).toBe(80);
    s = feedAltitude(s, 90); // +10 오르막 → 누적
    expect(s.gain).toBe(10);
  });

  it('고도 없음(null/NaN)은 상태를 바꾸지 않는다', () => {
    let s = feedAltitude(initElevState(), 100);
    const before = {...s};
    s = feedAltitude(s, null);
    s = feedAltitude(s, undefined);
    s = feedAltitude(s, NaN);
    expect(s).toEqual(before);
  });

  it('오르락내리락 종합: 순 상승분만 합산', () => {
    let s = initElevState();
    [100, 110, 105, 120, 90, 100].forEach(a => { s = feedAltitude(s, a); });
    // 100(기준) →110(+10) →105(노이즈? -5 ≥임계 내리막, 기준105) →120(+15) →90(내리막,기준90) →100(+10)
    // 누적: 10 + 15 + 10 = 35
    expect(s.gain).toBe(35);
  });
});

// ─── 노이즈가 고도를 만들어내지 못한다 (2026-08-04) ────────────────────────────
// 실기기에서 **3.25km / 20분 러닝에 3,262m** 가 찍혔다(분당 163m — 엘리트 등산 러너도
// 20~30m/분이다). 임계 히스테리시스만으로는 못 막는 구조였다: 1초마다 표본이 들어오는데
// 노이즈가 임계 근처에서 진동하면 **올라갈 때마다 누적되고 내려갈 때는 기준만 낮아진다.**
// 제자리 흔들림이 계속 적립되는 것이다.
describe('평지에서 고도가 쌓이지 않는다', () => {
  /** 20분 동안 1초마다, 평지(0m)에 ±4m 로 진동하는 기압 노이즈. */
  const flatWithNoise = (): {alt: number; atMs: number}[] => {
    const out: {alt: number; atMs: number}[] = [];
    for (let i = 0; i < 1200; i++) {
      out.push({alt: (i % 2 === 0 ? 4 : -4), atMs: i * 1000});
    }
    return out;
  };

  test('임계를 넘나드는 진동 20분 → 상승 0에 가깝다(옛 규칙이면 수천 m)', () => {
    let st = initElevState();
    for (const s of flatWithNoise()) st = feedAltitude(st, s.alt, s.atMs);
    expect(Math.round(st.gain)).toBeLessThan(50);
  });

  test('사람이 낼 수 없는 급상승은 버린다 — 1초에 30m 는 센서 이상이다', () => {
    let st = initElevState();
    st = feedAltitude(st, 0, 0);
    st = feedAltitude(st, 30, 1000); // 분당 1,800m
    expect(st.gain).toBe(0);
  });

  test('진짜 오르막은 그대로 잡는다 — 10분에 100m(분당 10m)', () => {
    let st = initElevState();
    for (let i = 0; i <= 600; i++) st = feedAltitude(st, (i / 600) * 100, i * 1000);
    expect(st.gain).toBeGreaterThan(80);
    expect(st.gain).toBeLessThan(110);
  });

  test('내리막은 누적하지 않는다', () => {
    let st = initElevState();
    for (let i = 0; i <= 600; i++) st = feedAltitude(st, 100 - (i / 600) * 100, i * 1000);
    expect(st.gain).toBeLessThan(5);
  });
});

// ============================================================================
// 워치 경로 상승률 상한 (2026-08-07 감사)
//
// elevationGainFrom 은 워치가 보낸 고도 원자료를 폰이 계산하는 유일한 경로인데,
// **상한이 아예 없었다**(표본 시각이 없어서). 임계 히스테리시스(3m)만 남아 잡음이
// 그대로 누적됐고, 400표본 시뮬레이션에서 평지가 최대 1,843m 로 나온다 —
// 2026-08-05 아이폰에서 실제로 터진 1,814m 와 같은 크기다.
// GPS 경로는 4f39cb9 로 고쳤지만 워치 경로는 그대로였다.
//
// 표본 시각은 없지만 러닝 총 시간은 안다. 균등 다운샘플이므로 평균 간격으로
// 재구성해 상한을 건다(근사임을 함수 주석에 명시).
// ============================================================================
describe('워치 고도 — 상승률 상한', () => {
  /** 평지 위 잡음: 진폭 amp(m), period 표본마다 오르내림. */
  const noisyFlat = (n: number, amp: number, period: number) =>
    Array.from({length: n}, (_, i) => 100 + (Math.floor(i / period) % 2 ? amp : 0));

  test('평지 잡음이 등반으로 둔갑하지 않는다 (감사 재현: 400표본)', () => {
    const samples = noisyFlat(400, 8, 3);
    const durationS = 30 * 60; // 30분 러닝

    // 시간을 안 주면 예전 동작 — 잡음이 그대로 쌓인다(그래서 상한이 필요했다).
    expect(elevationGainFrom(samples)).toBeGreaterThan(500);

    // 시간을 주면 사람이 낼 수 없는 상승률이 걸러진다.
    expect(elevationGainFrom(samples, durationS)).toBeLessThan(100);
  });

  test('진짜 언덕은 자르지 않는다 — 상한이 정상 러닝을 깎으면 그게 더 나쁘다', () => {
    // 30분에 200m 를 꾸준히 오르는 러닝(≈6.7 m/분 — 사람의 범위 안).
    const n = 400;
    const climb = Array.from({length: n}, (_, i) => 100 + (200 * i) / (n - 1));
    const gain = elevationGainFrom(climb, 30 * 60);
    expect(gain).toBeGreaterThan(180);
    expect(gain).toBeLessThanOrEqual(200);
  });

  test('표본이 부족하거나 시간이 없으면 히스테리시스만 적용한다(구버전 페이로드)', () => {
    expect(elevationGainFrom([100, 110], 0)).toBe(10);
    expect(elevationGainFrom([100, 110])).toBe(10);
    expect(elevationGainFrom([])).toBe(0);
  });
});

// ── 기압 → 상대고도 (2026-08-09) ─────────────────────────────────────────────
// 왜 이 경로가 생겼나: 업계는 **아무도 폰 GPS 고도를 쓰지 않는다**(가민·애플·스트라바·
// NRC 전부 기압계가 1순위, 스트라바는 기압계 없는 기기에서 지형 DB 를 조회한다).
// iOS 는 이미 정석이었고(`Barometer.relativeAltitude`), **안드로이드가 갭이었다** —
// expo-sensors 가 안드로이드에서 relativeAltitude 를 주지 않아 GPS 로 폴백했다.
// 기압만 있으면 상대고도는 만들 수 있다.
describe('relativeAltitudeFromPressure', () => {
  const {relativeAltitudeFromPressure} = require('../../lib/elevation');

  it('기압이 낮아지면 올라간 것이다', () => {
    // 해면 근처에서 1hPa ≈ 8.4m. 1013 → 1000 은 대략 +110m.
    const h = relativeAltitudeFromPressure(1000, 1013.25);
    expect(h).toBeGreaterThan(100);
    expect(h).toBeLessThan(120);
  });

  it('기준과 같으면 0 — 출발점은 항상 0 이다', () => {
    expect(relativeAltitudeFromPressure(1013.25, 1013.25)).toBeCloseTo(0, 6);
  });

  it('기압이 높아지면 음수(내려갔다)', () => {
    expect(relativeAltitudeFromPressure(1020, 1013.25)).toBeLessThan(0);
  });

  it('지구에 없는 기압은 센서 오류다 — null 로 버린다', () => {
    for (const bad of [0, -5, 200, 1200, NaN, Infinity]) {
      expect(relativeAltitudeFromPressure(bad, 1013.25)).toBeNull();
    }
    expect(relativeAltitudeFromPressure(1000, 0)).toBeNull();
  });

  it('절대 고도가 아니라 상대 고도다 — 기준을 바꾸면 값이 바뀐다', () => {
    // 표준 해면기압을 기준으로 삼으면 날씨에 따라 수십 m 가 통째로 어긋난다.
    // 그래서 **러닝 시작 시점의 기압**을 기준으로 쓴다(iOS relativeAltitude 와 같은 규약).
    const a = relativeAltitudeFromPressure(1000, 1013.25);
    const b = relativeAltitudeFromPressure(1000, 1005);
    expect(a).not.toBeCloseTo(b as number, 1);
  });

  it('실제 러닝 규모의 오르막을 정상 범위로 낸다', () => {
    // 100m 언덕 ≈ 12hPa 하강. 상승률 상한(30m/분)에 걸리지 않는 값이어야 한다.
    const h = relativeAltitudeFromPressure(1001.25, 1013.25) as number;
    expect(h).toBeGreaterThan(90);
    expect(h).toBeLessThan(110);
  });
});
