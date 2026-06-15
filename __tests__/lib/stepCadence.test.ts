import {
  initStepCadence,
  feedStepCount,
  computeStepSpm,
} from '../../lib/stepCadence';
import {CADENCE_MIN_WINDOW_MS, CADENCE_WINDOW_MS} from '../../lib/engineConstants';

// OS 걸음 센서(Pedometer)의 누적 걸음수 → 케이던스(spm) 산출 순수 로직 검증.
// 누적 걸음수를 시각과 함께 공급하면 Δsteps/Δt 분당비율로 spm 이 나온다.

describe('initStepCadence', () => {
  test('빈 상태', () => {
    expect(initStepCadence()).toEqual({samples: []});
  });
});

describe('computeStepSpm', () => {
  test('표본 2개 미만 → 0', () => {
    expect(computeStepSpm([], 0)).toBe(0);
    expect(computeStepSpm([{t: 0, steps: 0}], 1000)).toBe(0);
  });

  test('관측 span < 최소창 → 0(외삽 노이즈 억제)', () => {
    const samples = [
      {t: 0, steps: 0},
      {t: CADENCE_MIN_WINDOW_MS - 1, steps: 5},
    ];
    expect(computeStepSpm(samples, CADENCE_MIN_WINDOW_MS - 1)).toBe(0);
  });

  test('170spm: 12초간 34걸음 → 170', () => {
    const samples = [
      {t: 0, steps: 0},
      {t: 12000, steps: 34},
    ];
    // 34 / 12000ms * 60000 = 170
    expect(computeStepSpm(samples, 12000)).toBe(170);
  });

  test('Δsteps ≤ 0(정지) → 0', () => {
    const samples = [
      {t: 0, steps: 10},
      {t: 5000, steps: 10},
    ];
    expect(computeStepSpm(samples, 5000)).toBe(0);
  });
});

describe('feedStepCount', () => {
  test('누적 걸음수 스트림이 ~170spm 을 낸다', () => {
    let s = initStepCadence();
    let spm = 0;
    const intervalMs = Math.round(60000 / 170); // 353ms 당 1걸음
    for (let k = 0; k <= 40; k++) {
      const r = feedStepCount(s, k, k * intervalMs);
      s = r.state;
      spm = r.spm;
    }
    expect(spm).toBeGreaterThanOrEqual(165);
    expect(spm).toBeLessThanOrEqual(175);
  });

  test('첫 걸음 전 idle 은 케이던스를 희석하지 않는다', () => {
    // 30초 idle 후 첫 표본부터 170spm — span 은 첫 표본부터 재므로 idle 무관.
    let s = initStepCadence();
    const start = 30000;
    const intervalMs = Math.round(60000 / 170);
    let spm = 0;
    for (let k = 0; k <= 40; k++) {
      const r = feedStepCount(s, k, start + k * intervalMs);
      s = r.state;
      spm = r.spm;
    }
    expect(spm).toBeGreaterThanOrEqual(165);
    expect(spm).toBeLessThanOrEqual(175);
  });

  test('윈도우 밖 오래된 표본은 prune 된다', () => {
    let s = initStepCadence();
    s = feedStepCount(s, 0, 0).state;
    const r = feedStepCount(s, 100, CADENCE_WINDOW_MS + 5000);
    // 첫 표본(t=0)은 윈도우 밖이라 prune → 표본 1개만 남아 spm 0.
    expect(r.state.samples.length).toBe(1);
    expect(r.spm).toBe(0);
  });

  test('센서 역행(리셋) → 새 기준으로 재시작(음수 rate 없음)', () => {
    let s = initStepCadence();
    s = feedStepCount(s, 100, 0).state;
    s = feedStepCount(s, 120, 1000).state;
    const r = feedStepCount(s, 5, 2000); // 역행
    expect(r.state.samples).toEqual([{t: 2000, steps: 5}]);
    expect(r.spm).toBe(0);
  });

  test('입력 state 를 변형하지 않는다(순수)', () => {
    const s = initStepCadence();
    feedStepCount(s, 10, 1000);
    expect(s).toEqual({samples: []});
  });
});
