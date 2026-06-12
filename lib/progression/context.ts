// ============================================================================
// lib/progression/context.ts — buildContext 집계 (Slice A foundation)
// ============================================================================
// 런/신발/타이틀/챌린지 원시 데이터를 진척 엔진이 읽는 **사전 집계 사실(facts)** 한
// 묶음(ProgressionContext)으로 변환한다. rank/titles/achievements 는 이 컨텍스트만
// 읽어 평가축·기준을 판정하므로, 모든 데이터 파싱·집계는 여기 한곳에 모인다.
//
// PURE(iron law): 입력을 변형하지 않고, NaN/음수/누락은 0(또는 null)으로 방어하며,
// 어떤 입력에서도 throw 하지 않는다. 시각은 호출자가 `now`(epoch ms)로 주입한다
// (Date.now 직접 호출 금지 — 결정적 테스트).
//
// 입력 모양: 상태 배열의 원시 행 BackendRun/BackendShoe(types.d.ts 전역 ambient).
// 재사용: lib/stats.maxDayStreak(연속일), lib/records.personalRecords(페이스/최장 런).
// ============================================================================
import {Run} from '../../theme';
import {personalRecords} from '../records';
import {maxDayStreak} from '../stats';
import {
  ContextChallengeInput,
  EarnedTitle,
  PerShoeStats,
  ProgressionContext,
  RetiredShoeRecord,
  RetirementGrade,
} from './types';

const DAY_MS = 86400000;
/** Early Bird: 시작 시각 < 05:00. */
const EARLY_BEFORE_HOUR = 5;
/** Night Runner: 시작 시각 >= 22:00. */
const NIGHT_AT_OR_AFTER_HOUR = 22;
/** Speedster: 이 거리(km) 이상인 단일 런만 5km+ 페이스 집계에 포함. */
const SPEEDSTER_MIN_KM = 5;

