// ============================================================================
// lib/progression/achievements.ts — 업적 카탈로그 + 랭크 축 집계 (재설계)
// ============================================================================
// 업적은 **랭크의 단일 재료**다(이중 계산 제거). 각 업적의 **진행률(current/target)** 을
// 3개 랭크 축(거리/꾸준함/신발관리)으로 가중 집계해 rank.ts 가 연속 점수를 만든다 →
// 업적을 다 깨지 않아도 달린 만큼 랭크가 매끄럽게 오른다(계단식 아님).
//
// 설계 원칙(사용자 합의):
//   · 거리 = running 카테고리, 꾸준함 = consistency, 신발관리 = shoeManagement+
//     injuryPrevention+retirement. hidden 그룹은 랭크 제외(순수 수집).
//   · 과사용 기준 = 권장수명 **100% 초과**(다 쓰는 건 정상·낭비 아님). 90%는 알림만(여기 무관).
//   · 제거: 로테이션, 연속일수 스트릭(과훈련), 신발 수명 우려먹기(500/1000km).
//   · "제때 교체" = 권장수명 근처에 교체(grade good 이상) 한 신발 수(타이밍 정밀도 구분 없음).
//   · 무휴식 보상 없음 / 돈게이트 최소 / 과사용 보상 없음.
//
// achievements.ts 는 **rank.ts 를 import 하지 않는다**(순환 제거 — rank 가 여기서 집계를 읽음).
// PURE: ctx 불변, NaN/음수/누락 → 0, throw 금지.
// ============================================================================
import {pointsForRarity} from './points';
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

// ── 수치 방어 헬퍼 ─────────────────────────────────────────────────────────────
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function shoeStats(ctx: ProgressionContext): PerShoeStats[] {
  const map = ctx?.perShoe;
  if (!map || typeof map !== 'object') return [];
  return Object.values(map).filter(Boolean);
}
function wearRatio(s: PerShoeStats): number | null {
  const max = nonNeg(s.maxKm);
  if (max <= 0) return null;
  return nonNeg(s.km) / max;
}

/** 과사용(불건강) 기준 = 권장수명 100% 초과. 100% 이하는 건강(다 써도 정상). */
const OVERUSE_RATIO = 1.0;

/** 활성(미은퇴)·수명 알려진 신발 중 과사용 아닌(건강) 수. */
function healthyActiveCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(
    s => !s.retired && nonNeg(s.maxKm) > 0 && (wearRatio(s) ?? 0) <= OVERUSE_RATIO,
  ).length;
}
/** 평가 가능한(활성·수명 알려진) 신발 수. */
function assessedActiveCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(s => !s.retired && nonNeg(s.maxKm) > 0).length;
}

// ── 시간 기반 지표 ─────────────────────────────────────────────────────────────
const DAY_MS = 86400000;
function ymdToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  const ms = new Date(y, m - 1, dd).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}
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
/**
 * 지속가능 습관 테뉴어(일) — 주간 활성도가 유지될 때만 쌓인다. 연속일수(스트릭)가 아니라
 * "여러 주에 걸쳐 규칙적"을 보상한다(휴식 OK). 한 주 빠져도 weeklyActiveRatio 는 거의
 * 안 깎이므로(예: 11/12=0.92) 용서형이다. 활성도가 꾸준히 낮으면 0(쌓이지 않음).
 */
const SUSTAIN_MIN_RATIO = 0.6;
function sustainedHabitDays(ctx: ProgressionContext): number {
  return nonNeg(ctx.weeklyActiveRatio) >= SUSTAIN_MIN_RATIO ? tenureDays(ctx) : 0;
}

// ── 은퇴/교체 타이밍 지표 ───────────────────────────────────────────────────────
function retirementCount(ctx: ProgressionContext): number {
  return nonNeg(ctx?.retirementCount ?? 0);
}
function retirementGrades(ctx: ProgressionContext): RetirementGrade[] {
  const g = ctx?.retirementGrades;
  return Array.isArray(g) ? g.filter(Boolean) : [];
}
/**
 * "제때 교체"한 신발 수 — 권장수명 근처(grade 'standard' 이상, 즉 너무 일찍/너무 늦게가
 * 아닌)에 교체한 은퇴 수. 타이밍 정밀도(좋은/완벽) 구분 없이 하나로 센다.
 * standard = 아주 이른(<70%) 또는 한참 초과(>110%) 교체 → 제때 아님.
 */
