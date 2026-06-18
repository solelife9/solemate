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
  for (const s of shoeList) {
    if (!s || typeof s.id !== 'string' || !s.id) continue;
    const retired = s.retired === true;
    if (retired) retiredShoeCount += 1;
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
    if (hour !== null) {
      if (hour < EARLY_BEFORE_HOUR) earlyRunCount += 1;
      if (hour >= NIGHT_AT_OR_AFTER_HOUR) nightRunCount += 1;
    }

    const rd = ymd(r.run_date);
    if (rd) {
      dates.push(rd);
      // 계절 감지: 'YYYY-MM-DD'에서 월 추출
      const month = Number(rd.slice(5, 7));
      if (WINTER_MONTHS.has(month)) hasWinterRun = true;
      if (SUMMER_MONTHS.has(month)) hasSummerRun = true;
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

  // 신발 누적거리: 서버 truth 우선, 없으면 런 합산.
  for (const id of Object.keys(perShoe)) {
    if (perShoe[id].km <= 0) perShoe[id].km = perShoeDerivedKm[id] ?? 0;
  }

  // ── 스트릭/공백/주간 ─────────────────────────────────────────────────────────
  const sortedUniq = [...new Set(dates)].sort();
  const longestStreak = sortedUniq.length ? maxDayStreak(sortedUniq) : 0;
  const currentStreak = currentStreakFromDates(sortedUniq);
  const longestGapDays = longestGapFromDates(sortedUniq);
  const wActive = weeklyActiveRatio(sortedUniq, safeNow);

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
  };

  const achievementPoints = computeTotalXp(baseCtx);
  return {...baseCtx, achievementPoints};
}
