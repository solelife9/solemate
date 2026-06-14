// ============================================================================
// lib/progression/achievements.ts — 업적 카탈로그 + 헬퍼 (Slice A)
// ============================================================================
// 업적 카탈로그 **단일 정의 출처**. 타이틀(사다리·소수·고난도)과 달리 업적은 **많고
// 잘게 쌓는 수집**이며 **항상 보이는 진행률(progress: current/target)** 을 노출한다
// — 예: "믿음직한 파트너 348/500km". 표시 그룹(group)으로 묶고, 평가축 필러(category)는
// 엔진/커버리지용으로 유지한다. 일부 업적은 ACHIEVEMENT_UNLOCKS_TITLE 로 타이틀에 연결된다.
//
// 각 AchievementDef:
//   · progress(ctx) → {current, target} — 라이브 진행 바(달성 전에도 표시).
//   · unlocked(ctx) → boolean           — 실제 충족 시에만 true(날조 금지, anti-scenario 1).
//   · rarity(RankTier) → points         — POINTS_BY_RARITY 권위(points.ts) 단일 출처.
//
// 업적은 (1) 관련 타이틀 획득에 기여하고[ACHIEVEMENT_UNLOCKS_TITLE], (2) rank 의 engagement
// 평가축에 환산된다(포인트/획득 수). 평가축 임계(rotation≥…)는 rank.computeRank 를 재사용해
// 정의 권위를 한곳(rank.ts)에 둔다(중복 정의 금지).
//
// PURE(iron law): ctx 불변, NaN/음수/누락 → 0, 어떤 입력에서도 throw 금지.
// 순수 progress/unlocked 패턴: 대부분의 업적은 단조 증가 지표 value(ctx) 로 정의되고,
// unlocked ⟺ value ≥ target, progress.current = min(value, target) 로 **항상 일관**한다
// (progress 가 target 에 닿는 순간이 정확히 unlocked 순간 — 진행바와 언락의 모순 불가).
// ============================================================================
import {computeRank} from './rank';
import {pointsForRarity} from './points';
import {isPerfectOrBetter, isSmartOrBetter} from './retirementGrade';
import {
  AchievementDef,
  AchievementGroup,
  AchievementProgress,
  PerShoeStats,
  ProgressionContext,
  RankTier,
  RetirementGrade,
  TitleCategory,
} from './types';

// ── 수치 방어 헬퍼(titles.ts 와 동일 규약) ─────────────────────────────────────

/** 유한 비음수만 통과(NaN/음수/비유한 → 0). */
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 모든 perShoe 통계 배열(방어적). */
function shoeStats(ctx: ProgressionContext): PerShoeStats[] {
  const map = ctx?.perShoe;
  if (!map || typeof map !== 'object') return [];
  return Object.values(map).filter(Boolean);
}

/** km/maxKm 비율 — maxKm 미상이면 null(판정 불가). */
function wearRatio(s: PerShoeStats): number | null {
  const max = nonNeg(s.maxKm);
  if (max <= 0) return null;
  return nonNeg(s.km) / max;
}

/** 초과 마모(overdue) 경고 비율 — rank/lib.shoe SHOE_REPLACE_PCT(90%)과 동일. */
const OVERDUE_RATIO = 0.9;

/** 단일 신발 최대 누적 거리(km) — Trusted Partner/Long Haul 의 "한 켤레와" 진행 지표. */
function maxSingleShoeKm(ctx: ProgressionContext): number {
  return shoeStats(ctx).reduce((m, s) => Math.max(m, nonNeg(s.km)), 0);
}

/** 실제로 사용한(런 ≥1) 신발 수 — 로테이션 진행 지표. */
function shoesUsedCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(s => nonNeg(s.runs) >= 1).length;
}

/**
 * 초과(overdue) 도달 **전**에 교체한 은퇴 신발 수 — Smart Swap/Health Guardian.
 * 한 번도 신지 않은(ratio 0) 신발은 제외(titles.hasEarlyReplacement 와 동일 규약).
 */
function earlyReplacementCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(s => {
    if (!s.retired) return false;
    const r = wearRatio(s);
    return r !== null && r > 0 && r < OVERDUE_RATIO;
  }).length;
}

/** 활성(미은퇴)·수명 알려진 신발 중 건강(overdue 미만)한 수. */
function healthyActiveCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(
    s => !s.retired && nonNeg(s.maxKm) > 0 && (wearRatio(s) ?? 1) < OVERDUE_RATIO,
  ).length;
}

/** 평가 가능한(활성·수명 알려진) 신발 수. */
function assessedActiveCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(s => !s.retired && nonNeg(s.maxKm) > 0).length;
}

// 평가축 재사용(권위=rank.ts) — computeRank 는 순수·메모이즈.
function rotationPillar(ctx: ProgressionContext): number {
  return computeRank(ctx).pillars.rotation;
}

// ── 시간 기반 지표(titles.ts 와 동일 규약) ─────────────────────────────────────
const DAY_MS = 86400000;
/** 'YYYY-MM-DD' → 로컬 자정 epoch ms. */
function ymdToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  const ms = new Date(y, m - 1, dd).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}
/** 러닝 테뉴어(일) — 가장 이른 firstWorn 부터 now 까지. 기록 없으면 0. */
function tenureDays(ctx: ProgressionContext): number {
  let earliest: string | null = null;
  for (const s of shoeStats(ctx)) {
    if (s.firstWorn && (!earliest || s.firstWorn < earliest)) earliest = s.firstWorn;
  }
  if (!earliest) return 0;
  const ms = ymdToMs(earliest);
  const now = Number.isFinite(ctx.now) ? ctx.now : 0;
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((now - ms) / DAY_MS));
}
/** 가장 오래 함께한 (미은퇴) 신발의 보유 일수 — Long Relationship(히든). */
function maxActiveShoeAgeDays(ctx: ProgressionContext): number {
  const now = Number.isFinite(ctx.now) ? ctx.now : 0;
  let max = 0;
  for (const s of shoeStats(ctx)) {
    if (s.retired || !s.firstWorn) continue;
    const ms = ymdToMs(s.firstWorn);
    if (!Number.isFinite(ms)) continue;
    const age = Math.max(0, Math.floor((now - ms) / DAY_MS));
    if (age > max) max = age;
  }
  return max;
}
/** rotation≥0.7 균형을 유지한 채 쌓은 테뉴어(일) — 미충족이면 0(6mo/1yr 로테이션 업적). */
function balancedRotationTenureDays(ctx: ProgressionContext): number {
  return rotationPillar(ctx) >= 0.7 ? tenureDays(ctx) : 0;
}

// ── 은퇴(Hall of Shoes) 지표 — 권위=ctx.retirementCount/retirementGrades ─────────
// 신발 플래그(retiredShoeCount)가 아니라 **영속 은퇴 레코드**(progression_v1.retiredShoes)
// 로 구동한다(날조 금지 — 실제 은퇴 이벤트만). 손으로 만든 ctx 의 누락은 0/[] 로 방어.

/** 실제 은퇴(영속 레코드) 수 — First Retirement/Shoe Curator/Hall of Shoes 진행 지표. */
function retirementCount(ctx: ProgressionContext): number {
  return nonNeg(ctx?.retirementCount ?? 0);
}

/** 은퇴 레코드 등급 목록(방어적 — 누락/비배열 → []). */
function retirementGrades(ctx: ProgressionContext): RetirementGrade[] {
  const g = ctx?.retirementGrades;
  return Array.isArray(g) ? g.filter(Boolean) : [];
}

/** smart 이상 등급으로 교체한 은퇴 수 — Smart Replacement 진행 지표. */
function smartOrBetterRetirementCount(ctx: ProgressionContext): number {
  return retirementGrades(ctx).filter(isSmartOrBetter).length;
}

/** perfect(이상) 등급으로 교체한 은퇴 수 — Perfect Timing 진행 지표. */
function perfectRetirementCount(ctx: ProgressionContext): number {
  return retirementGrades(ctx).filter(isPerfectOrBetter).length;
}

