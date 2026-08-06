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
