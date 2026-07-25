// ============================================================================
// lib/goalEstimate.ts — 러닝 목표 화면 추정치 개인화(심사 P2 #74, Truth only)
// ----------------------------------------------------------------------------
// RunGoalScreen 의 "예상 시간 · 예상 칼로리"가 일률 5분/km·64kcal/km 고정 가정이라
// 실제 러너의 페이스와 무관한 숫자를 보여줬다. 최근 이력(기본 10회)의 **거리가중
// 평균 페이스**와 **km당 칼로리**(기록에 칼로리가 있을 때만)로 추정한다.
// 이력이 없거나 전부 비정상이면 기존 기본값(5분/km·64kcal/km)으로 폴백 —
// App 배선 전(runs 미전달)에도 기존 동작과 100% 동일하다.
//
// 순수 함수: 입력 불변(정렬은 복사본), throw 금지(비정상 레코드는 걸러냄).
// ============================================================================

/** 이력이 없을 때의 기본 페이스(초/km) — 기존 화면 가정 5분/km 그대로. */
export const DEFAULT_PACE_SEC_PER_KM = 300;
/** 이력이 없을 때의 기본 칼로리(kcal/km) — 기존 화면 가정 64 그대로. */
export const DEFAULT_KCAL_PER_KM = 64;
/** 추정에 쓰는 최근 러닝 수(기본). */
export const ESTIMATE_RECENT_N = 10;

// 비정상 레코드 방어선 — GPS 오염·수기 오입력이 추정을 무너뜨리지 않게.
const MIN_RUN_KM = 0.5; // 0.5km 미만은 페이스 표본으로 무의미
const MIN_PACE_SEC_PER_KM = 150; // 2:30/km 미만 = 세계기록 밖(데이터 오류)
const MAX_PACE_SEC_PER_KM = 1200; // 20:00/km 초과 = 걷기/방치 기록
const MIN_KCAL_PER_KM = 20; // km당 칼로리 타당 범위 밖은 표본 제외
const MAX_KCAL_PER_KM = 200;

/**
 * 추정 입력 레코드 — App 의 BackendRun(duration)·goals.Run(durationS) 어느 쪽이든
 * 그대로 받도록 최소 필드만 선택으로 둔다. km 는 서버 유래 문자열도 허용.
 */
export type EstimateRunLike = {
  km?: number | string;
  /** 소요 시간(초) — BackendRun 필드명. */
  duration?: number;
  /** 소요 시간(초) — goals.Run 필드명(폴백). */
  durationS?: number;
  /** 소모 칼로리(kcal) — 있으면 km당 칼로리 개인화에 사용. */
  calories?: number;
  /** 'YYYY-MM-DD…' — 최근순 정렬 기준. 없으면 배열 뒤쪽(오래된 것)으로 취급. */
  run_date?: string;
};

/** 개인 페이스 프로필 — 최근 이력 요약(폴백 포함, 항상 유효한 숫자). */
export interface PaceProfile {
  /** 거리가중 평균 페이스(초/km). 이력 없으면 DEFAULT_PACE_SEC_PER_KM. */
  paceSecPerKm: number;
  /** km당 칼로리. 칼로리 기록 없으면 DEFAULT_KCAL_PER_KM. */
  kcalPerKm: number;
  /** 페이스에 실제 이력이 반영됐는가(false = 전부 기본값). */
  personalized: boolean;
  /** 페이스 표본으로 쓰인 러닝 수. */
  sampleCount: number;
}

/** 거리·시간이 유효한 페이스 표본인가. */
function paceSample(r: EstimateRunLike): {km: number; sec: number} | null {
  if (r == null || typeof r !== 'object') return null;
  const km = Number(r.km);
  const sec = Number(r.duration ?? r.durationS);
  if (!Number.isFinite(km) || !Number.isFinite(sec)) return null;
  if (km < MIN_RUN_KM || sec <= 0) return null;
  const pace = sec / km;
  if (pace < MIN_PACE_SEC_PER_KM || pace > MAX_PACE_SEC_PER_KM) return null;
  return {km, sec};
}

