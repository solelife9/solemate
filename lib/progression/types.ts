// ============================================================================
// lib/progression/types.ts — KEEGO Progression 도메인 타입 (Slice A foundation)
// ============================================================================
// 진척/랭크/타이틀/업적/은퇴 생태계의 단일 타입 출처. 이 파일은 **순수 타입만** 담는다
// (런타임 로직 0). 엔진 모듈(rank·titles·achievements·context·storage)이 모두 여기서
// 타입을 가져오므로, 도메인 계약을 한곳에서 본다.
//
// 입력 데이터는 두 모양을 재사용한다(중복 정의 금지):
//   · BackendRun / BackendShoe — 서버/상태 배열의 원시 행 (types.d.ts, 전역 ambient).
//   · UI Run / Shoe — 프레젠테이션 모양 (theme.ts).
// 색상은 theme.ts 의 TIER_COLORS 만 권위(여기엔 색 상수를 두지 않는다).
// ============================================================================

// ── Rank ─────────────────────────────────────────────────────────────────────

/** 합성 랭크 티어(낮음→높음). RPG 레벨이 아니라 단일 티어. */
export type RankTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'legend';

/**
 * 6개 평가축 점수(각 0..1로 정규화). 거리 단독이 랭크를 좌우하지 못하게 가중 분산한다.
 *   · running           — 누적/단일 거리 (log 스케일로 포화)
 *   · consistency       — 스트릭/주간 활성도
 *   · shoeManagement    — 신발 등록·수명 관리 품질
 *   · rotation          — 신발 로테이션 다양성
 *   · injuryPrevention  — 과사용/급증 회피
 *   · engagement        — 업적 포인트/챌린지/타이틀 참여
 */
export interface PillarScores {
  running: number;
  consistency: number;
  shoeManagement: number;
  rotation: number;
  injuryPrevention: number;
  engagement: number;
}

/** computeRank 결과. score 0..100, 티어, 티어 색(TIER_COLORS), 평가축 스냅샷. */
export interface RankResult {
  /** 0..100 합성 점수. */
  score: number;
  tier: RankTier;
  /** theme.ts TIER_COLORS[tier] 값(하드코딩 금지). */
  color: string;
  pillars: PillarScores;
}

// ── Titles ─────────────────────────────────────────────────────────────────────

/** 타이틀 분류. 각 카테고리에 사다리(ladder) 또는 hidden 타이틀이 매달린다. */
export type TitleCategory =
  | 'running'
  | 'consistency'
  | 'shoeManagement'
  | 'rotation'
  | 'injuryPrevention'
  | 'hidden'
  | 'retirement';

/**
 * 타이틀 정의(정적). criterion 은 집계 컨텍스트로부터 충족 여부를 **순수 판정**한다.
 * hidden 타이틀은 갤러리에서 미달성 시 숨긴다(달성 전까지 노출 X).
 */
export interface TitleDef {
  key: string;
  /** 표시명(한국어/영문 혼용 카피는 카탈로그에서 확정). */
  name: string;
  category: TitleCategory;
  /** 타이틀 희귀도 티어(색/위계). */
  tier: RankTier;
  /** 숨김 타이틀 여부(미달성 시 갤러리 비노출). */
  hidden?: boolean;
  /** 달성 판정. 입력 불변·throw 금지. */
  criterion: (ctx: ProgressionContext) => boolean;
}

/** 사용자가 획득한 타이틀(영속). 단 하나만 isEquipped=true. */
export interface EarnedTitle {
  key: string;
  /** 최초 획득 시각(ISO 8601). */
  unlockedAt: string;
  isEquipped: boolean;
}

// ── Achievements ─────────────────────────────────────────────────────────────

/** 업적 진행률(현재/목표). 화면 진행 바가 직접 소비. */
export interface AchievementProgress {
  current: number;
  target: number;
}

/**
 * 업적 표시 그룹(수집 카탈로그의 묶음 — 타이틀의 사다리보다 잘게 쌓는 단위).
 * category(평가축 필러)와 별개로 화면 그룹 헤더에만 쓴다.
 */
