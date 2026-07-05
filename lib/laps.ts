// ============================================================================
// lib/laps.ts — 트랙/랩 모드 순수 엔진(자동랩 감지 · 거리 스냅 · 랩→시계열)
// ----------------------------------------------------------------------------
// 트랙(종합운동장)에선 GPS 누적거리가 뱅뱅 돌아 부정확 → 거리는 '랩 수 × 확정 랩거리'로,
// 랩 경계는 자동(출발점 복귀 감지) 또는 수동으로 끊는다. GPS 는 '모양'(복귀 판정)에만 쓰고
// '거리'는 캘리브레이션된 랩 길이가 낸다.
//
// 이 파일은 순수 함수만 — 위치 스트림/상태는 호출부(레코더)가 관리한다. 테스트로 못박는다.
// ============================================================================

/** 위경도 두 점 사이 거리(m) — Haversine. */
export function haversineM(
  aLat: number, aLon: number, bLat: number, bLon: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 표준 트랙 한 바퀴(m). 야외 공인 400, 실내 200, 일부 300. */
export const STANDARD_LAP_M = [200, 300, 400] as const;

export interface LapSnap {
  meters: number;   // 확정 랩 거리(m)
  label: string;    // '400m 표준' · '측정값' 등 표시용
  snapped: boolean; // 표준에 스냅됐는지(false=측정값/커스텀)
}

/**
 * GPS 로 측정한 한 바퀴 거리(m)를 가장 가까운 표준에 스냅한다(허용오차 내). 표준이 없으면
 * 측정값을 그대로(커스텀). tolFrac 기본 6% — GPS 트랙 드리프트를 흡수해 400 트랙을 400 으로.
 */
export function snapLapDistance(measuredM: number, tolFrac = 0.06): LapSnap {
  if (!Number.isFinite(measuredM) || measuredM <= 0) {
    return {meters: 400, label: '400m 표준', snapped: true}; // 안전 폴백(가장 흔한 야외 트랙)
  }
  let best: {std: number; diff: number} | null = null;
  for (const std of STANDARD_LAP_M) {
    const diff = Math.abs(measuredM - std) / std;
    if (diff <= tolFrac && (best == null || diff < best.diff)) best = {std, diff};
  }
  if (best) return {meters: best.std, label: `${best.std}m 표준`, snapped: true};
  return {meters: Math.round(measuredM), label: '측정값', snapped: false};
}

export interface GeoPoint {
  lat: number;
  lon: number;
  t: number; // 경과초(이동시간)
}

/**
 * 자동랩 — 출발점 복귀 감지. 러너가 출발점 반경(radiusM) 밖으로 '나갔다가' 다시 안으로
 * 들어오는 순간을 1랩으로 본다(반경 안에서 떠는 노이즈는 무시). 각 랩 완료 시각(t)을 돌려준다.
 * 거리는 여기서 안 만든다 — 랩 수 × 확정 랩거리로 별도 산출(GPS 누적거리 미사용).
 */
export function detectAutoLaps(points: readonly GeoPoint[], radiusM = 12): number[] {
  const pts = Array.isArray(points) ? points.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) : [];
  if (pts.length < 3) return [];
  const start = pts[0];
  const laps: number[] = [];
  let left = false; // 출발 반경을 벗어난 적 있는가(이번 랩에서)
  for (let i = 1; i < pts.length; i++) {
    const dist = haversineM(start.lat, start.lon, pts[i].lat, pts[i].lon);
    if (!left) {
      if (dist > radiusM) left = true;
    } else if (dist <= radiusM) {
      laps.push(pts[i].t);
      left = false; // 다음 랩을 위해 리셋(다시 벗어나야 다음 랩)
    }
  }
  return laps;
}

/** (d,t) 한 점 — bestEfforts.TrackPoint 와 호환(누적거리 km, 경과초). */
export interface DtPoint { d: number; t: number; }

/**
 * 랩 완료 시각들 → (누적거리 km, 경과초) 시계열. 시작점(0,0) 포함. lapKm = 확정 랩거리(km).
 * 이 시계열을 bestEfforts 엔진에 그대로 먹여 트랙 세션의 거리 PB 를 낸다.
 */
export function lapsToTrack(lapTimesSec: readonly number[], lapKm: number): DtPoint[] {
  const out: DtPoint[] = [{d: 0, t: 0}];
  if (!(lapKm > 0)) return out;
  const times = Array.isArray(lapTimesSec) ? lapTimesSec.filter(t => Number.isFinite(t) && t >= 0) : [];
  let prev = 0;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t <= prev) continue; // 시간 비단조 방어
    out.push({d: Math.round((i + 1) * lapKm * 1000) / 1000, t}); // 미터 정밀도(부동소수 정리)
    prev = t;
  }
  return out;
}

/** 총 랩 거리(km). */
export function lapDistanceKm(lapCount: number, lapKm: number): number {
  if (!(lapCount > 0) || !(lapKm > 0)) return 0;
  return lapCount * lapKm;
}
