// ─── 교체 예측(Slice 6 차별점) ────────────────────────────────────
// 신발이 "이 페이스면 약 N주 후 교체"인지 추정하는 순수 함수. 네이티브 0·백엔드 0:
// 실효 마모 모델(lib/wearModel)을 그대로 재사용해 잔여 수명과 최근 28일 소모율로
// 잔여 주(週)·예상 교체일을 파생한다. 마모 계산은 wearModel 에 단일 구현이 있으므로
// 여기서 중복 구현하지 않는다(effectiveWearKm·targetKmFor·runEffectiveWear import).
//
// 엣지 graceful(A6-2): 결측·0·음수·비유한 입력에서도 weeksRemaining 에 NaN/Infinity/
// 음수를 절대 반환하지 않는다. 추정 불가(비유한·음수)면 안전 폴백(no_recent: null,
// 또는 overdue: 0). 원본 shoe/run 은 읽기만 한다.

import {
  effectiveWearKm,
  targetKmFor,
  runEffectiveWear,
  AGE_WEAR_MONTHS,
  type Surface,
  type WearRun,
  type WearShoe,
} from './wearModel';

// ─── 타입 ─────────────────────────────────────────────────────────
// 예측이 읽는 런 행. WearRun(거리·시간) 에 날짜 필드를 더한다. 날짜는 백엔드/로컬
// 스키마 차이를 흡수해 date → run_date → created_at 순으로 존재하는 ISO 를 쓴다.
export type ForecastRun = WearRun & {
  date?: string;
  run_date?: string;
  created_at?: string;
};

export type ReplacementReason = 'ok' | 'overdue' | 'no_recent';

export type ReplacementForecast = {
  kmRemaining: number; // targetKmFor − effectiveWearKm (overdue 면 ≤0)
  weeksRemaining: number | null; // 추정 불가/기록없음 → null
  etaISO: string | null; // 예상 교체일 ISO; 추정 불가/기록없음 → null
  confidence: 'high' | 'low'; // 최근 28일 런 수 ≥3 → high
  reason: ReplacementReason;
};

// ─── 상수 ─────────────────────────────────────────────────────────
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// 최근 소모율 측정창 = 28일 = 4주. recentRatePerWeek 분모로도 쓴다.
const RECENT_WINDOW_DAYS = 28;
const RECENT_WINDOW_WEEKS = 4;
// 한 달의 평균 주 수(시간 기반 폼 열화를 주 단위로 환산할 때). 30.4375/7 ≈ 4.345.
const WEEKS_PER_MONTH = 4.345;
// confidence 임계: 최근창 런 수가 이 값 이상이면 high.
const HIGH_CONFIDENCE_MIN_RUNS = 3;

/** 유효한 Date 면 그것, 아니면 현재시각. (now 미지정·손상 방어) */
function resolveNow(now: Date | undefined): Date {
  if (now instanceof Date && Number.isFinite(now.getTime())) return now;
  return new Date();
}

/** 런의 날짜 → epoch ms. date→run_date→created_at 순. 결측·파싱불가 → NaN. */
function runEpochMs(run: ForecastRun): number {
  const raw = run?.date ?? run?.run_date ?? run?.created_at;
  if (!raw) return NaN;
  return new Date(raw).getTime();
}

/**
 * 교체 예측 — 잔여 실효 수명을 최근 28일 소모율 + 시간 열화율로 나눠 약 N주·예상일을
 * 추정한다. 모든 분기에서 NaN/Infinity/음수 weeksRemaining 을 내지 않는다(A6-2).
 *
 *   kmRemaining     = targetKmFor(shoe) − effectiveWearKm(shoe, runs, opts).
 *   remaining ≤ 0   → reason 'overdue'  (weeks 0, eta = now ISO).
 *   최근 28일 실효주행 합 0 → reason 'no_recent' (weeks/eta = null).
 *   그 외           → reason 'ok':
 *     recentRatePerWeek = (최근28일 실효km) / 4
 *     agePerWeek        = (targetKm / 24) / 4.345
 *     weeksRemaining    = kmRemaining / (recentRatePerWeek + agePerWeek)
 *     etaISO            = now + weeksRemaining×7일.
 *   weeksRemaining 이 0 이하/비유한이면 no_recent 로 안전 폴백.
 *   confidence = 최근 28일 런 수 ≥3 ? 'high' : 'low'.
 *
 * 원본 shoe/run 은 읽기만 한다(파생값만 반환).
 */
