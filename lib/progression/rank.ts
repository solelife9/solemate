// ============================================================================
// lib/progression/rank.ts — 합성 랭크 엔진 computeRank (Slice A)
// ============================================================================
// 사전 집계된 사실(ProgressionContext)만 읽어 6개 평가축(pillar)을 0..1로 정규화하고,
// spec 권위 가중치로 0..100 점수를 만들어 티어(Bronze→Legend)와 티어 색을 돌려준다.
//
//   score = 100 × ( 0.25·running + 0.20·consistency + 0.20·shoeManagement
//                 + 0.15·rotation + 0.10·injuryPrevention + 0.10·engagement )
//
// 설계 의도(거리 단독 금지, anti-scenario 2): running 은 누적+단일 거리를 log 스케일로
// **포화**시키므로 가중치(0.25)와 합쳐 거리만으로는 25점(=Silver 하한) 이상으로 못 간다.
// → 어떤 초장거리 유저도 다른 평가축 없이 상위 티어(특히 Legend)에 도달하지 못한다.
//
// 재사용한 도메인 개념(중복 정의 금지):
//   · overdue(초과 마모) = km / maxKm ≥ 0.9 — lib/shoe.SHOE_REPLACE_PCT(90%)과 동일 임계.
//     (wearModel/replacementForecast 의 '잔여 ≤ 0 → overdue' 개념을 컨텍스트 집계치 위에서
//      비율로 재현 — rank 는 ctx 만 읽으므로 비율 기준으로 동등하게 판정한다.)
//   · rotation = 활성 신발 간 사용량(누적 km) 분포의 엔트로피 — lib/rotation 의 '마모 분산'
//     관점을 정보이론적 균형도로 환산.
//
// PURE(iron law): 입력 불변, NaN/음수/누락 → 0, 어떤 입력에서도 throw 금지.
// memoizable: ctx 는 불변 사실 묶음이므로 객체 참조 기준 WeakMap 캐시로 재계산을 건너뛴다.
// ============================================================================
import {TIER_COLORS} from '../../theme';
import {
  PerShoeStats,
  PillarScores,
  ProgressionContext,
  RankResult,
  RankTier,
} from './types';

// ── 상수 ──────────────────────────────────────────────────────────────────────

/** 평가축 가중치(합 = 1.0, spec 권위). */
const WEIGHTS: Readonly<Record<keyof PillarScores, number>> = {
  running: 0.25,
  consistency: 0.2,
  shoeManagement: 0.2,
  rotation: 0.15,
  injuryPrevention: 0.1,
  engagement: 0.1,
};

/** overdue(초과 마모) 비율 임계 — lib/shoe.SHOE_REPLACE_PCT(90%)과 동일. */
const OVERDUE_RATIO = 0.9;

/** running 포화 기준: 이 누적거리(km)에서 누적 성분이 ~1.0 으로 포화. */
const CUMULATIVE_SATURATION_KM = 8000;
/** running 단일-런 성분 포화 기준(km) — 풀코스(마라톤). */
const SINGLE_SATURATION_KM = 42.195;

/** consistency 포화 기준. */
const STREAK_SATURATION_DAYS = 30;
const CURRENT_STREAK_SATURATION_DAYS = 14;

/** engagement 상한 — (획득 타이틀 + 완료 챌린지) 합이 이 값이면 포화. */
const ENGAGEMENT_CAP = 24;

/** 한참 초과(이 비율 초과) 후 은퇴는 절반만 '건강한 교체'로 인정. */
const LATE_RETIRE_RATIO = 1.3;

/**
 * 티어 컷오프(점수 하한, 높은 티어부터). spec 권위:
 * Bronze<25 · Silver 25–44 · Gold 45–61 · Platinum 62–77 · Diamond 78–89 ·
 * Master 90–96 · Legend ≥97. 첫 매칭(점수 ≥ 하한)이 그 티어.
 */
export const TIER_CUTOFFS: ReadonlyArray<readonly [number, RankTier]> = [
  [97, 'legend'],
  [90, 'master'],
  [78, 'diamond'],
  [62, 'platinum'],
  [45, 'gold'],
  [25, 'silver'],
  [0, 'bronze'],
];

// ── 수치 방어 헬퍼 ────────────────────────────────────────────────────────────

