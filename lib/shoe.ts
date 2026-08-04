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
  // 서버 truth(audit#9/#10): REST 백엔드가 영속하던 누적 주행거리(km).
  // ⚠️ **2026-08-01 확인 — 지금은 아무도 이 값을 쓰지 않는다.** Firestore 이관(2026-07-17)
  // 이후 갱신 주체가 사라졌고, 남은 값은 옛 계정의 잔재다. 그래서 usedKm 은 사실상 100%
  // 파생값이다. 옛 데이터 호환을 위해 읽기만 유지한다.
  total_km?: number;
  /**
   * 이 신발이 **지금까지 도달했던 최대 누적 거리**(km, AUDIT 3 D-4).
   *
   * 왜 필요한가: usedKm 은 런 목록에서 매번 다시 계산하는 파생값이라, 런이 어떤 이유로든
   * 사라지면 **말없이 줄어든다.** 신발 수명 링이 뒤로 감기고 교체 알림이 늦춰지는데,
   * 원래 얼마였는지 아는 주체가 없어 **사용자는 줄었다는 사실조차 모르고 되돌릴 수도 없다.**
   * 런 한 건은 캐시·사이드카·묘비·클라우드로 네 겹으로 지키면서 그 합계는 아무 데도
   * 안 적어 두던 셈이다 — 내구도 관리가 이 앱의 차별점인데.
   *
   * 이 필드는 되돌리기용이 아니라 **신호용**이다. 삭제처럼 정당한 감소는 호출부가 수위를
   * 함께 내리고(App.deleteRun), 그 외의 감소만 '설명되지 않는 감소'로 남아 화면에 뜬다.
   */
  usedKmHighWater?: number;
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
  // 클라이언트 파생값 = 등록거리(start_km) + 이 신발의 런 합산(항상 계산).
  const startKm = Number(shoe?.start_km ?? 0) || 0;
  const ranKm = (runs || []).reduce((sum, r) => {
    if (!r || r.shoe_id !== shoe?.id) return sum;
    const km = typeof r.km === 'number' ? r.km : parseFloat(String(r.km));
    return sum + (Number.isFinite(km) ? km : 0);
  }, 0);
  const clientKm = startKm + ranKm;
  // 서버 truth(total_km)가 있으면 채택하되, 클라이언트 파생값과 max 를 취한다 — total_km 이
  // 오래돼(스테일) 낮으면 새 런이 링을 못 올리고 멈추는 사고를 막는다(클라이언트가 바닥).
  const serverTotal = Number(shoe?.total_km);
  const usedKm =
    Number.isFinite(serverTotal) && serverTotal >= 0 ? Math.max(serverTotal, clientKm) : clientKm;
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

// ─── 몸무게별 내구도 계수(확정 2026-07-20, 보수적) ────────────────────────────
// 근거: 착지 충격(지면반력 ~체중 2.5~3배) → 무거운 러너일수록 스텝마다 미드솔 압축 피로↑
// → 유효 수명↓. 학계에 정확한 계수는 없어 과장 없이 완만하게: 0.3%/kg(10kg당 ~18km), ±10% 캡.
// 기준 = 앱 기본 몸무게(DEFAULT_WEIGHT_KG=65) — 그래야 **몸무게 미설정(기본값) 사용자는 계수 1
// = 변화 0**(데이터 안전: 기존 사용자 신발 % 무단 변동 없음). 몸무게 입력한 사람만 반영(사실상 옵트인).
// 저장 max_km 은 불변, 계수는 유효수명 표시·판정에서만 곱한다(되돌림 가능).
export const WEIGHT_DURABILITY_REF_KG = 65;
export function weightDurabilityFactor(weightKg?: number | null): number {
  const w = Number(weightKg) || 0;
  if (w <= 0) return 1;
  const f = 1 - (w - WEIGHT_DURABILITY_REF_KG) * 0.003;
  return Math.max(0.9, Math.min(1.1, f));
}

