// ============================================================================
// lib/progression/achievements.ts — KEEGO 업적 카탈로그 (재설계)
// ============================================================================
// 업적 = 러너의 정체성. 6개 카테고리 × 총 ~5,460 XP(레전드 5,000 XP).
//
//   1. runningMilestone  — 단일 런 이정표(첫 5km ~ 마라톤)                 730 XP max
//   2. distanceMilestone — 누적 거리(100 → 10,000km)                     1,070 XP max
//   3. shoeJourney       — 신발 소유 · 은퇴(첫 신발 ~ 명예의 전당)          1,690 XP max
//   4. shoeMemory        — 신발과의 동행(켤레마다 반복 적립, 10켤레 기준)   1,700 XP max
//   5. experience        — 특별 경험(트레일·새벽·야간·계절)                   200 XP max
//   6. keego             — Keep Going 철학(오랜 동반자)                      100 XP max
//
// 설계 원칙:
//   · RPG 아님 — 보상이 아닌 기억. "memories, not rewards."
//   · rain_run / trail_run: 카탈로그에 있되 지금은 항상 unlocked=false(데이터 없음).
//   · shoeMemory는 켤레마다 반복 적립(repeatablePerShoe=true) — earnedCount × xp.
//   · PURE: ctx 불변, throw 금지, NaN/음수/누락 → 0.
// ============================================================================
import {
  AchievementDef,
  AchievementProgress,
  PerShoeStats,
  ProgressionContext,
} from './types';

// ── 수치 방어 헬퍼 ──────────────────────────────────────────────────────────────
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function shoeList(ctx: ProgressionContext): PerShoeStats[] {
  const map = ctx?.perShoe;
  if (!map || typeof map !== 'object') return [];
  return Object.values(map).filter(Boolean);
}

// ── 날짜 파싱 ──────────────────────────────────────────────────────────────────
const DAY_MS = 86400000;
function ymdToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  const ms = new Date(y, m - 1, dd).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

// ── 신발별 km 집계 ─────────────────────────────────────────────────────────────
/** 모든 신발(은퇴 포함) 중 누적 km ≥ minKm 인 신발 수. */
function shoesOverKm(ctx: ProgressionContext, minKm: number): number {
  return shoeList(ctx).filter(s => nonNeg(s.km) >= minKm).length;
}

/** 모든 신발의 km 중 최댓값(진행 바용). */
function maxShoeKm(ctx: ProgressionContext): number {
  return shoeList(ctx).reduce((m, s) => Math.max(m, nonNeg(s.km)), 0);
}

// ── 신발 여정 일수 ─────────────────────────────────────────────────────────────
/** 어떤 신발이든(은퇴 포함) firstWorn→lastWorn(또는 now) 중 가장 긴 일수. */
function longestShoeJourneyDays(ctx: ProgressionContext): number {
  const now = Number.isFinite(ctx.now) ? ctx.now : 0;
  let max = 0;
  for (const s of shoeList(ctx)) {
    if (!s.firstWorn) continue;
    const start = ymdToMs(s.firstWorn);
    if (!Number.isFinite(start)) continue;
    const end = s.lastWorn ? ymdToMs(s.lastWorn) : now;
    const days = Math.max(0, Math.floor(((!Number.isFinite(end) ? now : end) - start) / DAY_MS));
    if (days > max) max = days;
  }
  return max;
}

// ── 은퇴 집계 ──────────────────────────────────────────────────────────────────
function retirementCount(ctx: ProgressionContext): number {
  return nonNeg(ctx?.retirementCount ?? 0);
}

// ── 팩토리 헬퍼 ────────────────────────────────────────────────────────────────
type MetricOpts = {
  key: string;
  name: string;
  description: string;
  category: AchievementDef['category'];
  rarity: AchievementDef['rarity'];
  xp: number;
  target: number;
  hidden?: boolean;
  signature?: boolean;
  value: (ctx: ProgressionContext) => number;
};

function metricAch(opts: MetricOpts): AchievementDef {
  const {key, name, description, category, rarity, xp, target, hidden, signature} = opts;
  return {
    key, name, description, category, rarity, xp, hidden, signature,
    progress: ctx => {
      const cur = nonNeg(opts.value(ctx));
      return {current: Math.min(cur, target), target};
    },
    unlocked: ctx => nonNeg(opts.value(ctx)) >= target,
  };
}