/** 유한 비음수만 통과(NaN/음수/비유한 → 0). */
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 0..1 로 클램프(NaN/음수 → 0, 1 초과 → 1). */
function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}

/** 0..100 로 클램프. */
function clampScore(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 100 ? 100 : n;
}

/**
 * log 포화 정규화: value 가 0 → 0, scale 근처 → ~1, 그 이상은 1 로 포화.
 * 큰 값일수록 한계효용이 급감(거리 단독이 점수를 독식하지 못하게 한다).
 */
function logSaturate(value: number, scale: number): number {
  const v = nonNeg(value);
  const s = nonNeg(scale);
  if (s <= 0) return 0;
  return clamp01(Math.log1p(v) / Math.log1p(s));
}

/** 신발이 초과 마모(overdue) 상태인가 — maxKm 미상이면 판정 불가(false). */
function isOverdue(s: PerShoeStats): boolean {
  const km = nonNeg(s.km);
  const max = nonNeg(s.maxKm);
  return max > 0 && km / max >= OVERDUE_RATIO;
}

// ── 평가축 계산(각 0..1) ──────────────────────────────────────────────────────

/**
 * running — 누적 + 단일 최장 런 거리(둘 다 log 포화). 누적이 주(0.82), 단일이 보조(0.18).
 * 포화 때문에 거리만으로는 1.0 에 근접해도 가중치 0.25 라 25점(Silver 하한)을 넘지 못한다.
 */
function runningPillar(ctx: ProgressionContext): number {
  const cumulative = logSaturate(ctx.cumulativeKm, CUMULATIVE_SATURATION_KM);
  const single = logSaturate(ctx.longestRunKm, SINGLE_SATURATION_KM);
  return clamp01(0.82 * cumulative + 0.18 * single);
}

/**
 * consistency — 주간 활성도(0.45) + 역대 최장 스트릭(0.35) + 현재 스트릭(0.20).
 * 스트릭은 각 포화일로 정규화한다.
 */
function consistencyPillar(ctx: ProgressionContext): number {
  const weekly = clamp01(ctx.weeklyActiveRatio);
  const longest = clamp01(nonNeg(ctx.longestStreak) / STREAK_SATURATION_DAYS);
  const current = clamp01(
    nonNeg(ctx.currentStreak) / CURRENT_STREAK_SATURATION_DAYS,
  );
  return clamp01(0.45 * weekly + 0.35 * longest + 0.2 * current);
}

/**
 * shoeManagement — 활성(미은퇴) 신발 중 overdue 가 아닌 신발의 비율(클린 셰어).
 * 활성 신발이 없으면 0(관리할 대상 없음). overdue 개념은 wearModel/replacementForecast 재사용.
 */
function shoeManagementPillar(ctx: ProgressionContext): number {
  const active = Object.values(ctx.perShoe).filter(s => s && !s.retired);
  if (active.length === 0) return 0;
  const healthy = active.filter(s => !isOverdue(s)).length;
  return clamp01(healthy / active.length);
}

/**
 * rotation — 활성 신발(누적 km>0) 간 사용량 분포의 정규화 엔트로피(0..1).
 * 신발 1켤레 이하 → 0(로테이션 무의미, lib/rotation 규약과 일치). 완전 균등 → 1.
 */
function rotationPillar(ctx: ProgressionContext): number {
  const active = Object.values(ctx.perShoe).filter(
    s => s && !s.retired && nonNeg(s.km) > 0,
  );
  const n = active.length;
  if (n < 2) return 0;
  const total = active.reduce((a, s) => a + nonNeg(s.km), 0);
  if (total <= 0) return 0;
  let entropy = 0;
  for (const s of active) {
    const p = nonNeg(s.km) / total;
    if (p > 0) entropy -= p * Math.log(p);
  }
  // log(n) 으로 정규화 → 균등분포에서 1.0.
  return clamp01(entropy / Math.log(n));
}

/**
 * injuryPrevention — '초과 마모 전에 교체' 비율. 신발(maxKm 알려진)을 건강/위험으로 분류:
 *   · 활성 + overdue → 위험(부상 위험: 초과 마모 신발을 계속 사용).
 *   · 활성 + 정상   → 건강(수명 내 관리 중).
 *   · 은퇴 + 합리적 시점(≤1.3배) → 건강(제때 교체).
 *   · 은퇴 + 한참 초과(>1.3배) → 절반만 인정.
 * maxKm 아는 신발이 없으면 0. = 건강 / (건강 + 위험).
 */