// ── 거리/페이스 임계 ─────────────────────────────────────────────────────────
const HALF_MARATHON_KM = 21.0975;
const MARATHON_KM = 42.195;
/** Trusted Partner: 한 켤레와 함께 달린 거리. */
const TRUSTED_PARTNER_KM = 500;
/** Long Haul: 한 켤레 1000km(보기 드문 장수 신발). */
const LONG_HAUL_KM = 1000;
/** Speedster: 5km 이상 단일 런의 평균 페이스 ≤5:00/km. */
const SPEEDSTER_PACE_SEC = 300;

// ── 진행/언락 일관 팩토리 ──────────────────────────────────────────────────────

/**
 * 단조 증가 지표(value)로 정의되는 표준 업적: unlocked ⟺ value ≥ target,
 * progress.current = min(value, target). 진행바와 언락이 **정의상 모순 불가**.
 */
function metricAch(opts: {
  key: string;
  name: string;
  category: TitleCategory;
  group: AchievementGroup;
  rarity: RankTier;
  target: number;
  hidden?: boolean;
  /** 현재 달성 지표(단조 증가, 비음수). */
  value: (ctx: ProgressionContext) => number;
}): AchievementDef {
  const {key, name, category, group, rarity, target, hidden} = opts;
  return {
    key,
    name,
    category,
    group,
    rarity,
    hidden,
    points: pointsForRarity(rarity),
    progress: ctx => {
      const cur = nonNeg(opts.value(ctx));
      return {current: Math.min(cur, target), target};
    },
    unlocked: ctx => nonNeg(opts.value(ctx)) >= target,
  };
}

/**
 * Speedster 충족: **5km 이상 단일 런**에서 평균 페이스 ≤5:00/km 를 한 번이라도 기록.
 * 거리 바닥(5km)으로 "짧은 1km 질주" 게이밍을 배제한다. bestPace5kSec 미주입(구 컨텍스트)→ 미달성.
 */
function isSpeedster(ctx: ProgressionContext): boolean {
  const p = ctx?.bestPace5kSec;
  return typeof p === 'number' && p > 0 && p <= SPEEDSTER_PACE_SEC;
}

// ============================================================================
// 업적 카탈로그(권위) — 필러별
// ============================================================================

// ── First Milestones: 첫 거리 이정표 ───────────────────────────────────────────
const FIRST_MILESTONE_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_first_run', name: '첫 걸음', category: 'running', group: 'firstMilestone', rarity: 'bronze', target: 1, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_first_5k', name: '첫 5km', category: 'running', group: 'firstMilestone', rarity: 'bronze', target: 5, value: ctx => nonNeg(ctx.longestRunKm)}),
  metricAch({key: 'ach_first_10k', name: '첫 10km', category: 'running', group: 'firstMilestone', rarity: 'bronze', target: 10, value: ctx => nonNeg(ctx.longestRunKm)}),
  metricAch({key: 'ach_half_marathon', name: '하프 마라톤', category: 'running', group: 'firstMilestone', rarity: 'silver', target: HALF_MARATHON_KM, value: ctx => nonNeg(ctx.longestRunKm)}),
  // anti-scenario 1: ≥42km 런이 없으면 절대 언락되지 않는다.
  metricAch({key: 'ach_marathon', name: '마라톤 완주', category: 'running', group: 'firstMilestone', rarity: 'gold', target: MARATHON_KM, value: ctx => nonNeg(ctx.longestRunKm)}),
  // Speedster: 5km 이상 단일 런에서 평균 ≤5:00/km 한 번. 페이스는 낮을수록 좋아
  // 단조 진행 불가 → 이진 진행(미충족 0 / 충족 1). 정직 판정만 유지.
  {
    key: 'ach_speedster',
    name: '스피드스터',
    category: 'running',
    group: 'firstMilestone',
    rarity: 'gold',
    points: pointsForRarity('gold'),
    progress: (ctx): AchievementProgress => ({current: isSpeedster(ctx) ? 1 : 0, target: 1}),
    unlocked: isSpeedster,
  },
];

