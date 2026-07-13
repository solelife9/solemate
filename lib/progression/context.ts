// ============================================================================
// lib/progression/context.ts — buildContext 집계 (재설계 후 확장)
// ============================================================================
// 런/신발/타이틀/챌린지 원시 데이터를 진척 엔진이 읽는 사전 집계 사실(ProgressionContext)
// 한 묶음으로 변환한다. rank/achievements 는 이 컨텍스트만 읽어 평가 기준을 판정한다.
//
// 주요 추가(재설계):
//   · hasWinterRun  — 12·1·2월 런 여부(겨울 런 업적)
//   · hasSummerRun  — 6·7·8월 런 여부(여름 런 업적)
//   · achievementPoints — computeTotalXp(baseCtx) 로 XP 합산(2-pass)
//
// PURE(iron law): 입력을 변형하지 않고, NaN/음수/누락은 0(또는 null)으로 방어하며,
// 어떤 입력에서도 throw 하지 않는다. 시각은 호출자가 `now`(epoch ms)로 주입한다.
// ============================================================================
import {Run} from '../../theme';
import {personalRecords} from '../records';
import {maxDayStreak} from '../stats';
import {computeTotalXp} from './achievements';
import {
  ContextChallengeInput,
  EarnedTitle,
  PerShoeStats,
  ProgressionContext,
  RetiredShoeRecord,
  RetirementGrade,
} from './types';

const DAY_MS = 86400000;
/** '러닝으로 인정'하는 최소 거리(km) — 횟수·스트릭·경험 업적의 게이트. */
export const QUALIFIED_RUN_KM = 1;
const EARLY_BEFORE_HOUR = 5;
const NIGHT_AT_OR_AFTER_HOUR = 22;
const SPEEDSTER_MIN_KM = 5;

/** 겨울 달: 12, 1, 2월. */
const WINTER_MONTHS = new Set([12, 1, 2]);
/** 여름 달: 6, 7, 8월. */
const SUMMER_MONTHS = new Set([6, 7, 8]);

function parseKm(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseSeconds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function ymd(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 10) return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function startHour(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

function ymdToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).getTime();
}

function daysBetween(a: string, b: string): number {
  return Math.round((ymdToMs(b) - ymdToMs(a)) / DAY_MS);
}

function currentStreakFromDates(sortedUniq: string[]): number {
  if (sortedUniq.length === 0) return 0;
  let streak = 1;
  for (let i = sortedUniq.length - 1; i > 0; i--) {
    const diff = daysBetween(sortedUniq[i - 1], sortedUniq[i]);
    if (diff === 1) streak += 1;
    else break;
  }
  return streak;
}

function longestGapFromDates(sortedUniq: string[]): number {
  let gap = 0;
  for (let i = 1; i < sortedUniq.length; i++) {
    gap = Math.max(gap, daysBetween(sortedUniq[i - 1], sortedUniq[i]));
  }
  return gap;
}

function weeklyActiveRatio(sortedUniq: string[], now: number): number {
  if (sortedUniq.length === 0) return 0;
  const first = sortedUniq[0];
  const nowDay = Math.floor(now / DAY_MS) * DAY_MS;
  const spanDays = Math.max(0, Math.round((nowDay - ymdToMs(first)) / DAY_MS));
  const totalWeeks = Math.max(1, Math.floor(spanDays / 7) + 1);
  const activeWeeks = new Set<number>();
  for (const d of sortedUniq) {
    activeWeeks.add(Math.floor(daysBetween(first, d) / 7));
  }
  return Math.min(1, activeWeeks.size / totalWeeks);
}

function toUiRun(r: BackendRun): Run {
  const rd = ymd(r.run_date);
  return {
    id: r.id,
    date: '',
    day: '',
    dateNum: '',
    dist: parseKm(r.km),
    pace: '',
    time: '',
    shoe: 0,
    cal: 0,
    cadence: 0,
    bpm: 0,
    elev: 0,
    durationS: parseSeconds(r.duration),
    runDate: rd ?? undefined,
  };
}

