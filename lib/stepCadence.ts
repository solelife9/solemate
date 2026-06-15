// ─── Step-counter cadence (OS pedometer) ─────────────────────────────────────
// 케이던스(steps-per-minute)를 **OS 걸음 센서**(expo-sensors Pedometer)의 누적 걸음수로
// 산출한다. 기존엔 가속도계 10Hz 합벡터 피크로 셌는데, 샘플레이트가 낮아 실제 ~170spm 이
// ~90 으로 절반쯤 누락됐다(앨리어싱). OS 걸음 센서는 저전력 보조칩이 OEM 튜닝으로 세므로
// 정확하다.
//
// 입력: Pedometer.watchStepCount 가 주는 **구독 이후 누적 걸음수**(cumulative). (t, steps)
// 표본을 롤링 윈도우로 모아 rate = Δsteps / Δt × 60000 로 spm 을 낸다. 정확한 걸음수라
// 피크검출/디바운스가 불필요.
//
// 윈도우/최소관측은 기존 케이던스와 동일 상수 재사용(engineConstants). 관측 span 이
// CADENCE_MIN_WINDOW_MS 미만이면 0(미표시) — 1~2 표본 외삽은 노이즈가 크다.
//
// PURE: 입력 불변, NaN/역행(센서 리셋) 방어, 어떤 입력에서도 throw 금지.

import {CADENCE_WINDOW_MS, CADENCE_MIN_WINDOW_MS} from './engineConstants';

export interface StepSample {
  /** ms timestamp. */
  t: number;
  /** 구독 이후 누적 걸음수(단조 증가 가정, 역행은 방어). */
  steps: number;
}

export interface StepCadenceState {
  /** 롤링 윈도우 내 (t, 누적걸음수) 표본, 도착순(samples[0] 이 가장 오래됨). */
  samples: StepSample[];
}

export interface StepCadenceSample {
  /** 다음 state — 이어지는 feedStepCount 호출에 되먹인다. */
  state: StepCadenceState;
  /** 현재 케이던스(spm, 양발 합산). 데이터 부족 시 0. */
  spm: number;
}

/** 빈 상태(표본 없음). */
export function initStepCadence(): StepCadenceState {
  return {samples: []};
}

function nonNegInt(n: number): number {
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * 누적 걸음수 표본 하나를 시각 nowMs 에 공급한다. 윈도우 밖 표본은 prune.
 * 센서 리셋 등으로 걸음수가 역행하면(새 표본 < 직전 표본) 윈도우를 비우고 새 기준으로
 * 다시 시작한다(음수 rate 방지). 입력 state 는 변형하지 않는다.
 */
export function feedStepCount(
  state: StepCadenceState,
  cumulativeSteps: number,
  nowMs: number,
): StepCadenceSample {
  const steps = nonNegInt(cumulativeSteps);
  const prev = state.samples;
  const last = prev.length > 0 ? prev[prev.length - 1] : null;

  // 역행(리셋) 방어: 누적값이 줄면 이전 표본을 버리고 이 표본을 새 기준으로 둔다.
  let samples: StepSample[];
  if (last && steps < last.steps) {
    samples = [{t: nowMs, steps}];
  } else {
    samples = [...prev, {t: nowMs, steps}];
  }

  // 롤링 윈도우 밖(오래된) 표본 prune.
  samples = samples.filter(s => nowMs - s.t <= CADENCE_WINDOW_MS);

  return {state: {samples}, spm: computeStepSpm(samples, nowMs)};
}

/**
 * 윈도우 내 표본으로 spm 계산. 가장 오래된~최신 표본의 Δsteps 를 Δt(관측 span)로 나눈
 * 분당 비율. 표본 2개 미만이거나 span < CADENCE_MIN_WINDOW_MS 면 0. Δsteps ≤ 0 이면 0
 * (정지/리셋 직후).
 */
export function computeStepSpm(samples: StepSample[], nowMs: number): number {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  // span 끝은 nowMs(현재) — feed 시점엔 last.t 와 같지만, 별도 tick 으로 호출되면 정지 후
  // 시간이 흐를수록 span 이 늘어 케이던스가 자연 감쇠한다(가속도 버전과 동일 규약).
  const spanMs = Math.min(CADENCE_WINDOW_MS, Math.max(0, nowMs - first.t));
  if (spanMs < CADENCE_MIN_WINDOW_MS) return 0;
  const dSteps = last.steps - first.steps;
  if (dSteps <= 0) return 0;
  return Math.round((dSteps * 60000) / spanMs);
}
