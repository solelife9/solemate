// ============================================================================
// lib/progression/titles.ts — 타이틀 카탈로그 + 헬퍼 (Slice A)
// ============================================================================
// 모든 카테고리 사다리(ladder)와 hidden 타이틀의 **단일 정의 출처**. 각 TitleDef.criterion
// 은 사전 집계 사실(ProgressionContext)만 읽어 달성 여부를 **순수 판정**한다(입력 불변,
// NaN/음수/누락 → false, throw 금지). 랭크처럼 "거리 단독"이 아니라 러너됨의 여러 축
// (거리·일관성·신발관리·로테이션·부상예방·트레이닝스타일)을 보상한다.
//
// 권위 매핑(브리프 verbatim — 이름/기준을 발명·누락하지 않는다):
//   running          1런 / 100 / 500 / 1000 / 5000 / 10000 / 25000 km (bronze→legend)
//   shoeManagement   1 / 3 / 5 / 10 켤레 + mgmt≥0.9(6·12mo) + mgmt≥0.95&12mo
//   rotation         2 사용 / 3 일관 / rotation≥0.7(3mo·1yr·2yr) + 탁월·엘리트
//   injuryPrevention 조기교체 / 전부건강 / 무초과(6mo·1yr) + 탁월·장기·다년
//   consistency      첫달 / 주간(1·3·6·12·24mo) + 엘리트
//   trainingStyle    Tempo / Long Run / Recovery / Race (런 타입 믹스)
//   hidden           Early Bird / Night Runner / Comeback / Long Relationship
//
// 시간 기반 타이틀("≥6개월" 등)은 히스토리 사실이 충족될 때까지 **잠긴 채로 둔다**
// (날조 금지). 테뉴어(러닝 시작 이후 경과일)는 ctx.now 와 가장 이른 firstWorn 으로 파생.
//
// 평가축 임계(mgmt≥0.9, rotation≥0.7, injuryPrevention≥0.9)는 rank.computeRank 의 평가축을
// 그대로 재사용한다 — 평가축 정의의 권위는 rank.ts 한곳(중복 정의 금지·일관).
//
// trainingStyle 주의: 런 워크아웃 타입(tempo/easy/race)은 추적되지 않는다(BackendRun 에
// 타입 필드 없음). 따라서 가용한 페이스/거리 사실로부터 **프록시**로 판정한다(Rain Runner
// 와 같은 정직성 원칙 — 추적 불가한 신호는 발명하지 않는다).
//
// Rain Runner: OMITTED — 날씨가 추적되지 않아 정직하게 판정할 수 없으므로 v1 에서 제외한다
// (spec Out of Scope). 데이터가 생기면 hidden 으로 추가.
// ============================================================================
import {computeRank} from './rank';
import {
  PerShoeStats,
  ProgressionContext,
  ProgressionState,
  TitleDef,
} from './types';

const DAY_MS = 86400000;

// ── 시간 창(테뉴어 일수) — "개월" 프록시(달력 변동 회피, 결정적) ────────────────
const MONTH_1 = 30;
const MONTH_3 = 90;
const MONTH_6 = 182;
const YEAR_1 = 365;
const YEAR_2 = 730;

// ── 신발 마모 비율 임계 ────────────────────────────────────────────────────────
/** 초과 마모(overdue) 경고 비율 — rank/lib.shoe SHOE_REPLACE_PCT(90%)과 동일. */
const OVERDUE_RATIO = 0.9;

// ── trainingStyle 프록시 임계(페이스 sec/km, 거리 km) ────────────────────────────
/** Tempo: 최고 페이스가 이보다 빠르면(≤) 템포 능력 보유 — 5:00/km. */
const TEMPO_PACE_SEC = 300;
/** Recovery: 평균이 최고보다 이 배수 이상 느리면 회복주를 섞는다는 신호. */
const RECOVERY_PACE_FACTOR = 1.25;
/** Long Run Specialist: 단일 최장 런 임계(장거리 훈련). */
const LONG_RUN_KM = 25;
/** Race Runner: 풀코스 거리 단일 런(레이스 완주 프록시). */
const RACE_KM = 42.195;

// ── 수치 방어 헬퍼 ────────────────────────────────────────────────────────────