function injuryPreventionPillar(ctx: ProgressionContext): number {
  const shoes = Object.values(ctx.perShoe).filter(s => s && nonNeg(s.maxKm) > 0);
  if (shoes.length === 0) return 0;
  let good = 0;
  let bad = 0;
  for (const s of shoes) {
    const ratio = nonNeg(s.km) / nonNeg(s.maxKm);
    if (s.retired) {
      if (ratio <= LATE_RETIRE_RATIO) {
        good += 1;
      } else {
        good += 0.5;
        bad += 0.5;
      }
    } else if (ratio >= OVERDUE_RATIO) {
      bad += 1;
    } else {
      good += 1;
    }
  }
  const denom = good + bad;
  return denom > 0 ? clamp01(good / denom) : 0;
}

/**
 * engagement — (획득 타이틀 + 완료 챌린지) 합을 상한(ENGAGEMENT_CAP)으로 정규화.
 * 업적/타이틀 획득과 챌린지 완수는 모두 실제 달성 기준에서만 누적된다(날조 없음).
 */
function engagementPillar(ctx: ProgressionContext): number {
  const titles = nonNeg(ctx.earnedTitleCount);
  const challenges = nonNeg(ctx.completedChallengeCount);
  return clamp01((titles + challenges) / ENGAGEMENT_CAP);
}

/** 모든 평가축 0(빈/비정상 컨텍스트용). */
function zeroPillars(): PillarScores {
  return {
    running: 0,
    consistency: 0,
    shoeManagement: 0,
    rotation: 0,
    injuryPrevention: 0,
    engagement: 0,
  };
}

/** 6개 평가축을 계산한다(각 0..1, 모두 방어적). */
function computePillars(ctx: ProgressionContext): PillarScores {
  return {
    running: runningPillar(ctx),
    consistency: consistencyPillar(ctx),
    shoeManagement: shoeManagementPillar(ctx),
    rotation: rotationPillar(ctx),
    injuryPrevention: injuryPreventionPillar(ctx),
    engagement: engagementPillar(ctx),
  };
}

/** 평가축 → 0..100 합성 점수(가중합). */
function scoreFromPillars(p: PillarScores): number {
  const raw =
    100 *
    (WEIGHTS.running * p.running +
      WEIGHTS.consistency * p.consistency +
      WEIGHTS.shoeManagement * p.shoeManagement +
      WEIGHTS.rotation * p.rotation +
      WEIGHTS.injuryPrevention * p.injuryPrevention +
      WEIGHTS.engagement * p.engagement);
  return clampScore(raw);
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/** 점수(0..100) → 티어. 컷오프는 spec 권위(TIER_CUTOFFS). */
export function tierForScore(score: number): RankTier {
  const s = clampScore(score);
  for (const [cut, tier] of TIER_CUTOFFS) {
    if (s >= cut) return tier;
  }
  return 'bronze';
}

/** 티어 → 티어 색(theme.TIER_COLORS — 하드코딩 금지). */
export function colorForTier(tier: RankTier): string {
  return TIER_COLORS[tier];
}

// 메모이제이션: ctx 는 불변 사실 묶음 → 객체 참조 기준 캐시(동일 ctx 재계산 회피).
const memo = new WeakMap<ProgressionContext, RankResult>();

/**
 * 합성 랭크를 계산한다. PURE·memoizable: 입력 불변, NaN/음수/누락 → 0, throw 금지.
 * 빈/비정상 컨텍스트 → score 0, Bronze, 모든 평가축 0.
 */
export function computeRank(ctx: ProgressionContext): RankResult {
  if (!ctx || typeof ctx !== 'object') {
    return {
      score: 0,
      tier: 'bronze',
      color: TIER_COLORS.bronze,
      pillars: zeroPillars(),
    };
  }
  const cached = memo.get(ctx);
  if (cached) return cached;

  const pillars = computePillars(ctx);
  const score = scoreFromPillars(pillars);
  const tier = tierForScore(score);
  const result: RankResult = {score, tier, color: TIER_COLORS[tier], pillars};

  memo.set(ctx, result);
  return result;
}
