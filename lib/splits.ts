// ============================================================================
// lib/splits.ts — per-km 스플릿 파생(기록 상세 RunSplits 용). 순수 함수·네이티브 0·I/O 0.
//
// 저장된 GPS 경로(route_<id>)는 {lat,lon} 뿐 — per-point 타임스탬프/고도가 없다.
// 그러나 위치 샘플링이 1Hz 시간 기반(locationService: timeInterval 1000ms,
// distanceInterval 0)이라 "한 구간에 속한 점 개수"가 그 구간에 머문 시간에 비례한다.
//   → 구간 페이스 ≈ (구간 점 개수 × 점당 평균 시간) / 구간 거리.
// 즉 점밀도를 시간의 프록시로 쓴다(자투리·정지 구간이 점을 더 쌓아 느린 km 로 잡힘).
// 고도(elevM)는 저장 경로에 없어 0 으로 둔다(추후 경로에 alt 저장 시 확장).
//
// 결과는 RunSplits 가 그대로 소비하는 {km, paceSec, elevM}[] (1km 단위, 구조적 동일).
// 경로가 빈약하면(<2점/<1km/시간 0) 빈 배열 → RunSplits 자동 숨김(수동 입력 런 안전).
// ============================================================================
import {calcDist} from './geo';
import type {LatLon} from './route';

export interface Split {
  km: number;
  paceSec: number; // 초/킬로미터(추정)
  elevM: number;
}

/**
 * 누적 거리 1km 경계로 경로를 끊어 구간별 추정 페이스를 만든다.
 * @param route 저장된 {lat,lon} 픽스 배열(parseRoute 결과)
 * @param totalDistKm 런 총거리(km) — 경로 합과 어긋날 수 있어 km 라벨 정규화 기준
 * @param totalDurationSec 런 총 소요 시간(초)
 */
export function buildSplits(route: LatLon[], totalDistKm: number, totalDurationSec: number): Split[] {
  if (!Array.isArray(route) || route.length < 2) return [];
  if (!(totalDurationSec > 0)) return [];

  // 1) 세그먼트별 거리 + 전체 경로거리.
  const n = route.length;
  const segKm: number[] = new Array(n).fill(0); // segKm[i] = dist(i-1 → i)
  let pathKm = 0;
  for (let i = 1; i < n; i++) {
    const d = calcDist(route[i - 1].lat, route[i - 1].lon, route[i].lat, route[i].lon);
    segKm[i] = Number.isFinite(d) && d > 0 ? d : 0;
    pathKm += segKm[i];
  }
  if (pathKm <= 0) return [];

  // 2) 점당 평균 시간(1Hz 가정) + 경로 합을 런 총거리로 정규화(km 라벨 정합).
  const secPerSeg = totalDurationSec / (n - 1);
  const distScale = totalDistKm > 0 ? totalDistKm / pathKm : 1;

  // 3) 1km 경계로 끊으며 구간 시간/거리 누적 → paceSec = 누적시간 / 누적거리.
  const splits: Split[] = [];
  let kmIndex = 1;
  let accDist = 0; // 현재 구간 누적 거리(정규화 km)
  let accSec = 0; // 현재 구간 누적 시간(초)
  for (let i = 1; i < n; i++) {
    accDist += segKm[i] * distScale;
    accSec += secPerSeg;
    if (accDist >= 1) {
      splits.push({km: kmIndex, paceSec: Math.round(accSec / accDist), elevM: 0});
      kmIndex += 1;
      accDist = 0;
      accSec = 0;
    }
  }
  // 잔여 부분 구간은 ≥0.5km 일 때만 한 줄 추가(0.x 자투리는 버린다).
  if (accDist >= 0.5) {
    splits.push({km: kmIndex, paceSec: Math.round(accSec / accDist), elevM: 0});
  }
  return splits;
}
