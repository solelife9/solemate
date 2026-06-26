// ============================================================================
// lib/pacePlan.ts — 스피드 러닝 '페이스 플랜'(km별 목표 페이스) 순수 로직
// 거리(km 수) + 평균 목표 페이스(초/km) + 전략으로 km별 목표 페이스 배열을 만든다.
//   · even      : 전 구간 동일 페이스
//   · negative  : 초반 느리게 → 후반 빠르게(네거티브 스플릿). 평균은 입력 평균에 수렴.
//   · custom    : UI 에서 km칸을 직접 미세조정한 배열(이 모듈은 생성만, 보관은 화면 상태).
// 네이티브/백엔드 0 — 입력에서만 결정되는 순수 함수. NaN/Infinity/음수 없이 graceful.
// ============================================================================

export type PaceStrategy = 'even' | 'negative' | 'custom';

/** 페이스 합리 범위(초/km) — 2:30 ~ 12:00. 생성/미세조정 모두 이 범위로 clamp. */
export const PACE_MIN_SEC = 150;
export const PACE_MAX_SEC = 720;
/** 네거티브 스플릿 기본 스프레드(초): 첫 km = 평균+SPREAD(느리게), 마지막 = 평균−SPREAD(빠르게). */
export const NEGATIVE_SPREAD_SEC = 15;

export function clampPace(sec: number): number {
  if (!Number.isFinite(sec)) return PACE_MIN_SEC;
  return Math.max(PACE_MIN_SEC, Math.min(PACE_MAX_SEC, Math.round(sec)));
}

/** 거리(km) → 플랜 구간 수(정수 km). 0.5km 이상은 한 칸 더(마지막 부분 구간 포함). 최소 1. */
export function planSegments(km: number): number {
  const k = Number.isFinite(km) ? km : 0;
  return Math.max(1, Math.ceil(k - 1e-9));
}

/**
 * km별 목표 페이스 배열(길이 = planSegments(km)). 평균 페이스 avgSec 기준, 전략에 따라 분배.
 * negative 는 i=0 에서 avg+spread(느리게) → i=n-1 에서 avg−spread(빠르게)로 선형 보간(평균 보존).
 */
export function buildPacePlan(km: number, avgSec: number, strategy: PaceStrategy): number[] {
  const n = planSegments(km);
  const avg = clampPace(avgSec);
  if (strategy !== 'negative' || n === 1) {
    return Array.from({length: n}, () => avg);
  }
  // 스프레드는 너무 작은 평균에서 하한을 뚫지 않게 조정(대칭 유지).
  const spread = Math.min(NEGATIVE_SPREAD_SEC, avg - PACE_MIN_SEC, PACE_MAX_SEC - avg);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 → 1
    out.push(clampPace(avg + spread * (1 - 2 * t)));
  }
  return out;
}

/** 진행 거리(km)에서 '현재 구간'의 목표 페이스. 플랜 밖(완주 초과)이면 마지막 구간 유지. */
export function currentTargetPace(plan: number[], distanceKm: number): number | null {
  if (!plan || plan.length === 0) return null;
  const idx = Math.max(0, Math.min(plan.length - 1, Math.floor(Number.isFinite(distanceKm) ? distanceKm : 0)));
  const v = plan[idx];
  return Number.isFinite(v) ? v : null;
}

/** 플랜의 평균 페이스(초/km) — 표시/검증용. 빈 배열이면 null. */
export function planAvgPace(plan: number[]): number | null {
  if (!plan || plan.length === 0) return null;
  const sum = plan.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  return Math.round(sum / plan.length);
}

/** 초/km → "M'SS\"" (페이스 표기). 비유한/0이하는 '--'. */
export function fmtPaceSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}
