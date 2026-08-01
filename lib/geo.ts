// ─── Geo / distance helpers ──────────────────────────────────────
// Pure geometry extracted from App.tsx. Behavior-preserving primitives
// (distance, segment speed, route simplification) plus `acceptSegment`, the
// GPS fix-accuracy/warmup/speed/distance gate that decides whether a segment's
// distance should be counted toward the run total.

import {
  MAX_FIX_ACCURACY_M,
  WARMUP_FIXES,
  MAX_SEG_SPEED_MPS,
  MIN_SEG_DIST_KM,
  MAX_SEG_DIST_KM,
  PHANTOM_ACC_FLOOR_FACTOR,
} from './engineConstants';

export interface LatLon {
  lat: number;
  lon: number;
}

/** Inputs for {@link acceptSegment}: one candidate movement segment. */
export interface SegmentInput {
  /** Segment distance in kilometers (e.g. from {@link calcDist}). */
  distKm: number;
  /** Elapsed seconds since the previous accepted fix. */
  dtSec: number;
  /** Reported GPS accuracy radius in meters for the new fix. */
  accuracyM: number;
  /** 0-based index of this fix since the run started (for warmup exclusion). */
  fixIndex: number;
}

/**
 * Decide whether a GPS segment's distance should be counted toward the run.
 *
 * Rejects a segment when ANY of the following holds:
 *  - the fix is too inaccurate: `accuracyM > MAX_FIX_ACCURACY_M` (20m)
 *  - it is still in GPS warmup: `fixIndex < WARMUP_FIXES` (first 3 fixes)
 *  - it implies an impossible speed: `segmentSpeed > MAX_SEG_SPEED_MPS` (12 m/s)
 *  - it is below the noise floor: `distKm < max(1m, accuracy × 0.35)` — 정확도
 *    비례 하한(C1 팬텀 드리프트 억제). 앵커는 거부 시 보존되므로(runTracker)
 *    저속 이동 거리는 다음 fix 에 합산돼 무손실이다(audit#5 의 과소계상 재발 없음).
 *  - it exceeds the single-fix jump cap: `distKm > MAX_SEG_DIST_KM` (300m)
 *
 * Otherwise the segment is accepted.
 */
export function acceptSegment({distKm, dtSec, accuracyM, fixIndex}: SegmentInput): boolean {
  if (accuracyM > MAX_FIX_ACCURACY_M) return false;
  if (fixIndex < WARMUP_FIXES) return false;
  if (segmentSpeedMps(distKm, dtSec) > MAX_SEG_SPEED_MPS) return false;
  const noiseFloorKm = Math.max(MIN_SEG_DIST_KM, (accuracyM * PHANTOM_ACC_FLOOR_FACTOR) / 1000);
  if (distKm < noiseFloorKm) return false;
  if (distKm > MAX_SEG_DIST_KM) return false;
  return true;
}

/**
 * Great-circle distance between two coordinates, in kilometers (haversine).
 * Identical formula to the original App.tsx implementation.
 */
export function calcDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371,
    dL = ((lat2 - lat1) * Math.PI) / 180,
    dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Instantaneous segment speed in meters/second from a distance (km) and a
 * time delta (s). Returns 0 for non-positive time so callers never divide by
 * zero or produce Infinity.
 */
export function segmentSpeedMps(distKm: number, dtSec: number): number {
  if (dtSec <= 0) return 0;
  return (distKm * 1000) / dtSec;
}

