import {
  initStepCadence,
  feedStepCount,
  computeStepSpm,
  averageSpm,
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

describe('averageSpm — 저장용 러닝 전체 평균 케이던스', () => {
  // 위 import 와 같은 함수다 — 이름을 겹치지 않게 해서 어느 쪽을 보는지 분명히 한다.
  const {averageSpm: avgSpm} = require('../../lib/stepCadence');
  test('총 걸음수 ÷ 이동분: 3,150걸음/18.75분 ≈ 168spm', () => {
    expect(avgSpm(3150, 1125)).toBe(168);
  });
  test('경계·비정상 입력은 0 (걸음 0, 시간 0/음수, NaN)', () => {
    expect(avgSpm(0, 600)).toBe(0);
    expect(avgSpm(100, 0)).toBe(0);
    expect(avgSpm(100, -5)).toBe(0);
    expect(avgSpm(NaN, 600)).toBe(0);
    expect(avgSpm(100, NaN)).toBe(0);
  });
  test('반올림: 170.4→170, 170.5→171', () => {
    expect(avgSpm(1704, 600)).toBe(170); // 170.4
    expect(avgSpm(1705, 600)).toBe(171); // 170.5
  });
});

// ============================================================================
// 평균 케이던스의 분자와 분모는 같은 구간을 덮어야 한다 (2026-08-07 감사)
//
// 완주 시 평균 케이던스를 `총 걸음수 ÷ 이동 시간` 으로 낸다. 그런데 분자는 OS 만보계의
// **러닝 전체 누적**(일시정지 중 걸은 것 포함)이고 분모는 **일시정지를 뺀 이동 시간**
// 이었다. 두 값이 서로 다른 구간을 덮으면 결과가 사람의 범위를 벗어난다:
//
//   · 30분@170spm + 10분 걸어서 물 마시기 → 저장값 **203 spm**
//   · 30분 뛰고 크래시 → 5분 더 (걸음 기준점만 리셋) → 저장값 **24 spm**
//
// 그래서 '이동 중에만 쌓은 걸음'(movingSteps)을 분자로 쓰고, 스냅샷에 실어 복구 런도
// 잇는다. 이 스위트는 그 불변식을 숫자로 못 박는다.
// ============================================================================
describe('평균 케이던스 — 분자/분모 구간 일치', () => {
  const SPM = 170;

  test('일시정지 중 걸은 걸음이 섞이면 사람의 범위를 벗어난다(옛 동작)', () => {
    const movingSec = 30 * 60;
    const runSteps = Math.round((SPM * movingSec) / 60);   // 이동 중 진짜 걸음
    const pausedSteps = Math.round((110 * 10 * 60) / 60);  // 10분 걷기(110spm — 보행 실측대)
    // 옛 분자 = 전체 누적, 분모 = 이동 시간
    expect(averageSpm(runSteps + pausedSteps, movingSec)).toBeGreaterThan(200);
    // 새 분자 = 이동 중 걸음만
    expect(averageSpm(runSteps, movingSec)).toBe(SPM);
  });

  test('복구 런: 걸음만 리셋되고 시간은 런 전체면 반토막 난다(옛 동작)', () => {
    const totalMovingSec = 35 * 60;          // 30분 + 크래시 후 5분
    const afterResumeSteps = Math.round((SPM * 5 * 60) / 60);
    // 옛 동작: 재개 후 걸음만 분자에 들어간다
    expect(averageSpm(afterResumeSteps, totalMovingSec)).toBeLessThan(30);
    // 새 동작: 스냅샷에서 이어받은 누적을 합친다
    const beforeCrashSteps = Math.round((SPM * 30 * 60) / 60);
    expect(averageSpm(beforeCrashSteps + afterResumeSteps, totalMovingSec)).toBe(SPM);
  });

  test('일시정지가 없으면 두 방식이 같은 답을 준다(회귀 없음)', () => {
    const sec = 20 * 60;
    const steps = Math.round((SPM * sec) / 60);
    expect(averageSpm(steps, sec)).toBe(SPM);
  });
});
