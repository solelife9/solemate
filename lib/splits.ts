// ============================================================================
// lib/splits.ts — RunDetail 구간(km) 스플릿 데이터 빌더
// 우선순위: run.splits(레코더가 기록한 구간 배열) → 있으면 그대로 사용.
// 없으면 빈 배열을 반환해 <RunSplits/> 가 자동으로 숨는다(수동 입력 런 안전).
//
// ※ 구간별 "페이스"는 per-km 누적 시간이 있어야 계산된다. 현재 route(route_<id>)는
//    [{lat,lon}] 만 저장하므로(타임스탬프 없음) 경로만으로는 구간 페이스를 만들 수 없다.
//    구간 스플릿을 실제로 채우려면 러닝 레코더가 1km 통과 시각을 기록해
//    run.splits = [{km, paceSec, elevM}] 로 남겨야 한다(App.addRun 확장).
// ============================================================================

import type {Split} from '../RunSplits';
import type {LatLon} from './route';

type RunLike = {splits?: Split[]};

export function buildSplits(run: RunLike, _route: LatLon[]): Split[] {
  if (Array.isArray(run?.splits) && run.splits.length >= 2) return run.splits;
  return [];
}

/** 마지막 부분 km 구간을 스플릿으로 인정하는 최소 거리(km). 이보다 짧은 꼬리는 노이즈로 본다. */
export const FINAL_SPLIT_MIN_KM = 0.1;

/**
 * 완주 시 마지막 정수 km 이후 남은 부분 구간(예: 5.6km 런의 0.6km)을 per-km 스플릿 배열에
 * 한 줄 덧붙인다. recorded 는 러닝 중 정수 km 경계마다 기록된 1km 스플릿들(각 paceSec = 그 1km
 * 소요초 = per-km 페이스)이다. 마지막 경계 이후 남은 거리 frac 이 FINAL_SPLIT_MIN_KM 이상일 때만,
 * 그 구간 소요시간을 per-km 페이스로 환산(segTime/frac)해 추가한다 — 다른 구간과 막대·페이스 비교가
 * 일관되도록. km 라벨은 총 거리(소수 2자리)로 둬 'N.Nkm 에서 마쳤다'를 읽히게 한다.
 *
 * 순수·비파괴: 입력 배열을 복제해 반환하고, frac<임계·segTime<=0·비유한 입력이면 원본 그대로 돌려준다.
 */
export function appendFinalSplit(
  recorded: Split[],
  finalKm: number,
  finalElapsedSec: number,
  lastBoundaryElapsedSec: number,
  finalElevGainM: number,
  lastBoundaryElevM: number,
): Split[] {
  const base = Array.isArray(recorded) ? recorded.slice() : [];
  if (!Number.isFinite(finalKm)) return base;
  const frac = finalKm - base.length; // 마지막 정수 km 이후 남은 거리(km)
  if (!(frac >= FINAL_SPLIT_MIN_KM - 1e-9)) return base; // 부동소수 경계 방어

  const segTime = finalElapsedSec - lastBoundaryElapsedSec;
  if (!(segTime > 0)) return base;
  const paceSec = Math.round(segTime / frac); // per-km 페이스로 정규화(부분 구간이라도 비교 가능)
  const elevM = Math.max(0, Math.round((finalElevGainM || 0) - (lastBoundaryElevM || 0)));
  base.push({km: Math.round(finalKm * 100) / 100, paceSec, elevM});
  return base;
}

/** 곡선 전용 (누적거리 km, 경과시간 sec) 시계열의 한 점. runTracker.getPaceTrack() 형태. */
export type PaceTrackPoint = {d: number; t: number};

/**
 * (거리,경과시간) 시계열 → binKm(기본 0.1km) 간격의 페이스 시계열({km, paceSec})로 변환한다.
 * 경로 단순화와 무관한 실측 거리-시간이라 per-km 보다 훨씬 고운 곡선이 된다. 각 bin 의 페이스는
 * 그 구간 평균(Δt/Δd, 선형보간으로 bin 경계 시각을 구함). 비유한/역행/0구간은 건너뛴다.
 * 표본 부족(2점 미만)·결과 2점 미만이면 [] → 호출자가 per-km 스플릿으로 폴백한다.
 */
export function buildPaceSeries(track: PaceTrackPoint[], binKm = 0.1): Split[] {
  const pts = (Array.isArray(track) ? track : []).filter(
    (p) => p && Number.isFinite(p.d) && Number.isFinite(p.t),
  );
  if (pts.length < 2) return [];
  const out: Split[] = [];
  let lastD = pts[0].d, lastT = pts[0].t;
  let mark = (Math.floor(pts[0].d / binKm) + 1) * binKm;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dd = b.d - a.d;
    if (dd <= 0) continue; // 거리 역행/정체 구간은 건너뜀
    while (b.d >= mark - 1e-9) {
      const f = Math.max(0, Math.min(1, (mark - a.d) / dd));
      const tAt = a.t + f * (b.t - a.t);
      const binD = mark - lastD, binT = tAt - lastT;
      if (binD > 0 && binT > 0) {
        out.push({km: +mark.toFixed(2), paceSec: Math.round(binT / binD), elevM: 0});
      }
      lastD = mark; lastT = tAt;
      mark += binKm;
    }
  }
  return out.length >= 2 ? out : [];
}
