// ============================================================================
// lib/progression/types.ts — KEEGO Progression 도메인 타입 (재설계)
// ============================================================================
// 진척/랭크/업적/은퇴 생태계의 단일 타입 출처. 이 파일은 **순수 타입만** 담는다
// (런타임 로직 0). 엔진 모듈(rank·achievements·context·storage)이 모두 여기서
// 타입을 가져오므로, 도메인 계약을 한곳에서 본다.
//
// 아키텍처: 타이틀 시스템 폐지 → 업적 = 유저 정체성. 업적을 달성하면 프로필에
// 최대 3개까지 고정(pin). 랭크 = 누적 XP 기반 7단계 티어(bronze→legend).
// ============================================================================

// ── Rank ─────────────────────────────────────────────────────────────────────

/** 합성 랭크 티어(낮음→높음). */
export type RankTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'legend';

/** XP 기반 랭크 결과. score = xp(backward-compat alias). */
export interface RankResult {
  /** 총 획득 XP (0..∞). */
  xp: number;
  tier: RankTier;
  /** theme.ts TIER_COLORS[tier] 값. */
  color: string;
  /** 다음 티어(legend 이면 null). */
  nextTier: RankTier | null;
  /** 다음 티어 달성에 필요한 추가 XP. legend면 0. */
  xpForNext: number;
  /** 현재 티어 내 진행도(0..100). */
  progressPercent: number;
  /** backward-compat: score = xp. 구 소비자 코드 유지용. */
  score: number;
}

// ── Achievement rarity & category (신규 시스템) ───────────────────────────────

/** 업적 희귀도 — 색·시각 위계를 결정한다(구 RankTier 희귀도 대체). */
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

/**
 * 업적 카테고리(6개). 화면 섹션 분류 + XP 집계 축.
 *   runningMilestone  — 단일 런 이정표(첫 5km·하프·마라톤)
 *   distanceMilestone — 누적 거리(100→10,000km)
 *   shoeJourney       — 신발 소유·은퇴 여정
 *   shoeMemory        — 신발과 함께한 거리(켤레마다 반복 적립)
 *   experience        — 특별 경험(트레일·새벽·야간·계절)
 *   keego             — Keep Going 철학(오랜 동반자 등)
 */
export type AchievementCategory =
  | 'runningMilestone'
  | 'distanceMilestone'
  | 'shoeJourney'
  | 'shoeMemory'
  | 'experience'
  | 'keego';

/** 업적 진행률(현재/목표). 화면 진행 바가 직접 소비. */
export interface AchievementProgress {
  current: number;
  target: number;
}

/**
 * 업적 정의(정적 카탈로그). progress 는 라이브 진행률, unlocked 는 달성 판정.
 * repeatablePerShoe=true 이면 켤레마다 xp 가 반복 적립(earnedCount 제공 필수).
 * 날조 금지(iron): unlocked 는 실제 충족 기준에서만 true.
 * PURE: ctx 불변, throw 금지.
 */
export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  /** 기본 XP(1회 또는 per-shoe). */
  xp: number;
  /** 특별 표시 업적(전면 카드 등). */
  signature?: boolean;
  /** true 면 달성 전까지 갤러리에서 숨긴다. */
  hidden?: boolean;
  /** true 면 신발 켤레마다 xp 반복 적립. earnedCount 가 필수 제공되어야 한다. */
  repeatablePerShoe?: boolean;
  progress: (ctx: ProgressionContext) => AchievementProgress;
  unlocked: (ctx: ProgressionContext) => boolean;
  /** repeatablePerShoe=true 일 때: 지금까지 적립된 횟수(신발 수). */
  earnedCount?: (ctx: ProgressionContext) => number;
}

// ── Titles (레거시 — 유지보수 전용, 신규 개발 금지) ──────────────────────────────

/** @deprecated 타이틀 시스템 폐지. 기존 저장 데이터 역호환 전용. */
export type TitleCategory =
  | 'running'
  | 'consistency'
  | 'shoeManagement'
  | 'injuryPrevention'
  | 'hidden'
  | 'retirement';

/** @deprecated */
export interface TitleDef {
  key: string;
  name: string;
  category: TitleCategory;
  tier: RankTier;
  hidden?: boolean;
  criterion: (ctx: ProgressionContext) => boolean;
}

/** @deprecated */
export interface EarnedTitle {
  key: string;
  unlockedAt: string;
  isEquipped: boolean;
}

// ── Retirement ────────────────────────────────────────────────────────────────

export type RetirementGrade =
  | 'standard'
  | 'good'
  | 'smart'
  | 'perfect'
  | 'hallOfFame';

