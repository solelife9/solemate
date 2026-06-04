// ─── '다음 러닝화' 추천 노출 트리거(Slice 7 갭보완) ──────────────────────────────
// 수익화 v1 NextShoeCard 를 '언제' 띄울지 결정하는 순수 헬퍼. 기존엔 condition==='교체'
// (수명 90%) 기반이었으나, 스펙은 Slice 6 교체 예측(forecast)을 트리거로 본다 — 즉
// 이미 수명 초과(overdue)이거나 교체가 임박(few weeks)한 시점에만 contextual 추천을
// 노출한다(구매 의도 최고 순간, 배너광고 아님). 예측은 lib/replacementForecast 에 단일
// 구현이 있으므로 여기서 다시 계산하지 않고 결과 타입만 읽는다(중복 계산 0·네이티브 0).

import {type ReplacementForecast} from './replacementForecast';

/** 교체 '임박' 기준 주(週). 잔여 주가 이 값 이하면 다음 러닝화를 미리 추천한다. */
export const REPLACE_SOON_WEEKS = 3;

/**
 * 교체 예측을 보고 '다음 러닝화' 추천을 노출할지 결정한다(순수 함수).
 *
 *   reason 'overdue'                                   → true  (이미 수명 초과)
 *   reason 'ok' && weeksRemaining ≤ REPLACE_SOON_WEEKS → true  (교체 임박)
 *   reason 'ok' 이지만 여유 충분(weeks 큼)              → false (아직 이르다)
 *   reason 'no_recent'(기록 없어 추정 불가)            → false (잡음 0)
 *   forecast 결측/weeksRemaining null                  → false
 */
export function shouldRecommendNextShoe(
  forecast: ReplacementForecast | null | undefined,
): boolean {
  if (!forecast) return false;
  if (forecast.reason === 'overdue') return true;
  if (
    forecast.reason === 'ok' &&
    forecast.weeksRemaining != null &&
    forecast.weeksRemaining <= REPLACE_SOON_WEEKS
  ) {
    return true;
  }
  return false;
}