/** 유한 비음수만 통과(NaN/음수/비유한 → 0). */
function nonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 'YYYY-MM-DD' → 로컬 자정 epoch ms(context.ts 와 동일 규약 재사용). */
function ymdToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  const ms = new Date(y, m - 1, dd).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/** 모든 perShoe 통계 배열(방어적). */
function shoeStats(ctx: ProgressionContext): PerShoeStats[] {
  const map = ctx.perShoe;
  if (!map || typeof map !== 'object') return [];
  return Object.values(map).filter(Boolean);
}

/**
 * 러닝 테뉴어(일) — 가장 이른 firstWorn 부터 now 까지. 신발 착용 기록이 없으면 0.
 * 시간 기반 타이틀이 충분한 히스토리에서만 열리도록 게이트한다(날조 금지).
 */
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

/** 특정 신발의 보유(첫 착용 이후) 경과일 — firstWorn 없으면 0. */
function shoeAgeDays(s: PerShoeStats, now: number): number {
  if (!s.firstWorn) return 0;
  const ms = ymdToMs(s.firstWorn);
  const n = Number.isFinite(now) ? now : 0;
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((n - ms) / DAY_MS));
}

/** 실제로 사용한(런 ≥1) 신발 수. */
function shoesUsedCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(s => nonNeg(s.runs) >= 1).length;
}

/** 일관되게 사용한(런 ≥3) 신발 수 — 일회성 착용 제외. */
function shoesUsedConsistentlyCount(ctx: ProgressionContext): number {
  return shoeStats(ctx).filter(s => nonNeg(s.runs) >= 3).length;
}

/** km/maxKm 비율 — maxKm 미상이면 null(판정 불가). */
function wearRatio(s: PerShoeStats): number | null {
  const max = nonNeg(s.maxKm);
  if (max <= 0) return null;
  return nonNeg(s.km) / max;
}

/**
 * 활성(미은퇴)·수명 알려진 신발이 ≥1 이고 그 전부가 건강(overdue 미만)인가.
 * = rank shoeManagement 평가축이 1.0 인 상태(전부 깨끗한 셰어)와 동치 — "all active healthy".
 */
function allActiveHealthy(ctx: ProgressionContext): boolean {
  const assessed = shoeStats(ctx).filter(s => !s.retired && nonNeg(s.maxKm) > 0);
  if (assessed.length === 0) return false;
  return assessed.every(s => (wearRatio(s) ?? 1) < OVERDUE_RATIO);
}

/**
 * 초과(overdue) 도달 **전**에 교체한 은퇴 신발이 ≥1 인가 — Smart Runner.
 * 0.9(OVERDUE_RATIO) 미만에서 은퇴해야 "조기 교체"다 — 0.9~1.0 밴드는 이미 overdue 라
 * allActiveHealthy(<0.9)·rank.isOverdue 와 일관되게 조기 교체로 치지 않는다.
 * 하한 r>0: 한 번도 신지 않은(km=0/ratio 0) 은퇴 신발은 똑똑한 조기 교체가 아니다.
 */
function hasEarlyReplacement(ctx: ProgressionContext): boolean {
  return shoeStats(ctx).some(s => {
    if (!s.retired) return false;
    const r = wearRatio(s);
    return r !== null && r > 0 && r < OVERDUE_RATIO;
  });
}

// 평가축 재사용(권위=rank.ts). computeRank 는 순수·메모이즈 → ctx 참조당 1회만 계산.
function mgmtPillar(ctx: ProgressionContext): number {
  return computeRank(ctx).pillars.shoeManagement;
}
function rotationPillar(ctx: ProgressionContext): number {
  return computeRank(ctx).pillars.rotation;
}
function injuryPillar(ctx: ProgressionContext): number {
  return computeRank(ctx).pillars.injuryPrevention;
}

// ============================================================================
// 타이틀 카탈로그(권위) — 카테고리별 사다리 + hidden
// ============================================================================

