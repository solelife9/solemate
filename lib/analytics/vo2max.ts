// ============================================================================
// lib/analytics/vo2max.ts — VO2max / VDOT 추정 (가민식 체력 지표)
// ----------------------------------------------------------------------------
// 두 경로:
//  · VDOT (페이스 기반) — Jack Daniels & Gilbert. 한 번의 (거리,시간) 노력에서 유효
//    VO2와 그 노력의 %VO2max로 VDOT 를 역산한다. *최대 노력*(레이스/하드런)일수록 실제
//    VO2max 에 근접하고, 이지런이면 과소추정된다(노력이 최대가 아니므로 — 정직히 명시).
//      v[m/min] = 거리[m] / 시간[min]
//      VO2      = −4.60 + 0.182258·v + 0.000104·v²            (ml·kg⁻¹·min⁻¹)
//      %VO2max  = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)  (t=시간[min])
//      VDOT     = VO2 / %VO2max
//    검증: 5km 20:00 → VDOT ≈ 49.8 (Daniels VDOT 표와 일치).
//  · Uth-Sørensen (HR 기반) — VO2max ≈ 15.3 × (HRmax/HRrest). 안정시심박 측정 시.
//
// 현재 체력 추정 = 최근 기간 중 *가장 높은 VDOT*(가장 강한 노력이 실제 VO2max 에 근접).
// 순수 함수 — 입력 불변, 비유효는 0/안전 처리(throw 금지).
// ============================================================================

/**
 * Daniels VDOT — (거리 km, 시간 sec) 한 번의 노력에서 VDOT(≈VO2max ml·kg⁻¹·min⁻¹) 역산.
 * 거리/시간 비유효거나 너무 짧으면(<400m 또는 <2min: 공식 신뢰구간 밖) 0.
 */
export function vdot(distanceKm: number, durationSec: number): number {
  const m = (Number.isFinite(distanceKm) ? distanceKm : 0) * 1000;
  const tMin = (Number.isFinite(durationSec) ? durationSec : 0) / 60;
  if (m < 400 || tMin < 2) return 0; // 단거리/단시간은 공식 범위 밖
  const v = m / tMin; // m/min
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
  if (!(pctMax > 0) || !(vo2 > 0)) return 0;
  return Math.round((vo2 / pctMax) * 10) / 10; // 소수 1자리
}

/** Uth-Sørensen: VO2max ≈ 15.3 × HRmax/HRrest. 둘 다 유효(0<rest<max)해야. 아니면 0. */
export function vo2maxUth(maxHR: number, restHR: number): number {
  if (!(maxHR > 0) || !(restHR > 0) || restHR >= maxHR) return 0;
  return Math.round(15.3 * (maxHR / restHR) * 10) / 10;
}

/** 런 한 건의 최소 입력(체력 추정용). */
export type FitnessRun = { km: number; durationS: number; runDate?: string };

/**
 * 최근 windowDays(기본 42일) 안의 런들에서 *최고 VDOT*를 현재 체력 추정으로 돌려준다.
 * 가장 강한 노력이 실제 VO2max 에 가장 가깝다는 원리(이지런 과소추정 보정). today 는
 * 'YYYY-MM-DD'. runDate 없으면 윈도우 필터에서 제외하지 않고 포함(보수적). 표본 없으면 0.
 */
export function currentVdot(runs: FitnessRun[], today: string, windowDays = 42): number {
  const arr = Array.isArray(runs) ? runs : [];
  const cutoff = today ? daysAgoIso(today, windowDays) : '';
  let best = 0;
  for (const r of arr) {
    if (!r) continue;
    if (cutoff && r.runDate && r.runDate < cutoff) continue;
    const v = vdot(Number(r.km) || 0, Number(r.durationS) || 0);
    if (v > best) best = v;
  }
  return best;
}

/** 'YYYY-MM-DD' 에서 n일 전 ISO 날짜. 순수(문자열 산술만, Date.now 미사용). */
function daysAgoIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(x => parseInt(x, 10));
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

/** VDOT → 피트니스 등급 라벨(대략적 코칭 카피, 가민 'VO2max 등급' 톤). */
export function vdotLabel(v: number): string {
  if (v <= 0) return '측정 전';
  if (v >= 60) return '엘리트';
  if (v >= 52) return '매우 우수';
  if (v >= 45) return '우수';
  if (v >= 38) return '양호';
  if (v >= 32) return '보통';
  return '입문';
}
