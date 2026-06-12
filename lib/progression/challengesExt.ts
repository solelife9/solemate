// ============================================================================
// lib/progression/challengesExt.ts — 확장 챌린지 로직 (Slice C)
// ============================================================================
// 기존 개인 챌린지(lib/challenges 의 distance/streak)를 확장해 4종을 더한다:
//   · monthly  — 이번 달 거리(km) 또는 런 횟수 목표
//   · shoe     — 특정 신발(혹은 새로 등록한 신발)로 누적한 거리(km) 목표
//   · rotation — 이번 주에 활성 신발 N켤레 이상 사용(distinct) 또는
//                한 신발이 주간 거리의 X% 를 넘지 않게 분산(balance)
//   · smart    — generateSmartChallenge: 로테이션/마모에서 파생한 **개인화·결정적**
//                추천(과사용 신발 → 가장 덜 신은 신발에 거리 목표 + 투명한 한국어 사유)
//
// PURE(iron law): 입력을 변형하지 않고, NaN/음수/누락은 안전값으로 방어하며, throw 하지
// 않는다. 기간 판정은 lib/challenges 와 동일한 'YYYY-MM-DD' 사전식 비교(타임존 안전)로
// 하고, 거리 합산은 기존 challengeProgress 를 재사용한다(중복 구현 금지). 시각은 호출자가
// `now`('YYYY-MM-DD' 문자열)로 주입한다(Date.now 직접 호출 금지 — 결정적).
//
// 완료는 참여도(engagement) 평가축으로 흐른다: extChallengesToContext 가 완료 여부를
// Slice A 가 세는 것과 동일한 ContextChallengeInput({completed}) 모양으로 변환하므로,
// buildContext 의 challenges 인자로 그대로 넘기면 completedChallengeCount 에 합산된다.
// ============================================================================
import {
  challengeProgress,
  Challenge,
  ChallengeRun,
  ChallengeProgressResult,
} from '../challenges';
import {
  effectiveWearKm,
  targetKmFor,
  type WearRun,
  type WearShoe,
} from '../wearModel';
import {ContextChallengeInput} from './types';

// ── 입력 모양(최소·순수) ──────────────────────────────────────────────────────
// lib/challenges 의 ChallengeRun({date,dist})을 확장해 신발 귀속(shoeId)만 더한다.
export interface ExtRun extends ChallengeRun {
  /** 이 런을 신은 신발 id(shoe/rotation 집계용). 없으면 신발 미귀속. */
  shoeId?: string;
  /** 소요 시간(초) — 마모 모델 페이스 보정용(선택). */
  durationS?: number;
}

/** 챌린지 집계가 읽는 최소 신발 모양. 활성 판정·마모 추정·표시명에 쓴다. */
export interface ExtShoe {
  id: string;
  name?: string;
  /** 보관(아카이브). true 면 활성에서 제외(로테이션·smart 대상 아님). */
  retired?: boolean;
  /** 등록일('YYYY-MM-DD' 또는 ISO) — '새로 등록한 신발' 판정/마모 시간성분용. */
  createdAt?: string;
  /** 권장 수명(km) — 마모 비율 산출용(없으면 모델명/기본값 폴백). */
  targetKm?: number;
}

export type ExtChallengeKind = 'monthly' | 'shoe' | 'rotation';

/** monthly 목표 종류. */
export type MonthlyMetric = 'distance' | 'count';
/** rotation 모드. distinct=N켤레 이상 / balance=한 신발 X% 이하. */
export type RotationMode = 'distinct' | 'balance';

