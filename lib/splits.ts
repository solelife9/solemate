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
