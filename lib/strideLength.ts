// ============================================================================
// lib/strideLength.ts — 보폭 추정 (걸음수 → 거리). 순수 함수.
// ============================================================================
// **왜 있는가(2026-08-08).** 안드로이드에서 **실내 러닝이 항상 0.00km 로 끝났다.**
// 실내에서는 GPS 를 켜지 않고(잡히지도 않고 팬텀 거리를 만든다) 거리는 만보계가
// 정본인데, 그 만보계 거리 모듈(`lib/pedometerDistance`)이 **iOS 전용**이었다.
// 아이폰은 `CMPedometer` 가 거리를 직접 주지만 안드로이드는 그런 API 가 없다.
//
// ── 먼저 OS 를 찾아봤다 (CLAUDE.md §구현 원칙) ────────────────────────────────
// **안드로이드에는 OS 가 주는 실시간 이동거리 API 가 없다.** 확인한 것:
//   · `expo-sensors` Pedometer → 걸음수만(`steps`). 거리 필드 자체가 없다.
//   · Android 센서 프레임워크 → TYPE_STEP_COUNTER/DETECTOR 뿐. 거리 센서는 없다.
//   · Health Connect → 저장소지 센서가 아니다. Distance 레코드는 *다른 앱이 쓴 것*을
//     읽는 것이고, 우리 러닝 중에 실시간으로 채워 주지 않는다(우리가 쓰는 쪽이다).
// 그래서 여기서는 표준을 쓸 수 없다. **그 사실을 적어 두는 게 이 문단의 목적이다** —
// 다음 사람이 "OS 에 있는데 왜 안 썼지?"로 다시 조사하지 않게.
//
// ── 그럼 업계는 트레드밀 거리를 어떻게 내나 ─────────────────────────────────
// **걸음수 × 보폭.** 문제는 보폭을 어디서 얻느냐인데, 가민·폴라·나이키가 쓰는 방법이
// 같다: **사용자의 GPS 러닝에서 자동 보정한다.** 밖에서 뛸수록 트레드밀 거리가
// 정확해진다(가민이 사용자에게 그렇게 안내한다).
//
// 우리는 그 데이터를 **이미 갖고 있다** — 러닝마다 거리·이동시간·케이던스를 저장한다.
//     총 걸음 ≈ 케이던스(spm) × 이동시간(분)
//     보폭(m) = 거리(m) ÷ 총 걸음
// 키를 물어보는 방식(stride ≈ 키 × 0.4x)도 있지만 그건 *걷기* 회귀식이고, 달리기 보폭은
// 속도에 따라 크게 변한다. 게다가 우리는 키를 수집하지 않는다 —
// **없는 값을 새로 묻는 것보다 이미 가진 값을 쓰는 쪽이 낫다.**
//
// ── 정직성 (MISSION.md Truth only) ──────────────────────────────────────────
// 보정 표본이 없으면 기본 보폭을 쓴다. **그건 추정이고, 추정이라고 말해야 한다** —
// `source` 를 함께 돌려주는 이유다. 화면은 그걸 보고 "실외 러닝을 하면 정확해져요"를
// 띄운다. 다만 **0.00km 보다는 라벨 붙은 추정이 낫다**: 0 은 틀린 값이고, 사용자가
// 30분 달린 사실 자체를 지운다.
// ============================================================================

/**
 * 보정 표본이 없을 때 쓰는 기본 러닝 보폭(m).
 *
 * 근거(추정임을 분명히 한다): 생활 러너의 흔한 조합인 **6'00"/km · 165spm** 에서
 *   속도 10km/h = 166.7 m/min → 166.7 ÷ 165 ≈ **1.01 m/걸음**
 * 특정 인물의 실측이 아니라 대표값이다. 첫 실외 러닝이 들어오는 순간 개인값으로 대체된다.
 */
export const DEFAULT_STRIDE_M = 1.0;

/** 사람의 러닝 보폭이 이 밖으로 나가면 계산이 잘못된 것이다(입력 오염 방어). */
export const STRIDE_MIN_M = 0.5;
export const STRIDE_MAX_M = 2.0;

/** 개인 보폭을 쓰기 위한 최소 표본 수. 한두 개로 개인값을 주장하지 않는다. */
export const MIN_CALIBRATION_RUNS = 3;