// ── Distance: 누적 거리 사다리 ─────────────────────────────────────────────────
const DISTANCE_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_dist_50', name: '50km', category: 'running', group: 'distance', rarity: 'bronze', target: 50, value: ctx => nonNeg(ctx.cumulativeKm)}),
  metricAch({key: 'ach_dist_100', name: '100km', category: 'running', group: 'distance', rarity: 'bronze', target: 100, value: ctx => nonNeg(ctx.cumulativeKm)}),
  metricAch({key: 'ach_dist_250', name: '250km', category: 'running', group: 'distance', rarity: 'silver', target: 250, value: ctx => nonNeg(ctx.cumulativeKm)}),
  metricAch({key: 'ach_dist_500', name: '500km', category: 'running', group: 'distance', rarity: 'silver', target: 500, value: ctx => nonNeg(ctx.cumulativeKm)}),
  metricAch({key: 'ach_distance_1000', name: '1,000km', category: 'running', group: 'distance', rarity: 'gold', target: 1000, value: ctx => nonNeg(ctx.cumulativeKm)}),
  metricAch({key: 'ach_dist_2500', name: '2,500km', category: 'running', group: 'distance', rarity: 'platinum', target: 2500, value: ctx => nonNeg(ctx.cumulativeKm)}),
  metricAch({key: 'ach_distance_5000', name: '5,000km', category: 'running', group: 'distance', rarity: 'diamond', target: 5000, value: ctx => nonNeg(ctx.cumulativeKm)}),
  metricAch({key: 'ach_dist_10000', name: '10,000km', category: 'running', group: 'distance', rarity: 'master', target: 10000, value: ctx => nonNeg(ctx.cumulativeKm)}),
];

// ── Running Count: 누적 러닝 횟수 사다리 ───────────────────────────────────────
const RUN_COUNT_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_runs_10', name: '10회 러닝', category: 'consistency', group: 'runCount', rarity: 'bronze', target: 10, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_25', name: '25회 러닝', category: 'consistency', group: 'runCount', rarity: 'bronze', target: 25, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_50', name: '50회 러닝', category: 'consistency', group: 'runCount', rarity: 'silver', target: 50, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_century_runs', name: '100회 러닝', category: 'consistency', group: 'runCount', rarity: 'gold', target: 100, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_250', name: '250회 러닝', category: 'consistency', group: 'runCount', rarity: 'platinum', target: 250, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_500', name: '500회 러닝', category: 'consistency', group: 'runCount', rarity: 'diamond', target: 500, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_1000', name: '1,000회 러닝', category: 'consistency', group: 'runCount', rarity: 'master', target: 1000, value: ctx => nonNeg(ctx.runCount)}),
];

// ── Consistency: 연속(스트릭) + 주간 습관 ──────────────────────────────────────
const CONSISTENCY_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_streak_7', name: '일주일 전사', category: 'consistency', group: 'consistency', rarity: 'silver', target: 7, value: ctx => nonNeg(ctx.longestStreak)}),
  metricAch({key: 'ach_streak_14', name: '2주의 약속', category: 'consistency', group: 'consistency', rarity: 'silver', target: 14, value: ctx => nonNeg(ctx.longestStreak)}),
  metricAch({key: 'ach_streak_30', name: '무적의 한 달', category: 'consistency', group: 'consistency', rarity: 'gold', target: 30, value: ctx => nonNeg(ctx.longestStreak)}),
  metricAch({key: 'ach_streak_100', name: '100일의 기적', category: 'consistency', group: 'consistency', rarity: 'diamond', target: 100, value: ctx => nonNeg(ctx.longestStreak)}),
  metricAch({key: 'ach_streak_365', name: '365일의 여정', category: 'consistency', group: 'consistency', rarity: 'master', target: 365, value: ctx => nonNeg(ctx.longestStreak)}),
  // 주간 활성 75% — 진행은 백분율 포인트(0..75).
  metricAch({key: 'ach_weekly_habit', name: '습관 형성', category: 'consistency', group: 'consistency', rarity: 'silver', target: 75, value: ctx => Math.round(nonNeg(ctx.weeklyActiveRatio) * 100)}),
];

