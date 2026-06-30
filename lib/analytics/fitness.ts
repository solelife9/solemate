// ============================================================================
// lib/analytics/fitness.ts — 런 히스토리 → 체력 종합(VO2max + 트레이닝 상태)
// ----------------------------------------------------------------------------
// 워치 없이도 기존 (거리·시간·날짜) 런 기록만으로 가민식 '체력/피로/폼'을 산출한다.
// 분석 프리미티브(vo2max·load)를 한데 묶어 UI 가 단일 호출로 쓰게 한다(UI 는 얇게).
//
//  · VO2max(VDOT)  = 최근 윈도우 내 최고 노력(currentVdot) — 가장 강한 런이 실제
//                    VO2max 에 가장 근접(이지런 과소추정 보정).
//  · 트레이닝 상태 = PMC(CTL 체력/ATL 피로/TSB 폼). 일별 부하는 HR 있으면 TRIMP,
//                    없으면 페이스 기반 rTSS(paceLoad). rTSS 의 임계페이스는 VDOT 에서
//                    역산한다(아래 thresholdPaceSec) — 사람마다 다른 강도 기준을 체력에
//                    맞춰 정규화(고정값으로 대충 잡지 않는다).
//
// 순수 함수 — 입력 불변, 비유효는 0/안전(throw 금지).
// ============================================================================

import { currentVdot, vdotLabel, type FitnessRun } from './vo2max';
import { paceLoad, trimp, performanceChart, currentPmc, tsbLabel, type Sex, type PmcPoint } from './load';

/**
 * VDOT → 임계(threshold) 페이스[초/km]. Daniels 의 임계 강도 ≈ 88% VO2max 에 해당하는
 * 속도를 VO2(v)=−4.60+0.182258·v+0.000104·v² 의 역(이차식 양근)으로 구한다(v[m/min]).
 * 검증: VDOT 50 → 255s(4:15/km), VDOT 60 → 220s(3:40/km) — Daniels 표와 일치.
 * VDOT 비유효면 0.
 */
export function thresholdPaceSec(vdotVal: number): number {
  if (!(vdotVal > 0)) return 0;
  const target = 0.88 * vdotVal;            // 임계에서의 VO2(≈88% VO2max)
  const a = 0.000104, b = 0.182258, c = -(4.60 + target);
  const disc = b * b - 4 * a * c;
  if (!(disc > 0)) return 0;
  const v = (-b + Math.sqrt(disc)) / (2 * a); // m/min (양근)
  if (!(v > 0)) return 0;
  return Math.round(60000 / v);              // 초/km = (1000/v)·60
}

/** 체력 종합 입력 — 런 한 건. HR 필드(평균/최대/안정)는 있으면 TRIMP, 없으면 페이스 부하. */
export type FitnessRunIn = FitnessRun & { hrAvg?: number; hrMax?: number; hrRest?: number };

export type FitnessSummary = {
  vo2max: number;          // 추정 VO2max(=최근 최고 VDOT). 표본 없으면 0.
  vo2maxLabel: string;     // 등급 라벨
  ctl: number;             // 체력(Fitness)
  atl: number;             // 피로(Fatigue)
  tsb: number;             // 폼(Form) = 전일 CTL−ATL
  tsbLabel: string;        // 폼 해석 라벨
  pmc: PmcPoint[];         // 전체 PMC 시계열(스파크라인 등)
  hasData: boolean;        // 유효 런이 하나라도 있어 표시할 가치가 있는가
};

/**
 * 런 히스토리 → 체력 종합. today 'YYYY-MM-DD'. windowDays 는 VO2max 추정 창(기본 42일).
 * 일별 부하: HR(평균·최대·안정)이 다 있으면 Banister TRIMP, 아니면 임계페이스 기준 rTSS.
 * 표본 없으면 모두 0 + hasData=false(카드 숨김용).
 */
export function fitnessSummary(
  runs: FitnessRunIn[],
  today: string,
  opts?: { windowDays?: number; sex?: Sex },
): FitnessSummary {
  const arr = Array.isArray(runs) ? runs.filter(Boolean) : [];
  const windowDays = opts?.windowDays ?? 42;
  const sex = opts?.sex ?? 'male';
  const vo2max = currentVdot(arr as FitnessRun[], today, windowDays);
  const tPace = thresholdPaceSec(vo2max);
  // 일별 부하 시계열(날짜 누락 런은 PMC 에 못 넣으므로 제외 — 부하는 0 처리가 아니라 미집계).
  const daily = arr
    .filter(r => r.runDate && /^\d{4}-\d{2}-\d{2}$/.test(r.runDate))
    .map(r => {
      const km = Number(r.km) || 0;
      const dur = Number(r.durationS) || 0;
      const hasHr = (r.hrAvg ?? 0) > 0 && (r.hrMax ?? 0) > 0 && (r.hrRest ?? 0) > 0;
      const load = hasHr
        ? trimp(dur, r.hrAvg!, r.hrMax!, r.hrRest!, sex)
        : paceLoad(km, dur, tPace);
      return { date: r.runDate as string, load };
    });
  const pmc = performanceChart(daily, today);
  const cur = currentPmc(pmc);
  return {
    vo2max,
    vo2maxLabel: vdotLabel(vo2max),
    ctl: cur.ctl,
    atl: cur.atl,
    tsb: cur.tsb,
    tsbLabel: tsbLabel(cur.tsb),
    pmc,
    hasData: vo2max > 0 || pmc.length > 0,
  };
}
