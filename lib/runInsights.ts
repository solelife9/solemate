// ============================================================================
// lib/runInsights.ts — 완주 리캡 자연어 인사이트(Strava/Wrapped식, 순수 파생)
// ----------------------------------------------------------------------------
// 방금 마친 러닝의 "왜 특별했는지"를 사람 말 한 줄로 짚어준다. 숫자를 감정·성취로
// 번역하는 리텐션 기능이되, 원칙을 지킨다:
//   · Truth only  — 실제 집계된 사실만. 날조·과장 0(헌법).
//   · 절제        — 축(페이스 실행 / 꾸준함 / 볼륨)마다 최대 1개, 총 최대 3개.
//   · 격려 톤     — "3주 쉬었네요"(처벌)가 아니라 "3주 만의 러닝"(환영). keep going.
//
// 순수·비파괴·결정성: 입력(이 런 + 이전 런들)만으로 결정된다. Date.now()·네이티브·
//   네트워크 0. 날짜 계산은 run.runDate 를 기준일로 삼아 전역 시각에 의존하지 않는다.
//   모든 엣지(빈/결측/0/비유한/부분 스플릿)에서 NaN/과장 없이 graceful.
//
// 재사용: 신기록(최장거리·최고페이스·최장시간)은 이미 리캡 배지(detectPRs)라 여기서
//   중복 서술하지 않는다 — prKinds 로 받아 볼륨 인사이트에서 배제한다.
// ============================================================================

import type {PRKind} from './records';

/** 인사이트 종류 — 화면(RunRecapScreen)이 kind→아이콘을 매핑한다(로직은 무채·UI무관). */
export type RunInsightKind =
  | 'negativeSplit'
  | 'strongFinish'
  | 'steadyPace'
  | 'streak'
  | 'weekCount'
  | 'comeback'
  | 'monthlyLongest';

export interface RunInsight {
  kind: RunInsightKind;
  /** 강조 문구(짧게). */
  text: string;
  /** 보조 설명(옵션). */
  detail?: string;
}

/** 방금 마친 런. splits 는 구간별 평균 페이스(초/km) 순서열(부분 km 포함 가능). */
export interface InsightRun {
  km: number;
  durationS: number;
  runDate: string; // 'YYYY-MM-DD'(시각 접미사 붙어도 날짜만 사용)
  splits?: {km: number; paceSec: number}[];
}

/** 이 런 이전의 런들(이 런 제외). dist=km, durationS=초, runDate='YYYY-MM-DD'. */
export interface InsightPriorRun {
  dist: number;
  durationS: number;
  runDate: string;
}

export interface RunInsightsOpts {
  /** 이 런이 세운 신기록(배지로 이미 표시) — 볼륨 인사이트 중복 배제용. */
  prKinds?: PRKind[];
}

