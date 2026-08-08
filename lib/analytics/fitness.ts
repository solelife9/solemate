// ============================================================================
// lib/analytics/fitness.ts — 런 히스토리 → 체력 종합(VO2max + 트레이닝 상태)
// ----------------------------------------------------------------------------
// 워치 없이도 기존 (거리·시간·날짜) 런 기록만으로 가민식 '체력/피로/폼'을 산출한다.
// 분석 프리미티브(vo2max·load)를 한데 묶어 UI 가 단일 호출로 쓰게 한다(UI 는 얇게).
//
//  · VO2max — **심박이 있으면 심박 기반(정본)**, 없으면 페이스 기반(참고).
//    2026-08-04 재설계. 전에는 페이스만 봤고(최근 최고 VDOT), 그래서 2.56km 를
//    2'53"/km 로 달린 조각 하나가 67.9(엘리트 구간)를 만들었다.
//    페이스만으로는 "체력이 좋아 빠른 것"과 "짧게 스퍼트한 것"을 구별할 수 없다 —
//    그 구별은 심박이 한다. 가민(Firstbeat)·애플·폴라가 전부 심박을 쓰는 이유다.
//    **심박이 없으면 아예 보여주지 않는다**(민우님 결정 2026-08-04 — 가민·애플과 같은 기준).
//    페이스로도 추정은 되지만 그건 '레이스급 최대 노력'을 가정한 참고치라, 숫자로 내보내면
//    측정값처럼 읽힌다. 그래서 이 계층에서 **값 자체를 0 으로 막는다** — 화면마다 조건을
//    되풀이하면 언젠가 한 곳이 샌다.
//    단, 페이스 VDOT 는 임계페이스(rTSS 강도 기준) 역산에 여전히 필요하므로 **내부 계산용**
//    으로 vdotPace·thresholdPaceSec 에 따로 내보낸다(표시용이 아니다).
//  · 트레이닝 상태 = PMC(CTL 체력/ATL 피로/TSB 폼). 일별 부하는 HR 있으면 TRIMP,
//                    없으면 페이스 기반 rTSS(paceLoad). rTSS 의 임계페이스는 VDOT 에서
//                    역산한다(아래 thresholdPaceSec) — 사람마다 다른 강도 기준을 체력에
//                    맞춰 정규화(고정값으로 대충 잡지 않는다).
//
// 순수 함수 — 입력 불변, 비유효는 0/안전(throw 금지).
// ============================================================================

import { currentVdot, vdotLabel, type FitnessRun } from './vo2max';
import { hrFitness, type HrSample } from './vo2maxHr';
import { estimateMaxHR } from './hrZones';
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
export type FitnessRunIn = FitnessRun & {
  hrAvg?: number; hrMax?: number; hrRest?: number;
  /** 경사 보정 페이스(초/km). 있으면 심박 추정이 이걸 쓴다 — 언덕 과대평가 방지. */
  gapSec?: number;
};

export type FitnessSummary = {
  /** **심박 기반 추정만** 담는다. 심박이 없으면 0 — 페이스로는 내보내지 않는다. */
  vo2max: number;
  vo2maxLabel: string;     // 등급 라벨
  /** 'hr' 심박 기반(표시 가능) · 'none' 표시하지 않음. */
  vo2maxSource: 'hr' | 'none';
  /** 심박 기반일 때 쓰인 표본 수. 신뢰도 표기에 쓴다. */
  vo2maxSamples: number;
  /**
   * **달리기는 충분한데 심박이 없어서 못 보여주는 상태.**
   * 화면은 이때 숫자 대신 "애플 건강을 연동하면 보여요"를 안내한다 — 그냥 비워 두면
   * 사용자는 앱이 고장 났다고 생각한다(실제로 그런 제보가 있었다).
   */
  vo2maxNeedsHealth: boolean;
  /**
   * 페이스 기반 VDOT — **표시용이 아니다.** 임계 페이스 역산 등 내부 계산 전용.
   * 화면에 숫자로 내보내지 말 것(그게 이번 변경의 이유다).
   */
  vdotPace: number;
  /** 임계 페이스(초/km) — per-run rTSS 강도 기준. vdotPace 에서 역산. */
  thresholdPaceSec: number;
  ctl: number;             // 체력(Fitness)
  atl: number;             // 피로(Fatigue)
  tsb: number;             // 폼(Form) = 전일 CTL−ATL
  tsbLabel: string;        // 폼 해석 라벨
  pmc: PmcPoint[];         // 전체 PMC 시계열(스파크라인 등)
  hasData: boolean;        // 유효 런이 하나라도 있어 표시할 가치가 있는가
};