// ── running: 누적 거리(1런→25000km), bronze→legend ─────────────────────────────
const RUNNING_TITLES: TitleDef[] = [
  {
    key: 'running_beginner',
    name: 'Running Beginner',
    category: 'running',
    tier: 'bronze',
    criterion: ctx => nonNeg(ctx.runCount) >= 1,
  },
  {
    key: 'running_100k',
    name: '100km Club',
    category: 'running',
    tier: 'silver',
    criterion: ctx => nonNeg(ctx.cumulativeKm) >= 100,
  },
  {
    key: 'running_500k',
    name: 'Distance Hunter',
    category: 'running',
    tier: 'gold',
    criterion: ctx => nonNeg(ctx.cumulativeKm) >= 500,
  },
  {
    key: 'running_1000k',
    name: 'Marathon Mindset',
    category: 'running',
    tier: 'platinum',
    criterion: ctx => nonNeg(ctx.cumulativeKm) >= 1000,
  },
  {
    key: 'running_5000k',
    name: 'Elite Runner',
    category: 'running',
    tier: 'diamond',
    criterion: ctx => nonNeg(ctx.cumulativeKm) >= 5000,
  },
  {
    key: 'running_10000k',
    name: 'Ultra Runner',
    category: 'running',
    tier: 'master',
    criterion: ctx => nonNeg(ctx.cumulativeKm) >= 10000,
  },
  {
    key: 'running_25000k',
    name: 'Endless Runner',
    category: 'running',
    tier: 'legend',
    criterion: ctx => nonNeg(ctx.cumulativeKm) >= 25000,
  },
];

// ── shoeManagement: 컬렉션 수(1/3/5/10) + 관리 품질·기간 ──────────────────────────
const SHOE_TITLES: TitleDef[] = [
  {
    key: 'shoe_beginner',
    name: 'Shoe Beginner',
    category: 'shoeManagement',
    tier: 'bronze',
    criterion: ctx => nonNeg(ctx.registeredShoeCount) >= 1,
  },
  {
    key: 'shoe_enthusiast',
    name: 'Shoe Enthusiast',
    category: 'shoeManagement',
    tier: 'silver',
    criterion: ctx => nonNeg(ctx.registeredShoeCount) >= 3,
  },
  {
    key: 'shoe_rotation_runner',
    name: 'Rotation Runner',
    category: 'shoeManagement',
    tier: 'gold',
    criterion: ctx => nonNeg(ctx.registeredShoeCount) >= 5,
  },
  {
    key: 'shoe_collector',
    name: 'Shoe Collector',
    category: 'shoeManagement',
    tier: 'platinum',
    criterion: ctx => nonNeg(ctx.registeredShoeCount) >= 10,
  },
  {
    // mgmt≥0.9 를 ≥6개월 유지 — 현재 mgmt + 충분한 테뉴어로 게이트(히스토리 충족 전 잠금).
    key: 'shoe_master',
    name: 'Shoe Master',
    category: 'shoeManagement',
    tier: 'diamond',
    criterion: ctx => mgmtPillar(ctx) >= 0.9 && tenureDays(ctx) >= MONTH_6,
  },
  {
    key: 'keego_master',
    name: 'KEEGO Master',
    category: 'shoeManagement',
    tier: 'master',
    criterion: ctx => mgmtPillar(ctx) >= 0.9 && tenureDays(ctx) >= YEAR_1,
  },
  {
    // Keep Going — mgmt≥0.95 & ≥12개월(상위 0.1% 로컬 프록시; 크로스유저 백엔드는 slice E/F).
    key: 'keep_going',
    name: 'Keep Going',
    category: 'shoeManagement',
    tier: 'legend',
    criterion: ctx => mgmtPillar(ctx) >= 0.95 && tenureDays(ctx) >= YEAR_1,
  },
];

