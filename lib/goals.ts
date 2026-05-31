// 주간 목표 추적 · 연속 달림(스트릭) · 개인 기록 순수함수
//
// 날짜는 로컬 기준(=> .tenet/knowledge/2026-05-31_global-globalthis.md):
//  - 기준 시각(mondayISO·todayISO)을 인자로 주입 → 전역 Date 모킹 불필요.
//  - 'YYYY-MM-DD' 문자열을 직접 분해해 new Date(y, m-1, d)로 로컬 자정을
//    만들므로 타임존/DST 파싱 차이(예: new Date('2026-05-25')의 UTC 해석)를 피한다.

export interface Run {
  /** 로컬 날짜 'YYYY-MM-DD' (시각이 붙어도 날짜 부분만 사용) */
  run_date: string;
  /** 거리(km, 저장 표준) */
  km: number;
  /** 소요 시간(초). 개인 기록 계산용(선택) */
  durationS?: number;
}

export interface WeeklyProgress {
  totalKm: number;
  /** goalKm 대비 달성률(%, 정수 반올림). goalKm<=0이면 0 */
  percent: number;
}

export interface PersonalRecords {
  /** 1km 최고 기록(초). 1km 이상·시간이 있는 기록이 없으면 null */
  fastest1k: number | null;
  /** 5km 최고 기록(초). 5km 이상·시간이 있는 기록이 없으면 null */
  fastest5k: number | null;
  /** 최장 거리(km). 기록이 없으면 null */
  longest: number | null;
}

/** 'YYYY-MM-DD[...]'의 날짜 부분만 떼어 로컬 자정 Date로 변환 */
function localMidnight(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** base에서 days일 이동한 로컬 자정 (DST 안전) */
function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/**
 * 한 주(mondayISO 00:00 ~ +7일 00:00, 로컬, 끝 배타) 안의 거리 합과 목표 달성률.
 */
export function weeklyProgress(
  runs: Run[],
  goalKm: number,
  mondayISO: string,
): WeeklyProgress {
  const monday = localMidnight(mondayISO);
  const start = monday.getTime();
  const end = addDays(monday, 7).getTime();

  let totalKm = 0;
  for (const r of runs) {
    const day = localMidnight(r.run_date).getTime();
    if (day >= start && day < end) totalKm += r.km;
  }

  const percent = goalKm > 0 ? Math.round((totalKm / goalKm) * 100) : 0;
  return { totalKm, percent };
}

/**
 * 오늘(todayISO)까지 이어지는 연속 달림 일수. 유예 없음:
 * 오늘 기록이 없으면 0, 있으면 과거로 끊길 때까지 센다.
 */
export function currentStreak(runs: Run[], todayISO: string): number {
  const days = new Set(runs.map((r) => localMidnight(r.run_date).getTime()));

  let cursor = localMidnight(todayISO);
  let streak = 0;
  while (days.has(cursor.getTime())) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * 개인 기록: 1km/5km 최고 기록(평균 페이스 환산 시간, 초)과 최장 거리(km).
 * 페이스는 거리·시간이 모두 양수인 기록만 사용한다.
 */
export function personalRecords(runs: Run[]): PersonalRecords {
  let fastest1k: number | null = null;
  let fastest5k: number | null = null;
  let longest: number | null = null;

  for (const r of runs) {
    if (longest === null || r.km > longest) longest = r.km;

    if (r.km > 0 && r.durationS !== undefined && r.durationS > 0) {
      const secPerKm = r.durationS / r.km;
      if (r.km >= 1 && (fastest1k === null || secPerKm < fastest1k)) {
        fastest1k = secPerKm;
      }
      if (r.km >= 5) {
        const t5 = secPerKm * 5;
        if (fastest5k === null || t5 < fastest5k) fastest5k = t5;
      }
    }
  }

  return { fastest1k, fastest5k, longest };
}