type RepeatableOpts = {
  key: string;
  name: string;
  description: string;
  category: AchievementDef['category'];
  rarity: AchievementDef['rarity'];
  xp: number;
  kmThreshold: number;
  signature?: boolean;
};

function repeatableShoeAch(opts: RepeatableOpts): AchievementDef {
  const {key, name, description, category, rarity, xp, kmThreshold, signature} = opts;
  return {
    key, name, description, category, rarity, xp, signature,
    repeatablePerShoe: true,
    progress: ctx => {
      const count = shoesOverKm(ctx, kmThreshold);
      if (count > 0) return {current: count, target: count};
      const best = Math.min(maxShoeKm(ctx), kmThreshold);
      return {current: best, target: kmThreshold};
    },
    unlocked: ctx => shoesOverKm(ctx, kmThreshold) >= 1,
    earnedCount: ctx => shoesOverKm(ctx, kmThreshold),
  };
}

// ============================================================================
// 카테고리 1: runningMilestone — 단일 런 이정표
// ============================================================================
const HALF_MARATHON_KM = 21.0975;
const MARATHON_KM = 42.195;

const RUNNING_MILESTONE: AchievementDef[] = [
  metricAch({
    key: 'first_run', name: '첫 걸음', rarity: 'common', xp: 10,
    description: '러닝 앱을 깔고 첫 런을 기록한 날.',
    category: 'runningMilestone', target: 1,
    value: ctx => nonNeg(ctx.runCount),
  }),
  metricAch({
    key: 'first_5k', name: '첫 5km', rarity: 'common', xp: 20,
    description: '5km를 한 번에 완주한 날.',
    category: 'runningMilestone', target: 5,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_10k', name: '첫 10km', rarity: 'rare', xp: 40,
    description: '10km를 쉬지 않고 달린 날.',
    category: 'runningMilestone', target: 10,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_20k', name: '첫 20km', rarity: 'rare', xp: 60,
    description: '20km 이상 달린 날. 하프가 보인다.',
    category: 'runningMilestone', target: 20,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_half', name: '하프마라톤', rarity: 'epic', xp: 200,
    description: '21.0975km 완주. 당신은 진짜 러너.',
    category: 'runningMilestone', target: HALF_MARATHON_KM,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_marathon', name: '마라톤 완주', rarity: 'legendary', xp: 400,
    description: '42.195km. 달릴 수 있다는 걸 증명한 날.',
    category: 'runningMilestone', target: MARATHON_KM,
    value: ctx => nonNeg(ctx.longestRunKm),
    signature: true,
  }),
];

// ============================================================================
// 카테고리 2: distanceMilestone — 누적 거리
// ============================================================================
const DISTANCE_MILESTONE: AchievementDef[] = [
  metricAch({
    key: 'dist_100', name: '100km', rarity: 'common', xp: 20,
    description: '첫 100km. 이제 시작이다.',
    category: 'distanceMilestone', target: 100,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_500', name: '500km', rarity: 'rare', xp: 50,
    description: '서울에서 부산까지의 거리.',
    category: 'distanceMilestone', target: 500,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_1000', name: '1,000km', rarity: 'rare', xp: 100,
    description: '1,000km. 꾸준함이 쌓인 증거.',
    category: 'distanceMilestone', target: 1000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_3000', name: '3,000km', rarity: 'epic', xp: 150,
    description: '한국을 두 바퀴 돌았다.',
    category: 'distanceMilestone', target: 3000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_5000', name: '5,000km', rarity: 'epic', xp: 250,
    description: '서울에서 뉴욕. 달리기 하나로.',
    category: 'distanceMilestone', target: 5000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_10000', name: '10,000km', rarity: 'legendary', xp: 500,
    description: '지구 4분의 1 바퀴. 전설이다.',
    category: 'distanceMilestone', target: 10000,
    value: ctx => nonNeg(ctx.cumulativeKm),
    signature: true,
  }),
];