export function buildContext(
  runs: readonly BackendRun[] | null | undefined,
  shoes: readonly BackendShoe[] | null | undefined,
  earned: readonly EarnedTitle[] | null | undefined,
  challenges: readonly ContextChallengeInput[] | null | undefined,
  now: number,
  retiredShoes?: readonly RetiredShoeRecord[] | null | undefined,
): ProgressionContext {
  const runList = Array.isArray(runs) ? runs.filter(Boolean) : [];
  const shoeList = Array.isArray(shoes) ? shoes.filter(Boolean) : [];
  const earnedList = Array.isArray(earned) ? earned.filter(Boolean) : [];
  const challengeList = Array.isArray(challenges) ? challenges.filter(Boolean) : [];
  const retiredList = Array.isArray(retiredShoes) ? retiredShoes.filter(Boolean) : [];
  const safeNow = Number.isFinite(now) ? now : 0;

  // ── 은퇴(Hall of Shoes) 레코드 ──────────────────────────────────────────────
  const retirementGrades: RetirementGrade[] = [];
  for (const r of retiredList) {
    if (!r || typeof r.shoeId !== 'string' || !r.shoeId) continue;
    retirementGrades.push((r.grade as RetirementGrade) ?? 'standard');
  }
  const retirementCount = retirementGrades.length;

  // ── perShoe 시드 ─────────────────────────────────────────────────────────────
  const perShoe: Record<string, PerShoeStats> = {};
  let retiredShoeCount = 0;
  // 등록 마일리지(start_km) — 런 합산 폴백에 더해 누적거리를 정확히 낸다(빠지면 은퇴
  // 명패·키프세이크가 실제보다 적은 km 를 보여줘 수명 링과 모순, Truth-only 위반).
  const perShoeStartKm: Record<string, number> = {};
  for (const s of shoeList) {
    if (!s || typeof s.id !== 'string' || !s.id) continue;
    const retired = s.retired === true;
    if (retired) retiredShoeCount += 1;
    perShoeStartKm[s.id] = Math.max(0, Number((s as {start_km?: number}).start_km) || 0);
    const maxKm = Number(s.max_km);
    const serverKm = Number(s.total_km);
    perShoe[s.id] = {
      id: s.id,
      name: typeof s.name === 'string' ? s.name : '',
      km: Number.isFinite(serverKm) && serverKm > 0 ? serverKm : 0,
      runs: 0,
      firstWorn: null,
      lastWorn: null,
      retired,
      maxKm: Number.isFinite(maxKm) && maxKm > 0 ? maxKm : 0,
    };
  }

  // ── 런 1패스: 누적 집계 ─────────────────────────────────────────────────────
  let cumulativeKm = 0;
  let totalDurationS = 0;
  let earlyRunCount = 0;
  let nightRunCount = 0;
  let qualifiedRunCount = 0;
  const qualifiedDates: string[] = [];
  let hasWinterRun = false;
  let hasSummerRun = false;
  let bestPace5kSec: number | null = null;
  const dates: string[] = [];
  const perShoeDerivedKm: Record<string, number> = {};

  for (const r of runList) {
    if (!r) continue;
    const km = parseKm(r.km);
    const dur = parseSeconds(r.duration);
    cumulativeKm += km;
    totalDurationS += dur;
    // '러닝으로 인정' 기준(≥1km) — 실수로 저장된 초미니 런(0.2km 등)이 횟수·스트릭·
    // 경험 업적을 채우지 않게 한다(런스트릭 국제 규칙 최소 1마일과 같은 취지, 2026-07-04).
    // 누적 거리·시간은 그대로 전부 합산(총량은 총량).
    const qualified = km >= QUALIFIED_RUN_KM;
    if (qualified) qualifiedRunCount += 1;

    if (km >= SPEEDSTER_MIN_KM && dur > 0) {
      const pace = dur / km;
      if (
        Number.isFinite(pace) &&
        pace > 0 &&
        (bestPace5kSec === null || pace < bestPace5kSec)
      ) {
        bestPace5kSec = pace;
      }
    }

    const hour = startHour(r.run_time);
    if (hour !== null && qualified) {
      if (hour < EARLY_BEFORE_HOUR) earlyRunCount += 1;
      if (hour >= NIGHT_AT_OR_AFTER_HOUR) nightRunCount += 1;
    }

    const rd = ymd(r.run_date);
    if (rd) {
      dates.push(rd);
      if (qualified) qualifiedDates.push(rd);
      // 계절 감지: 'YYYY-MM-DD'에서 월 추출 — 경험 업적도 인정 런만.
      const month = Number(rd.slice(5, 7));
      if (qualified && WINTER_MONTHS.has(month)) hasWinterRun = true;
      if (qualified && SUMMER_MONTHS.has(month)) hasSummerRun = true;
    }

    const sid = typeof r.shoe_id === 'string' ? r.shoe_id : '';
    if (sid) {
      const stat =
        perShoe[sid] ??
        (perShoe[sid] = {
          id: sid,
          name: '',
          km: 0,
          runs: 0,
          firstWorn: null,
          lastWorn: null,
          retired: false,
          maxKm: 0,
        });
      stat.runs += 1;
      perShoeDerivedKm[sid] = (perShoeDerivedKm[sid] ?? 0) + km;
      if (rd) {
        if (!stat.firstWorn || rd < stat.firstWorn) stat.firstWorn = rd;
        if (!stat.lastWorn || rd > stat.lastWorn) stat.lastWorn = rd;
      }
    }
  }

  // 신발 누적거리: 서버 truth 우선, 없으면 등록거리(start_km) + 런 합산.
  for (const id of Object.keys(perShoe)) {
    if (perShoe[id].km <= 0) perShoe[id].km = (perShoeDerivedKm[id] ?? 0) + (perShoeStartKm[id] ?? 0);
  }

  // ── 스트릭/공백/주간 ─────────────────────────────────────────────────────────
  const sortedUniq = [...new Set(dates)].sort();
  const longestStreak = sortedUniq.length ? maxDayStreak(sortedUniq) : 0;
  const currentStreak = currentStreakFromDates(sortedUniq);
  const longestGapDays = longestGapFromDates(sortedUniq);
  const wActive = weeklyActiveRatio(sortedUniq, safeNow);
  // 첫 런 → 마지막 런 사이 일수('킵고잉, 1년'). 마지막 '런' 기준이라 안 달리고
  // 기다리기만 하면 늘지 않는다(now 기준이 아님 — 의도).
  const runSpanDays = sortedUniq.length >= 2
    ? Math.max(0, daysBetween(sortedUniq[0], sortedUniq[sortedUniq.length - 1]))
    : 0;
  // 꾸준함 업적용 스트릭 — 인정 런(≥1km) 날짜만으로 계산.
  const qSorted = [...new Set(qualifiedDates)].sort();
  const longestQualifiedStreak = qSorted.length ? maxDayStreak(qSorted) : 0;
  // 주 단위 리듬(월요일 시작) — '쉼표 있는 리듬'(2026-07-04 v4, 사용자 결정):
  // 인정 런이 있는 주를 세되, **공백 1주는 리듬을 끊지 않는다**(diff ≤ 2 는 연결).
  // 2주 연속 비어야 새 리듬. 51주째 몸이 아파 한 주 쉰 러너를 처벌하지 않으면서(부상
  // 휴식 권고와 정렬), 띄엄띄엄 몇 년 모으기는 안 된다(격주 이상의 규칙성 유지 —
  // 단순 누적·누적 거리와 구분). 값은 이어진 리듬 안의 '러닝한 주' 수(공백 주 미포함).
  const weekIdx = [...new Set(qSorted.map(d => {
    const ms = ymdToMs(d);
    const day = new Date(ms).getDay(); // 0 일 .. 6 토
    return Math.floor((ms - ((day + 6) % 7) * DAY_MS) / (7 * DAY_MS));
  }))].sort((a, b) => a - b);
  let longestWeeklyStreak = weekIdx.length ? 1 : 0;
  for (let i = 1, run = 1; i < weekIdx.length; i++) {
    run = weekIdx[i] - weekIdx[i - 1] <= 2 ? run + 1 : 1;
    if (run > longestWeeklyStreak) longestWeeklyStreak = run;
  }
  // 러닝이 있는 주의 총수(연속 무관) — 꾸준함 업적의 단일 소스(2026-07-04 v3).
  // '한 주 쉬면 초기화'는 부상 시 휴식 권고와 충돌하는 가혹함(사용자 지적) —
  // 꾸준함은 끊기지 않는 것이 아니라 다시 돌아오는 것. 쌓이기만 하고 리셋 없음.
  const qualifiedWeekCount = weekIdx.length;

  // ── 페이스/최장 런 ───────────────────────────────────────────────────────────
  const pr = personalRecords(runList.map(toUiRun));
  const avgPaceSec =
    cumulativeKm > 0 && totalDurationS > 0 ? totalDurationS / cumulativeKm : null;

  const earnedTitleKeys = earnedList
    .map(t => (t && typeof t.key === 'string' ? t.key : ''))
    .filter(Boolean);
  const completedChallengeCount = challengeList.filter(c => c?.completed === true).length;

  // ── 베이스 컨텍스트(2-pass: XP 먼저 0, 그 다음 실제 합산) ─────────────────────
  const baseCtx: ProgressionContext = {
    now: safeNow,
    cumulativeKm,
    runCount: runList.length,
    totalDurationS,
    longestRunKm: pr.longestKm,
    bestPaceSec: pr.fastestPaceSec,
    bestPace5kSec,
    avgPaceSec,
    currentStreak,
    longestStreak,
    weeklyActiveRatio: wActive,
    earlyRunCount,
    nightRunCount,
    longestGapDays,
    registeredShoeCount: shoeList.filter(s => s && typeof s.id === 'string' && s.id).length,
    retiredShoeCount,
    retirementCount,
    retirementGrades,
    perShoe,
    earnedTitleKeys,
    earnedTitleCount: earnedTitleKeys.length,
    completedChallengeCount,
    achievementPoints: 0,
    hasWinterRun,
    hasSummerRun,
    runSpanDays,
    qualifiedRunCount,
    longestQualifiedStreak,
    longestWeeklyStreak,
    qualifiedWeekCount,
  };

  const achievementPoints = computeTotalXp(baseCtx);
  return {...baseCtx, achievementPoints};
}
