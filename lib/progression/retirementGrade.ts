// ============================================================================
// lib/progression/retirementGrade.ts — Smart Retirement Grade (Slice B)
// ============================================================================
// 신발을 "권장 수명 대비 얼마나 적절한 시점에" 교체했는지를 등급으로 환산한다.
// 등급은 카드 스타일/은퇴 업적(Perfect Timing·Smart Replacement)을 구동한다.
//
//   closeness c = usedKm / recommendedKm   (recommendedKm ≤ 0 → 판정 불가 → 'standard')
//
// 밴드 수학(권위 — 이 한곳에서만 정의):
//   · Perfect  : |c − 1| ≤ 0.05            (권장의 ±5% 이내)
//   · Smart    : |c − 1| ≤ 0.10  (Perfect 제외, 권장의 ±10% 이내)
//   · Good     : 0.70 ≤ c < 0.90           (권장 범위 안 — 너무 이르지도, 초과하지도 않음)
//                즉 합리적 하한(0.70) 이상이면서 권장(1.0)을 넘지 않되 ±10% 밖.
//   · Standard : 그 외 (아주 일찍: c < 0.70, 또는 한참 초과: c > 1.10).
//
//   · Hall of Fame(특별·최상위): healthy lifecycle(Smart 이상) **그리고** 뛰어난 신발
//     관리(shoeManagement pillar ≥ 0.70) **그리고** 그 신발로 실제 세운 PB(요약
//     하이라이트에 PB 키 존재)를 모두 충족할 때. 가장 권위 있는 등급으로 base 를 덮어쓴다.
//
// PURE(iron law): 입력 불변, NaN/음수/누락 → 안전값(usedKm<0→0, recommendedKm≤0→standard),
// 어떤 입력에서도 throw 금지.
// ============================================================================
// PB 하이라이트 키의 단일 출처는 retirement.ts (날조 금지 — 실제 PB 키만 인정).
// retirement.ts ↔ retirementGrade.ts 는 상호 import 하지만, 양쪽 모두 상대 export 를
// **함수 본문에서 지연 참조**(모듈 평가 시점이 아님)하므로 순환은 무해하다.
import {PB_HIGHLIGHT_KEYS} from './retirement';
import {
  ProgressionContext,
  RetirementGrade,
  RetirementSummary,
} from './types';

// ── 등급 품질 순위(권위) ───────────────────────────────────────────────────────
/**
 * 은퇴 등급의 품질 순위(낮음→높음). 카탈로그(업적/타이틀)의 "smart 이상 / perfect"
 * 판정이 이 한곳의 순위만 읽도록 단일 출처로 둔다(밴드 수학과 분리된 비교용 정의).
 * hallOfFame 은 healthy lifecycle(smart/perfect)의 최상위 승격이므로 perfect 보다 높다.
 */
export const GRADE_QUALITY: Readonly<Record<RetirementGrade, number>> = {
  standard: 0,
  good: 1,
  smart: 2,
  perfect: 3,
  hallOfFame: 4,
};

/** grade 가 'smart 이상'(smart/perfect/hallOfFame)인가 — Smart Replacement 판정. */
export function isSmartOrBetter(grade: RetirementGrade | null | undefined): boolean {
  const q = grade ? GRADE_QUALITY[grade] : undefined;
  return Number.isFinite(q) && (q as number) >= GRADE_QUALITY.smart;
}

/**
 * grade 가 'perfect 이상'(perfect/hallOfFame)인가 — Perfect Timing 판정.
 * hallOfFame 은 perfect 보다 높은 최상위 등급이므로 포함한다(최고 등급이 더 약한
 * 업적을 못 여는 모순을 막는다).
 */
export function isPerfectOrBetter(grade: RetirementGrade | null | undefined): boolean {
  const q = grade ? GRADE_QUALITY[grade] : undefined;
  return Number.isFinite(q) && (q as number) >= GRADE_QUALITY.perfect;
}

// ── 밴드 임계(권위) ────────────────────────────────────────────────────────────
/** Perfect: 권장의 ±5% 이내. */
export const PERFECT_BAND = 0.05;
/** Smart: 권장의 ±10% 이내(Perfect 제외). */
export const SMART_BAND = 0.1;
/** Good 하한: 이 비율(권장의 70%) 미만으로 일찍 버리면 'Standard'(아주 이른 교체). */
export const GOOD_LOWER_RATIO = 0.7;
/** Hall of Fame 조건: shoeManagement pillar 가 이 값 이상이면 '뛰어난 관리'. */
export const MGMT_HIGH_THRESHOLD = 0.7;
/** 밴드 경계 부동소수 허용 오차(정확히 ±5%/±10% 가 포함되도록). */
const BAND_EPS = 1e-9;

