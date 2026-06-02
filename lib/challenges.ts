// ============================================================================
// lib/challenges.ts — 개인 챌린지 진행률 (Slice 4)
// 개인(혼자) 전용 챌린지. 계정/서버 없이, 사용자의 런 기록에서만 파생하는 순수
// 함수다. 새 상태를 만들지 않고 'YYYY-MM-DD' 문자열을 사전식으로 비교(기간 판정)
// 하거나 로컬 자정 차로 일수를 세므로(스트릭) 타임존 모킹·데이터 파괴 위험이 없다
// (iron law). 토큰만 — 네이티브 0.
//
// 계약(수용 테스트 @slice-4 개인 챌린지):
//   - distance: 기간[startDate,endDate] 내 런 거리 합 → current,
//     target=targetKm, pct=min(1,current/target), completed=current>=target
//   - streak: 기간 내 연속(끊김 없는 날) 최대 일수 → current, target=targetDays
//   - 런 없으면 current 0 · completed false
// ============================================================================
export type ChallengeKind = 'distance' | 'streak';

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  targetKm?: number;
  targetDays?: number;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
}

export interface ChallengeRun {
  date: string; // 'YYYY-MM-DD'
  dist: number; // km
}

export interface ChallengeProgressResult {
  current: number;
  target: number;
  pct: number;
  completed: boolean;
}

/** 'YYYY-MM-DD' 로 정규화(앞 10자). 빈 입력은 빈 문자열. */
function ymd(d: string | undefined): string {
  return d ? String(d).slice(0, 10) : '';
}

/** date 가 [start,end] 기간 안인지(양끝 포함). 'YYYY-MM-DD' 사전식 비교라 타임존 무관. */
function inPeriod(date: string, start: string, end: string): boolean {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

/** 'YYYY-MM-DD' 두 날짜 사이 일수(b-a). 로컬 자정 차라 DST 안전(rotation 과 동일 규약). */
function daysBetween(a: string, b: string): number {
  const md = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round((md(b) - md(a)) / 86400000);
}

/**
 * 기간 내 거리 합 → current. 음수/NaN/누락 dist 는 0으로 방어(데이터 안전).
 * target=targetKm(없으면 0). pct=min(1,current/target). completed=target>0 && current>=target.
 */
function distanceProgress(ch: Challenge, runs: ChallengeRun[]): ChallengeProgressResult {
  const start = ymd(ch.startDate);
  const end = ymd(ch.endDate);
  const target = Number(ch.targetKm);
  const tgt = Number.isFinite(target) && target > 0 ? target : 0;

  let current = 0;
  for (const r of runs || []) {
    if (!r) continue;
    if (!inPeriod(ymd(r.date), start, end)) continue;
    const km = Number(r.dist);
    if (Number.isFinite(km) && km > 0) current += km;
  }

  const pct = tgt > 0 ? Math.min(1, current / tgt) : 0;
  const completed = tgt > 0 && current >= tgt;
  return {current, target: tgt, pct, completed};
}

/**
 * 기간 내 끊김 없는 최대 연속일 수 → current. 같은 날 여러 런은 1일로 친다(거리>0인
 * 런만 '달린 날'로 인정). target=targetDays. pct=min(1,current/target).
 * completed=target>0 && current>=target. 런 없으면 current 0 · 미달성.
 */
function streakProgress(ch: Challenge, runs: ChallengeRun[]): ChallengeProgressResult {
  const start = ymd(ch.startDate);
  const end = ymd(ch.endDate);
  const target = Number(ch.targetDays);
  const tgt = Number.isFinite(target) && target > 0 ? target : 0;

  // 기간 내 '달린 날'(거리>0)의 고유 날짜 집합 → 사전식 정렬.
  const daySet = new Set<string>();
  for (const r of runs || []) {
    if (!r) continue;
    const d = ymd(r.date);
    if (!inPeriod(d, start, end)) continue;
    const km = Number(r.dist);
    if (Number.isFinite(km) && km > 0) daySet.add(d);
  }
  const days = Array.from(daySet).sort();

  // 인접한 두 날의 차가 정확히 1일이면 연속으로 이어 붙이고, 최댓값을 기록한다.
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (prev !== null && daysBetween(prev, d) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  }

  const current = best;
  const pct = tgt > 0 ? Math.min(1, current / tgt) : 0;
  const completed = tgt > 0 && current >= tgt;
  return {current, target: tgt, pct, completed};
}

/**
 * 개인 챌린지 진행률. kind 에 따라 거리 합(distance) 또는 연속일 수(streak)를 current
 * 로 산출하고, pct 는 항상 [0,1] 로 캡한다. 런이 없으면 current 0 · 미달성.
 */
export function challengeProgress(ch: Challenge, runs: ChallengeRun[]): ChallengeProgressResult {
  if (!ch) return {current: 0, target: 0, pct: 0, completed: false};
  return ch.kind === 'streak'
    ? streakProgress(ch, runs || [])
    : distanceProgress(ch, runs || []);
}