// ── rotation: 사용 켤레 수 → 로테이션 균형·기간 ───────────────────────────────────
const ROTATION_TITLES: TitleDef[] = [
  {
    key: 'rotation_starter',
    name: 'Rotation Starter',
    category: 'rotation',
    tier: 'bronze',
    criterion: ctx => shoesUsedCount(ctx) >= 2,
  },
  {
    // 3켤레를 일관되게(각 런 ≥3) 사용 — 일회성 보유가 아닌 실제 로테이션.
    key: 'rotation_balanced',
    name: 'Balanced Runner',
    category: 'rotation',
    tier: 'silver',
    criterion: ctx => shoesUsedConsistentlyCount(ctx) >= 3,
  },
  {
    key: 'rotation_expert',
    name: 'Rotation Expert',
    category: 'rotation',
    tier: 'gold',
    criterion: ctx => rotationPillar(ctx) >= 0.7 && tenureDays(ctx) >= MONTH_3,
  },
  {
    key: 'rotation_master',
    name: 'Rotation Master',
    category: 'rotation',
    tier: 'platinum',
    criterion: ctx => rotationPillar(ctx) >= 0.7 && tenureDays(ctx) >= YEAR_1,
  },
  {
    key: 'rotation_perfect',
    name: 'Perfect Rotator',
    category: 'rotation',
    tier: 'diamond',
    criterion: ctx => rotationPillar(ctx) >= 0.7 && tenureDays(ctx) >= YEAR_2,
  },
  {
    // 탁월한 장기 로테이션(더 높은 균형 + 다년).
    key: 'rotation_architect',
    name: 'Rotation Architect',
    category: 'rotation',
    tier: 'master',
    criterion: ctx => rotationPillar(ctx) >= 0.8 && tenureDays(ctx) >= YEAR_2,
  },
  {
    // 엘리트 로테이션(거의 완벽한 균형 + 다년).
    key: 'rotation_legend',
    name: 'Rotation Legend',
    category: 'rotation',
    tier: 'legend',
    criterion: ctx => rotationPillar(ctx) >= 0.9 && tenureDays(ctx) >= YEAR_2,
  },
];

// ── injuryPrevention: 조기교체 → 무초과 유지·기간 ────────────────────────────────
const INJURY_TITLES: TitleDef[] = [
  {
    key: 'injury_smart',
    name: 'Smart Runner',
    category: 'injuryPrevention',
    tier: 'bronze',
    criterion: ctx => hasEarlyReplacement(ctx),
  },
  {
    key: 'injury_wise',
    name: 'Wise Runner',
    category: 'injuryPrevention',
    tier: 'silver',
    criterion: ctx => allActiveHealthy(ctx),
  },
  {
    // 6개월간 초과 마모 신발 없음 — 현재 전부 건강 + 테뉴어로 게이트.
    key: 'injury_prevention_expert',
    name: 'Prevention Expert',
    category: 'injuryPrevention',
    tier: 'gold',
    criterion: ctx => allActiveHealthy(ctx) && tenureDays(ctx) >= MONTH_6,
  },
  {
    key: 'injury_running_coach',
    name: 'Running Coach',
    category: 'injuryPrevention',
    tier: 'platinum',
    criterion: ctx => allActiveHealthy(ctx) && tenureDays(ctx) >= YEAR_1,
  },
  {
    // 탁월한 부상예방(평가축 ≥0.9, 은퇴 포함 전반 건강) + 1년.
    key: 'injury_master',
    name: 'Injury Prevention Master',
    category: 'injuryPrevention',
    tier: 'diamond',
    criterion: ctx => injuryPillar(ctx) >= 0.9 && tenureDays(ctx) >= YEAR_1,
  },
  {
    key: 'injury_guardian',
    name: 'Running Guardian',
    category: 'injuryPrevention',
    tier: 'master',
    criterion: ctx => injuryPillar(ctx) >= 0.9 && tenureDays(ctx) >= YEAR_2,
  },
  {
    key: 'injury_iron',
    name: 'Iron Runner',
    category: 'injuryPrevention',
    tier: 'legend',
    criterion: ctx => injuryPillar(ctx) >= 0.95 && tenureDays(ctx) >= YEAR_2,
  },
];

// ── consistency: 첫 달 → 주간 일관성·기간 ────────────────────────────────────────
/** 주간 러너 임계(첫 런 이후 주 중 활성 비율). */
const WEEKLY_ACTIVE = 0.75;
/** Never Stop(엘리트) 주간 활성 임계. */
const WEEKLY_ELITE = 0.9;