/**
 * 저장된 러닝 레코드 + 신체 설정 → `fitnessSummary` 입력.
 *
 * 왜 이 함수가 있나 (2026-08-08)
 * ----------------------------------------------------------------------------
 * 호출부마다 레코드 → 입력 매핑을 **따로 적고 있었고, 실제로 갈라졌다.**
 *   · 마이 탭은 심박을 넘긴다(2026-08-04·08-07 수리 — 그전엔 안 넘겨서 심박 기반
 *     VO2max 와 TRIMP 가 굶고 있었다).
 *   · 홈(공개 프로필 스펙)은 지금도 `{km, durationS, runDate}` 만 넘긴다 → 거기서 나오는
 *     `vo2max` 는 **항상 0**이다. 지금은 그 값을 화면에 쓰는 곳이 없어 사용자에게 보이는
 *     피해는 없지만, **0 을 진짜 값인 양 공개 프로필 문서에 실어 보내고 있었다.**
 *
 * 같은 매핑이 두 곳에 있으면 한쪽만 고쳐진다 — 실제로 그렇게 됐다. 그래서 여기 하나로
 * 모은다. 새 화면이 생겨도 같은 실수를 반복하지 않는다.
 *
 * ── 추측하지 않는 선 ──────────────────────────────────────────────────────
 * 나이·안정시 심박은 미입력이면 **0**이다(설정 기본값이 0 — 허수를 채우지 않는다).
 * 그때는 hrMax/hrRest 를 붙이지 않는다 → TRIMP 대신 페이스 부하로 간다. 없는 값을
 * 지어내 부하를 계산하면 그건 틀린 숫자를 자신 있게 보여주는 것이다.
 *
 * 최대 심박은 Tanaka(208 − 0.7×나이) 추정을 쓴다. 실측 최대심박은 최대 노력 테스트가
 * 있어야 얻는 값이라 대부분의 사용자에게 없고, 가민·폴라도 같은 방식으로 추정한다.
 * **추정이라는 사실이 숨겨지지 않는 자리에서만** 쓴다(부하 계산 — 화면에 숫자로 안 뜬다).
 */
export function buildFitnessInput(
  runs: readonly unknown[],
  body: {age?: number; sex?: Sex; restHR?: number},
): {runs: FitnessRunIn[]; opts: {sex: Sex; age: number}} {
  const age = Number(body?.age) > 0 ? Math.round(Number(body.age)) : 0;
  const restHR = Number(body?.restHR) > 0 ? Math.round(Number(body.restHR)) : 0;
  const sex: Sex = body?.sex === 'female' ? 'female' : 'male';
  // 나이가 없으면 추정도 못 한다 → 0(붙이지 않는다).
  const estimated = age > 0 ? estimateMaxHR(age) : 0;
  const mapped: FitnessRunIn[] = [];
  for (const raw of Array.isArray(runs) ? runs : []) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    // 레코드는 저장 형태(`km`·`duration`·`run_date`·`heart_rate`)와 표시 형태
    // (`dist`·`durationS`·`runDate`·`bpm`)가 섞여 들어온다 — 둘 다 받는다.
    const km = Number(r.km ?? r.dist) || 0;
    const durationS = Number(r.duration ?? r.durationS) || 0;
    const runDate = String(r.run_date ?? r.runDate ?? '');
    const hrAvg = Number(r.heart_rate ?? r.hrAvg ?? r.bpm) || 0;
    // 최대 심박은 **그 러닝에서 실제로 관측된 값이 있으면 그걸 쓴다**(저장 시 hrTrack 에서
    // 뽑아 둔다). 없을 때만 나이 추정으로 떨어진다 — 실측이 추정보다 항상 낫다.
    const observedMax = Number(r.heart_rate_max ?? r.hrMax) || 0;
    const hrMax = observedMax > 0 ? observedMax : estimated;
    mapped.push({
      km,
      durationS,
      runDate,
      ...(hrAvg > 0 ? {hrAvg} : {}),
      ...(hrAvg > 0 && hrMax > 0 ? {hrMax} : {}),
      ...(hrAvg > 0 && restHR > 0 ? {hrRest: restHR} : {}),
    });
  }
  return {runs: mapped, opts: {sex, age}};
}

