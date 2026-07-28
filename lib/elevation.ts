// ─── 고도 상승(elevation gain) 누적 (순수 상태기계) ──────────────────────────────
// 폰 GPS 고도는 노이즈가 크다(±5~10m 흔함). 매 fix의 고도 차를 그대로 더하면 평지에서도
// 상승분이 부풀려진다. 그래서 '기준 고도(ref)'를 들고, 현재 고도가 기준보다 임계
// (ELEV_THRESHOLD_M) 이상 *올라갔을 때만* 그 차이를 누적하고 기준을 끌어올린다. 임계
// 이상 내려가면 기준만 낮추고(누적 안 함), 임계 이내 흔들림은 무시한다. 이렇게 하면
// 지터는 거르고 실제 오르막만 대략 잡는다(정밀 측정이 아니라 가이드 지표).

export interface ElevState {
  /** 마지막으로 확정한 기준 고도(m). null이면 아직 첫 고도 미수신. */
  ref: number | null;
  /** 누적 상승분(m, >= 0). */
  gain: number;
}

/** 고도 노이즈 임계(m). 이보다 작은 변화는 무시한다. */
export const ELEV_THRESHOLD_M = 3;

export function initElevState(): ElevState {
  return {ref: null, gain: 0};
}

/**
 * 새 고도 표본을 먹여 상승분 누적 상태를 갱신한다(불변 반환).
 *  - 고도 없음(null/NaN) → 상태 유지.
 *  - 첫 표본 → 기준만 설정(누적 0).
 *  - +임계 이상 → 그 차이만큼 gain 누적 + 기준 상향.
 *  - −임계 이상 → 기준만 하향(내리막은 누적 안 함).
 *  - 임계 이내 → 무시(노이즈).
 */
/**
 * 고도 표본 배열 → 누적 상승(m). 워치가 보낸 원자료(routeAlt)를 폰이 계산할 때 쓴다.
 *
 * 워치는 상승고도를 스스로 계산하지 않는다(2026-07-28) — 종전엔 0.5m 이상 증분을 전부
 * 더해 평지 5km 러닝에서도 274m 가 나왔다(폰 33m, 8배). 같은 러닝을 두 벌의 규칙으로
 * 계산하면 답이 갈리므로, 규칙을 이 파일 하나로 모은다.
 *
 * 측정 불가 표본(NaN/null)은 건너뛴다 — 0 으로 치면 해수면으로 읽혀 가짜 오르내림이 생긴다.
 */
export function elevationGainFrom(samples: readonly (number | null | undefined)[]): number {
  let st = initElevState();
  for (const a of samples || []) {
    if (a == null || !Number.isFinite(a)) continue;
    st = feedAltitude(st, a);
  }
  return Math.round(st.gain);
}

export function feedAltitude(state: ElevState, altitude: number | null | undefined): ElevState {
  if (altitude == null || !Number.isFinite(altitude)) return state;
  if (state.ref == null) return {ref: altitude, gain: state.gain};
  const delta = altitude - state.ref;
  if (delta >= ELEV_THRESHOLD_M) return {ref: altitude, gain: state.gain + delta};
  if (delta <= -ELEV_THRESHOLD_M) return {ref: altitude, gain: state.gain};
  return state;
}