function goodTimingRetirementCount(ctx: ProgressionContext): number {
  return retirementGrades(ctx).filter(g => g !== 'standard').length;
}

// ── 거리/페이스 임계 ─────────────────────────────────────────────────────────
const HALF_MARATHON_KM = 21.0975;
const MARATHON_KM = 42.195;
const SPEEDSTER_PACE_SEC = 300;

// ── 진행/언락 일관 팩토리 ──────────────────────────────────────────────────────
function metricAch(opts: {
  key: string;
  name: string;
  category: TitleCategory;
  group: AchievementGroup;
  rarity: RankTier;
  target: number;
  hidden?: boolean;
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

/** Speedster: 5km 이상 단일 런 평균 페이스 ≤5:00/km(이진). */
function isSpeedster(ctx: ProgressionContext): boolean {
  const p = ctx?.bestPace5kSec;
  return typeof p === 'number' && p > 0 && p <= SPEEDSTER_PACE_SEC;
}

// ============================================================================
// 업적 카탈로그 — 거리 / 꾸준함 / 신발관리 + 히든(랭크 제외)
// ============================================================================

// ── 거리: 첫 이정표 + 누적 거리 ─────────────────────────────────────────────────
const FIRST_MILESTONE_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_first_run', name: '첫 걸음', category: 'running', group: 'firstMilestone', rarity: 'bronze', target: 1, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_first_5k', name: '첫 5km', category: 'running', group: 'firstMilestone', rarity: 'bronze', target: 5, value: ctx => nonNeg(ctx.longestRunKm)}),
  metricAch({key: 'ach_first_10k', name: '첫 10km', category: 'running', group: 'firstMilestone', rarity: 'bronze', target: 10, value: ctx => nonNeg(ctx.longestRunKm)}),
  metricAch({key: 'ach_half_marathon', name: '하프 마라톤', category: 'running', group: 'firstMilestone', rarity: 'silver', target: HALF_MARATHON_KM, value: ctx => nonNeg(ctx.longestRunKm)}),
  metricAch({key: 'ach_marathon', name: '마라톤 완주', category: 'running', group: 'firstMilestone', rarity: 'gold', target: MARATHON_KM, value: ctx => nonNeg(ctx.longestRunKm)}),
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

// ── 꾸준함: 누적 러닝 횟수 + 지속가능 습관(스트릭 아님·휴식 OK) ──────────────────
const RUN_COUNT_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_runs_10', name: '10회 러닝', category: 'consistency', group: 'runCount', rarity: 'bronze', target: 10, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_25', name: '25회 러닝', category: 'consistency', group: 'runCount', rarity: 'bronze', target: 25, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_50', name: '50회 러닝', category: 'consistency', group: 'runCount', rarity: 'silver', target: 50, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_century_runs', name: '100회 러닝', category: 'consistency', group: 'runCount', rarity: 'gold', target: 100, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_250', name: '250회 러닝', category: 'consistency', group: 'runCount', rarity: 'platinum', target: 250, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_500', name: '500회 러닝', category: 'consistency', group: 'runCount', rarity: 'diamond', target: 500, value: ctx => nonNeg(ctx.runCount)}),
  metricAch({key: 'ach_runs_1000', name: '1,000회 러닝', category: 'consistency', group: 'runCount', rarity: 'master', target: 1000, value: ctx => nonNeg(ctx.runCount)}),
];

const CONSISTENCY_ACHIEVEMENTS: AchievementDef[] = [
  // 주간 활성 75%(휴식 포함, 연속 아님).
  metricAch({key: 'ach_weekly_habit', name: '습관 형성', category: 'consistency', group: 'consistency', rarity: 'silver', target: 75, value: ctx => Math.round(nonNeg(ctx.weeklyActiveRatio) * 100)}),
  // 지속가능 습관 기간(여러 주 규칙적 유지). 한 주 빠져도 거의 안 깎임(용서형).
  metricAch({key: 'ach_habit_3mo', name: '꾸준한 3개월', category: 'consistency', group: 'consistency', rarity: 'gold', target: 90, value: sustainedHabitDays}),
  metricAch({key: 'ach_habit_6mo', name: '꾸준한 6개월', category: 'consistency', group: 'consistency', rarity: 'platinum', target: 182, value: sustainedHabitDays}),
  metricAch({key: 'ach_habit_1yr', name: '꾸준한 1년', category: 'consistency', group: 'consistency', rarity: 'diamond', target: 365, value: sustainedHabitDays}),
];

