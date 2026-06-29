// ============================================================================
// lib/progression/challengesExt.ts — 확장 챌린지 로직 (Slice C)
// ============================================================================
// 기존 개인 챌린지(lib/challenges 의 distance/streak)를 확장해 3종을 더한다:
//   · weekly   — 이번 주 거리(km) 목표 (주 3회 습관 유도, 스마트 추천 기반)
//   · shoe     — 특정 신발(혹은 새로 등록한 신발)로 누적한 거리(km) 목표
//   · rotation — 이번 주에 활성 신발 N켤레 이상 사용(distinct) 또는
//                한 신발이 주간 거리의 X% 를 넘지 않게 분산(balance)
//   · smart    — generateSmartChallenge: 평균 런 거리 × 3 기반 주간 목표 자동 생성
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
import {ContextChallengeInput} from './types';
import {ymdLocal} from '../format';

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

export type ExtChallengeKind = 'weekly' | 'shoe' | 'rotation';

/** weekly 목표 종류(거리 only — 스마트 추천은 항상 distance). */
export type MonthlyMetric = 'distance' | 'count';
/** rotation 모드. distinct=N켤레 이상 / balance=한 신발 X% 이하. */
export type RotationMode = 'distinct' | 'balance';

export interface ExtChallenge {
  id: string;
  kind: ExtChallengeKind;
  // ── weekly ──
  /** 'distance'(거리 km) | 'count'(런 횟수). 스마트 추천은 항상 distance. */
  metric?: MonthlyMetric;
  targetKm?: number;
  targetRuns?: number;
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
const SMART_TARGET_MIN = 5;
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
  return ymdLocal(t); // 'YYYY-MM-DD' 로컬 빌더 단일화(lib/format)
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

// ── weekly ───────────────────────────────────────────────────────────────────
/**
 * 이번 주(월~일) 거리 합 또는 런 횟수. 주 윈도우는 weekWindow(now)로 동적 계산하므로
 * 수락 시점의 startDate/endDate 와 무관하게 항상 현재 주를 반영한다.
 */
function weeklyProgress(
  ch: ExtChallenge,
  runs: ExtRun[],
  now: string,
): ChallengeProgressResult {
  const {start, end} = weekWindow(now);
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

  // count: 이번 주 내 실제로 달린(dist>0) 런의 수.
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
 * 확장 챌린지 진행률. kind 에 따라 weekly/shoe/rotation 으로 분기한다. 순수·방어적:
 * 잘못된 입력/누락은 안전한 0 진행으로 떨어지고 throw 하지 않는다.
 *
 * @param now 기준일('YYYY-MM-DD'). 주 윈도우의 기준.
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
    case 'weekly':
      return weeklyProgress(challenge, safeRuns, safeNow);
    case 'shoe':
      return shoeProgress(challenge, safeRuns, safeShoes, safeNow);
    case 'rotation':
      return rotationProgress(challenge, safeRuns, safeShoes, safeNow);
    default:
      return EMPTY;
  }
}

// ── smart(개인화·결정적 주간 챌린지) ────────────────────────────────────────────
function roundTo5(x: number): number {
  return Math.round(x / 5) * 5;
}

/**
 * 개인화·결정적 스마트 주간 챌린지를 만든다. 런 기록이 없으면 null(빈 상태 표시).
 *
 * 로직(같은 입력 → 항상 같은 출력, Math.random/Date.now 미사용):
 *   1) 전체 런의 평균 1회 거리(avgRunKm)를 구한다.
 *   2) 런 기록 없음 → null(빈 상태 메시지로 대체).
 *   3) 주간 목표 = roundTo5(avgRunKm × 3), clamp(5..50).
 *      → 평균 거리 × 3 = 주 3회 달리면 달성하는 목표.
 *   4) id = 'smart-weekly-{이번 주 월요일}' — 매주 월요일 새 추천으로 교체.
 *   5) weeklyProgress 가 항상 현재 주 윈도우를 동적으로 계산하므로, startDate/endDate 는
 *      참고용(표시)이며 진행률 판정에는 now 기준 weekWindow 를 사용한다.
 *
 * @param now 기준일('YYYY-MM-DD').
 */
export function generateSmartChallenge(
  runs: ExtRun[],
  _shoes: ExtShoe[],
  now: string,
): ExtChallenge | null {
  const safeRuns = Array.isArray(runs) ? runs : [];
  const safeNow = ymd(now);

  // 런 기록 없음 → null(빈 상태)
  const validRuns = safeRuns.filter(r => r && safeKm(r.dist) > 0);
  if (validRuns.length === 0) return null;

  // 평균 1회 거리
  const totalKm = validRuns.reduce((s, r) => s + safeKm(r.dist), 0);
  const avgRunKm = totalKm / validRuns.length;

  // 주간 목표: 평균 × 3, 5단위 반올림, 5~50 캡
  const targetKm = Math.max(
    SMART_TARGET_MIN,
    Math.min(SMART_TARGET_MAX, roundTo5(avgRunKm * 3)),
  );

  const avgDisplay = Math.round(avgRunKm * 10) / 10;
  const reason = `평균 ${avgDisplay}km × 3회 기준 — 이번 주 ${targetKm}km`;

  const {start: weekStart, end: weekEnd} = weekWindow(safeNow);

  return {
    id: `smart-weekly-${weekStart}`,
    kind: 'weekly',
    metric: 'distance',
    targetKm,
    reason,
    startDate: weekStart,
    endDate: weekEnd,
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