// ============================================================================
// 카테고리 3: shoeJourney — 신발 소유 · 은퇴
// ============================================================================
const SHOE_JOURNEY: AchievementDef[] = [
  metricAch({
    key: 'shoe_1', name: '첫 신발', rarity: 'common', xp: 10,
    description: '러닝화를 처음 등록한 날.',
    category: 'shoeJourney', target: 1,
    value: ctx => nonNeg(ctx.registeredShoeCount),
  }),
  metricAch({
    key: 'shoe_3', name: '3켤레', rarity: 'rare', xp: 30,
    description: '러닝화 3켤레. 진지하게 달리고 있다.',
    category: 'shoeJourney', target: 3,
    value: ctx => nonNeg(ctx.registeredShoeCount),
  }),
  metricAch({
    key: 'shoe_5', name: '5켤레', rarity: 'rare', xp: 50,
    description: '신발장에 5켤레. 진정한 러닝 마니아.',
    category: 'shoeJourney', target: 5,
    value: ctx => nonNeg(ctx.registeredShoeCount),
  }),
  metricAch({
    key: 'shoe_10', name: '10켤레', rarity: 'epic', xp: 100,
    description: '10켤레 이상 등록. 신발 컬렉터의 경지.',
    category: 'shoeJourney', target: 10,
    value: ctx => nonNeg(ctx.registeredShoeCount),
  }),
  metricAch({
    key: 'retire_1', name: '첫 번째 은퇴', rarity: 'epic', xp: 150,
    description: '신발 한 켤레와의 여정을 마무리했다.',
    category: 'shoeJourney', target: 1,
    value: retirementCount,
    signature: true,
  }),
  metricAch({
    key: 'retire_3', name: '3켤레 은퇴', rarity: 'epic', xp: 250,
    description: '세 켤레와의 추억. 제때 쉬게 해줬다.',
    category: 'shoeJourney', target: 3,
    value: retirementCount,
  }),
  metricAch({
    key: 'retire_5', name: '5켤레 은퇴', rarity: 'legendary', xp: 400,
    description: '다섯 켤레를 책임 있게 보내줬다.',
    category: 'shoeJourney', target: 5,
    value: retirementCount,
  }),
  metricAch({
    key: 'retire_10', name: '신발 명예의 전당', rarity: 'legendary', xp: 700,
    description: '10켤레와 함께 달렸다. 부상 없는 러닝의 비결.',
    category: 'shoeJourney', target: 10,
    value: retirementCount,
    signature: true,
  }),
];

// ============================================================================
// 카테고리 4: shoeMemory — 신발과의 동행(켤레마다 반복 적립)
// ============================================================================
const SHOE_MEMORY: AchievementDef[] = [
  repeatableShoeAch({
    key: 'together_100', name: '함께 100km', rarity: 'common', xp: 20,
    description: '이 신발과 100km를 달렸다. 첫 번째 이정표.',
    category: 'shoeMemory', kmThreshold: 100,
  }),
  repeatableShoeAch({
    key: 'together_300', name: '함께 300km', rarity: 'rare', xp: 50,
    description: '300km. 이 신발이 얼마나 고마운지 안다.',
    category: 'shoeMemory', kmThreshold: 300,
  }),
  repeatableShoeAch({
    key: 'together_500', name: '함께 500km', rarity: 'epic', xp: 100,
    description: '500km를 함께 달렸다. 이 신발과의 기억.',
    category: 'shoeMemory', kmThreshold: 500,
    signature: true,
  }),
];

// ============================================================================
// 카테고리 5: experience — 특별 경험
// ============================================================================
const EXPERIENCE: AchievementDef[] = [
  // trail_run: 데이터 없음 → 항상 잠금. 추후 surface 연동 시 활성화.
  {
    key: 'trail_run', name: '트레일 런', rarity: 'rare', xp: 50,
    description: '오프로드를 달렸다. 자연과 함께한 런.',
    category: 'experience',
    hidden: false,
    progress: () => ({current: 0, target: 1}),
    unlocked: () => false,
  },
  {
    key: 'night_run', name: '나이트 런', rarity: 'rare', xp: 30,
    description: '밤 10시 이후, 도시의 고요함 속에서 달렸다.',
    category: 'experience',
    progress: ctx => ({current: Math.min(nonNeg(ctx.nightRunCount), 1), target: 1}),
    unlocked: ctx => nonNeg(ctx.nightRunCount) >= 1,
  },
  // rain_run: 날씨 API 없음 → 항상 잠금.
  {
    key: 'rain_run', name: '빗속 런', rarity: 'rare', xp: 30,
    description: '비 오는 날도 포기하지 않았다.',
    category: 'experience',
    hidden: false,
    progress: () => ({current: 0, target: 1}),
    unlocked: () => false,
  },
  {
    key: 'sunrise_run', name: '일출 런', rarity: 'rare', xp: 30,
    description: '새벽 5시 전, 해가 뜨기 전에 달렸다.',
    category: 'experience',
    progress: ctx => ({current: Math.min(nonNeg(ctx.earlyRunCount), 1), target: 1}),
    unlocked: ctx => nonNeg(ctx.earlyRunCount) >= 1,
  },
  {
    key: 'winter_run', name: '겨울 런', rarity: 'rare', xp: 30,
    description: '추운 겨울에도 달렸다. 그것만으로도 충분하다.',
    category: 'experience',
    progress: ctx => ({current: ctx.hasWinterRun ? 1 : 0, target: 1}),
    unlocked: ctx => ctx.hasWinterRun === true,
  },
  {
    key: 'summer_run', name: '여름 런', rarity: 'rare', xp: 30,
    description: '뜨거운 여름에도 달렸다. 땀은 성실함의 증거.',
    category: 'experience',
    progress: ctx => ({current: ctx.hasSummerRun ? 1 : 0, target: 1}),
    unlocked: ctx => ctx.hasSummerRun === true,
  },
];