export interface RetirementSummary {
  shoeId: string;
  name: string;
  totalKm: number;
  runCount: number;
  totalDurationS: number;
  avgPaceSec: number | null;
  bestPaceSec: number | null;
  longestRunKm: number;
  firstRunDate: string | null;
  lastRunDate: string | null;
  usageDays: number;
  grade: RetirementGrade;
  highlights: string[];
  mostMemorable: string | null;
}

export interface RetiredShoeRecord {
  shoeId: string;
  name: string;
  km: number;
  retiredAt: string;
  retireYear: number;
  grade: RetirementGrade;
  summary?: RetirementSummary;
}

// ── Persistence ───────────────────────────────────────────────────────────────

export interface ProgressionState {
  /** @deprecated 타이틀 폐지, 역호환 전용 저장. */
  earnedTitles: EarnedTitle[];
  /** @deprecated */
  equippedTitleKey: string | null;
  seenUnlocks: string[];
  retiredShoes: RetiredShoeRecord[];
  /** 누적 적립 XP 캐시. */
  points: number;
  /** 프로필에 고정한 업적 키(최대 3). */
  pinnedAchievementKeys?: string[];
}

// ── PerShoeStats ──────────────────────────────────────────────────────────────

export interface PerShoeStats {
  id: string;
  name: string;
  km: number;
  runs: number;
  firstWorn: string | null;
  lastWorn: string | null;
  retired: boolean;
  maxKm: number;
}

export interface ContextChallengeInput {
  completed?: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface ProgressionContext {
  now: number;
  cumulativeKm: number;
  runCount: number;
  totalDurationS: number;
  longestRunKm: number;
  bestPaceSec: number | null;
  bestPace5kSec?: number | null;
  avgPaceSec: number | null;
  currentStreak: number;
  longestStreak: number;
  weeklyActiveRatio: number;
  earlyRunCount: number;
  nightRunCount: number;
  longestGapDays: number;
  registeredShoeCount: number;
  retiredShoeCount: number;
  retirementCount?: number;
  retirementGrades?: RetirementGrade[];
  perShoe: Record<string, PerShoeStats>;
  /** @deprecated 역호환 전용(타이틀 시스템 잔재). */
  earnedTitleKeys: string[];
  /** @deprecated */
  earnedTitleCount: number;
  completedChallengeCount: number;
  achievementPoints?: number;
  /** 겨울(12·1·2월) 런 기록 여부. */
  hasWinterRun?: boolean;
  /** 여름(6·7·8월) 런 기록 여부. */
  hasSummerRun?: boolean;
}

// ── Leaderboard (미래 백엔드 계약 stub) ──────────────────────────────────────

export interface LeaderboardEntry {
  uid: string;
  yearMonth: string;
  category: string;
  rank: number;
  score: number;
  nickname: string;
  rankTier: RankTier;
  rankColor: string;
  equippedTitle: string | null;
}

export interface LocalMyRanking {
  kind: 'local';
  available: false;
  me: {score: number; tier: RankTier; color: string} | null;
}

export interface LocalLeaderboard {
  kind: 'local';
  available: false;
  category: string;
  yearMonth: string;
  entries: LeaderboardEntry[];
}

export interface RemoteLeaderboard {
  kind: 'remote';
  available: boolean;
  category: string;
  yearMonth: string;
  entries: LeaderboardEntry[];
}

export interface RemoteMyRanking {
  kind: 'remote';
  available: boolean;
  category: string;
  yearMonth: string;
  total: number;
  topPercent: number | null;
  me: LeaderboardEntry | null;
  nearby: LeaderboardEntry[];
}

export interface RankingProvider {
  getLeaderboard(
    category: string,
    yearMonth: string,
  ): Promise<LocalLeaderboard | RemoteLeaderboard>;
  getMyRanking(
    category: string,
    yearMonth: string,
  ): Promise<LocalMyRanking | RemoteMyRanking>;
}

// ── Deprecated group type (이전 코드 역호환) ─────────────────────────────────

/** @deprecated 업적 카테고리로 대체됨. 기존 타입 체크 통과용으로만 유지. */
export type AchievementGroup =
  | 'firstMilestone'
  | 'distance'
  | 'runCount'
  | 'consistency'
  | 'shoeCollection'
  | 'shoeLife'
  | 'injuryPrevention'
  | 'retirement'
  | 'hidden';

/** @deprecated 사용하지 않음. rank.ts 가 XP 기반으로 대체. */
export interface PillarScores {
  running: number;
  consistency: number;
  shoeManagement: number;
}
