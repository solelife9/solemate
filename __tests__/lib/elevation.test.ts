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
