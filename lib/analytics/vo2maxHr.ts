// ============================================================================
// lib/analytics/vo2maxHr.ts — 심박 기반 VO2max 추정 (가민·애플이 쓰는 방식)
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-04): 기존 추정은 **페이스만** 봤다(Daniels VDOT 최고치).
// 그런데 VDOT 는 원래 VO2max 측정식이 아니라 **레이스 결과 → 훈련 페이스 환산표**다.
// "이 노력은 레이스급 최대"라는 전제가 깔려 있는데, 앱은 아무 런에나 적용하고 그중
// 가장 높게 나온 값을 채택했다. 그래서 2.56km 를 2'53"/km 로 달린 조각 하나가
// VO2max 67.9(엘리트 구간)를 만들었다 — 2위 기록은 48.8 이었다.
//
// 페이스만으로는 **"체력이 좋아서 빠른 것"과 "짧게 스퍼트한 것"을 구별할 수 없다.**
// 그 구별은 심박이 한다. 그래서 가민(Firstbeat)·애플·폴라가 전부 심박을 쓴다.
//
// ── 원리: 서브맥시멀 심박 ↔ 산소섭취 ─────────────────────────────────────────
// 잘 확립된 선형 관계를 쓴다(Swain & Leutholtz): **%HRR ≈ %VO2R**
//   %HRR = (HR평균 − 안정시) / (최대 − 안정시)
//   VO2R = VO2max − VO2안정(3.5)
//   ⇒ VO2(속도) − 3.5 = %HRR × (VO2max − 3.5)
//   ⇒ VO2max = 3.5 + (VO2(속도) − 3.5) / %HRR
// 속도→VO2 는 Daniels 식을 그대로 쓴다(ACSM 선형식보다 빠른 구간에서 정확).
//
// **최대로 달릴 필요가 없다**는 게 이 방식의 핵심이다. 평상시 러닝에서 "이 페이스에
// 심박이 얼마나 드는가"를 보고 역산한다 — 같은 페이스에 심박이 낮아지면 체력이 올랐다.
//
// ── 정직하게 밝히는 한계 ─────────────────────────────────────────────────────
// 가민의 Firstbeat 는 수십 년 축적된 상용 알고리즘이다(EPOC·HRV·신뢰도 모델 포함).
// 이 모듈은 그 **공개된 생리학적 코어**를 구현한 것이고, 같은 수준을 주장하지 않는다.
// 대신 그쪽이 쓰는 품질 게이트를 최대한 따른다 — 아래 isValidSample 참조.
//
// 순수 함수 — I/O 없음, 입력 불변, throw 금지, 비유효는 0/null.
// ============================================================================

/** 안정시 산소섭취량(ml·kg⁻¹·min⁻¹) — 1 MET. */
const VO2_REST = 3.5;

/** 사람의 VO2max 가 실재할 수 있는 범위. 밖이면 표본을 버린다(계산 오류·데이터 오염). */
export const VO2MAX_FLOOR = 20;
export const VO2MAX_CEIL = 90;

/** 표본으로 인정하는 최소 지속시간(초) — 심박이 정상상태에 드는 데 필요한 시간. */
export const MIN_SAMPLE_SEC = 600; // 10분

/**
 * 표본으로 인정하는 %HRR 구간.
 *  · 하한 0.55 — 더 낮으면 심박이 자세·기온·카페인에 휘둘려 관계가 무너진다.
 *  · 상한 0.90 — 최대 근처에서는 심박이 먼저 천장에 닿아(HR 평탄화) 과대추정된다.
 * 가민·폴라가 '유효 구간'을 두는 이유와 같다.
 */
export const HRR_MIN = 0.55;
export const HRR_MAX = 0.90;

/** 현실적인 러닝 페이스(초/km) 범위 — 밖이면 GPS·입력 오류로 본다. */
const PACE_MIN_SEC = 160; // 2'40"/km
const PACE_MAX_SEC = 720; // 12'00"/km

/** 관측 최대심박이 신뢰할 만한지: 안정시보다 최소 이만큼은 높아야 한다. */
const MIN_HR_SPREAD = 40;