export type AchievementGroup =
  | 'firstMilestone'
  | 'distance'
  | 'runCount'
  | 'consistency'
  | 'shoeCollection'
  | 'shoeLife'
  | 'rotation'
  | 'injuryPrevention'
  | 'retirement'
  | 'hidden';

/**
 * 업적 정의(정적). progress 는 라이브 진행률, unlocked 는 달성 판정(둘 다 순수).
 * 포인트는 rarity 로 결정(Bronze10 … Legend1000) — engagement 평가축에 환산된다.
 * 날조 금지(iron): unlocked 는 실제 충족 기준에서만 true.
 */
export interface AchievementDef {
  key: string;
  name: string;
  /** 평가축 필러(엔진/커버리지용). */
  category: TitleCategory;
  /** 화면 표시 그룹(수집 카탈로그 헤더용). */
  group: AchievementGroup;
  /** 희귀도(포인트/색 결정). */
  rarity: RankTier;
  /** rarity 에 대응하는 포인트(POINTS_BY_RARITY 와 일치). */
  points: number;
  /** true 면 달성 전까지 갤러리에서 숨긴다(히든 업적 — 달성 순간 공개). */
  hidden?: boolean;
  progress: (ctx: ProgressionContext) => AchievementProgress;
  unlocked: (ctx: ProgressionContext) => boolean;
}

// ── Retirement (이후 슬라이스용 stub — storage 가 보관) ─────────────────────────

/** 은퇴 등급 — 권장 수명 대비 교체 시점의 적절성. */
export type RetirementGrade =
  | 'standard'
  | 'good'
  | 'smart'
  | 'perfect'
  | 'hallOfFame';

/**
 * 은퇴 요약(신발 일대기). 모든 값은 그 신발의 실제 런에서 파생(날조 금지).
 * Slice B 가 채우는 구조 — foundation 은 모양만 고정해 storage 가 보관 가능하게 한다.
 */
export interface RetirementSummary {
  shoeId: string;
  name: string;
  totalKm: number;
  runCount: number;
  totalDurationS: number;
  /** 평균 페이스(sec/km). 측정 가능한 런 없으면 null. */
  avgPaceSec: number | null;
  /** 최고 페이스(sec/km). 없으면 null. */
  bestPaceSec: number | null;
  longestRunKm: number;
  /** 첫/마지막 런 일자(YYYY-MM-DD). 없으면 null. */
  firstRunDate: string | null;
  lastRunDate: string | null;
  /** 사용 기간(일) — 첫 런부터 은퇴일(now)까지(없으면 마지막 런까지). 항상 0 이상. */
  usageDays: number;
  grade: RetirementGrade;
  /** 실제 달성한 하이라이트 키만(날조 금지). 우선순위 내림차순(강→약) 정렬. */
  highlights: string[];
  /**
   * Most Memorable Moment — 그 신발과 함께한 가장 강렬한 **단일 실제** 하이라이트 키
   * (highlights 의 우선순위 1위). 하이라이트가 없으면 null(날조 금지).
   */
  mostMemorable: string | null;
}

/** Hall of Shoes 에 영속되는 은퇴 신발 레코드(절대 사라지지 않음). */
export interface RetiredShoeRecord {
  shoeId: string;
  name: string;
  /** 은퇴 시점 누적 거리(km). */
  km: number;
  /** 은퇴 시각(ISO 8601). */
  retiredAt: string;
  /** 은퇴 연도(Hall of Shoes 라벨용). */
  retireYear: number;
  grade: RetirementGrade;
  /** 카드 재생성을 위한 전체 요약(선택 — 구버전 레코드엔 없을 수 있음). */
  summary?: RetirementSummary;
}

// ── Persistence ───────────────────────────────────────────────────────────────