/** 보정에 쓸 러닝의 최소 거리(km)·최소 이동시간(초). 짧은 런은 비율 오차가 크다. */
export const CAL_MIN_KM = 1.0;
export const CAL_MIN_SEC = 300;

/** 보정에 쓸 케이던스 범위(spm). 밖은 측정 실패로 본다(걷기·센서 오류·미측정 0). */
export const CAL_CADENCE_MIN = 120;
export const CAL_CADENCE_MAX = 220;

/** 최근 몇 개까지 볼 것인가. 오래된 러닝은 체력·폼이 달라 지금의 보폭이 아니다. */
export const CAL_WINDOW = 20;

/** 보정에 쓰는 러닝 한 건(필요한 필드만 — 호출부가 매핑한다). */
export interface StrideCalRun {
  /** 거리(km). */
  km: number;
  /** **이동 시간**(초). 일시정지가 빠진 값이어야 케이던스와 분모가 맞는다. */
  durationS: number;
  /** 평균 케이던스(spm). 0/누락이면 못 쓴다. */
  cadence?: number;
  /**
   * GPS 로 잰 거리인가. **이게 false 면 보정에 쓰면 안 된다** — 실내 러닝은 바로 이
   * 보폭으로 거리를 만든 것이라, 쓰면 자기 추정으로 자기를 보정하는 순환이 된다.
   */
  gpsMeasured: boolean;
}

export type StrideSource = 'personal' | 'default';

export interface StrideEstimate {
  strideM: number;
  source: StrideSource;
  /** 개인 보정에 실제로 쓰인 러닝 수(default 면 0). */
  samples: number;
}

/** 러닝 한 건에서 보폭(m)을 역산한다. 못 쓰는 표본이면 null. */
export function strideFromRun(r: StrideCalRun): number | null {
  if (!r || !r.gpsMeasured) return null;
  const km = Number(r.km);
  const sec = Number(r.durationS);
  const spm = Number(r.cadence);
  if (!Number.isFinite(km) || km < CAL_MIN_KM) return null;
  if (!Number.isFinite(sec) || sec < CAL_MIN_SEC) return null;
  if (!Number.isFinite(spm) || spm < CAL_CADENCE_MIN || spm > CAL_CADENCE_MAX) return null;

  const steps = spm * (sec / 60);
  if (!(steps > 0)) return null;
  const stride = (km * 1000) / steps;
  if (!Number.isFinite(stride) || stride < STRIDE_MIN_M || stride > STRIDE_MAX_M) return null;
  return stride;
}

/**
 * 사용자의 러닝 기록에서 보폭을 보정한다.
 *
 * **중앙값을 쓴다**(평균 아님). 한 건이라도 거리나 케이던스가 튀면 평균은 통째로
 * 끌려가는데, 러닝 기록에는 그런 건이 실제로 섞인다(터널 GPS 튐·센서 리셋·수동 입력).
 *
 * @param runs 최신순일 필요는 없다 — 최근 CAL_WINDOW 건을 쓰려면 호출부가 잘라 넘긴다.
 */
export function calibrateStride(runs: readonly StrideCalRun[] | null | undefined): StrideEstimate {
  const samples: number[] = [];
  for (const r of runs ?? []) {
    const s = strideFromRun(r);
    if (s != null) samples.push(s);
    if (samples.length >= CAL_WINDOW) break;
  }
  if (samples.length < MIN_CALIBRATION_RUNS) {
    return {strideM: DEFAULT_STRIDE_M, source: 'default', samples: 0};
  }
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  const median = samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
  return {
    strideM: Math.min(STRIDE_MAX_M, Math.max(STRIDE_MIN_M, median)),
    source: 'personal',
    samples: samples.length,
  };
}

/**
 * 누적 걸음수 → 누적 거리(m). `runTracker.feedPedometerDistance` 가 **누적 미터**를
 * 받으므로 여기서도 누적을 그대로 환산한다(델타 계산은 엔진 몫 — 일시정지·센서 리셋
 * 처리가 이미 거기 있다).
 *
 * 음수·NaN 은 0 으로 접는다. Iron Law: 거리는 음수가 될 수 없다.
 */
export function stepsToMeters(steps: number, strideM: number): number {
  const n = Number(steps);
  const s = Number(strideM);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(s) || s <= 0) return 0;
  return n * Math.min(STRIDE_MAX_M, Math.max(STRIDE_MIN_M, s));
}
