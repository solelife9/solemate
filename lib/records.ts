// ─── 개인 기록(PR, 탑티어 1-3) ────────────────────────────────────
// 전체 런(theme.Run[])에서 동기부여가 되는 올타임 기록을 순수 파생한다.
//   · 최장 거리(km)       — 단일 런 최대 dist
//   · 최고 페이스(sec/km) — 1km 이상 런 중 가장 빠른 평균 페이스(durationS/dist)
//   · 최장 시간(초)       — 단일 런 최대 durationS
// 네이티브 0·백엔드 0: 입력에서만 결정되는 순수 함수. 원본은 읽기만 한다.
// 모든 엣지(빈 배열·결측·0·비유한)에서 NaN/Infinity 없이 graceful 한 값을 보장한다.

import {Run} from '../theme';
import {maxDayStreak} from './stats';

export type PersonalRecords = {
  /** 최장 단일 런 거리(km). 기록 없으면 0. */
  longestKm: number;
  /** 최고(최소) 평균 페이스(sec/km). 측정 가능한 런이 없으면 null. */
  fastestPaceSec: number | null;
  /** 최장 단일 런 시간(초). 기록 없으면 0. */
  longestDurationS: number;
  /** 최장 연속 러닝 일수(스트릭) — Keego('keep going') 핵심 동기지표. 기록 없으면 0. */
  longestStreakDays: number;
  /** PR 계산에 쓰인 유효 런 수(0이면 화면에서 카드 숨김). */
  count: number;
};

// 1km 미만 런은 페이스 기록에서 제외 — 짧은 스프린트/오기록이 '최고 페이스'를 왜곡하지 않게.
const MIN_PACE_KM = 1;

/** 전체 런에서 올타임 개인 기록을 구한다(파생값만). */
export function personalRecords(runs: Run[]): PersonalRecords {
  const list = Array.isArray(runs) ? runs : [];
  let longestKm = 0;
  let longestDurationS = 0;
  let fastestPaceSec: number | null = null;
  let count = 0;

  for (const r of list) {
    if (!r) continue;
    count += 1;
    const km = Number(r.dist);
    const dur = Number(r.durationS);
    if (Number.isFinite(km) && km > longestKm) longestKm = km;
    if (Number.isFinite(dur) && dur > longestDurationS) longestDurationS = dur;
    // 평균 페이스 = 시간/거리. 1km 이상 + 시간 양수 + 유한일 때만 후보.
    if (Number.isFinite(km) && km >= MIN_PACE_KM && Number.isFinite(dur) && dur > 0) {
      const paceSec = dur / km;
      if (
        Number.isFinite(paceSec) &&
        paceSec > 0 &&
        (fastestPaceSec == null || paceSec < fastestPaceSec)
      ) {
        fastestPaceSec = paceSec;
      }
    }
  }

  // 최장 연속 러닝일 — 같은 달력일 중복 제거 후 연속 일수의 최댓값(stats.maxDayStreak 재사용).
  const dates = list
    .map((r) => (r && typeof r.runDate === 'string' ? r.runDate : ''))
    .filter((d): d is string => !!d);
  const longestStreakDays = dates.length ? maxDayStreak(dates) : 0;

  return {longestKm, fastestPaceSec, longestDurationS, longestStreakDays, count};
}

// ─── 신기록(PR) 감지 — 완주 직후 "방금 그 런이 신기록인가?" ──────────────────────
export type PRKind = 'longestDist' | 'longestTime' | 'fastestPace';

/** PR 종류 → 한국어 라벨(토스트/배지/공유용). */
export const PR_LABEL: Record<PRKind, string> = {
  longestDist: '최장 거리',
  longestTime: '최장 시간',
  fastestPace: '최고 페이스',
};

/**
 * 방금 저장한 런(newRun)이 그 이전 런들(priorRuns, 이 런 제외) 대비 세운 신기록을 반환한다.
 * 첫 런(이전 기록 없음)은 비교 대상이 없어 PR 로 보지 않는다([] 반환) — 별도 '첫 런' 축하가 담당.
 * 페이스 PR 은 이전에 측정 가능한 페이스가 있었을 때만(1km↑) 인정한다. 순수 함수(파생만).
 */
export function detectPRs(
  newRun: {dist: number; durationS: number},
  priorRuns: ReadonlyArray<{dist: number; durationS: number; runDate?: string}>,
): PRKind[] {
  const prior = personalRecords(priorRuns as unknown as Run[]);
  if (prior.count === 0) return []; // 첫 런 — 비교 대상 없음
  const km = Number(newRun.dist);
  const dur = Number(newRun.durationS);
  const out: PRKind[] = [];
  if (Number.isFinite(km) && km > 0 && km > prior.longestKm) out.push('longestDist');
  if (Number.isFinite(dur) && dur > 0 && dur > prior.longestDurationS) out.push('longestTime');
  if (Number.isFinite(km) && km >= MIN_PACE_KM && Number.isFinite(dur) && dur > 0) {
    const paceSec = dur / km;
    if (paceSec > 0 && prior.fastestPaceSec != null && paceSec < prior.fastestPaceSec) {
      out.push('fastestPace');
    }
  }
  return out;
}
