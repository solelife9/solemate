// ============================================================================
// lib/progression/achievements.ts — KEEGO 업적 카탈로그 (재설계)
// ============================================================================
// 업적 = 러너의 정체성. 7개 카테고리 × 총 ~5,920 XP(레전드 5,000 XP, 10켤레 기준).
//
//   1. runningMilestone  — 단일 런 이정표(첫 5km ~ 마라톤)                 730 XP max
//   2. distanceMilestone — 누적 거리(100 → 10,000km, 7단계)             1,370 XP max
//   2b. consistency      — 꾸준함(주간 리듬 단일 사다리 2→52주)             470 XP max
//   3. shoeJourney       — 신발 소유 · 은퇴(첫 신발 ~ 명예의 전당)          1,690 XP max
//   4. shoeMemory        — 신발과의 동행(켤레마다 반복 적립, 10켤레 기준)   1,700 XP max
//   5. experience        — 특별 경험(야간·새벽·계절) + 챌린지                 250 XP max
//   6. keego             — Keep Going 철학(잘 보내주었다·킵고잉 1년·온전한 하루) 240 XP max
//
// 설계 원칙:
//   · RPG 아님 — 보상이 아닌 기억. "memories, not rewards."
//   · 영원히 잠긴 업적은 노출하지 않는다(trail/rain 은 데이터 생기면 재도입).
//   · 인센티브는 안전 권고와 정렬 — 동행 상위 단계는 절대 km 아닌 수명 비율(90%=교체
//     권장 시점)이라, 죽은 신발로 달려야 따지는 업적이 없다.
//   · shoeMemory는 켤레마다 반복 적립(repeatablePerShoe=true) — earnedCount × xp.
//   · PURE: ctx 불변, throw 금지, NaN/음수/누락 → 0.
// ============================================================================
import {
  AchievementDef,
  AchievementProgress,
  PerShoeStats,
  ProgressionContext,
} from './types';
import {isSmartOrBetter} from './retirementGrade';
// 수명 기반 동행 업적(journey_half/full)의 maxKm 미상 폴백 — 카테고리 기본 수명의
// 단일 소스(data/shoeModels)와 정렬(데일리 650).
import {DEFAULT_LIFESPAN_KM} from '../../data/shoeModels';

// ── 수치 방어 헬퍼 ──────────────────────────────────────────────────────────────
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function shoeList(ctx: ProgressionContext): PerShoeStats[] {
  const map = ctx?.perShoe;
  if (!map || typeof map !== 'object') return [];
  return Object.values(map).filter(Boolean);
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
  progressPrefix?: string;
  value: (ctx: ProgressionContext) => number;
};

