// ─── 고도 상승(elevation gain) 누적 (순수 상태기계) ──────────────────────────────
// 폰 GPS 고도는 노이즈가 크다(±5~10m 흔함). 매 fix의 고도 차를 그대로 더하면 평지에서도
// 상승분이 부풀려진다. 그래서 '기준 고도(ref)'를 들고, 현재 고도가 기준보다 임계
// (ELEV_THRESHOLD_M) 이상 *올라갔을 때만* 그 차이를 누적하고 기준을 끌어올린다. 임계
// 이상 내려가면 기준만 낮추고(누적 안 함), 임계 이내 흔들림은 무시한다. 이렇게 하면
// 지터는 거르고 실제 오르막만 대략 잡는다(정밀 측정이 아니라 가이드 지표).
//
// ── 임계만으로는 부족했다 (2026-08-04) ───────────────────────────────────────
// 실기기 데이터에서 **3.25km / 20분 러닝에 고도 3,262m** 가 찍혔다(분당 163m — 엘리트
// 등산 러너도 20~30m/분이다). 같은 사용자의 다른 런은 0.39km 에 122m(분당 136m)였다.
//
// 원인은 임계 히스테리시스의 구조적 약점이다: 표본이 1초마다 들어오는데, 노이즈가 임계
// 근처에서 진동하면 **올라갈 때마다 누적되고 내려갈 때는 기준만 낮아진다.** 즉 제자리
// 흔들림이 계속 gain 으로 적립된다. 20분이면 1,200 표본이라 3m 진동만 반복돼도 수천 m 가 된다.
//
// 그래서 **상승률 상한**을 더한다: 직전 표본 이후 경과 시간으로 낼 수 없는 상승은
// 사람이 아니라 센서다. 초당 ±4m 진동은 분당 480m 라 그대로 걸린다.
//
// 평활화(EMA)도 검토했는데 뺐다 — 노이즈를 누르는 만큼 **진짜 오르막도 눌러서**,
// 10분에 100m 오르는 실제 등반이 과소 집계됐다. 상한 하나로 관측된 사고가 잡히고
// 정상 오르막은 손대지 않는다면 그쪽이 낫다(간단한 규칙이 오래 간다).

export interface ElevState {
  /** 마지막으로 확정한 기준 고도(m). null이면 아직 첫 고도 미수신. */
  ref: number | null;
  /** 누적 상승분(m, >= 0). */
  gain: number;
  /**
   * **기준 고도(ref)를 확정한 시각**(ms). 마지막 표본 시각이 아니다 —
   * 상승률은 '기준점에서 여기까지 얼마 만에 올라왔나'로 재야 한다. 매 표본마다
   * 갱신하면 완만한 오르막도 "직전 1초에 3m"로 읽혀 전부 거부된다(실측으로 확인).
   */
  atMs?: number;
}

/** 고도 노이즈 임계(m). 이보다 작은 변화는 무시한다. */
export const ELEV_THRESHOLD_M = 3;

/**
 * 사람이 낼 수 있는 최대 상승률(m/분). 러닝 중 지속 상승은 20~25 가 상한이고,
 * 계단 전력질주도 그 언저리다. 여유를 둬 30 으로 잡는다 — 이보다 빠른 '상승'은
 * 사람이 아니라 센서다(엘리베이터·기압 급변·터널 진입·노이즈 진동).
 */
export const MAX_CLIMB_M_PER_MIN = 30;

export function initElevState(): ElevState {
  return {ref: null, gain: 0};
}