/**
 * 최근 recentN 회의 거리가중 평균 페이스·km당 칼로리 프로필(순수, throw 금지).
 * - 페이스 = Σ시간 / Σ거리 (긴 러닝이 더 크게 반영 — 단순 평균의 짧은 런 편향 방지).
 * - 칼로리 = 같은 표본 중 칼로리(>0·타당 범위) 기록이 있는 런의 Σkcal / Σkm.
 * - 유효 표본 0 이면 기본값(5분/km·64kcal/km) 폴백, personalized=false.
 */
export function buildPaceProfile(
  runs: readonly EstimateRunLike[] | null | undefined,
  recentN: number = ESTIMATE_RECENT_N,
): PaceProfile {
  const fallback: PaceProfile = {
    paceSecPerKm: DEFAULT_PACE_SEC_PER_KM,
    kcalPerKm: DEFAULT_KCAL_PER_KM,
    personalized: false,
    sampleCount: 0,
  };
  if (!Array.isArray(runs) || runs.length === 0) return fallback;
  const n = Number.isFinite(recentN) && recentN > 0 ? Math.floor(recentN) : ESTIMATE_RECENT_N;

  // 입력 불변 — 복사본을 최근 날짜순으로 정렬(ISO 문자열 내림차순, 날짜 없으면 뒤로).
  const sorted = runs
    .filter((r): r is EstimateRunLike => r != null && typeof r === 'object')
    .slice()
    .sort((a, b) => String(b.run_date ?? '').slice(0, 10).localeCompare(String(a.run_date ?? '').slice(0, 10)));

  let sumKm = 0;
  let sumSec = 0;
  let calKm = 0;
  let calSum = 0;
  let count = 0;
  for (const r of sorted) {
    if (count >= n) break;
    const s = paceSample(r);
    if (!s) continue; // 비정상 레코드는 최근 n 회 창에서 제외(유효 표본 기준 n 회)
    count++;
    sumKm += s.km;
    sumSec += s.sec;
    const kcal = Number(r.calories);
    if (Number.isFinite(kcal) && kcal > 0) {
      const perKm = kcal / s.km;
      if (perKm >= MIN_KCAL_PER_KM && perKm <= MAX_KCAL_PER_KM) {
        calKm += s.km;
        calSum += kcal;
      }
    }
  }
  if (count === 0 || sumKm <= 0) return fallback;
  return {
    paceSecPerKm: sumSec / sumKm,
    kcalPerKm: calKm > 0 ? calSum / calKm : DEFAULT_KCAL_PER_KM,
    personalized: true,
    sampleCount: count,
  };
}

/** 거리 목표(goalKm)의 예상 소요 시간(분, 반올림)·칼로리(kcal, 반올림). */
export function estimateForGoal(
  runs: readonly EstimateRunLike[] | null | undefined,
  goalKm: number,
): {minutes: number; kcal: number; personalized: boolean} {
  const p = buildPaceProfile(runs);
  if (!Number.isFinite(goalKm) || goalKm <= 0) {
    return {minutes: 0, kcal: 0, personalized: p.personalized};
  }
  return {
    minutes: Math.round((goalKm * p.paceSecPerKm) / 60),
    kcal: Math.round(goalKm * p.kcalPerKm),
    personalized: p.personalized,
  };
}

/** 시간 목표(minutes)의 예상 거리(km)·칼로리(kcal, 반올림). km 는 소수 그대로(표시측 포맷). */
export function estimateForDuration(
  runs: readonly EstimateRunLike[] | null | undefined,
  minutes: number,
): {km: number; kcal: number; personalized: boolean} {
  const p = buildPaceProfile(runs);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return {km: 0, kcal: 0, personalized: p.personalized};
  }
  const km = (minutes * 60) / p.paceSecPerKm;
  return {km, kcal: Math.round(km * p.kcalPerKm), personalized: p.personalized};
}