function metricAch(opts: MetricOpts): AchievementDef {
  const {key, name, description, category, rarity, xp, target, hidden, signature, progressPrefix} = opts;
  return {
    key, name, description, category, rarity, xp, hidden, signature, progressPrefix,
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
    description: 'Keego와 함께한 첫 런.',
    category: 'runningMilestone', target: 1,
    value: ctx => nonNeg(ctx.runCount),
  }),
  metricAch({
    key: 'first_5k', name: '첫 5km', rarity: 'common', xp: 20,
    progressPrefix: '최장 런',
    description: '5km를 한 번에 완주한 날.',
    category: 'runningMilestone', target: 5,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_10k', name: '첫 10km', rarity: 'rare', xp: 40,
    progressPrefix: '최장 런',
    description: '10km를 쉬지 않고 달린 날.',
    category: 'runningMilestone', target: 10,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_20k', name: '첫 20km', rarity: 'rare', xp: 60,
    progressPrefix: '최장 런',
    description: '한 번에 20km를 달린 날. 하프가 보인다.',
    category: 'runningMilestone', target: 20,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_half', name: '하프마라톤', rarity: 'epic', xp: 200,
    progressPrefix: '최장 런',
    description: '한 번에 21.0975km. 당신은 진짜 러너.',
    category: 'runningMilestone', target: HALF_MARATHON_KM,
    value: ctx => nonNeg(ctx.longestRunKm),
  }),
  metricAch({
    key: 'first_marathon', name: '마라톤 완주', rarity: 'legendary', xp: 400,
    progressPrefix: '최장 런',
    description: '한 번에 42.195km. 달릴 수 있다는 걸 증명한 날.',
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
    progressPrefix: '누적',
    description: '첫 100km. 이제 시작이다.',
    category: 'distanceMilestone', target: 100,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_500', name: '500km', rarity: 'rare', xp: 50,
    progressPrefix: '누적',
    description: '서울에서 부산까지의 거리.',
    category: 'distanceMilestone', target: 500,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_1000', name: '1,000km', rarity: 'rare', xp: 100,
    progressPrefix: '누적',
    description: '1,000km. 꾸준함이 쌓인 증거.',
    category: 'distanceMilestone', target: 1000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_3000', name: '3,000km', rarity: 'epic', xp: 150,
    progressPrefix: '누적',
    description: '한국을 두 바퀴 돌았다.',
    category: 'distanceMilestone', target: 3000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_5000', name: '5,000km', rarity: 'epic', xp: 250,
    progressPrefix: '누적',
    description: '서울에서 뉴욕. 달리기 하나로.',
    category: 'distanceMilestone', target: 5000,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_7500', name: '7,500km', rarity: 'epic', xp: 300,
    progressPrefix: '누적',
    description: '서울에서 파리. 대륙을 건넜다.',
    category: 'distanceMilestone', target: 7500,
    value: ctx => nonNeg(ctx.cumulativeKm),
  }),
  metricAch({
    key: 'dist_10000', name: '10,000km', rarity: 'legendary', xp: 500,
    progressPrefix: '누적',
    description: '지구 4분의 1 바퀴. 전설이다.',
    category: 'distanceMilestone', target: 10000,
    value: ctx => nonNeg(ctx.cumulativeKm),
    signature: true,
  }),
];