// ── Shoe Collection: 등록 신발 수 ──────────────────────────────────────────────
const SHOE_COLLECTION_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_shoe_1', name: '첫 신발', category: 'shoeManagement', group: 'shoeCollection', rarity: 'bronze', target: 1, value: ctx => nonNeg(ctx.registeredShoeCount)}),
  metricAch({key: 'ach_shoe_3', name: '3켤레 컬렉션', category: 'shoeManagement', group: 'shoeCollection', rarity: 'bronze', target: 3, value: ctx => nonNeg(ctx.registeredShoeCount)}),
  metricAch({key: 'ach_collection_5', name: '신발 큐레이터', category: 'shoeManagement', group: 'shoeCollection', rarity: 'silver', target: 5, value: ctx => nonNeg(ctx.registeredShoeCount)}),
  metricAch({key: 'ach_collection_10', name: '신발 감식가', category: 'shoeManagement', group: 'shoeCollection', rarity: 'gold', target: 10, value: ctx => nonNeg(ctx.registeredShoeCount)}),
];

// ── Shoe Life: 한 켤레와 함께한 거리 ───────────────────────────────────────────
const SHOE_LIFE_ACHIEVEMENTS: AchievementDef[] = [
  // ★ 사용자 명시 예시: "Trusted Partner 348/500km" — 한 켤레로 500km.
  metricAch({key: 'ach_trusted_partner', name: '믿음직한 파트너', category: 'shoeManagement', group: 'shoeLife', rarity: 'gold', target: TRUSTED_PARTNER_KM, value: maxSingleShoeKm}),
  metricAch({key: 'ach_long_haul', name: '천 킬로의 동반자', category: 'shoeManagement', group: 'shoeLife', rarity: 'diamond', target: LONG_HAUL_KM, value: maxSingleShoeKm}),
];

// ── Rotation: 사용 켤레 수 + 균형 + 기간 ───────────────────────────────────────
const ROTATION_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_rotation_2', name: '2켤레 로테이션', category: 'rotation', group: 'rotation', rarity: 'bronze', target: 2, value: shoesUsedCount}),
  metricAch({key: 'ach_rotation_3', name: '세 켤레의 동행', category: 'rotation', group: 'rotation', rarity: 'silver', target: 3, value: shoesUsedCount}),
  metricAch({key: 'ach_rotation_5', name: '로테이션 마에스트로', category: 'rotation', group: 'rotation', rarity: 'gold', target: 5, value: shoesUsedCount}),
  // 사용량 균형(엔트로피) ≥0.8 — 진행은 백분율 포인트(0..80). 평가축 권위=rank.ts.
  metricAch({key: 'ach_rotation_balance', name: '완벽한 균형', category: 'rotation', group: 'rotation', rarity: 'platinum', target: 80, value: ctx => Math.round(rotationPillar(ctx) * 100)}),
  // 균형(≥0.7)을 유지한 채 6개월/1년 — 미충족이면 진행 0(balancedRotationTenureDays).
  metricAch({key: 'ach_rotation_6mo', name: '6개월 로테이션', category: 'rotation', group: 'rotation', rarity: 'gold', target: 182, value: balancedRotationTenureDays}),
  metricAch({key: 'ach_rotation_1yr', name: '1년 로테이션', category: 'rotation', group: 'rotation', rarity: 'platinum', target: 365, value: balancedRotationTenureDays}),
];