/**
 * 몸무게 보정을 **왜** 하는지 한 줄(2026-08-04 민우님: "621로 계산하는 이유도 적어주면 납득").
 *
 * 숫자만 들이밀면 임의로 보이지만, 이유를 대면 납득된다. 다만 **방향까지만** 말한다 —
 * 착지 지면반력이 체중의 2.5~3배라 무거울수록 미드솔 폼의 압축 피로가 빨리 쌓인다는 건
 * 근거가 있고(위 주석 · durability 리서치도 90kg+ → 15~20% 단축이라고 적는다),
 * **정확한 계수는 학계에 없다.** 그래서 "N% 줄어요" 같은 정밀한 말은 화면에 쓰지 않는다.
 * 화면은 이 상수만 참조한다(사본 금지).
 */
export const WEIGHT_WEAR_REASON_KO = '무거울수록 미드솔이 빨리 눌려요';

/** 몸무게 반영 유효 수명(km) = 기저 권장수명 × 계수, 정수 반올림. 몸무게 없으면 기저 그대로. */
export function effectiveMaxKm(baseMaxKm: number, weightKg?: number | null): number {
  const base = Number(baseMaxKm) || DEFAULT_MAX_KM;
  return Math.round(base * weightDurabilityFactor(weightKg));
}

/**
 * `effectiveMaxKm` 의 **역함수** — 사용자가 본 유효 수명 → 저장할 기저 수명(km).
 *
 * 왜 필요한가(2026-08-04 민우님): 등록 화면이 "권장 650km" 를 보여주고 앱은 621km 로
 * 계산하면 **깎인 느낌**이 든다. 그래서 등록·편집 화면은 처음부터 **내 몸무게 기준 값**
 * 하나만 보여준다(621). 그런데 **저장은 여전히 기저(650)** 여야 한다 —
 * 저장값에 계수를 구워 버리면 나중에 살이 빠졌을 때 그 신발만 옛 몸무게에 갇히고,
 * 설정에서 몸무게를 바꿔도 안 따라온다(지금은 볼 때마다 곱해서 실시간으로 반영된다).
 * 그래서 **보이는 건 유효값, 저장은 기저값** — 그 사이를 이 함수가 잇는다.
 *
 * **왕복 정확도(중요 — 단순 나눗셈이면 숫자가 흘러간다):**
 * `round(round(E/f)·f)` 는 항상 `E` 가 아니다. 계수가 1보다 크면(65kg 미만 러너)
 * `b → round(b·f)` 가 일부 정수를 건너뛰어 **도달 불가능한 E** 가 생긴다
 * (f=1.03 에서 429 를 입력하면 430 으로 되돌아온다). 그래서 나눈 값 주변 ±1 을 훑어
 * **되곱했을 때 정확히 E 가 되는 기저값**을 고른다.
 *
 * 그런 기저값이 아예 없는 E(위의 '건너뛴 값')만 근사로 떨어지고, 그때도 오차는 **최대 1km**,
 * 게다가 **한 번만** 어긋난다 — 보정된 값은 도달 가능한 값이라 그다음부터 고정점이다.
 * 650km 짜리 수명에서 1km 는 무해하고, 대안(기저를 소수로 저장)은 저장 규약을 더럽힌다.
 * 회귀 가드가 전 구간(몸무게 30~150 × 수명 100~2000)을 훑는다 —
 * `__tests__/lib/weightRoundTrip.test.ts`.
 */