// ============================================================================
// 카테고리 2b: consistency — 꾸준함 = '쉼표 있는 리듬'(2026-07-04 재설계 v4, 확정)
// ============================================================================
// 규칙 한 문장: **한 주는 쉬어도 리듬이 이어진다. 두 주 연속 비면 새 리듬.**
// (ctx.longestWeeklyStreak — 공백 1주 유예. 51주째 몸이 아파 한 주 쉰 러너를
// 처벌하지 않고(부상 휴식 권고와 정렬), 띄엄띄엄 몇 년 모으기는 안 돼 단순 누적·
// 누적 거리와 구분된다 — v2 연속은 가혹, v3 총량은 밋밋(사용자 판정)의 절충.)
// 표시는 역대 최장 기준이라 후퇴 없음. 일일 스트릭은 부재(매일 달리기 부추김 금지).
const CONSISTENCY: AchievementDef[] = [
  metricAch({
    key: 'weeks_4', name: '4주의 리듬', rarity: 'common', xp: 20,
    progressPrefix: '최장 리듬',
    description: '4주의 리듬. 한 주쯤 쉬어도 리듬은 이어진다.',
    category: 'consistency', target: 4,
    value: ctx => nonNeg(ctx.longestWeeklyStreak ?? 0),
  }),
  metricAch({
    key: 'weeks_12', name: '한 계절의 리듬', rarity: 'rare', xp: 50,
    progressPrefix: '최장 리듬',
    description: '12주 — 계절이 바뀌는 동안 리듬을 지켰다.',
    category: 'consistency', target: 12,
    value: ctx => nonNeg(ctx.longestWeeklyStreak ?? 0),
  }),
  metricAch({
    key: 'weeks_26', name: '반년의 리듬', rarity: 'epic', xp: 100,
    progressPrefix: '최장 리듬',
    description: '반년의 리듬. 쉬어간 주가 있어도, 당신은 돌아왔다.',
    category: 'consistency', target: 26,
    value: ctx => nonNeg(ctx.longestWeeklyStreak ?? 0),
  }),
  metricAch({
    key: 'weeks_52', name: '1년의 리듬', rarity: 'legendary', xp: 300,
    progressPrefix: '최장 리듬',
    description: '1년의 리듬을 지켰다. 잠깐의 쉼표까지, 전부 러닝이었다.',
    category: 'consistency', target: 52,
    value: ctx => nonNeg(ctx.longestWeeklyStreak ?? 0),
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
// 2026-07-04 재설계(사용자 발견 모순): 옛 '함께 500km'는 카본화 기본 수명(450km)보다
// 길어서, 앱이 '교체 권장'(수명 90%)한 신발로 계속 달려야만 따지는 업적이었다 —
// 인센티브가 안전 권고와 정면 충돌. 이제 상위 두 단계는 절대 km 대신 **그 신발의
// 수명(maxKm) 대비 비율**로 판정한다: 반환점(50%) · 여정 완주(90% = 교체 권장 시점).
// '여정 완주'는 정확히 은퇴할 때가 된 순간 열려, 업적이 건강한 은퇴를 축하한다.
const JOURNEY_HALF_PCT = 0.5;
const JOURNEY_FULL_PCT = 0.9; // lib/shoe SHOE_REPLACE_PCT(90%) — 교체 권장 시점과 정렬

/** 신발의 판정 수명(km). maxKm 미상(0)이면 데일리 기본 650. */
function lifespanOf(s: PerShoeStats): number {
  return nonNeg(s.maxKm) > 0 ? s.maxKm : DEFAULT_LIFESPAN_KM;
}

/** 수명 대비 비율 ≥ pct 인 신발 수(은퇴 포함). */
function shoesOverLifePct(ctx: ProgressionContext, pct: number): number {
  return shoeList(ctx).filter(s => nonNeg(s.km) >= lifespanOf(s) * pct).length;
}

/** 수명 기반 반복 업적 — 진행 바는 비율이 가장 앞선 신발의 km/목표km 로 보여준다. */
function repeatableLifePctAch(
  opts: Omit<RepeatableOpts, 'kmThreshold'> & {lifePct: number},
): AchievementDef {
  const {key, name, description, category, rarity, xp, lifePct, signature} = opts;
  return {
    key, name, description, category, rarity, xp, signature,
    repeatablePerShoe: true,
    progress: ctx => {
      const count = shoesOverLifePct(ctx, lifePct);
      if (count > 0) return {current: count, target: count};
      let bestCur = 0;
      let bestTarget = Math.round(DEFAULT_LIFESPAN_KM * lifePct);
      let bestRatio = -1;
      for (const s of shoeList(ctx)) {
        const target = lifespanOf(s) * lifePct;
        const ratio = target > 0 ? nonNeg(s.km) / target : 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestCur = Math.min(nonNeg(s.km), target);
          bestTarget = Math.round(target);
        }
      }
      return {current: Math.round(bestCur), target: bestTarget};
    },
    unlocked: ctx => shoesOverLifePct(ctx, lifePct) >= 1,
    earnedCount: ctx => shoesOverLifePct(ctx, lifePct),
  };
}

const SHOE_MEMORY: AchievementDef[] = [
  repeatableShoeAch({
    key: 'together_100', name: '함께 100km', rarity: 'common', xp: 20,
    description: '이 신발과 100km를 달렸다. 첫 번째 이정표.',
    category: 'shoeMemory', kmThreshold: 100,
  }),
  repeatableLifePctAch({
    key: 'journey_half', name: '반환점', rarity: 'rare', xp: 50,
    description: '한 켤레와 수명의 절반을 함께 달렸다.',
    category: 'shoeMemory', lifePct: JOURNEY_HALF_PCT,
  }),
  repeatableLifePctAch({
    key: 'journey_full', name: '여정 완주', rarity: 'epic', xp: 100,
    description: '수명의 90%를 함께 달렸다. 이제 잘 보내줄 시간 — 은퇴도 훈장이다.',
    category: 'shoeMemory', lifePct: JOURNEY_FULL_PCT,
    signature: true,
  }),
];

// ============================================================================
// 카테고리 5: experience — 특별 경험
// ============================================================================
const EXPERIENCE: AchievementDef[] = [
  // trail_run·rain_run 제거(2026-07-04): 지면/날씨 데이터가 없어 영원히 잠금 상태인
  // 업적을 노출하는 건 사용자 신뢰를 깎는다("이건 왜 안 따져?"). 데이터가 생기면
  // (지면 연동·날씨 API) 그때 카탈로그에 다시 넣는다 — 새 업적 추가는 안전(합산제).
  {
    key: 'night_run', name: '나이트 런', rarity: 'rare', xp: 30,
    description: '밤 10시 이후, 도시의 고요함 속에서 달렸다.',
    category: 'experience',
    progress: ctx => ({current: Math.min(nonNeg(ctx.nightRunCount), 1), target: 1}),
    unlocked: ctx => nonNeg(ctx.nightRunCount) >= 1,
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
    key: 'challenge_dedicated', name: '꾸준한 도전', rarity: 'rare', xp: 40,
    description: '챌린지 3개를 완수했다. 목표 달성의 맛을 알았다.',
    category: 'experience', target: 3,
    value: ctx => nonNeg(ctx.completedChallengeCount),
  }),
  metricAch({
    key: 'challenge_master', name: '챌린지 마스터', rarity: 'rare', xp: 60,
    description: '챌린지 10개 완수. 설정하고, 달리고, 달성한다.',
    category: 'experience', target: 10,
    value: ctx => nonNeg(ctx.completedChallengeCount),
  }),
];

// ============================================================================
// 카테고리 6: keego — Keep Going 철학
// ============================================================================
// 2026-07-04 재설계(사용자 발견 모순): 옛 '오랜 동반자'(한 켤레와 1년)는 적게 달리거나
// 수명 지난 신발로 계속 달려야 유리한 역인센티브였다(주 30km 러너의 데일리화 수명은
// 4~5개월). Keep Going 은 신발이 아니라 **러너의 여정** — 첫 런에서 1년이 지나도
// 여전히 달리고 있는 것(runSpanDays: 첫 런 → 마지막 런, 기다림만으론 안 늘어남)이다.
const KEEGO: AchievementDef[] = [
  // 철학 3부작: 잘 보내주었다(Let Go) · 킵고잉 1년(Keep Going) · 온전한 하루(시간의 시).
  // Keep Going(계속 달리는 것)과 짝을 이루는 Let Go(잘 떠나보내는 것) — 교체 권장
  // 시점 안의 은퇴(smart 이상 등급). 사다리 없이 단 한 장: 앱 존재 이유의 업적화.
  {
    key: 'well_sent', name: '잘 보내주었다', rarity: 'epic', xp: 100,
    description: '수명이 다한 신발을 제때 은퇴시켰다. 잘 떠나보내는 것도 러닝이다.',
    category: 'keego',
    signature: true,
    progress: ctx => ({
      current: Math.min((ctx.retirementGrades ?? []).filter(isSmartOrBetter).length, 1),
      target: 1,
    }),
    unlocked: ctx => (ctx.retirementGrades ?? []).some(isSmartOrBetter),
  },
  {
    key: 'keep_going_year', name: '킵고잉, 1년', rarity: 'epic', xp: 100,
    description: '첫 런으로부터 1년이 지나도, 여전히 달리고 있다. 그것이 Keep Going.',
    category: 'keego',
    signature: true,
    progress: ctx => ({
      current: Math.min(nonNeg(ctx.runSpanDays ?? 0), 365),
      target: 365,
    }),
    unlocked: ctx => nonNeg(ctx.runSpanDays ?? 0) >= 365,
  },
  // 주 3시간 러너면 8주 만에 도달 — 시(詩)는 지키되 등급·XP 는 난이도에 정직하게
  // (에픽 신뢰 보호, 2026-07-04 XP 감사).
  metricAch({
    key: 'time_24h', name: '온전한 하루', rarity: 'rare', xp: 40,
    progressPrefix: '누적',
    description: '누적 24시간 — 지구가 한 바퀴 도는 시간을 달렸다.',
    category: 'keego', target: 86400,
    value: ctx => nonNeg(ctx.totalDurationS),
  }),
];

// ── 전체 카탈로그 ──────────────────────────────────────────────────────────────

/** 전체 업적 카탈로그(권위·불변). 카테고리 순서대로 평탄화. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...RUNNING_MILESTONE,
  ...DISTANCE_MILESTONE,
  ...CONSISTENCY,
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