/** 속도(m/min) → VO2(ml·kg⁻¹·min⁻¹). Daniels & Gilbert. */
export function vo2AtSpeed(metersPerMin: number): number {
  const v = Number.isFinite(metersPerMin) ? metersPerMin : 0;
  if (!(v > 0)) return 0;
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/**
 * 최대심박 추정 — **관측값이 있으면 그것이 우선**이다(추정식보다 언제나 정확).
 * 없으면 Tanaka(2001): 208 − 0.7×나이. 흔히 쓰는 220−나이 보다 오차가 작다.
 * 둘 다 없으면 0(= 추정 불가).
 */
export function estimateHrMax(observedMax: number, age: number): number {
  const obs = Number.isFinite(observedMax) ? observedMax : 0;
  if (obs > 0) return Math.round(obs);
  const a = Number.isFinite(age) ? age : 0;
  if (!(a > 0) || a > 120) return 0;
  return Math.round(208 - 0.7 * a);
}

/** 한 건의 심박 표본 — 체력 추정에 필요한 최소 입력. */
export interface HrSample {
  /** 거리(km). 경사 보정된 값이 있으면 그쪽을 넣는다(아래 gapSec 참고). */
  km: number;
  /** 소요 시간(초). */
  durationS: number;
  /** 그 런의 **평균** 심박(bpm). */
  hrAvg: number;
  /** 'YYYY-MM-DD'. 윈도우 필터에 쓴다. */
  runDate?: string;
  /**
   * 경사 보정 페이스(초/km). 있으면 raw 페이스 대신 이걸 쓴다 — 오르막에서는 같은
   * 속도라도 산소를 더 쓰므로, 보정하지 않으면 언덕 런이 체력을 과대평가한다.
   * keego 는 GAP 을 이미 계산한다(lib/analytics/gap).
   */
  gapSec?: number;
}

/** 표본이 추정에 쓸 만한가 — 이유까지 돌려준다(디버깅·설명 가능성). */
export function sampleRejection(
  s: HrSample,
  hrRest: number,
  hrMax: number,
): string | null {
  const km = Number(s?.km) || 0;
  const sec = Number(s?.durationS) || 0;
  const hr = Number(s?.hrAvg) || 0;
  if (sec < MIN_SAMPLE_SEC) return 'too_short';
  if (!(km > 0)) return 'no_distance';
  if (!(hr > 0)) return 'no_hr';
  if (!(hrRest > 0) || !(hrMax > hrRest + MIN_HR_SPREAD)) return 'hr_bounds';
  const pace = (s.gapSec && s.gapSec > 0 ? s.gapSec : sec / km);
  if (pace < PACE_MIN_SEC || pace > PACE_MAX_SEC) return 'pace_range';
  const hrr = (hr - hrRest) / (hrMax - hrRest);
  if (hrr < HRR_MIN) return 'intensity_low';
  if (hrr > HRR_MAX) return 'intensity_high';
  return null;
}

/**
 * 표본 하나에서 VO2max 를 역산한다. 쓸 수 없으면 0.
 * 경사 보정 페이스가 있으면 그것으로 속도를 잡는다(언덕 과대평가 방지).
 */
export function vo2maxFromSample(s: HrSample, hrRest: number, hrMax: number): number {
  if (sampleRejection(s, hrRest, hrMax) !== null) return 0;
  const paceSec = s.gapSec && s.gapSec > 0 ? s.gapSec : Number(s.durationS) / Number(s.km);
  const metersPerMin = 60000 / paceSec; // (1000m / paceSec) * 60
  const vo2 = vo2AtSpeed(metersPerMin);
  if (!(vo2 > VO2_REST)) return 0;
  const hrr = (Number(s.hrAvg) - hrRest) / (hrMax - hrRest);
  const est = VO2_REST + (vo2 - VO2_REST) / hrr;
  if (!(est >= VO2MAX_FLOOR) || est > VO2MAX_CEIL) return 0;
  return Math.round(est * 10) / 10;
}

export interface HrFitnessInput {
  samples: HrSample[];
  /** 안정시 심박(HealthKit 또는 사용자 입력). */
  hrRest: number;
  /** 관측된 최대 심박(런들에서 본 최대). 없으면 0 → 나이로 추정. */
  observedHrMax?: number;
  /** 나이 — 관측 최대심박이 없을 때만 쓴다(Tanaka). */
  age?: number;
  /** 기준일 'YYYY-MM-DD'. */
  today: string;
  /** 집계 창(일). 기본 90일 — 체력은 천천히 변한다. */
  windowDays?: number;
}

export interface HrFitnessResult {
  /** 추정 VO2max. 유효 표본이 없으면 0. */
  vo2max: number;
  /** 계산에 실제로 쓰인 표본 수. */
  sampleCount: number;
  /** 표본 수에 따른 신뢰도. 화면이 표기를 다르게 하도록. */
  confidence: 'none' | 'low' | 'high';
  /** 이 추정에 쓴 최대심박(관측 또는 Tanaka). 0이면 추정 불가였다. */
  hrMaxUsed: number;
}

/** 'YYYY-MM-DD' 에서 days 일 전 문자열. */
function daysAgoIso(today: string, days: number): string {
  const t = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(t)) return '';
  return new Date(t - days * 86400000).toISOString().slice(0, 10);
}

/** 중앙값 — 이상치 한 건이 값을 끌고 가지 못하게 한다(평균 대신). */
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * 심박 기반 체력 추정 — 최근 창의 유효 표본들의 **중앙값**.
 *
 * 왜 최고치가 아니라 중앙값인가: 최고치는 이상치 한 건에 통째로 끌려간다(지금 문제의
 * 원인이 정확히 그것이다). 가민·애플도 단일 최고 기록이 아니라 여러 세션에 걸쳐
 * 완만하게 갱신한다. 중앙값은 그 성질을 가장 단순·정직하게 구현한 것이다.
 */
export function hrFitness(input: HrFitnessInput): HrFitnessResult {
  const samples = Array.isArray(input?.samples) ? input.samples.filter(Boolean) : [];
  const hrRest = Number(input?.hrRest) || 0;
  const hrMax = estimateHrMax(Number(input?.observedHrMax) || 0, Number(input?.age) || 0);
  const windowDays = input?.windowDays ?? 90;
  const cutoff = input?.today ? daysAgoIso(input.today, windowDays) : '';

  if (!(hrMax > 0)) return {vo2max: 0, sampleCount: 0, confidence: 'none', hrMaxUsed: 0};

  const ests: number[] = [];
  for (const s of samples) {
    if (cutoff && s.runDate && s.runDate < cutoff) continue;
    const v = vo2maxFromSample(s, hrRest, hrMax);
    if (v > 0) ests.push(v);
  }
  if (!ests.length) return {vo2max: 0, sampleCount: 0, confidence: 'none', hrMaxUsed: hrMax};

  const vo2max = Math.round(median(ests) * 10) / 10;
  return {
    vo2max,
    sampleCount: ests.length,
    // 5건 이상이면 중앙값이 안정된다. 그 아래는 참고치로 취급하도록 화면에 알린다.
    confidence: ests.length >= 5 ? 'high' : 'low',
    hrMaxUsed: hrMax,
  };
}