const CONSISTENCY_TITLES: TitleDef[] = [
  {
    // 첫 달 목표 — 첫 달 동안 ~주간(런 ≥4)으로 달림.
    key: 'consistency_start',
    name: 'Consistent Start',
    category: 'consistency',
    tier: 'bronze',
    criterion: ctx => nonNeg(ctx.runCount) >= 4,
  },
  {
    key: 'consistency_runner',
    name: 'Consistent Runner',
    category: 'consistency',
    tier: 'silver',
    criterion: ctx =>
      nonNeg(ctx.weeklyActiveRatio) >= WEEKLY_ACTIVE &&
      tenureDays(ctx) >= MONTH_1,
  },
  {
    key: 'consistency_habit',
    name: 'Habit Builder',
    category: 'consistency',
    tier: 'gold',
    criterion: ctx =>
      nonNeg(ctx.weeklyActiveRatio) >= WEEKLY_ACTIVE &&
      tenureDays(ctx) >= MONTH_3,
  },
  {
    key: 'consistency_monthly',
    name: 'Monthly Champion',
    category: 'consistency',
    tier: 'platinum',
    criterion: ctx =>
      nonNeg(ctx.weeklyActiveRatio) >= WEEKLY_ACTIVE &&
      tenureDays(ctx) >= MONTH_6,
  },
  {
    key: 'consistency_annual',
    name: 'Annual Champion',
    category: 'consistency',
    tier: 'diamond',
    criterion: ctx =>
      nonNeg(ctx.weeklyActiveRatio) >= WEEKLY_ACTIVE &&
      tenureDays(ctx) >= YEAR_1,
  },
  {
    key: 'consistency_steady',
    name: 'Steady Runner',
    category: 'consistency',
    tier: 'master',
    criterion: ctx =>
      nonNeg(ctx.weeklyActiveRatio) >= WEEKLY_ACTIVE &&
      tenureDays(ctx) >= YEAR_2,
  },
  {
    key: 'consistency_never_stop',
    name: 'Never Stop',
    category: 'consistency',
    tier: 'legend',
    criterion: ctx =>
      nonNeg(ctx.weeklyActiveRatio) >= WEEKLY_ELITE &&
      tenureDays(ctx) >= YEAR_2,
  },
];

// ── trainingStyle: 런 타입 믹스(워크아웃 타입 미추적 → 페이스/거리 프록시) ──────────
const TRAINING_STYLE_TITLES: TitleDef[] = [
  {
    // Tempo: 빠른 템포 페이스 능력(최고 페이스 ≤5:00/km) + 충분한 런.
    key: 'style_tempo',
    name: 'Tempo Runner',
    category: 'trainingStyle',
    tier: 'silver',
    criterion: ctx =>
      ctx.bestPaceSec !== null &&
      nonNeg(ctx.bestPaceSec) > 0 &&
      ctx.bestPaceSec <= TEMPO_PACE_SEC &&
      nonNeg(ctx.runCount) >= 10,
  },
  {
    // Long Run Specialist: 단일 장거리 런 완수.
    key: 'style_long_run',
    name: 'Long Run Specialist',
    category: 'trainingStyle',
    tier: 'gold',
    criterion: ctx => nonNeg(ctx.longestRunKm) >= LONG_RUN_KM,
  },
  {
    // Recovery: 평균이 최고보다 뚜렷이 느림 → 회복주를 섞는 패턴 + 충분한 볼륨.
    key: 'style_recovery',
    name: 'Recovery Runner',
    category: 'trainingStyle',
    tier: 'silver',
    criterion: ctx =>
      ctx.avgPaceSec !== null &&
      ctx.bestPaceSec !== null &&
      nonNeg(ctx.bestPaceSec) > 0 &&
      ctx.avgPaceSec >= ctx.bestPaceSec * RECOVERY_PACE_FACTOR &&
      nonNeg(ctx.runCount) >= 20,
  },
  {
    // Race Runner: 풀코스 거리 단일 런(레이스 완주 프록시).
    key: 'style_race',
    name: 'Race Runner',
    category: 'trainingStyle',
    tier: 'platinum',
    criterion: ctx => nonNeg(ctx.longestRunKm) >= RACE_KM,
  },
];