// ─── 경로 단순화 — Ramer–Douglas–Peucker (2026-07-31 근본수정) ────────────────
//
// 왜 바꿨나: 이전 구현은 **균등 간격 추출**이었다(N개마다 하나씩). 직선 구간에서 점을
// 낭비하고 코너에서는 점이 없어, 길고 굽은 코스일수록 경로가 안쪽으로 잘렸다. 실측:
//
//   도심 코스(200m마다 코너), 고정 200점 기준 — 저장된 경로로 거리를 다시 계산하면
//     10km  -4.5%  ·  하프 -10.3%  ·  30km -14.9%  ·  풀코스 -20.7%
//
// 앱 화면의 거리는 이 영향을 받지 않는다(거리는 fix 마다 실시간 누적한 값을 쓴다 —
// lib/runTracker). 문제는 **밖으로 내보낸 경로**다: GPX 를 스트라바·가민에 올리면
// 그쪽은 좌표로 거리를 다시 계산하므로 30km 러닝이 25km 로 등록된다. "내 데이터를
// 꺼낼 수 있다"는 약속이 깨지고, 지도에 그려지는 코스 모양도 실제와 달라진다.
//
// 정석은 "점 몇 개"가 아니라 **"원래 경로에서 몇 m 이상 벗어나지 않는다"** 로 정하는
// 것이다. RDP 는 그 기준(tolerance)을 만족하는 최소 점만 남긴다 — 직선은 두 점으로,
// 코너는 촘촘하게. 그래서 **점 개수가 코스 복잡도에 따라 자동으로 정해진다.**
//
// tolerance 5m 실측(같은 코스):
//   도심 풀코스 470점(21KB) -0.22%  ·  강변 30km 158점(7KB) -0.06%
//
// 5m 인 이유: GPS 자체 정확도가 보통 5~10m 이고 엔진은 20m 초과 fix 를 아예 버린다
// (MAX_FIX_ACCURACY_M). 즉 5m 는 **측정 잡음보다 작은 값**이라, 이보다 촘촘히 남겨봐야
// 실제 정보가 아니라 노이즈를 저장하는 것이다.

/** 경로 단순화 허용 오차(m). 원래 경로에서 이보다 멀어지는 점은 반드시 남긴다. */
export const ROUTE_SIMPLIFY_TOLERANCE_M = 5;

/**
 * 안전 상한(점). tolerance 만으로도 실측 최악이 500점 안쪽이라 평상시엔 걸리지 않는다.
 * 울트라·비정상 GPS 폭주에서 저장이 무한정 커지는 것만 막는 최후 방어선이다.
 */
export const ROUTE_SIMPLIFY_MAX_POINTS = 3000;

type LatLonLike = {lat: number; lon: number};

/**
 * 경로를 **허용 오차 이내로** 단순화한다(RDP). 첫 점과 끝 점은 항상 보존한다.
 *
 * @param pts    원본 좌표열
 * @param toleranceM  허용 오차(m). 기본 ROUTE_SIMPLIFY_TOLERANCE_M.
 * @param maxPoints   안전 상한. 초과하면 오차를 키워 가며 다시 줄인다.
 *
 * 재귀 대신 스택을 쓴다 — 3시간 러닝이면 원본이 1만 점을 넘어 재귀는 스택을 넘길 수 있다.
 */
export function simplifyRoute<T extends LatLonLike>(
  pts: T[],
  toleranceM: number = ROUTE_SIMPLIFY_TOLERANCE_M,
  maxPoints: number = ROUTE_SIMPLIFY_MAX_POINTS,
): T[] {
  if (!Array.isArray(pts) || pts.length <= 2) return pts;

  let tol = Number.isFinite(toleranceM) && toleranceM > 0 ? toleranceM : ROUTE_SIMPLIFY_TOLERANCE_M;
  let out = rdp(pts, tol);
  // 상한 초과(울트라·GPS 폭주) — 오차를 2배씩 키워 가며 상한 안으로 들인다.
  // 반복 상한 20회면 tol 이 5m→5,000km 이라 어떤 경로도 반드시 수렴한다.
  for (let i = 0; i < 20 && out.length > maxPoints; i++) {
    tol *= 2;
    out = rdp(pts, tol);
  }
  return out;
}

/** 위경도를 로컬 평면(m)으로 근사 투영 — 러닝 한 건의 범위(수십 km)에선 오차가 무시된다. */
function projector(originLat: number) {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((originLat * Math.PI) / 180);
  return (p: LatLonLike) => ({x: p.lon * mPerDegLon, y: p.lat * mPerDegLat});
}

/** 점 p 에서 선분 ab 까지의 수직거리(m). 선분 밖이면 가까운 끝점까지의 거리. */
function perpDistM(
  p: {x: number; y: number},
  a: {x: number; y: number},
  b: {x: number; y: number},
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** RDP 본체(반복형). 남길 점을 표시한 뒤 원래 순서대로 뽑는다. */
function rdp<T extends LatLonLike>(pts: T[], tolM: number): T[] {
  const project = projector(pts[0].lat);
  const xy = pts.map(project);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const seg = stack.pop();
    if (!seg) break;
    const [s, e] = seg;
    if (e <= s + 1) continue;
    let far = -1;
    let maxD = 0;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistM(xy[i], xy[s], xy[e]);
      if (d > maxD) {
        maxD = d;
        far = i;
      }
    }
    if (maxD > tolM && far > 0) {
      keep[far] = 1;
      stack.push([s, far], [far, e]);
    }
  }
  const out: T[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