/**
 * 영속 상태(단일 키 'progression_v1'). 파생 가능한 값(랭크/업적/타이틀)은 저장하지 않고
 * 런/신발에서 재계산한다. 여기엔 **사용자 선택 + 이미 알린 언락 + 은퇴 기록 + 포인트**만 둔다.
 */
export interface ProgressionState {
  earnedTitles: EarnedTitle[];
  /** 현재 장착한 타이틀 키(없으면 null). */
  equippedTitleKey: string | null;
  /** 이미 언락 토스트를 띄운 키들(idempotent 알림용). */
  seenUnlocks: string[];
  retiredShoes: RetiredShoeRecord[];
  /** 누적 진척 포인트(업적 합산 캐시). */
  points: number;
}

// ── Context (집계 사실 — buildContext 의 산출물) ──────────────────────────────

/** 신발 1켤레의 집계 통계(런 연결 기준). */
export interface PerShoeStats {
  id: string;
  name: string;
  /** 누적 주행거리(km). 서버 truth(total_km) 우선, 없으면 런 합산. */
  km: number;
  /** 그 신발로 기록한 런 수. */
  runs: number;
  /** 첫/마지막 착용 일자(YYYY-MM-DD). 런 없으면 null. */
  firstWorn: string | null;
  lastWorn: string | null;
  retired: boolean;
  /** 카테고리 권장 수명(km). 미상이면 0. */
  maxKm: number;
}

/** 챌린지 입력의 최소 모양(완료 수만 집계에 필요). */
export interface ContextChallengeInput {
  completed?: boolean;
}

/**
 * 사전 집계된 사실(facts)의 묶음. rank/titles/achievements 가 이 컨텍스트만 읽어
 * 평가축·기준을 판정한다. PURE: 입력 불변, NaN/음수/누락 → 0, throw 금지.
 */
export interface ProgressionContext {
  /** 계산 기준 시각(epoch ms) — 주간 활성도/공백 계산에 사용. */
  now: number;
  cumulativeKm: number;
  runCount: number;
  totalDurationS: number;
  /** 최장 단일 런(km). */
  longestRunKm: number;
  /** 최고(최소) 평균 페이스(sec/km). 없으면 null. */
  bestPaceSec: number | null;
  /**
   * 단일 런 거리 ≥5km 인 런들 중 최고(최소) 평균 페이스(sec/km). 없으면 null.
   * Speedster 가 "짧은 1km 질주"가 아닌 "의미 있는 거리에서의 속도"를 요구하는 데 쓴다.
   * 손으로 만든 컨텍스트와의 하위호환을 위해 선택적(누락 → null=미달성).
   */
  bestPace5kSec?: number | null;
  /** 전체 평균 페이스(sec/km). 없으면 null. */
  avgPaceSec: number | null;
  /** 마지막 런에서 이어지는 연속 러닝 일수. */
  currentStreak: number;
  /** 역대 최장 연속 러닝 일수. */
  longestStreak: number;
  /** 첫 런 이후 주(week) 중 런이 있었던 주의 비율(0..1). */
  weeklyActiveRatio: number;
  /** 05:00 이전 시작 런 수(Early Bird). */
  earlyRunCount: number;
  /** 22:00 이후 시작 런 수(Night Runner). */
  nightRunCount: number;
  /** 연속한 두 런 사이 최장 공백(일) — Comeback 판정용. */
  longestGapDays: number;
  /** 등록된 신발 수(은퇴 포함). */
  registeredShoeCount: number;
  /** 은퇴한 신발 수(신발 목록의 retired 플래그 기준). */
  retiredShoeCount: number;
  /**
   * 영속된 은퇴(Hall of Shoes) 레코드 수 — **실제 은퇴 이벤트**의 권위
   * (progression_v1.retiredShoes). 은퇴 업적/타이틀은 retiredShoeCount(플래그)가 아니라
   * 이 영속 레코드 수로 구동된다(날조 금지 — 실제 은퇴만 카운트). buildContext 가 항상
   * 채우지만, 손으로 만든 컨텍스트와의 하위호환을 위해 선택적(누락 → 0)으로 둔다.
   */
  retirementCount?: number;
  /**
   * 각 은퇴 레코드의 등급(레코드 순서 보존). Smart Replacement(smart 이상)·Perfect
   * Timing(perfect)·은퇴 타이틀의 품질 게이트가 읽는다. 누락 → [](판정 불가).
   */
  retirementGrades?: RetirementGrade[];
  /** 신발 id → 집계 통계. */
  perShoe: Record<string, PerShoeStats>;
  /** 이미 획득한 타이틀 키(중복 언락 방지/참여도용). */
  earnedTitleKeys: string[];
  /** 획득 타이틀 수. */
  earnedTitleCount: number;
  /** 완료한 챌린지 수(engagement 평가축). */
  completedChallengeCount: number;
  /**
   * 언락한 업적의 난이도(rarity) 가중 포인트 합 — engagement 평가축에 환산된다.
   * 선택(미설정→0): buildContext 가 사전집계로 채운다. 직접 만든 ctx(테스트 등)는 0 취급.
   */
  achievementPoints?: number;
}