/**
 * 고도 표본 배열 → 누적 상승(m). 워치가 보낸 원자료(routeAlt)를 폰이 계산할 때 쓴다.
 *
 * 워치는 상승고도를 스스로 계산하지 않는다(2026-07-28) — 종전엔 0.5m 이상 증분을 전부
 * 더해 평지 5km 러닝에서도 274m 가 나왔다(폰 33m, 8배). 같은 러닝을 두 벌의 규칙으로
 * 계산하면 답이 갈리므로, 규칙을 이 파일 하나로 모은다.
 *
 * 측정 불가 표본(NaN/null)은 건너뛴다 — 0 으로 치면 해수면으로 읽혀 가짜 오르내림이 생긴다.
 *
 * ── 상승률 상한 (2026-08-07) ────────────────────────────────────────────────
 * 예전엔 이 경로에 **상한이 아예 없었다.** 워치가 표본 시각을 안 보내기 때문인데,
 * 그 결과 임계 히스테리시스(3m)만 남아 잡음이 그대로 '오늘의 등반'이 됐다.
 * 400표본 시뮬레이션에서 평지가 최대 **1,843m** 로 나온다 — 2026-08-05 아이폰에서
 * 실제로 터진 1,814m 와 같은 크기다. 그쪽(GPS 경로)은 고쳤는데 워치 경로는 그대로였다.
 *
 * 표본 시각은 없지만 **러닝 총 시간은 안다.** 워치는 경로를 러닝 전체에 걸쳐 균등
 * 다운샘플하므로(watchSession 이 400개로 자른다), 평균 간격 = durationS/(n-1) 로
 * 시각을 재구성해 상한을 건다.
 *
 * ⚠️ 이건 **근사다.** 표본이 실제로 균등하지 않으면 간격이 틀린다. 그래도 상한이
 * 없는 것보다 훨씬 낫다 — 틀리는 방향이 '조금 느슨하거나 조금 빡빡한 상한'이고,
 * 없을 때는 '잡음 전량 누적'이다. durationS 를 모르면(구버전 페이로드) 예전처럼
 * 히스테리시스만 적용한다.
 *
 * @param durationS 러닝 총 이동 시간(초). 주면 상승률 상한이 함께 걸린다.
 */
export function elevationGainFrom(
  samples: readonly (number | null | undefined)[],
  durationS?: number,
): number {
  const list = samples || [];
  // 균등 간격 가정으로 표본 시각을 재구성한다. 표본이 2개 미만이거나 시간이 없으면 0.
  const stepMs =
    typeof durationS === 'number' && durationS > 0 && list.length > 1
      ? (durationS * 1000) / (list.length - 1)
      : 0;
  let st = initElevState();
  let i = -1;
  for (const a of list) {
    i += 1;
    if (a == null || !Number.isFinite(a)) continue;
    st = feedAltitude(st, a, stepMs > 0 ? i * stepMs : undefined);
  }
  return Math.round(st.gain);
}

/**
 * 새 고도 표본을 먹여 상승분 누적 상태를 갱신한다(불변 반환).
 *  - 고도 없음(null/NaN) → 상태 유지.
 *  - 첫 표본 → 기준만 설정(누적 0).
 *  - +임계 이상 → 그 차이만큼 gain 누적 + 기준 상향.
 *  - −임계 이상 → 기준만 하향(내리막은 누적 안 함).
 *  - 임계 이내 → 무시(노이즈).
 *
 * @param atMs 표본 시각(ms). 주면 **상승률 상한**이 적용된다 — 직전 표본 이후 경과
 *             시간으로 낼 수 없는 상승은 센서 이상으로 보고 기준만 옮긴다(누적 안 함).
 */
export function feedAltitude(
  state: ElevState,
  altitude: number | null | undefined,
  atMs?: number,
): ElevState {
  if (altitude == null || !Number.isFinite(altitude)) return state;
  if (state.ref == null) return {ref: altitude, gain: state.gain, atMs};

  const delta = altitude - state.ref;

  // 상승률 상한 — 시각을 아는 경우만. 사람이 낼 수 없는 상승은 기준만 옮기고 버린다
  // (누적하면 센서 이상이 그대로 '오늘의 등반'이 된다).
  if (delta >= ELEV_THRESHOLD_M && atMs != null && state.atMs != null) {
    const minutes = (atMs - state.atMs) / 60000;
    if (minutes > 0 && delta / minutes > MAX_CLIMB_M_PER_MIN) {
      return {ref: altitude, gain: state.gain, atMs};
    }
  }

  if (delta >= ELEV_THRESHOLD_M) return {ref: altitude, gain: state.gain + delta, atMs};
  if (delta <= -ELEV_THRESHOLD_M) return {ref: altitude, gain: state.gain, atMs};
  return state; // 임계 이내 — 기준도 시각도 그대로 둔다(상승률은 기준점 기준이다)
}