export interface ExtChallenge {
  id: string;
  kind: ExtChallengeKind;
  // ── monthly ──
  /** 'distance'(거리 km) | 'count'(런 횟수). 기본 distance. */
  metric?: MonthlyMetric;
  targetKm?: number;
  targetRuns?: number;
  /** 기준 달('YYYY-MM'). 없으면 now 의 달. */
  month?: string;
  // ── shoe ──
  /** 대상 신발 id. 'new'(또는 미지정+newShoe=true)면 가장 최근 등록 활성 신발. */
  shoeId?: string;
  /** 특정 id 대신 '새로 등록한 신발'을 대상으로 삼는다. */
  newShoe?: boolean;
  // ── rotation ──
  /** distinct | balance. 기본 distinct. */
  rotationMode?: RotationMode;
  /** distinct: 사용할 활성 신발 최소 켤레수(기본 2). */
  targetShoes?: number;
  /** balance: 한 신발이 넘지 말아야 할 주간 거리 비율 %(기본 60). */
  maxSharePct?: number;
  // ── 공통(선택) ──
  /** shoe 누적 기간 하한('YYYY-MM-DD'). 없으면 전체 기간. */
  startDate?: string;
  /** shoe 누적 기간 상한('YYYY-MM-DD'). 없으면 전체 기간. */
  endDate?: string;
  /** smart 추천의 투명한 한국어 사유(generateSmartChallenge 가 채운다). */
  reason?: string;
}

// ── 결정적 상수 ───────────────────────────────────────────────────────────────
const DEFAULT_ROTATION_SHOES = 2;
const DEFAULT_MAX_SHARE_PCT = 60;
/** smart: '최근' 사용량을 보는 창(일). now 포함 직전 28일. */
const SMART_RECENT_DAYS = 28;
const SMART_TARGET_MIN = 10;
const SMART_TARGET_MAX = 50;

// ── 순수 헬퍼(challenges.ts 규약 재사용) ───────────────────────────────────────

/** 'YYYY-MM-DD' 앞 10자 정규화. 빈 입력은 ''. */
function ymd(d: string | undefined): string {
  return d ? String(d).slice(0, 10) : '';
}

/** 유한·양수 km 만 반환, 그 외 0(데이터 안전). */
function safeKm(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 'YYYY-MM-DD' 에 delta 일을 더한 날짜('YYYY-MM-DD'). 로컬 자정 기준이라 DST 안전. */
function shiftDate(d: string, delta: number): string {
  const [y, m, dd] = ymd(d).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(dd)) return ymd(d);
  const t = new Date(y, m - 1, dd + delta);
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  return `${t.getFullYear()}-${mm}-${day}`;
}

/** now 가 속한 달의 [첫날, 끝날] 윈도우('YYYY-MM-DD'). month 오버라이드 가능('YYYY-MM'). */
function monthWindow(now: string, month?: string): {start: string; end: string} {
  const ym = (month && /^\d{4}-\d{2}/.test(month) ? month : ymd(now)).slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // 다음 달 0일 = 이번 달 말일
  return {start: `${ym}-01`, end: `${ym}-${String(lastDay).padStart(2, '0')}`};
}

/** now 가 속한 주(월~일)의 [시작, 끝] 윈도우('YYYY-MM-DD'). */
function weekWindow(now: string): {start: string; end: string} {
  const [y, m, d] = ymd(now).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0 일 .. 6 토
  const backToMon = (dow + 6) % 7; // 월요일까지 되돌릴 일수
  const start = shiftDate(now, -backToMon);
  return {start, end: shiftDate(start, 6)};
}