// ── Ranking seam (크로스유저 백엔드 부재 시 로컬 전용 placeholder) ─────────────

/**
 * 리더보드 엔트리(미래 백엔드 계약 — slice E/F). 앱 재작업 없이 백엔드가 구현하도록
 * 모양만 고정한다. 이 run 에선 실제로 채워지지 않는다(가짜 경쟁자 금지).
 */
export interface LeaderboardEntry {
  uid: string;
  /** 'YYYY-MM' 월별 스냅샷. */
  yearMonth: string;
  category: string;
  rank: number;
  score: number;
  nickname: string;
  rankTier: RankTier;
  rankColor: string;
  equippedTitle: string | null;
}

/** 내 랭킹의 로컬 placeholder(백엔드 부재 → available:false, 경쟁자 없음). */
export interface LocalMyRanking {
  kind: 'local';
  available: false;
  /** 로컬 스냅샷(개인 점수/티어)만. 순위/경쟁자는 없음. */
  me: {score: number; tier: RankTier; color: string} | null;
}

/** 리더보드의 로컬 placeholder(엔트리 없음 — "coming soon" UI). */
export interface LocalLeaderboard {
  kind: 'local';
  available: false;
  category: string;
  yearMonth: string;
  entries: LeaderboardEntry[];
}

/**
 * 네트워크(멀티유저 백엔드) 리더보드 — slice E. 백엔드가 검증된 데이터로 집계한 실제
 * 엔트리를 담는다. available 은 런타임 값(백엔드 응답/네트워크 성공 여부)이라 boolean 이며,
 * 실패/빈 결과는 available:false + entries:[] 로 떨어진다(가짜 경쟁자 발명 금지).
 */
export interface RemoteLeaderboard {
  kind: 'remote';
  available: boolean;
  category: string;
  yearMonth: string;
  entries: LeaderboardEntry[];
}

/**
 * 네트워크 내 랭킹 — slice E. 내 순위/상위%/주변(±2)까지 크로스유저 값을 담는다.
 * 미참여/실패면 available:false, me=null, nearby:[].
 */
export interface RemoteMyRanking {
  kind: 'remote';
  available: boolean;
  category: string;
  yearMonth: string;
  /** 카테고리 전체 참여자 수(상위% 산정 분모). */
  total: number;
  /** 내 상위 백분율(0..100, 작을수록 상위). 미참여 → null. */
  topPercent: number | null;
  /** 내 엔트리(순위/점수 포함). 미참여 → null. */
  me: LeaderboardEntry | null;
  /** 내 위 2 + 나 + 아래 2 (백엔드 nearby). */
  nearby: LeaderboardEntry[];
}

/**
 * 랭킹 데이터 소스 seam. 로컬 stub(ranking.ts)은 Local* 를, 네트워크 구현
 * (remoteRanking.ts, slice E)은 Remote* 를 반환한다. 소비자는 result.kind 로 분기한다.
 */
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
