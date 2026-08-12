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
  } else if (last && steps === last.steps) {
    // 공회전 앵커 슬라이드(폴링 소스, 2026-07-03): 걸음수가 그대로면 표본을 append 하지
    // 않고 마지막 표본의 시각만 지금으로 민다. 스트림(CMPedometer 이벤트)은 걸음이 없으면
    // 이벤트 자체가 없지만, 폴링은 정지 중에도 5초마다 '변화 0' 표본을 만든다 — 그대로
    // 쌓으면 출발선 대기/신호 정지 뒤 재출발 케이던스가 공회전 시간에 희석된다. 앵커를
    // 밀면 재출발 첫 Δ가 곧바로 신선한 윈도우에서 계산된다(스트림 의미론과 동치).
    samples = [...prev.slice(0, -1), {t: nowMs, steps}];
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

/**
 * 러닝 전체 평균 케이던스(spm) = 총 걸음수 ÷ 이동 시간(분). 기록 저장용 표준 지표 —
 * 롤링 spm(라이브 표시용)과 달리 마지막 순간의 속도에 좌우되지 않는다.
 *
 * ⚠️ **분자를 무엇으로 줄지가 이 함수의 전부다.**
 * 예전 주석은 "걸음은 이동 중에만 쌓이므로 분모는 이동 시간이 맞다"고 적혀 있었는데,
 * 앞 절이 **사실이 아니다** — OS 만보계는 일시정지 중 걸어도 계속 센다. 그 전제 위에서
 * 호출부가 '러닝 전체 누적'을 분자로 넘겼고, 30분@170spm 뒤 10분 걸어서 물 마시면
 * **200 spm 대**가 저장됐다(2026-08-07 감사).
 *
 * 그래서 호출부는 **이동 중에만 쌓은 걸음**(RunEngine 의 movingStepsRef, 스냅샷의
 * movingSteps)을 넘겨야 한다. 분자와 분모가 같은 구간을 덮는지는 이 함수가 알 수 없으니
 * 호출부의 계약이다. 비정상 입력(0/음수/NaN)은 0.
 */
export function averageSpm(totalSteps: number, movingSec: number): number {
  if (!Number.isFinite(totalSteps) || !Number.isFinite(movingSec)) return 0;
  if (totalSteps <= 0 || movingSec <= 0) return 0;
  return Math.round((totalSteps * 60) / movingSec);
}

/**
 * 안드로이드 걸음 누적 — **expo 가 기준을 옮겨도 총합을 잃지 않는다.**
 *
 * 왜 필요한가 (2026-08-12 실기기)
 * ----------------------------------------------------------------------------
 * `expo-sensors` 의 PedometerModule 은 리스너가 다시 등록될 때마다 기준을 지운다:
 *     listenerDecorator = { stepsAtTheBeginning = null }
 * 그리고 SensorProxy 는 앱이 백그라운드로 가면(onHostPause) 리스너를 해제한다.
 * 즉 폰을 주머니에 넣고 달리다 화면을 켜면 `steps` 가 **0 부터 다시** 시작한다.
 *
 * 실측: 갤럭시 19분 33초 러닝의 저장된 케이던스가 **1 spm**. 마지막 복귀 이후의
 * 스무 걸음 남짓만 남았기 때문이다(가민은 같은 러닝에서 168 spm).
 *
 * 그래서 raw 의 **증분만** 더한다. 값이 줄면 기준이 리셋된 것이므로 그 시점부터의
 * 값을 그대로 더한다.
 *
 * ⚠️ 백그라운드 동안 하드웨어가 센 걸음은 expo 가 기준을 옮겨 버려 **되찾을 수 없다.**
 * 완전한 해법은 Health Connect 걸음수로 러닝 구간을 조회하는 것이다(별건).
 */
export function accumulateSteps(
  state: {total: number; lastRaw: number},
  raw: unknown,
): {total: number; lastRaw: number} {
  const v = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(v) || v < 0) return state;         // 쓰레기 표본은 무시
  const delta = v >= state.lastRaw ? v - state.lastRaw : v; // 줄었다 = 기준 리셋
  return {total: state.total + delta, lastRaw: v};
}