/**
 * 런 히스토리 → 체력 종합. today 'YYYY-MM-DD'. windowDays 는 VO2max 추정 창(기본 42일).
 * 일별 부하: HR(평균·최대·안정)이 다 있으면 Banister TRIMP, 아니면 임계페이스 기준 rTSS.
 * 표본 없으면 모두 0 + hasData=false(카드 숨김용).
 */
export function fitnessSummary(
  runs: FitnessRunIn[],
  today: string,
  opts?: { windowDays?: number; sex?: Sex; age?: number; hrWindowDays?: number },
): FitnessSummary {
  const arr = Array.isArray(runs) ? runs.filter(Boolean) : [];
  const windowDays = opts?.windowDays ?? 42;
  const sex = opts?.sex ?? 'male';
  // ── VO2max: 심박 우선, 없으면 페이스 폴백 ────────────────────────────────
  // 심박 기반은 '평상시 러닝'에서 페이스 대비 심박으로 역산한다(최대 노력 불필요).
  // 페이스 기반은 '최근 최고 노력' 하나를 레이스로 간주하는 방식이라 참고치다.
  const hr = hrFitness({
    samples: arr
      .filter(r => (r.hrAvg ?? 0) > 0)
      .map(r => ({km: Number(r.km) || 0, durationS: Number(r.durationS) || 0,
                  hrAvg: Number(r.hrAvg) || 0, runDate: r.runDate, gapSec: r.gapSec})) as HrSample[],
    hrRest: arr.find(r => (r.hrRest ?? 0) > 0)?.hrRest ?? 0,
    observedHrMax: arr.reduce((m, r) => Math.max(m, Number(r.hrMax) || 0), 0),
    age: opts?.age ?? 0,
    today,
    windowDays: opts?.hrWindowDays ?? 90,
  });
  const paceVdot = currentVdot(arr as FitnessRun[], today, windowDays);
  // 심박 기반만 표시한다. 페이스 추정치는 있어도 내보내지 않는다(위 헤더 주석 참조).
  const vo2max = hr.vo2max;
  const vo2maxSource: 'hr' | 'none' = hr.vo2max > 0 ? 'hr' : 'none';
  // "달릴 만큼 달렸는데 심박이 없어서 못 보여준다" — 이때만 연동을 권한다.
  const vo2maxNeedsHealth = hr.vo2max <= 0 && paceVdot > 0;
  // 임계 페이스(rTSS 정규화)는 **페이스 기반 VDOT**로 계산한다 — 페이스 기준을 페이스에서
  // 뽑는 게 일관되고, 심박 추정치를 여기 섞으면 부하 계산이 방법 전환에 흔들린다.
  const tPace = thresholdPaceSec(paceVdot);
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
    vo2maxSource,
    vo2maxSamples: hr.sampleCount,
    vo2maxNeedsHealth,
    vdotPace: paceVdot,
    thresholdPaceSec: tPace,
    ctl: cur.ctl,
    atl: cur.atl,
    tsb: cur.tsb,
    tsbLabel: tsbLabel(cur.tsb),
    pmc,
    hasData: vo2max > 0 || paceVdot > 0 || pmc.length > 0,
  };
}