// ── 신발관리: 소유(은퇴 포함, 자연 누적) + 은퇴 수 + 건강 유지 ───────────────────
const SHOE_COLLECTION_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_shoe_1', name: '첫 신발', category: 'shoeManagement', group: 'shoeCollection', rarity: 'bronze', target: 1, value: ctx => nonNeg(ctx.registeredShoeCount)}),
  metricAch({key: 'ach_shoe_3', name: '3켤레', category: 'shoeManagement', group: 'shoeCollection', rarity: 'silver', target: 3, value: ctx => nonNeg(ctx.registeredShoeCount)}),
  metricAch({key: 'ach_shoe_5', name: '5켤레', category: 'shoeManagement', group: 'shoeCollection', rarity: 'gold', target: 5, value: ctx => nonNeg(ctx.registeredShoeCount)}),
  metricAch({key: 'ach_shoe_10', name: '10켤레', category: 'shoeManagement', group: 'shoeCollection', rarity: 'platinum', target: 10, value: ctx => nonNeg(ctx.registeredShoeCount)}),
];

const RETIREMENT_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_first_retirement', name: '첫 은퇴', category: 'retirement', group: 'retirement', rarity: 'bronze', target: 1, value: retirementCount}),
  metricAch({key: 'ach_retire_3', name: '3켤레 은퇴', category: 'retirement', group: 'retirement', rarity: 'silver', target: 3, value: retirementCount}),
  metricAch({key: 'ach_retire_5', name: '5켤레 은퇴', category: 'retirement', group: 'retirement', rarity: 'gold', target: 5, value: retirementCount}),
  metricAch({key: 'ach_retire_10', name: '10켤레 은퇴', category: 'retirement', group: 'retirement', rarity: 'diamond', target: 10, value: retirementCount}),
];

const SHOE_CARE_ACHIEVEMENTS: AchievementDef[] = [
  // 건강한 신발장: 평가 가능한 활성 신발 ≥1 이고 전부 과사용(100% 초과) 아님.
  {
    key: 'ach_healthy_closet',
    name: '건강한 신발장',
    category: 'shoeManagement',
    group: 'shoeLife',
    rarity: 'silver',
    points: pointsForRarity('silver'),
    progress: (ctx): AchievementProgress => ({
      current: healthyActiveCount(ctx),
      target: Math.max(assessedActiveCount(ctx), 1),
    }),
    unlocked: ctx => {
      const assessed = assessedActiveCount(ctx);
      return assessed >= 1 && healthyActiveCount(ctx) === assessed;
    },
  },
];

// ── 히든(랭크 제외 — 순수 수집) ─────────────────────────────────────────────────
// 컴백 = 쉬고 돌아옴 보상(브랜드 정합). 제때 교체(타이밍) = 보너스 배지(느리고 가혹해
// 랭크 게이트로는 안 씀). early/night 는 run_date 시각 없으면 미언락(앱 로컬 판정).
const HIDDEN_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({key: 'ach_hidden_early_bird', name: '얼리버드', category: 'running', group: 'hidden', rarity: 'gold', target: 20, hidden: true, value: ctx => nonNeg(ctx.earlyRunCount)}),
  metricAch({key: 'ach_hidden_night_runner', name: '나이트 러너', category: 'running', group: 'hidden', rarity: 'gold', target: 20, hidden: true, value: ctx => nonNeg(ctx.nightRunCount)}),
  metricAch({key: 'ach_hidden_comeback', name: '컴백 러너', category: 'consistency', group: 'hidden', rarity: 'silver', target: 30, hidden: true, value: ctx => nonNeg(ctx.longestGapDays)}),
  metricAch({key: 'ach_hidden_long_relationship', name: '오랜 동반자', category: 'shoeManagement', group: 'hidden', rarity: 'platinum', target: 365, hidden: true, value: maxActiveShoeAgeDays}),
  // 제때 교체(타이밍) — 보너스 배지(히든·랭크 제외).
  metricAch({key: 'ach_good_timing_1', name: '제때 교체', category: 'injuryPrevention', group: 'hidden', rarity: 'silver', target: 1, hidden: true, value: goodTimingRetirementCount}),
  metricAch({key: 'ach_good_timing_3', name: '제때 교체 ×3', category: 'injuryPrevention', group: 'hidden', rarity: 'gold', target: 3, hidden: true, value: goodTimingRetirementCount}),
  metricAch({key: 'ach_good_timing_5', name: '제때 교체 ×5', category: 'injuryPrevention', group: 'hidden', rarity: 'platinum', target: 5, hidden: true, value: goodTimingRetirementCount}),
];

