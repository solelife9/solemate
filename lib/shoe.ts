// ─── Shoe helpers ────────────────────────────────────────────────
// Pure shoe-name parsing + the single source of truth for shoe wear/condition.

import {BRANDS as CATALOG_BRANDS} from '../data/shoeModels';

// 시드 카탈로그(data/shoeModels)가 브랜드 단일 소스다. 카탈로그엔 없지만 사용자가
// 보유할 수 있는 브랜드만 parseShoeName 보조용으로 여기에 보탠다(파싱 전용).
const EXTRA_PARSE_BRANDS = [
  'La Sportiva', 'Inov-8', 'Karhu', 'Scott', 'Merrell', 'Norda',
  'Veja', 'Lululemon', 'Reebok',
];

// 다중 단어 브랜드를 먼저 검사해야 접두 매칭이 안정적이다(예: "New Balance").
export const BRANDS: string[] = [...new Set([...CATALOG_BRANDS, ...EXTRA_PARSE_BRANDS])]
  .sort((a, b) => b.split(' ').length - a.split(' ').length);

/**
 * Split a free-form shoe name into `{brand, model}`. Known multi-word brands
 * (from BRANDS) match case-insensitively by prefix; otherwise the first token
 * is treated as the brand. Brand is upper-cased to match the original behavior.
 */
export function parseShoeName(name: string): {brand: string; model: string} {
  if (!name) return {brand: '', model: ''};
  for (const b of BRANDS) {
    if (name.toUpperCase().startsWith(b.toUpperCase())) {
      return {brand: b.toUpperCase(), model: name.slice(b.length).trim()};
    }
  }
  const idx = name.indexOf(' ');
  if (idx < 0) return {brand: name.toUpperCase(), model: ''};
  return {brand: name.slice(0, idx).toUpperCase(), model: name.slice(idx + 1).trim()};
}

// ─── Shoe health (single source of truth) ─────────────────────────
// Replaces the old hard-coded "잔여 100km → 점검" rule and the `used` math that
// was duplicated across App.tsx / Home / Shoes (audit#7). Usage is derived once
// from the run log + the shoe's *category lifespan* (max_km, set at registration
// from the recommended life), then mapped to a proportional condition tier.

export type ShoeCondition = '양호' | '주의' | '교체';

export type ShoeHealth = {
  usedKm: number; // start_km + Σ km of runs logged against this shoe
  remainingKm: number; // max(0, max_km - usedKm)
  percentUsed: number; // usedKm / max_km * 100 (may exceed 100 once worn past life)
  condition: ShoeCondition;
};

// Proportional tier thresholds — percent of category lifespan consumed.
export const SHOE_CAUTION_PCT = 75; // ≥75% → 주의
export const SHOE_REPLACE_PCT = 90; // ≥90% → 교체

// Fallback category lifespan when a shoe carries no max_km (mirrors App default).
export const DEFAULT_MAX_KM = 600;

export type ShoeLike = {
  id?: string | number;
  max_km?: number; // backend field (category lifespan)
  max?: number; // presentational alias used by the UI Shoe shape
  start_km?: number; // mileage already on the shoe at registration
  retired?: boolean;
  // 서버 truth(audit#9/#10): 서버가 영속한 누적 주행거리(km). 존재하면 클라이언트
  // 런-합산 파생 대신 이 값을 usedKm 의 단일 소스로 쓴다(다른 기기의 미동기 런으로
  // 인한 과소표시 완화). 없으면 start_km + Σ runs 로 폴백한다.
  total_km?: number;
};

export type RunLike = {shoe_id?: string | number; km?: number | string};

/** Map a consumed-percentage to a condition tier. Shared by every consumer so
 *  the threshold lives in exactly one place. */
export function conditionForPercent(percentUsed: number): ShoeCondition {
  if (percentUsed >= SHOE_REPLACE_PCT) return '교체';
  if (percentUsed >= SHOE_CAUTION_PCT) return '주의';
  return '양호';
}

/**
 * Derive a shoe's wear. Prefers the SERVER-PERSISTED `total_km` (audit#9/#10) as
 * the single source of truth for usedKm when present; otherwise falls back to the
 * client derivation: registration mileage (start_km) + every run logged against
 * this shoe's id (runs for other shoes are ignored, so it is safe to pass the
 * full run list). Pure: no rounding/clamping beyond a non-negative remaining (a
 * shoe past its life still reports its true usedKm/percentUsed).
 */
