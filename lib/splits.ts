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