// ============================================================================
// 카테고리 5b: challenges — 챌린지 달성
// ============================================================================
const CHALLENGES: AchievementDef[] = [
  metricAch({
    key: 'challenge_starter', name: '첫 챌린지 달성', rarity: 'common', xp: 30,
    description: '스스로 세운 챌린지를 처음 완수한 날.',
    category: 'experience', target: 1,
    value: ctx => nonNeg(ctx.completedChallengeCount),
  }),
  metricAch({
    key: 'challenge_dedicated', name: '챌린지 집착', rarity: 'rare', xp: 60,
    description: '챌린지 3개를 완수했다. 목표 달성의 맛을 알았다.',
    category: 'experience', target: 3,
    value: ctx => nonNeg(ctx.completedChallengeCount),
  }),
  metricAch({
    key: 'challenge_master', name: '챌린지 마스터', rarity: 'epic', xp: 100,
    description: '챌린지 10개 완수. 설정하고, 달리고, 달성한다.',
    category: 'experience', target: 10,
    value: ctx => nonNeg(ctx.completedChallengeCount),
  }),
];

// ============================================================================
// 카테고리 6: keego — Keep Going 철학
// ============================================================================
const KEEGO: AchievementDef[] = [
  {
    key: 'longtime_partner', name: '오랜 동반자', rarity: 'epic', xp: 100,
    description: '한 켤레와 1년 이상 함께 달렸다. 그것이 Keep Going.',
    category: 'keego',
    signature: true,
    progress: ctx => ({
      current: Math.min(longestShoeJourneyDays(ctx), 365),
      target: 365,
    }),
    unlocked: ctx => longestShoeJourneyDays(ctx) >= 365,
  },
];

// ── 전체 카탈로그 ──────────────────────────────────────────────────────────────

/** 전체 업적 카탈로그(권위·불변). 카테고리 순서대로 평탄화. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...RUNNING_MILESTONE,
  ...DISTANCE_MILESTONE,
  ...SHOE_JOURNEY,
  ...SHOE_MEMORY,
  ...EXPERIENCE,
  ...CHALLENGES,
  ...KEEGO,
];

/** key → AchievementDef 조회 맵(O(1)). */
export const ACHIEVEMENTS_BY_KEY: Readonly<Record<string, AchievementDef>> =
  ACHIEVEMENTS.reduce(
    (acc, def) => {
      acc[def.key] = def;
      return acc;
    },
    {} as Record<string, AchievementDef>,
  );

// ── XP 계산 ────────────────────────────────────────────────────────────────────

/** 한 업적의 실제 적립 XP(반복형이면 earnedCount × xp). */
export function earnedXpFor(def: AchievementDef, ctx: ProgressionContext): number {
  try {
    if (!def.unlocked(ctx)) return 0;
    if (def.repeatablePerShoe && def.earnedCount) {
      return def.xp * Math.max(0, def.earnedCount(ctx));
    }
    return def.xp;
  } catch {
    return 0;
  }
}

/**
 * 현재 컨텍스트의 총 적립 XP.
 * context.ts 2-pass 에서 호출(baseCtx → achievementPoints).
 * PURE: throw 금지.
 */
export function computeTotalXp(ctx: ProgressionContext): number {
  if (!ctx || typeof ctx !== 'object') return 0;
  let total = 0;
  for (const def of ACHIEVEMENTS) {
    total += earnedXpFor(def, ctx);
  }
  return total;
}

// ── 헬퍼 함수 ─────────────────────────────────────────────────────────────────

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