// ── hidden: 미달성 시 갤러리 비노출(달성 순간 공개) ──────────────────────────────
// Rain Runner 는 여기 들어가야 했으나 날씨 미추적으로 OMITTED(위 헤더 주석 참조).
const HIDDEN_TITLES: TitleDef[] = [
  {
    key: 'hidden_early_bird',
    name: 'Early Bird',
    category: 'hidden',
    tier: 'gold',
    hidden: true,
    criterion: ctx => nonNeg(ctx.earlyRunCount) >= 20,
  },
  {
    key: 'hidden_night_runner',
    name: 'Night Runner',
    category: 'hidden',
    tier: 'gold',
    hidden: true,
    criterion: ctx => nonNeg(ctx.nightRunCount) >= 20,
  },
  {
    // 30일 이상 공백 후 복귀 런.
    key: 'hidden_comeback',
    name: 'Comeback Runner',
    category: 'hidden',
    tier: 'silver',
    hidden: true,
    criterion: ctx => nonNeg(ctx.longestGapDays) >= 30,
  },
  {
    // 365일 넘게 함께한(은퇴하지 않은) 신발 1켤레 이상.
    key: 'hidden_long_relationship',
    name: 'Long Relationship',
    category: 'hidden',
    tier: 'platinum',
    hidden: true,
    criterion: ctx => {
      const now = Number.isFinite(ctx.now) ? ctx.now : 0;
      return shoeStats(ctx).some(s => !s.retired && shoeAgeDays(s, now) > YEAR_1);
    },
  },
];

/**
 * 전체 타이틀 카탈로그(권위·불변). 카테고리 순서대로 평탄화한다.
 * 갤러리/엔진은 이 배열만 소비한다(분산 정의 금지).
 */
export const TITLES: readonly TitleDef[] = [
  ...RUNNING_TITLES,
  ...SHOE_TITLES,
  ...ROTATION_TITLES,
  ...INJURY_TITLES,
  ...CONSISTENCY_TITLES,
  ...TRAINING_STYLE_TITLES,
  ...HIDDEN_TITLES,
];

/** key → TitleDef 조회 맵(O(1)). */
export const TITLES_BY_KEY: Readonly<Record<string, TitleDef>> = TITLES.reduce(
  (acc, def) => {
    acc[def.key] = def;
    return acc;
  },
  {} as Record<string, TitleDef>,
);

/** key 로 타이틀 정의 조회(없으면 undefined). */
export function titleDef(key: string): TitleDef | undefined {
  return TITLES_BY_KEY[key];
}

/**
 * 컨텍스트로부터 **현재 충족(언락)된** 타이틀 키 목록을 판정한다.
 * 순수: ctx 불변, criterion 이 던지더라도(있을 수 없음) 삼켜 해당 타이틀만 잠금 처리.
 * 충족 순서는 카탈로그 순서(running→…→hidden)를 따른다(결정적).
 */
export function evaluateTitles(ctx: ProgressionContext): string[] {
  if (!ctx || typeof ctx !== 'object') return [];
  const out: string[] = [];
  for (const def of TITLES) {
    let ok = false;
    try {
      ok = def.criterion(ctx) === true;
    } catch {
      ok = false; // pure-guard: 어떤 입력에서도 throw 가 언락 판정을 깨지 않는다.
    }
    if (ok) out.push(def.key);
  }
  return out;
}

/**
 * 타이틀을 장착한다 — **정확히 하나만** 장착(또는 0개) 불변식을 보장한다.
 * PURE: 입력 state 를 변형하지 않고 새 state 를 반환한다.
 *   · key=null     → 전부 해제(장착 없음).
 *   · 보유한 key    → 그 타이틀만 isEquipped=true, 나머지는 false, equippedTitleKey=key.
 *   · 미보유 key    → 무변경(날조 금지: 보유하지 않은 타이틀은 장착 불가).
 */
export function equip(
  state: ProgressionState,
  key: string | null,
): ProgressionState {
  if (!state || !Array.isArray(state.earnedTitles)) return state;

  if (key === null) {
    return {
      ...state,
      earnedTitles: state.earnedTitles.map(t =>
        t.isEquipped ? {...t, isEquipped: false} : t,
      ),
      equippedTitleKey: null,
    };
  }

  if (!state.earnedTitles.some(t => t.key === key)) {
    return state; // 보유하지 않은 타이틀 — 무변경.
  }

  return {
    ...state,
    earnedTitles: state.earnedTitles.map(t => ({
      ...t,
      isEquipped: t.key === key,
    })),
    equippedTitleKey: key,
  };
}
