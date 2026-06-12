// ============================================================================
// lib/progression/achievements.ts — 업적 카탈로그 + 헬퍼 (Slice A)
// ============================================================================
// 5개 필러(Running·Consistency·Rotation·ShoeManagement·InjuryPrevention) 전반의 업적
// **단일 정의 출처**. 타이틀과 달리 업적은 **항상 보이는
// 진행률(progress: current/target)** 을 노출한다 — 예: "Trusted Partner 348/500km".
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
/** Long Run Specialist: 단일 최장 런. */
const LONG_RUN_KM = 25;
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
  rarity: RankTier;
  target: number;
  /** 현재 달성 지표(단조 증가, 비음수). */
  value: (ctx: ProgressionContext) => number;
}): AchievementDef {
  const {key, name, category, rarity, target} = opts;
  return {
    key,
    name,
    category,
    rarity,
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

// ── Running: 누적/단일 거리 마일스톤 ───────────────────────────────────────────
const RUNNING_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({
    key: 'ach_first_run',
    name: 'First Steps',
    category: 'running',
    rarity: 'bronze',
    target: 1,
    value: ctx => nonNeg(ctx.runCount),
  }),
  metricAch({
    key: 'ach_half_marathon',
    name: 'Half Marathon',
    category: 'running',
    rarity: 'silver',
    target: HALF_MARATHON_KM,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  // anti-scenario 1: ≥42km 런이 없으면 절대 언락되지 않는 "Marathon" 하이라이트.
  metricAch({
    key: 'ach_marathon',
    name: 'Marathon Finisher',
    category: 'running',
    rarity: 'gold',
    target: MARATHON_KM,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'ach_distance_1000',
    name: '1000km Journey',
    category: 'running',
    rarity: 'platinum',
    target: 1000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'ach_distance_5000',
    name: '5000km Odyssey',
    category: 'running',
    rarity: 'diamond',
    target: 5000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  // 단일 최장 런(장거리 능력) — 구 trainingStyle 에서 running 으로 이전.
  metricAch({
    key: 'ach_long_run_25',
    name: 'Long Run Specialist',
    category: 'running',
    rarity: 'gold',
    target: LONG_RUN_KM,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  // Speedster: 5km 이상 단일 런에서 평균 ≤5:00/km 한 번 — 구 trainingStyle 에서 running 으로 이전.
  // 페이스는 낮을수록 좋아 단조 진행으로 표현 불가 → 이진 진행(미충족 0 / 충족 1). 정직 판정만 유지.
  {
    key: 'ach_speedster',
    name: 'Speedster',
    category: 'running',
    rarity: 'gold',
    points: pointsForRarity('gold'),
    progress: (ctx): AchievementProgress => ({
      current: isSpeedster(ctx) ? 1 : 0,
      target: 1,
    }),
    unlocked: isSpeedster,
  },
];

// ── Consistency: 스트릭/주간 습관 ──────────────────────────────────────────────
const CONSISTENCY_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({
    key: 'ach_streak_7',
    name: 'Week Warrior',
    category: 'consistency',
    rarity: 'silver',
    target: 7,
    value: ctx => nonNeg(ctx.longestStreak),
  }),
  metricAch({
    key: 'ach_streak_30',
    name: 'Unbreakable',
    category: 'consistency',
    rarity: 'gold',
    target: 30,
    value: ctx => nonNeg(ctx.longestStreak),
  }),
  metricAch({
    key: 'ach_streak_100',
    name: 'Centurion Streak',
    category: 'consistency',
    rarity: 'diamond',
    target: 100,
    value: ctx => nonNeg(ctx.longestStreak),
  }),
  // 주간 활성 75% — 진행은 백분율 포인트(0..75).
  metricAch({
    key: 'ach_weekly_habit',
    name: 'Habit Formed',
    category: 'consistency',
    rarity: 'silver',
    target: 75,
    value: ctx => Math.round(nonNeg(ctx.weeklyActiveRatio) * 100),
  }),
  // 누적 100회 러닝(볼륨·꾸준함) — 구 trainingStyle 에서 consistency 로 이전.
  metricAch({
    key: 'ach_century_runs',
    name: 'Century of Runs',
    category: 'consistency',
    rarity: 'platinum',
    target: 100,
    value: ctx => nonNeg(ctx.runCount),
  }),
];

// ── Rotation: 사용 켤레 수 + 균형 ──────────────────────────────────────────────
const ROTATION_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({
    key: 'ach_rotation_3',
    name: "Three's Company",
    category: 'rotation',
    rarity: 'silver',
    target: 3,
    value: shoesUsedCount,
  }),
  metricAch({
    key: 'ach_rotation_5',
    name: 'Rotation Maestro',
    category: 'rotation',
    rarity: 'gold',
    target: 5,
    value: shoesUsedCount,
  }),
  // 사용량 균형(엔트로피) ≥0.8 — 진행은 백분율 포인트(0..80). 평가축 권위=rank.ts.
  metricAch({
    key: 'ach_rotation_balance',
    name: 'Perfect Balance',
    category: 'rotation',
    rarity: 'platinum',
    target: 80,
    value: ctx => Math.round(rotationPillar(ctx) * 100),
  }),
];

// ── ShoeManagement: 한 켤레와의 관계 + 컬렉션 ──────────────────────────────────
const SHOE_ACHIEVEMENTS: AchievementDef[] = [
  // ★ 사용자 명시 예시: "Trusted Partner 348/500km" — 한 켤레로 500km.
  metricAch({
    key: 'ach_trusted_partner',
    name: 'Trusted Partner',
    category: 'shoeManagement',
    rarity: 'gold',
    target: TRUSTED_PARTNER_KM,
    value: maxSingleShoeKm,
  }),
  metricAch({
    key: 'ach_long_haul',
    name: 'Long Haul',
    category: 'shoeManagement',
    rarity: 'diamond',
    target: LONG_HAUL_KM,
    value: maxSingleShoeKm,
  }),
  metricAch({
    key: 'ach_collection_5',
    name: 'Shoe Curator',
    category: 'shoeManagement',
    rarity: 'silver',
    target: 5,
    value: ctx => nonNeg(ctx.registeredShoeCount),
  }),
  metricAch({
    key: 'ach_collection_10',
    name: 'Shoe Connoisseur',
    category: 'shoeManagement',
    rarity: 'gold',
    target: 10,
    value: ctx => nonNeg(ctx.registeredShoeCount),
  }),
];

// ── InjuryPrevention: 조기 교체 + 건강 유지 ────────────────────────────────────
const INJURY_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({
    key: 'ach_smart_swap',
    name: 'Smart Swap',
    category: 'injuryPrevention',
    rarity: 'silver',
    target: 1,
    value: earlyReplacementCount,
  }),
  metricAch({
    key: 'ach_health_guardian',
    name: 'Health Guardian',
    category: 'injuryPrevention',
    rarity: 'gold',
    target: 3,
    value: earlyReplacementCount,
  }),
  // Clean Rotation: 평가 가능한 활성 신발 ≥2 이고 **전부** 건강(초과 없음).
  // metricAch 로는 "전부 건강" 조건을 못 담으므로 별도 정의. 진행바는 건강한/전체(healthy/total)
  // 로 읽혀, 평가 신발 중 하나라도 overdue 면 절대 가득 차지 않는다(target=assessed). 따라서
  // current===target ⟺ unlocked 가 **정의상** 성립한다(metricAch 와 동일 불변 — 진행바·언락 모순 불가).
  // target 은 최소 2(로테이션 성립 조건) 로 깔아 신발<2 일 때도 가득 참=언락 모순을 막는다.
  {
    key: 'ach_clean_rotation',
    name: 'Clean Rotation',
    category: 'injuryPrevention',
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
];

// ── Retirement: Hall of Shoes 은퇴 수 + 등급 품질(progression_v1.retiredShoes) ──
// 카운트형(First Retirement/Shoe Curator/Hall of Shoes)은 metricAch 로 진행바·언락이
// 정의상 일치한다. 등급형(Smart Replacement/Perfect Timing)은 "해당 등급 은퇴가 ≥1"
// 이라는 이진 조건을 target=1 카운트로 표현 — 진행바는 0/1↔1/1 로 언락과 일치한다.
const RETIREMENT_ACHIEVEMENTS: AchievementDef[] = [
  metricAch({
    key: 'ach_first_retirement',
    name: 'First Retirement',
    category: 'retirement',
    rarity: 'bronze',
    target: 1,
    value: retirementCount,
  }),
  metricAch({
    key: 'ach_retire_5',
    name: 'Shoe Curator',
    category: 'retirement',
    rarity: 'silver',
    target: 5,
    value: retirementCount,
  }),
  metricAch({
    key: 'ach_retire_10',
    name: 'Hall of Shoes',
    category: 'retirement',
    rarity: 'gold',
    target: 10,
    value: retirementCount,
  }),
  // Smart Replacement: 한 번이라도 smart 이상 등급으로 교체(perfect/hallOfFame 포함).
  metricAch({
    key: 'ach_smart_replacement',
    name: 'Smart Replacement',
    category: 'retirement',
    rarity: 'silver',
    target: 1,
    value: smartOrBetterRetirementCount,
  }),
  // Perfect Timing: 한 번이라도 perfect(이상) 등급으로 교체(hallOfFame 포함).
  metricAch({
    key: 'ach_perfect_timing',
    name: 'Perfect Timing',
    category: 'retirement',
    rarity: 'gold',
    target: 1,
    value: perfectRetirementCount,
  }),
];

/**
 * 전체 업적 카탈로그(권위·불변). 필러 순서대로 평탄화한다.
 * 갤러리/엔진은 이 배열만 소비한다(분산 정의 금지).
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...RUNNING_ACHIEVEMENTS,
  ...CONSISTENCY_ACHIEVEMENTS,
  ...ROTATION_ACHIEVEMENTS,
  ...SHOE_ACHIEVEMENTS,
  ...INJURY_ACHIEVEMENTS,
  ...RETIREMENT_ACHIEVEMENTS,
];

/** key → AchievementDef 조회 맵(O(1)). */
export const ACHIEVEMENTS_BY_KEY: Readonly<Record<string, AchievementDef>> =
  ACHIEVEMENTS.reduce((acc, def) => {
    acc[def.key] = def;
    return acc;
  }, {} as Record<string, AchievementDef>);

/**
 * 업적 → 관련 타이틀 매핑(업적 달성이 타이틀 획득에 기여). 엔진(slice-a-engine)이
 * 언락된 업적의 관련 타이틀을 함께 표면화하는 데 쓴다. 모든 업적이 타이틀을 갖진 않는다.
 * 값(타이틀 키)은 titles.ts 카탈로그에 실재해야 한다(분산 정의가 아닌 단순 참조 링크).
 */
export const ACHIEVEMENT_UNLOCKS_TITLE: Readonly<Record<string, string>> = {
  ach_collection_5: 'shoe_rotation_runner',
  ach_collection_10: 'shoe_collector',
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
