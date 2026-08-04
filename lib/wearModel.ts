// ─── 마모 모델(Slice 6 차별점) ─────────────────────────────────────
// 신발이 얼마나 닳았는지 추정하는 순수 함수 모음. 네이티브 0·백엔드 0.
//
// ⚠️ 2026-08-04 단일화 — **한 신발은 한 숫자가 설명한다.**
// 예전엔 같은 신발을 두 계산이 다르게 봤다: 수명 링·%·교체 알림은 lib/shoe.shoeHealth
// (실제 달린 거리), 신발 상세의 교체 예측은 여기(노면·페이스·체중·시간 보정). 둘은
// 세 군데서 어긋났다 — 노면/페이스는 한쪽만 쓰고, 몸무게는 한쪽은 분모(수명↓) 한쪽은
// 분자(마모↑)로, 그것도 **기준 체중이 65kg 과 70kg 으로 달랐다**(같은 사람이 한쪽에선
// 무거운 편, 다른 쪽에선 가벼운 편이 됐다).
//
// 정리 방향:
//   · 누적 마모 = **실제 달린 거리**(start_km + Σ 거리). 사용자가 보는 숫자를 건드리지
//     않는다 — "412km 달렸는데 왜 390이지?"가 되면 그건 Truth only 위반이다.
//   · 모든 보정은 **수명(분모)** 쪽으로 몬다. 몸무게가 이미 그렇게 하고 있었고 그 방식이
//     옳았다. 규칙도 하나만 쓴다(lib/shoe.weightDurabilityFactor, 기준 65kg).
//   · **노면·페이스 계수는 폐기했다.** 복잡해서가 아니라 근거가 없어서다: 출처 없이 우리가
//     정한 숫자였고(CLAUDE.md 의 "확인한 것만 넣는다 · 유추 금지"에 정면으로 어긋난다),
//     트레일이 더 빨리 닳는지조차 한 방향이 아니다(아웃솔은 더, 미드솔은 덜). 게다가
//     입력이 반쪽이었다 — 트레일을 태깅할 경로가 애초에 없었다.
//     되살리려면 셋이 필요하다: 신발 카테고리로 자동 판정 · 출처 있는 계수 · 화면 노출.
//   · 시간 열화(ageWearKm)는 '지금 얼마나 닳았나'에서 빼고 **예측의 속도**에만 남겼다
//     (forecastReplacement 의 agePerWeek) — 그건 링과 다투지 않는 별개 개념이다.
//
// 원본 불변(A6-1): shoe.total_km · run.distance_km 는 읽기만 한다. 어떤 입력도
// 변경/마이그레이션하지 않으며 실효마모는 전부 파생값이다.
// 엣지 graceful(A6-2): 결측·0·음수·비유한 입력에서도 NaN/Infinity/음수를 절대
// 반환하지 않는다(모든 경로가 0 또는 양수 유한값으로 정규화).

import {parseShoeName, weightDurabilityFactor, type ShoeLike, type RunLike} from './shoe';
import {
  categoryLifespanKm,
  DEFAULT_LIFESPAN_KM,
  findShoeModel,
} from '../data/shoeModels';

// ─── 타입 ─────────────────────────────────────────────────────────
// 마모 계산이 읽는 런 행. 기존 RunLike(shoe_id/km) 를 확장하되, 실효 마모는
// distance_km(거리)·duration_s(소요시간)에서 도출한다(원본 km 은 건드리지 않음).
export type WearRun = RunLike & {
  id?: string | number;
  distance_km?: number;
  duration_s?: number;
};

// 마모 계산이 읽는 신발 행. 기존 ShoeLike 를 확장. target_km(수명)·구매시점은
// 선택적이며 결측 시 모델명 파싱/기본값으로 graceful 폴백한다.
export type WearShoe = ShoeLike & {
  name?: string;
  target_km?: number;
  created_at?: string; // ISO 또는 YYYY-MM-DD
  purchase_date?: string; // YYYY-MM-DD
};

// ─── 계수 ─────────────────────────────────────────────────────────
// 시간 기반 폼 열화: 미착용도 약 24개월에 수명 소진(target_km/24 per month).
// 미드솔 노화는 실재하는 현상이라 남긴다 — 다만 '지금 마모'가 아니라 예측 속도에만 쓴다.
export const AGE_WEAR_MONTHS = 24;