/** date 가 [start,end] 안인지(양끝 포함). 사전식 비교 — 타임존 무관. */
function inWindow(date: string, start: string, end: string): boolean {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

const EMPTY: ChallengeProgressResult = {current: 0, target: 0, pct: 0, completed: false};

// ── monthly ──────────────────────────────────────────────────────────────────
/**
 * 이번 달(또는 challenge.month) 거리 합 또는 런 횟수. distance 는 기존 challengeProgress
 * 를 재사용(달 윈도우를 distance 챌린지로 환산)하고, count 는 달 윈도우 내 '달린 날의 런'
 * (dist>0) 수를 센다.
 */
function monthlyProgress(
  ch: ExtChallenge,
  runs: ExtRun[],
  now: string,
): ChallengeProgressResult {
  const {start, end} = monthWindow(now, ch.month);
  const metric: MonthlyMetric = ch.metric === 'count' ? 'count' : 'distance';

  if (metric === 'distance') {
    const inner: Challenge = {
      id: ch.id,
      kind: 'distance',
      targetKm: ch.targetKm,
      startDate: start,
      endDate: end,
    };
    return challengeProgress(inner, runs as ChallengeRun[]);
  }

  // count: 달 윈도우 내, 실제로 달린(dist>0) 런의 수.
  const target = Number(ch.targetRuns);
  const tgt = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;
  let current = 0;
  for (const r of runs || []) {
    if (!r) continue;
    if (!inWindow(ymd(r.date), start, end)) continue;
    if (safeKm(r.dist) > 0) current += 1;
  }
  const pct = tgt > 0 ? Math.min(1, current / tgt) : 0;
  return {current, target: tgt, pct, completed: tgt > 0 && current >= tgt};
}

// ── shoe ─────────────────────────────────────────────────────────────────────
/** '새로 등록한 신발' = createdAt 이 가장 늦은 활성 신발. 동률은 id 사전식. */
function newestActiveShoe(shoes: ExtShoe[]): ExtShoe | null {
  const active = (shoes || []).filter(s => s && !s.retired && s.id);
  if (!active.length) return null;
  return active.reduce((best, s) => {
    const a = ymd(s.createdAt);
    const b = ymd(best.createdAt);
    if (a !== b) return a > b ? s : best;
    return s.id < best.id ? s : best;
  });
}

/**
 * 특정 신발(또는 새로 등록한 신발)로 누적한 거리. 그 신발의 런만 골라 기존
 * challengeProgress(distance)에 태워 합산한다(기간 지정 시 그 안만, 없으면 전체).
 */
function shoeProgress(
  ch: ExtChallenge,
  runs: ExtRun[],
  shoes: ExtShoe[],
  _now: string,
): ChallengeProgressResult {
  const targetId =
    ch.newShoe || ch.shoeId === 'new'
      ? newestActiveShoe(shoes)?.id
      : ch.shoeId;
  if (!targetId) return {...EMPTY, target: safeKm(ch.targetKm)};

  const owned = (runs || []).filter(r => r && r.shoeId === targetId);
  const inner: Challenge = {
    id: ch.id,
    kind: 'distance',
    targetKm: ch.targetKm,
    startDate: ymd(ch.startDate), // '' → 하한 없음
    endDate: ymd(ch.endDate), //   '' → 상한 없음
  };
  return challengeProgress(inner, owned as ChallengeRun[]);
}

// ── rotation ─────────────────────────────────────────────────────────────────
/** 이번 주 활성 신발 런만(거리>0). shoeId 가 활성 집합에 있는 런. */
function weekActiveRuns(
  runs: ExtRun[],
  shoes: ExtShoe[],
  now: string,
): ExtRun[] {
  const {start, end} = weekWindow(now);
  const activeIds = new Set(
    (shoes || []).filter(s => s && !s.retired && s.id).map(s => s.id),
  );
  return (runs || []).filter(
    r =>
      r &&
      r.shoeId &&
      activeIds.has(r.shoeId) &&
      safeKm(r.dist) > 0 &&
      inWindow(ymd(r.date), start, end),
  );
}

/**
 * 로테이션. distinct: 이번 주 사용한 서로 다른 활성 신발 수 ≥ N. balance: 한 신발이
 * 주간 거리의 X% 를 넘지 않음. balance 의 current 는 '현재 최대 한 신발 점유율%',
 * target 은 X — 점유율이 X 이하로 내려오면 달성('아래로 유지'형 목표).
 */
function rotationProgress(
  ch: ExtChallenge,
  runs: ExtRun[],
  shoes: ExtShoe[],
  now: string,
): ChallengeProgressResult {
  const mode: RotationMode = ch.rotationMode === 'balance' ? 'balance' : 'distinct';
  const wr = weekActiveRuns(runs, shoes, now);

  if (mode === 'distinct') {
    const tgtRaw = Number(ch.targetShoes);
    const tgt =
      Number.isFinite(tgtRaw) && tgtRaw > 0
        ? Math.floor(tgtRaw)
        : DEFAULT_ROTATION_SHOES;
    const distinct = new Set(wr.map(r => r.shoeId as string)).size;
    const pct = tgt > 0 ? Math.min(1, distinct / tgt) : 0;
    return {current: distinct, target: tgt, pct, completed: distinct >= tgt};
  }

  // balance: 한 신발 점유율 ≤ X%.
  const xRaw = Number(ch.maxSharePct);
  const x =
    Number.isFinite(xRaw) && xRaw > 0 ? Math.min(100, xRaw) : DEFAULT_MAX_SHARE_PCT;
  const perShoe = new Map<string, number>();
  let total = 0;
  for (const r of wr) {
    const km = safeKm(r.dist);
    total += km;
    perShoe.set(r.shoeId as string, (perShoe.get(r.shoeId as string) ?? 0) + km);
  }
  if (total <= 0) return {current: 0, target: x, pct: 0, completed: false};
  const maxKm = Math.max(...perShoe.values());
  const maxShare = (maxKm / total) * 100;
  const completed = maxShare <= x;
  const pct = completed ? 1 : Math.max(0, Math.min(1, x / maxShare));
  return {current: maxShare, target: x, pct, completed};
}

// ── 디스패치 ──────────────────────────────────────────────────────────────────
/**
 * 확장 챌린지 진행률. kind 에 따라 monthly/shoe/rotation 으로 분기한다. 순수·방어적:
 * 잘못된 입력/누락은 안전한 0 진행으로 떨어지고 throw 하지 않는다.
 *
 * @param now 기준일('YYYY-MM-DD'). 달/주 윈도우의 기준.
 */
export function challengeExtProgress(
  challenge: ExtChallenge,
  runs: ExtRun[],
  shoes: ExtShoe[],
  now: string,
): ChallengeProgressResult {
  if (!challenge || !challenge.kind) return EMPTY;
  const safeRuns = Array.isArray(runs) ? runs : [];
  const safeShoes = Array.isArray(shoes) ? shoes : [];
  const safeNow = ymd(now);
  switch (challenge.kind) {
    case 'monthly':
      return monthlyProgress(challenge, safeRuns, safeNow);
    case 'shoe':
      return shoeProgress(challenge, safeRuns, safeShoes, safeNow);
    case 'rotation':
      return rotationProgress(challenge, safeRuns, safeShoes, safeNow);
    default:
      return EMPTY;
  }
}

// ── smart(개인화·결정적) ───────────────────────────────────────────────────────
function roundTo5(x: number): number {
  return Math.round(x / 5) * 5;
}

/** ExtShoe → wearModel WearShoe 어댑터(읽기 전용). */
function toWearShoe(s: ExtShoe): WearShoe {
  return {name: s.name ?? '', target_km: s.targetKm, created_at: s.createdAt};
}

/** ExtRun → wearModel WearRun 어댑터(읽기 전용). */
function toWearRun(r: ExtRun): WearRun {
  return {distance_km: safeKm(r.dist), duration_s: r.durationS} as WearRun;
}

interface ShoeUsage {
  shoe: ExtShoe;
  recentKm: number;
  /** 마모/권장수명 비율(클수록 과사용·교체 임박). */
  wearRatio: number;
}

/**
 * 개인화·결정적 스마트 챌린지를 만든다. 활성 신발이 2켤레 미만이면 null(로테이션 무의미).
 *
 * 로직(같은 입력 → 항상 같은 출력, Math.random/Date.now 미사용):
 *   1) 활성 신발별 최근 28일 거리(recentKm)와 wearModel 마모비율(wearRatio)을 구한다.
 *   2) 과사용 신발 = (recentKm desc, wearRatio desc, id asc) 최상위.
 *   3) 가장 덜 신은 신발 = 과사용 제외 후 (recentKm asc, wearRatio asc, id asc) 최상위.
 *   4) 덜 신은 신발에 거리 목표 = clamp(roundTo5(과사용 최근거리 / 2), 10..50)km.
 *   5) 투명한 한국어 사유: '<과사용>를 많이 신었어요 → <덜신은>로 <target>km'.
 *
 * 실제 등록된 활성 신발만 대상으로 하며(날조 금지), 반환 챌린지는 kind 'shoe'(대상
 * shoeId=덜 신은 신발)로 즉시 추적 가능하다. **전진(forward) 윈도우**를 박는다:
 * startDate=now(추천 시점) ~ endDate=이번 달 말일. 추천 이후 달린 거리만 진행으로 세므로,
 * 덜 신은 신발의 과거 누적(평생) 거리가 targetKm 을 넘더라도 '태어나자마자 완료'되지
 * 않는다(current=0 에서 시작 — 'never fabricate'·참여도 오염 방지).
 *
 * @param now 기준일('YYYY-MM-DD').
 */
export function generateSmartChallenge(
  runs: ExtRun[],
  shoes: ExtShoe[],
  now: string,
): ExtChallenge | null {
  const safeRuns = Array.isArray(runs) ? runs : [];
  const safeNow = ymd(now);
  const active = (Array.isArray(shoes) ? shoes : []).filter(
    s => s && !s.retired && s.id,
  );
  if (active.length < 2) return null;

  const recentStart = shiftDate(safeNow, -(SMART_RECENT_DAYS - 1));
  const nowDate = (() => {
    const [y, m, d] = safeNow.split('-').map(Number);
    return new Date(y, m - 1, d);
  })();

  const usage: ShoeUsage[] = active.map(shoe => {
    const owned = safeRuns.filter(r => r && r.shoeId === shoe.id);
    let recentKm = 0;
    for (const r of owned) {
      if (inWindow(ymd(r.date), recentStart, safeNow)) recentKm += safeKm(r.dist);
    }
    const wear = effectiveWearKm(toWearShoe(shoe), owned.map(toWearRun), {
      now: nowDate,
    });
    const target = targetKmFor(toWearShoe(shoe));
    const wearRatio = target > 0 ? wear / target : 0;
    return {shoe, recentKm, wearRatio};
  });

  // 과사용: 최근 거리 → 마모비율 → id(결정적 tie-break).
  const overused = [...usage].sort(
    (a, b) =>
      b.recentKm - a.recentKm ||
      b.wearRatio - a.wearRatio ||
      (a.shoe.id < b.shoe.id ? -1 : 1),
  )[0];

  // 덜 신음: 과사용 제외 후 최근 거리 → 마모비율 → id 오름차순.
  const least = usage
    .filter(u => u.shoe.id !== overused.shoe.id)
    .sort(
      (a, b) =>
        a.recentKm - b.recentKm ||
        a.wearRatio - b.wearRatio ||
        (a.shoe.id < b.shoe.id ? -1 : 1),
    )[0];

  const targetKm = Math.max(
    SMART_TARGET_MIN,
    Math.min(SMART_TARGET_MAX, roundTo5(overused.recentKm / 2)),
  );

  const overName = overused.shoe.name || overused.shoe.id;
  const leastName = least.shoe.name || least.shoe.id;
  const reason = `${overName}를 많이 신었어요 → ${leastName}로 ${targetKm}km`;

  // 전진 윈도우: 추천 시점(now) 이후 ~ 이번 달 말일. shoeProgress 가 startDate 를 존중하므로
  // 덜 신은 신발의 추천 이전(평생) 거리는 제외되고, 사용자가 실제로 신어 달린 거리만 센다.
  const {end: monthEnd} = monthWindow(safeNow);

  return {
    id: `smart-${overused.shoe.id}-${least.shoe.id}`,
    kind: 'shoe',
    metric: 'distance',
    shoeId: least.shoe.id,
    targetKm,
    reason,
    startDate: safeNow,
    endDate: monthEnd,
  };
}

// ── 참여도(engagement) 연결 ─────────────────────────────────────────────────────
/**
 * 확장 챌린지들을 buildContext 가 세는 것과 **동일한** 모양(ContextChallengeInput)으로
 * 변환한다 — 각 항목의 completed 만 채운다. 호출자는 결과를 기존 챌린지들과 합쳐
 * buildContext(...challenges...) 인자로 넘기면, 완료된 확장 챌린지가
 * completedChallengeCount(→ engagement 평가축)에 그대로 합산된다(중복 카운트 경로 없음).
 */
export function extChallengesToContext(
  challenges: ExtChallenge[],
  runs: ExtRun[],
  shoes: ExtShoe[],
  now: string,
): ContextChallengeInput[] {
  return (Array.isArray(challenges) ? challenges : [])
    .filter(Boolean)
    .map(ch => ({
      completed: challengeExtProgress(ch, runs, shoes, now).completed,
    }));
}