/** km(string|number) → 유한 비음수 숫자. 비정상은 0. */
function parseKm(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 초 단위 숫자 → 유한 비음수. 비정상은 0. */
function parseSeconds(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 'YYYY-MM-DD' 앞 10자만(정규화). 비문자/빈 값은 null. */
function ymd(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 10) return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 'HH:MM' 시작 시각의 시(hour) — 0..23. 파싱 불가면 null(시간대 집계 제외). */
function startHour(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

/** 'YYYY-MM-DD' → 로컬 자정 epoch ms(타임존/DST 안전 — 같은 규약 재사용). */
function ymdToMs(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).getTime();
}

/** 두 'YYYY-MM-DD' 사이 일수(b-a). */
function daysBetween(a: string, b: string): number {
  return Math.round((ymdToMs(b) - ymdToMs(a)) / DAY_MS);
}

/**
 * 정렬된 고유 런 일자에서 마지막 런부터 이어지는 연속 일수.
 * (현재 스트릭 — 오늘까지 이어졌는지는 호출자/엔진이 now 로 별도 판단 가능.)
 */
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

/** 정렬된 고유 일자에서 연속 두 런 사이 최장 공백(일). 1개 이하면 0. */
function longestGapFromDates(sortedUniq: string[]): number {
  let gap = 0;
  for (let i = 1; i < sortedUniq.length; i++) {
    gap = Math.max(gap, daysBetween(sortedUniq[i - 1], sortedUniq[i]));
  }
  return gap;
}

/**
 * 첫 런 주(week)부터 now 주까지 중 런이 있었던 주의 비율(0..1).
 * 주 인덱스 = floor(첫 런으로부터의 일수 / 7).
 */
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

/** BackendRun → 최소 UI Run(personalRecords 가 읽는 dist/durationS/runDate 만 의미). */
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

/**
 * 진척 엔진용 컨텍스트를 집계한다.
 *
 * @param runs       서버/상태 런 행(BackendRun[]). 비배열/null 안전.
 * @param shoes      서버/상태 신발 행(BackendShoe[]). 비배열/null 안전.
 * @param earned     이미 획득한 타이틀(중복 언락 방지/참여도).
 * @param challenges 챌린지(완료 수만 집계) — engagement 평가축.
 * @param now        기준 시각(epoch ms) — 주간 활성도 계산에 주입.
 * @param retiredShoes 영속된 은퇴 레코드(progression_v1.retiredShoes) — 은퇴 업적/타이틀의
 *                    권위 소스. 생략 시 은퇴 카운트/등급은 비어 있는 것으로 본다(하위호환).
 */
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

  // ── 은퇴(Hall of Shoes) 레코드: 실제 은퇴 이벤트 + 등급(날조 금지) ──────────────
  // shoeId 누락 레코드는 무효로 제외(storage 정규화와 동일 규약). 등급 누락 → 'standard'.
  const retirementGrades: RetirementGrade[] = [];
  for (const r of retiredList) {
    if (!r || typeof r.shoeId !== 'string' || !r.shoeId) continue;
    retirementGrades.push((r.grade as RetirementGrade) ?? 'standard');
  }
  const retirementCount = retirementGrades.length;

  // ── perShoe 시드: 등록된 모든 신발(런 0인 신발·은퇴 신발도 포함) ──────────────
  const perShoe: Record<string, PerShoeStats> = {};
  let retiredShoeCount = 0;
  for (const s of shoeList) {
    if (!s || typeof s.id !== 'string' || !s.id) continue;
    const retired = s.retired === true;
    if (retired) retiredShoeCount += 1;
    const maxKm = Number(s.max_km);
    // 서버 truth(total_km) 우선 — 다른 기기 미동기 런으로 인한 과소표시 방지.
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

  // ── 런 1패스: 누적 집계 ────────────────────────────────────────────────────
  let cumulativeKm = 0;
  let totalDurationS = 0;
  let earlyRunCount = 0;
  let nightRunCount = 0;
  // 단일 런 ≥5km 중 최고(최소) 평균 페이스(sec/km) — Speedster 판정용.
  let bestPace5kSec: number | null = null;
  const dates: string[] = [];
  // 신발별 런 합산(서버 total_km 가 없을 때만 km 폴백에 사용).
  const perShoeDerivedKm: Record<string, number> = {};

  for (const r of runList) {
    if (!r) continue;
    const km = parseKm(r.km);
    const dur = parseSeconds(r.duration);
    cumulativeKm += km;
    totalDurationS += dur;

    // 5km 이상 단일 런의 평균 페이스 후보(거리 바닥으로 "짧은 질주" 배제).
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
    if (rd) dates.push(rd);

    const sid = typeof r.shoe_id === 'string' ? r.shoe_id : '';
    if (sid) {
      // 미등록 신발 id 의 런도 perShoe 에 흡수(데이터 일관성).
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

  // 신발 누적거리: 서버 truth(시드 km>0) 우선, 없으면 런 합산으로 채운다.
  for (const id of Object.keys(perShoe)) {
    if (perShoe[id].km <= 0) perShoe[id].km = perShoeDerivedKm[id] ?? 0;
  }

  // ── 스트릭/공백/주간(고유 정렬 일자 기준) ──────────────────────────────────
  const sortedUniq = [...new Set(dates)].sort();
  const longestStreak = sortedUniq.length ? maxDayStreak(sortedUniq) : 0;
  const currentStreak = currentStreakFromDates(sortedUniq);
  const longestGapDays = longestGapFromDates(sortedUniq);
  const wActive = weeklyActiveRatio(sortedUniq, safeNow);

  // ── 페이스/최장 런(lib/records 재사용) ──────────────────────────────────────
  const pr = personalRecords(runList.map(toUiRun));
  const avgPaceSec =
    cumulativeKm > 0 && totalDurationS > 0 ? totalDurationS / cumulativeKm : null;

  const earnedTitleKeys = earnedList
    .map(t => (t && typeof t.key === 'string' ? t.key : ''))
    .filter(Boolean);
  const completedChallengeCount = challengeList.filter(c => c?.completed === true)
    .length;

  return {
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
    registeredShoeCount: shoeList.filter(
      s => s && typeof s.id === 'string' && s.id,
    ).length,
    retiredShoeCount,
    retirementCount,
    retirementGrades,
    perShoe,
    earnedTitleKeys,
    earnedTitleCount: earnedTitleKeys.length,
    completedChallengeCount,
  };
}