export function baseMaxKmFromEffective(effectiveKm: number, weightKg?: number | null): number {
  const e = Number(effectiveKm);
  if (!Number.isFinite(e) || e <= 0) return 0; // 0/비정상은 그대로 넘겨 호출부 검증(validateMaxKm)에 맡긴다
  const f = weightDurabilityFactor(weightKg);
  const guess = Math.round(e / f);
  for (const b of [guess, guess - 1, guess + 1]) {
    if (b > 0 && Math.round(b * f) === e) return b;
  }
  return guess;
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

// ─── 마일리지 최고수위 (AUDIT 3 D-4) ──────────────────────────────────────────

/**
 * 이 정도 차이는 '줄었다'고 보지 않는다(km). 부동소수 오차와 반올림 잡음을 넘기는 하한.
 * 100m 미만의 감소를 사용자에게 알리면 그게 잡음이다.
 */
export const MILEAGE_DROP_EPSILON_KM = 0.1;

/** 설명되지 않는 마일리지 감소 한 건. */
export interface MileageDrop {
  shoeId: string;
  shoeName: string;
  /** 최고수위(km) — 예전에 도달했던 값. */
  highWaterKm: number;
  /** 지금 계산되는 값(km). */
  currentKm: number;
  /** 사라진 거리(km, 양수). */
  missingKm: number;
}

/**
 * 신발 목록과 런 목록을 받아 **설명되지 않는 마일리지 감소**를 찾는다(순수).
 *
 * 판정: `usedKmHighWater` 가 있고, 지금 파생값이 그보다 `MILEAGE_DROP_EPSILON_KM` 이상
 * 작으면 감소다. 수위가 없으면(첫 계산·구버전 데이터) 판정하지 않는다 — 기준이 없는데
 * 경고하면 전원에게 오탐이 뜬다.
 *
 * **되돌리지 않는다.** 이 함수는 "무언가 사라졌다"를 말할 뿐이고, 무엇이 옳은지는 모른다
 * (삭제가 정당했을 수도 있다 — 그 경우는 호출부가 수위를 미리 내려 여기 안 걸린다).
 */
export function detectMileageDrops(
  shoes: readonly ShoeLike[],
  runs: readonly RunLike[] = [],
  epsilonKm: number = MILEAGE_DROP_EPSILON_KM,
): MileageDrop[] {
  if (!Array.isArray(shoes)) return [];
  const out: MileageDrop[] = [];
  for (const shoe of shoes) {
    const hw = Number((shoe as {usedKmHighWater?: unknown})?.usedKmHighWater);
    if (!Number.isFinite(hw) || hw <= 0) continue; // 기준 없음 — 판정하지 않는다
    const {usedKm} = shoeHealth(shoe, runs as RunLike[]);
    const missing = hw - usedKm;
    if (missing < epsilonKm) continue;
    out.push({
      shoeId: String(shoe?.id ?? ''),
      shoeName: String((shoe as {name?: unknown})?.name ?? '신발'),
      highWaterKm: hw,
      currentKm: usedKm,
      missingKm: missing,
    });
  }
  return out;
}

/**
 * 최고수위를 끌어올린다(순수). 지금 파생값이 기존 수위보다 크면 그 값으로 갱신한 **새
 * 신발 객체**를, 아니면 **원본 그대로**(참조 동일) 돌려준다.
 *
 * 참조를 그대로 돌려주는 게 중요하다 — 호출부가 "바뀐 게 있나"를 참조 비교로 판정해,
 * 변화가 없을 때 불필요한 상태 갱신·동기·쓰기를 만들지 않는다.
 */
export function raiseHighWater<T extends ShoeLike>(shoe: T, runs: readonly RunLike[] = []): T {
  const {usedKm} = shoeHealth(shoe, runs as RunLike[]);
  const hw = Number((shoe as {usedKmHighWater?: unknown})?.usedKmHighWater);
  const cur = Number.isFinite(hw) && hw > 0 ? hw : 0;
  if (!(usedKm > cur)) return shoe;
  return {...shoe, usedKmHighWater: usedKm};
}

/**
 * 정당한 감소만큼 수위를 내린다(순수) — 런 삭제처럼 사용자가 의도한 감소.
 * 이걸 안 하면 삭제할 때마다 '설명되지 않는 감소' 경고가 뜬다.
 * 수위가 없거나 내릴 것이 없으면 원본 그대로(참조 동일).
 */
export function lowerHighWater<T extends ShoeLike>(shoe: T, byKm: number): T {
  const hw = Number((shoe as {usedKmHighWater?: unknown})?.usedKmHighWater);
  if (!Number.isFinite(hw) || hw <= 0) return shoe;
  const drop = Number.isFinite(byKm) && byKm > 0 ? byKm : 0;
  if (drop <= 0) return shoe;
  return {...shoe, usedKmHighWater: Math.max(0, hw - drop)};
}
