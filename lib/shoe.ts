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

// ⚠️ 워치 구버전 호환 전용(2026-07-11 4단계 단일화). 사용자 노출 라벨/색은 전부
// wearTier(4단계)로 통일됐다 — 이 3단계 타입/매핑은 App.tsx 의 watch push payload
// (WatchShoePayload.condition — 구버전 워치가 도트 색을 이 문자열로 매핑)에만 남는다.
// 새 코드에서 화면/알림/로직 트리거로 쓰지 말 것(로직은 percentUsed ≥ 임계 숫자 비교).
export type ShoeCondition = '양호' | '주의' | '교체';

export type ShoeHealth = {
  usedKm: number; // start_km + Σ km of runs logged against this shoe
  remainingKm: number; // max(0, max_km - usedKm)
  percentUsed: number; // usedKm / max_km * 100 (may exceed 100 once worn past life)
};

// Proportional tier thresholds — 4단계 wearTier 경계(80/90)에 정렬(P1 #3 단일 임계).
// 양호 <80 · 주의 80~90(교체 고려) · 교체 ≥90(교체 권장). 부상 경고도 90%(안전 유지).
export const SHOE_CAUTION_PCT = 80; // ≥80% → 주의 (= wearTier 교체 고려)
export const SHOE_REPLACE_PCT = 90; // ≥90% → 교체 (= wearTier 교체 권장)

// ─── 마모 상태 4단계(사용자 노출 컨디션의 단일 출처) ─────────────────────────────
// 사용률(%)을 4단계 컨디션으로 매핑한다. 2026-07-11 단일화: 화면 라벨/색은 전부 이
// 4단계만 쓴다(3단계는 워치 구버전 계약 전용). 로직 트리거는 percentUsed ≥
// SHOE_CAUTION_PCT/SHOE_REPLACE_PCT 숫자 비교 또는 wearTier(...).key 로 판정한다.
// 0~50 최상 / 50~80 양호 / 80~90 교체 고려 / 90%+ 교체 권장.
export type WearTierKey = 'best' | 'good' | 'consider' | 'replace';
export type WearTierTone = 'good' | 'mid' | 'warn' | 'danger';
export type WearTier = {
  key: WearTierKey;
  label: string; // 최상의 컨디션 / 좋은 상태 / 교체 고려 / 교체 권장
  emoji: string; // 🟢 🟡 🟠 🔴
  tone: WearTierTone; // 화면이 theme 토큰으로 매핑(raw hex 0)
};

export const WEAR_GOOD_PCT = 50; // <50% → 최상
export const WEAR_FAIR_PCT = 80; // 50~80% → 양호
export const WEAR_CONSIDER_PCT = 90; // 80~90% → 교체 고려, 90%+ → 교체 권장(condition 교체·부상 high 와 정렬)

/** 사용률(%) → 4단계 마모 컨디션(라벨·이모지·톤). 입력 비정상 → 최상(0%). */
export function wearTier(percentUsed: number): WearTier {
  const p = Number.isFinite(percentUsed) && percentUsed > 0 ? percentUsed : 0;
  if (p >= WEAR_CONSIDER_PCT) return {key: 'replace', label: '교체 권장', emoji: '🔴', tone: 'danger'};
  if (p >= WEAR_FAIR_PCT) return {key: 'consider', label: '교체 고려', emoji: '🟠', tone: 'warn'};
  if (p >= WEAR_GOOD_PCT) return {key: 'good', label: '양호', emoji: '🟡', tone: 'mid'};
  return {key: 'best', label: '최상', emoji: '🟢', tone: 'good'};
}

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

/** ⚠️ 워치 구버전 호환 전용 — 위 ShoeCondition 주석 참조. 임계(80/90)는 wearTier 와
 *  동일하므로 워치 도트 의미는 4단계 consider/replace 경계와 계속 일치한다. */
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
  // condition(3단계)은 반환하지 않는다 — 컨디션은 wearTier(percentUsed) 4단계가 단일
  // 출처(2026-07-11). 워치 계약만 conditionForPercent 를 직접 호출한다.
  return {usedKm, remainingKm, percentUsed};
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
export const SHOE_MAX_STEP_KM = 10;

/** 신발 수명(max_km)을 허용 범위(km)로 클램프 + 정수 반올림. 비정상값은 기본 수명. */
export function clampMaxKm(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_MAX_KM;
  return Math.max(MIN_SHOE_MAX_KM, Math.min(MAX_SHOE_MAX_KM, Math.round(km)));
}

// (구 tierBadge/TierBadge 3단계 배지는 2026-07-11 제거 — 모든 화면이 wearTier 4단계
//  칩으로 통일돼 소비처가 사라졌다. 배지가 다시 필요하면 wearTier 기반으로 만들 것.)

// keep-going 카피: 교체를 '손실'이 아니라 '부상 없이 계속'의 조건으로 프레이밍한다.
export const KEEP_GOING_REPLACE = '지금 교체하면 부상 없이 계속';

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