export function shoeHealth(shoe: ShoeLike, runs: RunLike[] = []): ShoeHealth {
  const max = Number(shoe?.max_km ?? shoe?.max ?? DEFAULT_MAX_KM) || DEFAULT_MAX_KM;
  // 서버 truth 우선: total_km 이 유한·음수아님이면 그것을 usedKm 으로 채택한다.
  const serverTotal = Number(shoe?.total_km);
  let usedKm: number;
  if (Number.isFinite(serverTotal) && serverTotal >= 0) {
    usedKm = serverTotal;
  } else {
    const startKm = Number(shoe?.start_km ?? 0) || 0;
    const ranKm = (runs || []).reduce((sum, r) => {
      if (!r || r.shoe_id !== shoe?.id) return sum;
      const km = typeof r.km === 'number' ? r.km : parseFloat(String(r.km));
      return sum + (Number.isFinite(km) ? km : 0);
    }, 0);
    usedKm = startKm + ranKm;
  }
  const remainingKm = Math.max(0, max - usedKm);
  const percentUsed = max > 0 ? (usedKm / max) * 100 : 0;
  return {usedKm, remainingKm, percentUsed, condition: conditionForPercent(percentUsed)};
}

/** Retired (archived) shoes are hidden from run pickers but keep all records. */
export function isRetired(shoe: ShoeLike | null | undefined): boolean {
  return !!(shoe && shoe.retired);
}

// ─── Per-shoe lifespan (max_km) tuning ────────────────────────────
// 신발별 수명(max_km)을 사용자가 직접 조정한다 = 신발별 교체 임계의 분모. 한 신발의
// max_km을 올리면 같은 주행거리라도 percentUsed가 내려가 tier가 완화되고, 내리면
// 더 빨리 주의/교체로 넘어간다. 비현실적 값으로 화면이 깨지지 않게 범위를 클램프한다.
export const MIN_SHOE_MAX_KM = 100;
export const MAX_SHOE_MAX_KM = 2000;
export const SHOE_MAX_STEP_KM = 50;

/** 신발 수명(max_km)을 허용 범위(km)로 클램프 + 정수 반올림. 비정상값은 기본 수명. */
export function clampMaxKm(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_MAX_KM;
  return Math.max(MIN_SHOE_MAX_KM, Math.min(MAX_SHOE_MAX_KM, Math.round(km)));
}

// ─── Tier badge (앱내 배지: 홈/목록/상세 공용) ──────────────────────
// shoeHealth의 condition을 화면 배지로 매핑한다. '양호'는 배지를 노출하지 않으므로
// null(평상시 잡음 제거). 주의/교체만 색/문구를 띄워 교체 동선을 끌어올린다.
export type BadgeTone = 'warn' | 'danger';
export type TierBadge = {label: ShoeCondition; tone: BadgeTone};

// keep-going 카피: 교체를 '손실'이 아니라 '부상 없이 계속'의 조건으로 프레이밍한다.
export const KEEP_GOING_REPLACE = '지금 교체하면 부상 없이 계속';

/** condition → 배지({label,tone}) | null. '양호'면 null(배지 없음). */
export function tierBadge(condition: ShoeCondition): TierBadge | null {
  if (condition === '교체') return {label: '교체', tone: 'danger'};
  if (condition === '주의') return {label: '주의', tone: 'warn'};
  return null;
}

// ─── 신발 교체 알림 추적(중복 알림 방지) ───────────────────────────
// 기존 '하루 1회' 전역 게이트의 문제: ① 같은 신발이 매일 다시 알린다(중복) ② 한 신발이
// 오늘 이미 알렸으면, 같은 날 임계에 새로 도달한 *다른* 신발은 묻혀버린다.
// 올바른 추적 = 신발별. 이미 알린 신발 id 집합을 들고, 임계 이상이면서 아직 안 알린
// 신발만 새로 알린다. 임계 아래로 내려간 신발(수명 상향/교체)은 집합에서 빠져, 추후
// 진짜 재도달 시 다시 알릴 수 있다.
export type ShoeId = string | number;

/**
 * 임계 이상 신발 id 목록(criticalIds)과 이미 알린 id 목록(alreadyNotified)을 받아,
 * 새로 알릴 신발(toNotify)과 갱신된 알림-완료 집합(notified)을 반환한다. 순수함수 —
 * 영속은 호출부(App)가 한다.
 *   · toNotify  = 임계 이상이지만 아직 안 알린 신발(중복 없음)
 *   · notified  = 현재 임계 이상인 모든 신발(아래로 내려간 신발은 자동 제외)
 */
export function reconcileShoeAlerts(
  criticalIds: ShoeId[],
  alreadyNotified: ShoeId[],
): {toNotify: ShoeId[]; notified: ShoeId[]} {
  const notifiedSet = new Set((alreadyNotified || []).map(String));
  const seen = new Set<string>();
  const toNotify: ShoeId[] = [];
  const notified: ShoeId[] = [];
  for (const id of criticalIds || []) {
    const key = String(id);
    if (seen.has(key)) continue; // 중복 id 방어
    seen.add(key);
    notified.push(id);
    if (!notifiedSet.has(key)) toNotify.push(id);
  }
  return {toNotify, notified};
}