// ── 수치 방어 ──────────────────────────────────────────────────────────────────
/** 유한 비음수만 통과(NaN/음수/비유한 → 0). */
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * closeness c = usedKm / recommendedKm. recommendedKm ≤ 0(미상)면 판정 불가 → null.
 * usedKm 음수/NaN → 0 으로 정규화(0 으로 나눠지지 않음 — rec>0 보장).
 */
export function retirementCloseness(
  usedKm: number,
  recommendedKm: number,
): number | null {
  const rec = nonNeg(recommendedKm);
  if (rec <= 0) return null;
  return nonNeg(usedKm) / rec;
}

/** closeness → 기본 등급(Hall of Fame 적용 전). 밴드 수학은 파일 상단 문서 참조. */
function baseGradeFor(c: number | null): RetirementGrade {
  if (c === null) return 'standard';
  const delta = Math.abs(c - 1);
  if (delta <= PERFECT_BAND + BAND_EPS) return 'perfect';
  if (delta <= SMART_BAND + BAND_EPS) return 'smart';
  // 권장 범위 안(합리적 하한 이상 & 권장 이하, ±10% 밖) → Good.
  if (c >= GOOD_LOWER_RATIO - BAND_EPS && c < 1 - SMART_BAND) return 'good';
  return 'standard'; // 아주 이른(c<0.70) 또는 한참 초과(c>1.10) 교체.
}

/** healthy lifecycle = Smart 이상(perfect/smart). */
function isHealthyLifecycle(grade: RetirementGrade): boolean {
  return grade === 'smart' || grade === 'perfect';
}

/**
 * 신발 관리 품질(0..1) = 활성·수명 알려진 신발 중 과사용(권장수명 100% 초과) 아닌 비율.
 * rank 엔진(이제 업적 기반)에 의존하지 않고 직접 ctx 로 판정한다(순환 제거). 방어적.
 */
function mgmtHealthyShare(ctx: ProgressionContext): number {
  const map = ctx?.perShoe;
  if (!map || typeof map !== 'object') return 0;
  const active = Object.values(map).filter(
    s => s && !s.retired && nonNeg(s.maxKm) > 0,
  );
  if (active.length === 0) return 0;
  const healthy = active.filter(s => nonNeg(s.km) / nonNeg(s.maxKm) <= 1).length;
  return healthy / active.length;
}

/** 요약 하이라이트에 그 신발로 실제 세운 PB 키가 있는가(날조 금지). */
function hasRealPB(summary: RetirementSummary | null | undefined): boolean {
  const hl = summary && Array.isArray(summary.highlights) ? summary.highlights : [];
  return hl.some(k => PB_HIGHLIGHT_KEYS.includes(k));
}

/**
 * 은퇴 등급을 계산한다. PURE: 입력 불변, NaN/음수/누락 안전, throw 금지.
 *
 * @param usedKm        은퇴 시점 누적 주행거리(km). 음수/NaN → 0.
 * @param recommendedKm 권장 수명(km). ≤0/미상 → 'standard'(판정 불가).
 * @param summary       은퇴 요약 — Hall of Fame 의 '실제 PB' 판정에 하이라이트를 읽는다.
 * @param ctx           진척 컨텍스트 — Hall of Fame 의 'shoeManagement' 평가에 쓴다.
 */
export function gradeRetirement(
  usedKm: number,
  recommendedKm: number,
  summary: RetirementSummary | null | undefined,
  ctx: ProgressionContext | null | undefined,
): RetirementGrade {
  const c = retirementCloseness(usedKm, recommendedKm);
  const base = baseGradeFor(c);

  // Hall of Fame(특별): healthy lifecycle + 뛰어난 관리 + 실제 PB → 최상위로 승격.
  if (
    isHealthyLifecycle(base) &&
    ctx &&
    typeof ctx === 'object' &&
    mgmtHealthyShare(ctx) >= MGMT_HIGH_THRESHOLD &&
    hasRealPB(summary)
  ) {
    return 'hallOfFame';
  }
  return base;
}
