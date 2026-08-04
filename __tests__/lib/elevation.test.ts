import {initElevState, feedAltitude, ELEV_THRESHOLD_M} from '../../lib/elevation';

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
