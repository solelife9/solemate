// ============================================================================
// lib/analytics/hrZones.ts — 심박 존(Z1–Z5) 정의·분류·구간 시간
// ----------------------------------------------------------------------------
// 모든 심박 기반 분석(트레이닝효과·구간 분포·존별 코칭)의 토대. 순수 함수만 — 입력
// 불변, NaN/음수/누락은 안전 처리(throw 금지). 두 가지 존 모델을 지원한다:
//   · %HRmax  — 최대심박 대비 비율. 안정시심박(restHR)이 없을 때 기본.
//   · %HRR    — 여유심박(Karvonen): (bpm-rest)/(max-rest). restHR 이 있으면 더 정확.
// 존 경계는 가민/폴라 등이 쓰는 5존 표준(Z1 회복 … Z5 무산소)을 따른다.
// ============================================================================

export type HRZone = 1 | 2 | 3 | 4 | 5;

/** 존별 한국어 라벨·의미(코칭 카피). */
export const HR_ZONE_LABEL: Record<HRZone, string> = {
  1: '회복',
  2: '유산소',
  3: '템포',
  4: '역치',
  5: '무산소',
};

/** 존별 상세 설명(상세 화면 보조). */
export const HR_ZONE_DESC: Record<HRZone, string> = {
  1: '아주 가벼운 회복 강도',
  2: '지방 연소·기초 지구력',
  3: '유산소 능력 향상',
  4: '젖산 역치·레이스 페이스',
  5: '최대 강도·스피드',
};

/**
 * Tanaka 공식 최대심박 추정(208 − 0.7×나이). 전통적 220−나이 보다 실측에 가깝다.
 * 나이가 비유효(≤0, NaN)면 일반 성인 기본값 190 으로 폴백한다.
 */
export function estimateMaxHR(age: number): number {
  if (!Number.isFinite(age) || age <= 0 || age > 120) return 190;
  return Math.round(208 - 0.7 * age);
}

// %HRmax 5존 하한 경계(이상~). 표준(가민): Z1 50–60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90–100%.
const PCT_MAX_LOWER: Record<HRZone, number> = { 1: 0.5, 2: 0.6, 3: 0.7, 4: 0.8, 5: 0.9 };
// %HRR(Karvonen) 5존 하한. Z1 50, Z2 60, Z3 70, Z4 80, Z5 90% 여유심박.
const PCT_HRR_LOWER: Record<HRZone, number> = { 1: 0.5, 2: 0.6, 3: 0.7, 4: 0.8, 5: 0.9 };

/**
 * 한 심박값을 존(1–5)으로 분류한다. restHR 이 유효하면 HRR(Karvonen), 아니면 %HRmax.
 * Z1 하한(50%) 미만은 너무 낮아 운동으로 안 보지만, 분류는 1로 바닥 처리한다(누락 방지).
 * maxHR 비유효면 0을 돌려 '미분류'를 표현한다(존 0 = 데이터 없음).
 */
export function zoneOf(bpm: number, maxHR: number, restHR?: number): HRZone | 0 {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(maxHR) || maxHR <= 0) return 0;
  const useHRR = Number.isFinite(restHR as number) && (restHR as number) > 0 && (restHR as number) < maxHR;
  const frac = useHRR
    ? (bpm - (restHR as number)) / (maxHR - (restHR as number))
    : bpm / maxHR;
  const lower = useHRR ? PCT_HRR_LOWER : PCT_MAX_LOWER;
  if (frac >= lower[5]) return 5;
  if (frac >= lower[4]) return 4;
  if (frac >= lower[3]) return 3;
  if (frac >= lower[2]) return 2;
  return 1;
}

/** 5존 각 경계 bpm(하한)을 돌려준다 — UI 게이지/범례용. maxHR 비유효면 모두 0. */
export function zoneBoundaries(maxHR: number, restHR?: number): Record<HRZone, number> {
  const useHRR = Number.isFinite(restHR as number) && (restHR as number) > 0 && (restHR as number) < maxHR;
  const lower = useHRR ? PCT_HRR_LOWER : PCT_MAX_LOWER;
  const bpmAt = (f: number) =>
    useHRR ? Math.round((restHR as number) + f * (maxHR - (restHR as number))) : Math.round(f * maxHR);
  if (!Number.isFinite(maxHR) || maxHR <= 0) return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  return { 1: bpmAt(lower[1]), 2: bpmAt(lower[2]), 3: bpmAt(lower[3]), 4: bpmAt(lower[4]), 5: bpmAt(lower[5]) };
}

/** 심박 시계열의 한 점({t: 경과초, bpm}). runTracker 가 남기는 hrTrack 형태. */
export type HRSample = { t: number; bpm: number };

/**
 * 심박 시계열 → 존별 누적 시간(초). 인접 두 표본 사이 구간(Δt)을 앞 표본의 존에 귀속한다
 * (계단 적분). 비유효 표본·역행 시간·미분류(존 0)는 건너뛴다. 반환은 Z1–Z5 누적초.
 */
export function timeInZones(track: HRSample[], maxHR: number, restHR?: number): Record<HRZone, number> {
  const out: Record<HRZone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const pts = (Array.isArray(track) ? track : []).filter(p => p && Number.isFinite(p.t) && Number.isFinite(p.bpm));
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (!(dt > 0)) continue; // 역행/정체 구간은 무시
    const z = zoneOf(pts[i - 1].bpm, maxHR, restHR);
    if (z !== 0) out[z] += dt; // z!==0 으로 0|HRZone → HRZone 타입 narrowing
  }
  return out;
}

/** 시계열 평균/최대 심박(유효 표본만). 표본 없으면 {avg:0,max:0}. */
export function hrSummary(track: HRSample[]): { avg: number; max: number } {
  const bpms = (Array.isArray(track) ? track : []).map(p => p && p.bpm).filter((b): b is number => Number.isFinite(b) && b > 0);
  if (bpms.length === 0) return { avg: 0, max: 0 };
  const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
  return { avg, max: Math.round(Math.max(...bpms)) };
}