// ─── 날짜 유틸(결정성: run.runDate 기준, 전역 시각 의존 0) ────────────────────
/** 'YYYY-MM-DD[...]' → 정수 day index(UTC 자정 기준). 파싱 불가 → NaN. */
function dayNum(iso?: string): number {
  if (!iso) return NaN;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** 'YYYY-MM-DD' → {y,m}(1-based month). 파싱 불가 → null. */
function ym(iso?: string): {y: number; m: number} | null {
  if (!iso) return null;
  const [y, m] = String(iso).slice(0, 10).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return {y, m};
}

/** 기준일이 속한 주(월요일 시작)의 [startDay, endDay) day index 반경. */
function weekRange(anchorDay: number): {start: number; end: number} {
  // day 0(1970-01-01)은 목요일이라 dow=0=목. 월요일은 목요일의 3일 전이므로,
  // 이번 주 월요일까지 되감을 일수 = (dow + 3) mod 7 (월→0·화→1…일→6, 전 요일 검증됨).
  const dow = ((anchorDay % 7) + 7) % 7;
  const backToMon = (dow + 3) % 7;
  const start = anchorDay - backToMon;
  return {start, end: start + 7};
}

// ─── 임계값(과장 방지: 유의미한 차이일 때만 서술) ───────────────────────────
const NEG_ABS = 5; // 네거티브 스플릿: 후반이 전반보다 최소 5초/km 빠름
const NEG_REL = 0.015; // + 최소 1.5% 빠름(짧은 런의 미세차 제외)
const FINISH_ABS = 10; // 막판 스퍼트: 마지막 구간이 앞 평균보다 10초/km↑ 빠름
const FINISH_REL = 0.05;
const STEADY_ABS = 12; // 일정한 페이스: 구간 최대-최소 폭 12초/km 이하
const STEADY_REL = 0.035; // + 평균 대비 3.5% 이하
const STREAK_MIN = 3; // N일 연속(이하는 흔해서 절제)
const WEEK_MIN = 2; // 이번 주 N번째(2번째부터)
const COMEBACK_MIN = 14; // 오랜만의 러닝(14일 이상 공백)

/** 스플릿에서 유한·양수 페이스만 순서 보존해 추린다. */
function cleanPaces(splits?: {paceSec: number}[]): number[] {
  if (!Array.isArray(splits)) return [];
  const out: number[] = [];
  for (const s of splits) {
    const p = Number(s?.paceSec);
    if (Number.isFinite(p) && p > 0) out.push(p);
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** 페이스 실행 축 — 이 런의 스플릿 모양에서 최대 1개(우선순위: 네거티브>스퍼트>일정). */
function paceShapeInsight(splits?: {paceSec: number}[]): RunInsight | null {
  const p = cleanPaces(splits);
  const n = p.length;
  if (n < 3) return null;

  // 네거티브 스플릿 — 후반 평균이 전반 평균보다 유의미하게 빠름(반반 비교, n≥4).
  if (n >= 4) {
    const mid = Math.floor(n / 2);
    const front = mean(p.slice(0, mid));
    const back = mean(p.slice(mid));
    if (front > 0 && back <= front - NEG_ABS && back <= front * (1 - NEG_REL)) {
      return {kind: 'negativeSplit', text: '네거티브 스플릿', detail: '후반이 더 빨랐어요'};
    }
  }

  // 막판 스퍼트 — 마지막 구간이 앞 구간 평균보다 뚜렷하게 빠름.
  const last = p[n - 1];
  const earlier = mean(p.slice(0, n - 1));
  if (earlier > 0 && last <= earlier - FINISH_ABS && last <= earlier * (1 - FINISH_REL)) {
    return {kind: 'strongFinish', text: '막판 스퍼트', detail: '마지막 구간이 가장 빨랐어요'};
  }

  // 일정한 페이스 — 구간 편차가 작음(흔들림 없이 고르게).
  const mx = Math.max(...p);
  const mn = Math.min(...p);
  const avg = mean(p);
  if (avg > 0 && mx - mn <= STEADY_ABS && (mx - mn) / avg <= STEADY_REL) {
    return {kind: 'steadyPace', text: '일정한 페이스', detail: '흔들림 없이 고르게'};
  }
  return null;
}

/** 꾸준함 축 — 최대 1개(우선순위: 오랜만>연속>이번 주). */
function consistencyInsight(runDay: number, priorDays: number[]): RunInsight | null {
  const before = priorDays.filter(d => Number.isFinite(d) && d < runDay);

  // 오랜만의 러닝 — 직전 러닝과의 공백이 크면 환영(처벌 아님).
  if (before.length) {
    const lastDay = Math.max(...before);
    const gap = runDay - lastDay;
    if (gap >= COMEBACK_MIN) {
      return {kind: 'comeback', text: `${gap}일 만의 러닝`, detail: '다시 달렸어요'};
    }
  }

  // N일 연속 — runDay 부터 하루씩 거슬러 끊기지 않는 날 수(같은 날 중복은 1로).
  const daySet = new Set(priorDays.filter(Number.isFinite));
  daySet.add(runDay);
  let streak = 0;
  for (let d = runDay; daySet.has(d); d--) streak++;
  if (streak >= STREAK_MIN) {
    return {kind: 'streak', text: `${streak}일 연속 러닝`};
  }

  // 이번 주 N번째 — 같은 주(월~일) 안의 런 수(이 런 포함). 런 단위(같은 날 2회=2).
  const {start, end} = weekRange(runDay);
  const inWeek = priorDays.filter(d => Number.isFinite(d) && d >= start && d < end).length + 1;
  if (inWeek >= WEEK_MIN) {
    return {kind: 'weekCount', text: `이번 주 ${inWeek}번째 러닝`};
  }
  return null;
}

/** 볼륨 축 — 이번 달 최장(올타임 최장은 배지라 배제). 최대 1개. */
function volumeInsight(
  run: InsightRun,
  prior: InsightPriorRun[],
  prKinds: PRKind[],
): RunInsight | null {
  // 올타임 최장 거리는 이미 신기록 배지 — 중복 금지.
  if (prKinds.includes('longestDist')) return null;
  const km = Number(run.km);
  if (!Number.isFinite(km) || km <= 0) return null;
  const cur = ym(run.runDate);
  if (!cur) return null;

  let monthRuns = 0;
  let maxOther = 0;
  for (const r of prior) {
    const y = ym(r?.runDate);
    if (!y || y.y !== cur.y || y.m !== cur.m) continue;
    const d = Number(r?.dist);
    if (!Number.isFinite(d) || d <= 0) continue;
    monthRuns++;
    if (d > maxOther) maxOther = d;
  }
  // 비교 대상(이번 달 다른 런)이 있고, 이 런이 그보다 길 때만.
  if (monthRuns >= 1 && km > maxOther) {
    return {kind: 'monthlyLongest', text: '이번 달 가장 긴 러닝'};
  }
  return null;
}

/**
 * 완주 리캡 자연어 인사이트 — 축(꾸준함·페이스 실행·볼륨)마다 최대 1개, 총 최대 3개.
 * 순서: 꾸준함 → 페이스 실행 → 볼륨(정체성 훅 먼저, 실행 다음, 기록 마지막).
 * 해당 없으면 [](빈) — 화면은 통째로 숨긴다.
 */
export function runInsights(
  run: InsightRun,
  prior: InsightPriorRun[],
  opts?: RunInsightsOpts,
): RunInsight[] {
  const out: RunInsight[] = [];
  if (!run) return out;

  const runDay = dayNum(run.runDate);
  const priorList = Array.isArray(prior) ? prior : [];
  const priorDays = priorList.map(r => dayNum(r?.runDate));
  const prKinds = opts?.prKinds ?? [];

  const consistency = Number.isFinite(runDay)
    ? consistencyInsight(runDay, priorDays)
    : null;
  if (consistency) out.push(consistency);

  const pace = paceShapeInsight(run.splits);
  if (pace) out.push(pace);

  const volume = volumeInsight(run, priorList, prKinds);
  if (volume) out.push(volume);

  return out.slice(0, 3);
}
