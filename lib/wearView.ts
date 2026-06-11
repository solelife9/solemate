// ─── 마모/예측 표시 어댑터(Slice 6 UI) ────────────────────────────────────────
// 화면(ShoesScreen 상세·HomeScreen 히어로)이 쓰는 표시용 `Shoe`/`Run`(theme) 모양을
// 순수 마모 모델(lib/wearModel)·교체 예측(lib/replacementForecast) 입력으로 변환하고,
// keep-going 보이스 카피(A6-3: '약'·'예상' 추정 톤)를 한 곳에서 만든다.
//
// 계산은 wearModel/replacementForecast 에 단일 구현이 있으므로 여기서 중복하지 않는다
// (effectiveWearKm·targetKmFor·forecastReplacement 재사용). 네이티브 0·백엔드 0:
// 표시값은 전부 입력에서 결정되는 순수 파생값이며 원본은 읽기만 한다(A6-1).

import {
  effectiveWearKm,
  targetKmFor,
  type Surface,
  type WearShoe,
} from './wearModel';
import {
  forecastReplacement,
  type ForecastRun,
  type ReplacementForecast,
} from './replacementForecast';

export type {Surface, ReplacementForecast};

// 화면 표시용 신발(theme.Shoe 부분집합). max(=사용자 설정 수명 km)가 권장 수명의
// 단일 소스이므로 target_km 으로 넘긴다(결측이면 모델명 파싱으로 graceful 폴백).
export type WearViewShoe = {
  brand?: string;
  model?: string;
  max?: number;
  created_at?: string;
  purchase_date?: string;
};

// 화면 표시용 런(theme.Run 부분집합). 거리=dist(km), 시간=durationS(초), 날짜=runDate.
export type WearViewRun = {
  id?: string | number;
  dist?: number;
  durationS?: number;
  runDate?: string;
};

export type WearView = {
  effectiveWearKm: number; // 실효 마모(km) — 항상 0 이상 유한
  targetKm: number; // 권장 수명(km) — 항상 양수 유한
  forecast: ReplacementForecast;
};

type WearOpts = {
  weightKg?: number;
  now?: Date;
  surfaceOf?: (runId: string) => Surface;
};

/** 표시용 Shoe → wearModel WearShoe. brand+model 을 name 으로, max 를 target_km 으로. */
function toWearShoe(shoe: WearViewShoe): WearShoe {
  return {
    name: `${shoe?.brand ?? ''} ${shoe?.model ?? ''}`.trim(),
    target_km: shoe?.max,
    created_at: shoe?.created_at,
    purchase_date: shoe?.purchase_date,
  };
}

/** 표시용 Run[] → forecast/​wear 입력(ForecastRun[]). 거리/시간/날짜만 매핑한다. */
function toForecastRuns(runs: WearViewRun[]): ForecastRun[] {
  return (Array.isArray(runs) ? runs : []).map((r) => ({
    id: r?.id,
    distance_km: r?.dist,
    duration_s: r?.durationS,
    date: r?.runDate,
  }));
}

/**
 * 한 신발의 표시용 마모/예측 뷰모델을 만든다(파생값만). effectiveWearKm/targetKmFor/
 * forecastReplacement 를 같은 입력으로 호출해 화면이 단순히 그리기만 하면 되게 한다.
 * 모든 엣지(결측·0·미태그)에서 NaN/음수/Infinity 없이 graceful 한 값을 보장한다(A6-2).
 */
export function buildWearView(
  shoe: WearViewShoe,
  runs: WearViewRun[],
  opts?: WearOpts,
): WearView {
  const wearShoe = toWearShoe(shoe);
  const wearRuns = toForecastRuns(runs);
  return {
    effectiveWearKm: effectiveWearKm(wearShoe, wearRuns, opts),
    targetKm: targetKmFor(wearShoe),
    forecast: forecastReplacement(wearShoe, wearRuns, opts),
  };
}

/** 예상 교체일 ISO → 'M월 D일'. 결측/파싱불가면 빈 문자열(화면에서 생략). */
export function formatEtaKo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 교체 예측 → keep-going 보이스 한 줄(A6-3: '약'·'예상' 추정 톤으로 단정 회피).
 *   ok        → '이 페이스면 약 N주 후 교체 권장 · 예상 M월 D일'
 *   overdue   → '지금 교체하면 부상 없이 계속 달릴 수 있어요'
 *   no_recent → '최근 기록이 없어 예측할 수 없어요'
 * ok 인데 주/ETA 가 비면(이론상 도달 불가) 빈 문자열로 안전 폴백한다.
 */
export function forecastLineKo(forecast: ReplacementForecast): string {
  switch (forecast?.reason) {
    case 'overdue':
      return '지금 교체하면 부상 없이 계속 달릴 수 있어요';
    case 'no_recent':
      return '최근 기록이 없어 예측할 수 없어요';
    case 'ok':
    default:
      if (forecast?.weeksRemaining == null || !forecast?.etaISO) return '';
      return `이 페이스면 약 ${Math.max(1, Math.round(forecast.weeksRemaining))}주 후 교체 권장 · 예상 ${formatEtaKo(forecast.etaISO)}`;
  }
}

// ─── 예측 투명성(탑티어 1-1) ───────────────────────────────────────────────────
// 사용자가 '왜 N주인지' 신뢰하도록 추정 근거와 정확도(confidence)를 한 줄로 설명한다.
// 예측 엔진(replacementForecast)은 (최근 28일 주행 페이스 + 시간 경과 열화)로 잔여 주를
// 구하고, 최근창 런 ≥3 이면 confidence='high'. 그 사실을 사람이 읽는 문장으로 노출.

/** 예측 정확도 한국어 라벨 — confidence(high/low) → '정확도 높음'/'정확도 낮음'. */
export function forecastConfidenceKo(forecast: ReplacementForecast): string {
  return forecast?.confidence === 'high' ? '정확도 높음' : '정확도 낮음';
}

/**
 * 예측 근거 한 줄(ok 분기 전용). 무엇을 반영했고 정확도가 왜 그런지 설명한다.
 *   high → '최근 4주 주행 페이스와 시간 경과를 반영한 추정이에요'
 *   low  → '최근 기록이 적어 정확도는 낮아요 — 더 달리면 정확해져요'
 * ok 가 아니면(overdue/no_recent) 빈 문자열(근거 행 생략).
 */
export function forecastBasisKo(forecast: ReplacementForecast): string {
  if (forecast?.reason !== 'ok' || forecast?.weeksRemaining == null) return '';
  return forecast.confidence === 'high'
    ? '최근 4주 주행 페이스와 시간 경과를 반영한 추정이에요'
    : '최근 기록이 적어 정확도는 낮아요 — 더 달리면 정확해져요';
}