// ── Injury Prevention: 조기 교체 + 건강 유지 + 교체 타이밍 품질 ─────────────────
// 부상 예방의 핵심은 "신발을 제때 교체"하는 것. 그래서 (1) 초과 마모 전 조기 교체,
// (2) 활성 신발 건강 유지에 더해, (3) **권장수명에 맞춰 교체한 타이밍 품질**(은퇴 등급
// smart/perfect)까지 이 그룹이 보상한다. 타이밍 품질 지표는 은퇴 레코드의 등급에서 오지만
// (smartOrBetterRetirementCount/perfectRetirementCount), 보상하는 행위는 "잘 교체해 부상을
// 예방"하는 것이므로 '은퇴(개수)' 그룹이 아니라 여기에 둔다. '현명한 교체'(조기)와
// '좋은 타이밍/완벽한 타이밍'(권장 근접)은 서로 다른 밴드를 보상한다(중복 아님).
const INJURY_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_smart_swap', name: '현명한 교체', category: 'injuryPrevention', group: 'injuryPrevention', rarity: 'silver', target: 1, value: earlyReplacementCount}),
  metricAch({key: 'ach_health_guardian', name: '건강 지킴이', category: 'injuryPrevention', group: 'injuryPrevention', rarity: 'gold', target: 3, value: earlyReplacementCount}),
  // Clean Rotation: 평가 가능한 활성 신발 ≥2 이고 **전부** 건강(초과 없음).
  // current===target ⟺ unlocked 가 **정의상** 성립(target=assessed, 최소 2).
  {
    key: 'ach_clean_rotation',
    name: '건강한 로테이션',
    category: 'injuryPrevention',
    group: 'injuryPrevention',
    rarity: 'silver',
    points: pointsForRarity('silver'),
    progress: (ctx): AchievementProgress => ({
      current: healthyActiveCount(ctx),
      target: Math.max(assessedActiveCount(ctx), 2),
    }),
    unlocked: ctx => {
      const assessed = assessedActiveCount(ctx);
      return assessed >= 2 && healthyActiveCount(ctx) === assessed;
    },
  },
  // 교체 타이밍 품질(은퇴 등급) — 권장수명 ±10%(좋은) / ±5%(완벽). 등급 지표는 은퇴
  // 레코드에서 오므로 은퇴가 0건이면 절대 언락되지 않는다(날조 금지).
  metricAch({key: 'ach_smart_replacement', name: '좋은 타이밍', category: 'injuryPrevention', group: 'injuryPrevention', rarity: 'silver', target: 1, value: smartOrBetterRetirementCount}),
  metricAch({key: 'ach_perfect_timing', name: '완벽한 타이밍', category: 'injuryPrevention', group: 'injuryPrevention', rarity: 'gold', target: 1, value: perfectRetirementCount}),
];

// ── Retirement(Hall of Shoes): 은퇴시킨 신발 **수**만 보상 ──────────────────────
// 순수 카운트 사다리(1/3/5/10) — "몇 켤레를 떠나보냈나". 교체 '타이밍 품질'(등급) 보상은
// 개념이 달라 부상 예방 그룹으로 옮겼다(은퇴 그룹은 개수만 유지해 의미를 깔끔히 한다).
const RETIREMENT_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_first_retirement', name: '첫 은퇴', category: 'retirement', group: 'retirement', rarity: 'bronze', target: 1, value: retirementCount}),
  metricAch({key: 'ach_retire_3', name: '3켤레 은퇴', category: 'retirement', group: 'retirement', rarity: 'silver', target: 3, value: retirementCount}),
  metricAch({key: 'ach_retire_5', name: '5켤레 은퇴', category: 'retirement', group: 'retirement', rarity: 'silver', target: 5, value: retirementCount}),
  metricAch({key: 'ach_retire_10', name: '명예의 전당', category: 'retirement', group: 'retirement', rarity: 'gold', target: 10, value: retirementCount}),
];

// ── Hidden: 달성 전까지 숨김(달성 순간 공개). Rain Runner 는 날씨 미추적으로 제외. ─
const HIDDEN_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_hidden_early_bird', name: '얼리버드', category: 'running', group: 'hidden', rarity: 'gold', target: 20, hidden: true, value: ctx => nonNeg(ctx.earlyRunCount)}),
  metricAch({key: 'ach_hidden_night_runner', name: '나이트 러너', category: 'running', group: 'hidden', rarity: 'gold', target: 20, hidden: true, value: ctx => nonNeg(ctx.nightRunCount)}),
  metricAch({key: 'ach_hidden_comeback', name: '컴백 러너', category: 'consistency', group: 'hidden', rarity: 'silver', target: 30, hidden: true, value: ctx => nonNeg(ctx.longestGapDays)}),
  metricAch({key: 'ach_hidden_long_relationship', name: '오랜 동반자', category: 'shoeManagement', group: 'hidden', rarity: 'platinum', target: 365, hidden: true, value: maxActiveShoeAgeDays}),
];

