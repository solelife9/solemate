// ============================================================================
// lib/analytics/load.ts — 트레이닝 부하: TRIMP + PMC(CTL/ATL/TSB)
// ----------------------------------------------------------------------------
// ACWR(부상위험, lib/trainingLoad.ts)와 별개로, 가민/TrainingPeaks 의 '체력·피로·폼'
// 트렌드(Performance Management Chart)를 정밀 산출한다.
//
//  · TRIMP (Banister 1991) — 한 세션의 심박 기반 부하:
//      HRr   = (HRavg − HRrest) / (HRmax − HRrest)         (여유심박 비율 0..1)
//      TRIMP = D[min] × HRr × c1 · e^(c2·HRr)
//      남: c1=0.64, c2=1.92 / 여: c1=0.86, c2=1.67
//
//  · PMC (TrainingPeaks) — 일별 부하의 지수가중이동평균:
//      CTL(체력 Fitness)  = EWMA τ=42일
//      ATL(피로 Fatigue)  = EWMA τ=7일
//      TSB(폼 Form)       = 전일 CTL − 전일 ATL   (양수=신선/테이퍼, 음수=피로 누적)
//      EWMA: today = prev + (load − prev)·(1 − e^(−1/τ))
//
// 순수 함수 — 입력 불변, 비유효는 0/안전(throw 금지).
// ============================================================================

export type Sex = 'male' | 'female';

/**
 * Banister TRIMP — 세션 부하 점수. duration[sec], 평균/최대/안정 심박. 심박 비유효
 * (0, rest≥max)면 0(심박 없는 런은 TRIMP 0 — PMC 는 rTSS 등 다른 부하로 채운다).
 */
export function trimp(durationSec: number, hrAvg: number, hrMax: number, hrRest: number, sex: Sex = 'male'): number {
  const D = (Number.isFinite(durationSec) ? durationSec : 0) / 60;
  if (!(D > 0) || !(hrMax > hrRest) || !(hrAvg > 0) || !(hrRest >= 0)) return 0;
  const hrr = Math.max(0, Math.min(1, (hrAvg - hrRest) / (hrMax - hrRest)));
  const c1 = sex === 'female' ? 0.86 : 0.64;
  const c2 = sex === 'female' ? 1.67 : 1.92;
  return Math.round(D * hrr * c1 * Math.exp(c2 * hrr));
}

/**
 * rTSS 유사 — 심박 없을 때의 페이스 기반 세션 부하(PMC 입력 폴백). 강도 IF = 임계페이스/
 * 평균페이스(빠를수록 IF↑). TSS = (시간[hr]) × IF² × 100. 임계페이스(초/km)는 VDOT 에서
 * 파생해 주입한다. 입력 비유효면 0.
 */
export function paceLoad(km: number, durationSec: number, thresholdPaceSecPerKm: number): number {
  if (!(km > 0) || !(durationSec > 0) || !(thresholdPaceSecPerKm > 0)) return 0;
  const avgPace = durationSec / km; // 초/km
  const intensity = thresholdPaceSecPerKm / avgPace; // IF (빠르면 >1)
  const hours = durationSec / 3600;
  return Math.round(hours * intensity * intensity * 100);
}

const K_CTL = 1 - Math.exp(-1 / 42);
const K_ATL = 1 - Math.exp(-1 / 7);

export type DailyLoad = { date: string; load: number }; // 'YYYY-MM-DD'
export type PmcPoint = { date: string; ctl: number; atl: number; tsb: number };

/**
 * 일별 부하 → PMC 시계열(체력CTL/피로ATL/폼TSB). 날짜 정렬 후 첫날~today 까지 하루씩
 * 진행하며 EWMA. 런 없는 날은 부하 0(휴식도 모델에 반영돼야 ATL 감소·폼 회복). TSB 는
 * 그날 갱신 *전*의 CTL−ATL(전일값) — PMC 표준. today 'YYYY-MM-DD'. 입력 없으면 [].
 */
export function performanceChart(loads: DailyLoad[], today: string): PmcPoint[] {
  const valid = (Array.isArray(loads) ? loads : []).filter(l => l && /^\d{4}-\d{2}-\d{2}$/.test(l.date));
  if (valid.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  // 날짜별 부하 합산(하루 여러 런).
  const byDate = new Map<string, number>();
  for (const l of valid) byDate.set(l.date, (byDate.get(l.date) || 0) + (Number(l.load) || 0));
  const start = [...byDate.keys()].sort()[0];
  const out: PmcPoint[] = [];
  let ctl = 0, atl = 0;
  for (let d = start; d <= today; d = nextIso(d)) {
    const tsb = ctl - atl; // 전일 CTL−ATL = 오늘의 폼
    const load = byDate.get(d) || 0;
    ctl = ctl + (load - ctl) * K_CTL;
    atl = atl + (load - atl) * K_ATL;
    out.push({ date: d, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round(tsb * 10) / 10 });
    if (out.length > 800) break; // 안전 상한(약 2년)
  }
  return out;
}

/** PMC 시계열의 마지막(현재) 값. 없으면 모두 0. */
export function currentPmc(pmc: PmcPoint[]): { ctl: number; atl: number; tsb: number } {
  if (!pmc || pmc.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
  const last = pmc[pmc.length - 1];
  return { ctl: last.ctl, atl: last.atl, tsb: last.tsb };
}

/**
 * 세션 부하 점수(TRIMP 또는 rTSS) → 정성 라벨(스트라바 'Relative Effort' 톤). 두 방법은
 * 스케일이 완전히 같진 않지만 강도×시간에 함께 비례하며, 1시간 적당런이 대략 '적당' 경계에
 * 오도록 보정한 공통 밴드다(정밀 수치가 아니라 체감 안내). 0 이하는 빈 문자열.
 */
export function effortBand(score: number): string {
  if (!(score > 0)) return '';
  if (score < 35) return '가벼움';
  if (score < 75) return '적당';
  if (score < 120) return '높음';
  return '매우 높음';
}

/**
 * 폼(TSB) → 일반 사용자용 컨디션 상태 + 한 줄 조언. raw 숫자(CTL/ATL/TSB)는 러너가 아닌
 * 이상 이해하기 어려우므로, '오늘 몸이 얼마나 신선한가 + 그래서 뭘 하면 되나'로 번역한다.
 */
export function formStatus(tsb: number): { label: string; advice: string } {
  if (tsb >= 15) return { label: '아주 신선', advice: '레이스·고강도에 최적인 상태예요' };
  if (tsb >= 5) return { label: '신선', advice: '고강도 훈련하기 좋은 날이에요' };
  if (tsb > -10) return { label: '균형', advice: '평소대로 훈련하기 좋아요' };
  if (tsb > -25) return { label: '피로 쌓임', advice: '몸이 만들어지는 중 — 무리하지 마세요' };
  return { label: '과부하', advice: '회복이 필요해요 — 쉬어가세요' };
}

/** 폼(TSB) 해석 라벨 — 가민/TP 톤. */
export function tsbLabel(tsb: number): string {
  if (tsb >= 15) return '아주 신선 (테이퍼/레이스 준비)';
  if (tsb >= 5) return '신선';
  if (tsb > -10) return '균형';
  if (tsb > -25) return '피로 (생산적 훈련)';
  return '과부하 (회복 필요)';
}

/** 'YYYY-MM-DD' + 1일. 순수 문자열 산술(Date.now 미사용). */
function nextIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(x => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