export function forecastReplacement(
  shoe: WearShoe,
  runs: ForecastRun[],
  opts?: {weightKg?: number; now?: Date; surfaceOf?: (runId: string) => Surface},
): ReplacementForecast {
  const now = resolveNow(opts?.now);
  const nowMs = now.getTime();
  const surfaceOf = opts?.surfaceOf;

  // 잔여 실효 수명. target 은 항상 양수 유한, worn 은 항상 0 이상 유한(wearModel 보장).
  const target = targetKmFor(shoe);
  const worn = effectiveWearKm(shoe, runs, {
    weightKg: opts?.weightKg,
    now,
    surfaceOf,
  });
  let kmRemaining = target - worn;
  if (!Number.isFinite(kmRemaining)) kmRemaining = 0; // 방어(이론상 도달 불가)

  // 최근 28일 창의 실효 주행 합·런 수. 파싱 불가 런은 집계서 제외.
  const cutoffMs = nowMs - RECENT_WINDOW_DAYS * MS_PER_DAY;
  const list = Array.isArray(runs) ? runs : [];
  let recentKm = 0;
  let recentCount = 0;
  for (const run of list) {
    if (!run) continue;
    const t = runEpochMs(run);
    if (!Number.isFinite(t) || t < cutoffMs || t > nowMs) continue;
    recentCount += 1;
    const surface =
      surfaceOf && run.id != null ? surfaceOf(String(run.id)) : undefined;
    const w = runEffectiveWear(run, {surface});
    recentKm += Number.isFinite(w) && w > 0 ? w : 0;
  }

  const confidence: 'high' | 'low' =
    recentCount >= HIGH_CONFIDENCE_MIN_RUNS ? 'high' : 'low';

  // 1) 잔여 ≤ 0 → 지금 교체(overdue). kmRemaining 은 음수 그대로 노출(초과 마모량).
  if (kmRemaining <= 0) {
    return {
      kmRemaining,
      weeksRemaining: 0,
      etaISO: now.toISOString(),
      confidence,
      reason: 'overdue',
    };
  }

  // 2) 최근 28일 실효 주행 0 → 추정 불가(no_recent).
  if (!(recentKm > 0)) {
    return {kmRemaining, weeksRemaining: null, etaISO: null, confidence, reason: 'no_recent'};
  }

  // 3) ok — 최근 소모율 + 시간 열화율로 잔여 주 추정.
  const recentRatePerWeek = recentKm / RECENT_WINDOW_WEEKS;
  const agePerWeek = target / AGE_WEAR_MONTHS / WEEKS_PER_MONTH;
  const ratePerWeek = recentRatePerWeek + agePerWeek;
  const weeksRemaining = kmRemaining / ratePerWeek;

  // weeksRemaining 은 0 보다 크고 유한해야 한다 — 아니면 no_recent 로 안전 폴백.
  if (!Number.isFinite(weeksRemaining) || weeksRemaining <= 0) {
    return {kmRemaining, weeksRemaining: null, etaISO: null, confidence, reason: 'no_recent'};
  }

  const etaMs = nowMs + weeksRemaining * 7 * MS_PER_DAY;
  if (!Number.isFinite(etaMs)) {
    return {kmRemaining, weeksRemaining: null, etaISO: null, confidence, reason: 'no_recent'};
  }

  return {
    kmRemaining,
    weeksRemaining,
    etaISO: new Date(etaMs).toISOString(),
    confidence,
    reason: 'ok',
  };
}