/** 전체 업적 카탈로그(권위·불변). 그룹 순서대로 평탄화. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...FIRST_MILESTONE_ACHIEVEMENTS,
  ...DISTANCE_ACHIEVEMENTS,
  ...RUN_COUNT_ACHIEVEMENTS,
  ...CONSISTENCY_ACHIEVEMENTS,
  ...SHOE_COLLECTION_ACHIEVEMENTS,
  ...RETIREMENT_ACHIEVEMENTS,
  ...SHOE_CARE_ACHIEVEMENTS,
  ...HIDDEN_ACHIEVEMENTS,
];

/** key → AchievementDef 조회 맵(O(1)). */
export const ACHIEVEMENTS_BY_KEY: Readonly<Record<string, AchievementDef>> =
  ACHIEVEMENTS.reduce((acc, def) => {
    acc[def.key] = def;
    return acc;
  }, {} as Record<string, AchievementDef>);

/**
 * 업적 → 관련 타이틀 매핑. 값(타이틀 키)은 titles.ts 카탈로그에 실재해야 한다.
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
  ach_shoe_5: 'shoe_rotation_runner',
  ach_shoe_10: 'shoe_collector',
  ach_first_retirement: 'retire_starter',
  ach_retire_10: 'retire_hall',
};

export function achievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENTS_BY_KEY[key];
}

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

export function unlockedAchievements(ctx: ProgressionContext): AchievementDef[] {
  if (!ctx || typeof ctx !== 'object') return [];
  const out: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    let ok = false;
    try {
      ok = def.unlocked(ctx) === true;
    } catch {
      ok = false;
    }
    if (ok) out.push(def);
  }
  return out;
}

export function evaluateAchievements(ctx: ProgressionContext): string[] {
  return unlockedAchievements(ctx).map(d => d.key);
}

// ============================================================================
// 랭크 축 집계 — 업적 진행률을 3축으로 가중 합산(rank.ts 가 소비). 연속(계단 아님).
// ============================================================================

/** 랭크 축 키(3축). */
export type RankAxisKey = 'running' | 'consistency' | 'shoeManagement';

/** 업적 → 랭크 축 매핑. hidden 그룹은 랭크 제외(null). */
function axisOf(def: AchievementDef): RankAxisKey | null {
  if (def.group === 'hidden') return null;
  switch (def.category) {
    case 'running':
      return 'running';
    case 'consistency':
      return 'consistency';
    case 'shoeManagement':
    case 'injuryPrevention':
    case 'retirement':
      return 'shoeManagement';
    default:
      return null;
  }
}

/** 한 업적의 진행 분율(0..1) — 연속 상승의 기본 단위. */
function progressFraction(def: AchievementDef, ctx: ProgressionContext): number {
  const p = achievementProgress(def, ctx);
  if (p.target > 0) return Math.min(1, p.current / p.target);
  // target 0(이진 등) → 언락 여부.
  try {
    return def.unlocked(ctx) ? 1 : 0;
  } catch {
    return 0;
  }
}

/**
 * 3개 랭크 축 진행도(각 0..1). 축 = 그 축에 속한 (히든 제외) 업적들의 **진행률 가중합** ÷
 * 그 축 전체 포인트. 업적을 다 안 깨도 진행률만큼 연속으로 차오른다.
 * PURE: ctx 불변, 누락/비정상 → 0.
 */
export function axisProgress(
  ctx: ProgressionContext,
): Record<RankAxisKey, number> {
  const earned: Record<RankAxisKey, number> = {running: 0, consistency: 0, shoeManagement: 0};
  const total: Record<RankAxisKey, number> = {running: 0, consistency: 0, shoeManagement: 0};
  if (!ctx || typeof ctx !== 'object') return earned;
  for (const def of ACHIEVEMENTS) {
    const ax = axisOf(def);
    if (!ax) continue;
    const pts = nonNeg(def.points);
    if (pts <= 0) continue;
    total[ax] += pts;
    earned[ax] += pts * progressFraction(def, ctx);
  }
  return {
    running: total.running > 0 ? earned.running / total.running : 0,
    consistency: total.consistency > 0 ? earned.consistency / total.consistency : 0,
    shoeManagement: total.shoeManagement > 0 ? earned.shoeManagement / total.shoeManagement : 0,
  };
}