// 평균 한 달 길이(일) — 개월수 환산용.
const DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── 순수 계산 ─────────────────────────────────────────────────────

/**
 * 단일 런이 신발에 더하는 마모(km) = **실제 달린 거리**.
 * 예전엔 노면·페이스 계수를 곱했다(위 헤더 참조 — 근거 없는 숫자였다). 거리 결측·0·
 * 음수·비유한 → 0.
 */
export function runEffectiveWear(run: WearRun): number {
  const distance = Number(run?.distance_km);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return distance;
}

/**
 * 신발의 목표 수명(km).
 *   1) target_km 가 유한·>0 이면 그것.
 *   2) 아니면 모델명 파싱 → 시드 카테고리 → categoryLifespanKm[category].
 *   3) 최종 폴백 DEFAULT_LIFESPAN_KM(700).
 * weightKg 를 주면 **몸무게 반영 유효 수명**을 돌려준다 — 수명 링(lib/appViewModel 의
 * effectiveMaxKm)과 **같은 규칙·같은 기준(65kg)** 을 쓴다. 예전엔 여기만 70kg 기준의
 * 별도 계수를 분자에 곱해, 같은 사람이 두 화면에서 반대로 판정됐다.
 * 항상 양수 유한값.
 */
export function targetKmFor(shoe: WearShoe, weightKg?: number): number {
  const base = (() => {
    const explicit = Number(shoe?.target_km);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const {brand, model} = parseShoeName(shoe?.name ?? '');
    const matched = findShoeModel(brand, model);
    if (matched) {
      const byCategory = categoryLifespanKm[matched.category];
      if (Number.isFinite(byCategory) && byCategory > 0) return byCategory;
    }
    return DEFAULT_LIFESPAN_KM;
  })();
  const adjusted = Math.round(base * weightDurabilityFactor(weightKg));
  return Number.isFinite(adjusted) && adjusted > 0 ? adjusted : base;
}

/**
 * 보유 개월수 — created_at(우선) 또는 purchase_date 에서 산출. 결측/파싱불가/미래
 * (now 이전이 아님)/음수 → 0. 평균 월 길이(30.4375일)로 환산.
 */
function monthsOwned(shoe: WearShoe, now: Date): number {
  const raw = shoe?.created_at ?? shoe?.purchase_date;
  if (!raw) return 0;
  const startMs = new Date(raw).getTime();
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0;
  const elapsedMs = nowMs - startMs;
  if (!(elapsedMs > 0)) return 0; // 미래·동시각 → 0
  const months = elapsedMs / MS_PER_DAY / DAYS_PER_MONTH;
  return Number.isFinite(months) && months > 0 ? months : 0;
}

/**
 * 시간 기반(폼 열화) 마모(km) = monthsOwned × (targetKmFor / 24).
 * 저주행이라도 보유 기간만으로 수명이 누적됨을 반영(휴리스틱). 항상 0 이상 유한값.
 */
export function ageWearKm(shoe: WearShoe, now: Date = new Date()): number {
  const months = monthsOwned(shoe, now);
  if (months <= 0) return 0;
  const target = targetKmFor(shoe);
  const wear = months * (target / AGE_WEAR_MONTHS);
  return Number.isFinite(wear) && wear > 0 ? wear : 0;
}

/**
 * 신발의 누적 마모(km) = start_km + Σ 실제 달린 거리.
 *
 * **수명 링(lib/shoe.shoeHealth)과 같은 값이다** — 그게 이 단일화의 핵심이다.
 * 보정은 전부 수명(targetKmFor) 쪽에 있고, 시간 열화는 예측 속도에만 있다.
 * 모든 결측·비정상 입력에서 0 이상 유한값을 보장한다. 원본은 읽기만 한다(A6-1).
 */
export function effectiveWearKm(shoe: WearShoe, runs: WearRun[]): number {
  const list = Array.isArray(runs) ? runs : [];
  const runWear = list.reduce<number>((sum, run) => {
    if (!run) return sum;
    const w = runEffectiveWear(run);
    return sum + (Number.isFinite(w) && w > 0 ? w : 0);
  }, 0);
  // 등록 시 이미 쌓여 있던 주행거리 — 수명 링도 이걸 더한다(start_km).
  const startKm = Math.max(0, Number((shoe as {start_km?: number})?.start_km ?? 0) || 0);
  const total = runWear + startKm;
  return Number.isFinite(total) && total > 0 ? total : 0;
}