/**
 * 전체 업적 카탈로그(권위·불변). 그룹(수집 카탈로그) 순서대로 평탄화한다.
 * 갤러리/엔진은 이 배열만 소비한다(분산 정의 금지).
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...FIRST_MILESTONE_ACHIEVEMENTS,
  ...DISTANCE_ACHIEVEMENTS,
  ...RUN_COUNT_ACHIEVEMENTS,
  ...CONSISTENCY_ACHIEVEMENTS,
  ...SHOE_COLLECTION_ACHIEVEMENTS,
  ...SHOE_LIFE_ACHIEVEMENTS,
  ...ROTATION_ACHIEVEMENTS,
  ...INJURY_ACHIEVEMENTS,
  ...RETIREMENT_ACHIEVEMENTS,
  ...HIDDEN_ACHIEVEMENTS,
];

/** key → AchievementDef 조회 맵(O(1)). */
export const ACHIEVEMENTS_BY_KEY: Readonly<Record<string, AchievementDef>> =
  ACHIEVEMENTS.reduce((acc, def) => {
    acc[def.key] = def;
    return acc;
  }, {} as Record<string, AchievementDef>);

/**
 * 업적 → 관련 타이틀 매핑(업적을 쌓아 타이틀을 획득하는 연결). 엔진이 언락된 업적의
 * 관련 타이틀을 함께 표면화한다. 값(타이틀 키)은 titles.ts 카탈로그에 실재해야 한다.
 * 철학: 업적 = 잘게 쌓는 수집, 타이틀 = 그 위에 도달하는 더 높은 보상.
 */
export const ACHIEVEMENT_UNLOCKS_TITLE: Readonly<Record<string, string>> = {
  ach_first_run: 'running_beginner',
  ach_dist_100: 'running_100k',
  ach_dist_500: 'running_500k',
  ach_distance_1000: 'running_1000k',
  ach_distance_5000: 'running_5000k',
  ach_dist_10000: 'running_10000k',
  ach_shoe_1: 'shoe_beginner',
  ach_shoe_3: 'shoe_enthusiast',
  ach_collection_5: 'shoe_rotation_runner',
  ach_collection_10: 'shoe_collector',
  ach_rotation_2: 'rotation_starter',
  ach_first_retirement: 'retire_starter',
  ach_retire_10: 'retire_hall',
};

/** key 로 업적 정의 조회(없으면 undefined). */
export function achievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENTS_BY_KEY[key];
}

/**
 * 컨텍스트로부터 한 업적의 라이브 진행률을 구한다(항상 표시 가능 — 미달성도).
 * 순수·방어적: progress 가 던지면(있을 수 없음) {0,target?} 대신 {0,0} 으로 안전.
 */
export function achievementProgress(
  def: AchievementDef,
  ctx: ProgressionContext,
): AchievementProgress {
  try {
    const p = def.progress(ctx);
    const current = nonNeg(p?.current);
    const target = nonNeg(p?.target);
    return {current: Math.min(current, target || current), target};
  } catch {
    return {current: 0, target: 0};
  }
}

/**
 * 현재 **언락된** 업적 정의 목록(날조 금지 — 실제 충족만). 순수: ctx 불변, criterion 이
 * 던지더라도 삼켜 해당 업적만 잠금 처리. 순서는 카탈로그 순서(결정적).
 */
export function unlockedAchievements(ctx: ProgressionContext): AchievementDef[] {
  if (!ctx || typeof ctx !== 'object') return [];
  const out: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    let ok = false;
    try {
      ok = def.unlocked(ctx) === true;
    } catch {
      ok = false; // pure-guard: 어떤 입력에서도 throw 가 언락 판정을 깨지 않는다.
    }
    if (ok) out.push(def);
  }
  return out;
}

/** 언락된 업적 **키** 목록(notice diff/engagement 용 — evaluateTitles 와 대칭). */
export function evaluateAchievements(ctx: ProgressionContext): string[] {
  return unlockedAchievements(ctx).map(d => d.key);
}
