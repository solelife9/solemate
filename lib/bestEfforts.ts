// ============================================================================
// lib/bestEfforts.ts — 거리별 베스트에포트(러너 스펙 '거리 PB')
// ----------------------------------------------------------------------------
// 입력: (누적거리 km, 경과초) 시계열 하나. 소스 무관 —
//   · GPS 런  → runTracker.getPaceTrack() (약 25m/점, 단조↑, 이동시간 t)
//   · 트랙 런 → 랩 경계 {d: 확정 랩거리 누적, t: 경과초}
// 이 시계열에서 '정확히 D 거리를 커버하는 최소 시간'(가장 빠른 연속 구간)을 구한다.
//
// 정확성(핵심): 시간-거리 T(x)는 조각선형이라 f(x)=T(x+D)−T(x)의 최소는
//   (a) 시작이 데이터점(x=d[i], 끝 보간)  또는  (b) 끝이 데이터점(x+D=d[j], 시작 보간)
// 두 브레이크포인트 집합 중 하나에서만 발생한다. 둘 다 평가해야 진짜 최소를 놓치지 않는다
// (한쪽만 보면 미세하게 틀린 PB). 각 앵커는 투포인터로 O(n).
//
// 순수·비파괴: 입력을 읽기만 하고, 모든 엣지(빈/1점/비단조/비유한/총거리<D)에서
// NaN/Infinity 없이 number|null 을 보장한다. t 는 이동시간이어야 정지 구간이 안 낀다.
// ============================================================================

export type TrackPoint = {d: number; t: number};

/** 표준 경주 거리 — 러너가 '훈장'처럼 여기는 5K·10K·하프·풀. */
export const STANDARD_DISTANCES = [
  {key: '5k', km: 5, label: '5K'},
  {key: '10k', km: 10, label: '10K'},
  {key: 'half', km: 21.0975, label: '하프'},
  {key: 'full', km: 42.195, label: '풀'},
] as const;

export type BestEffortKey = (typeof STANDARD_DISTANCES)[number]['key'];

const EPS = 1e-9;

/** (d,t) 시계열을 단조 증가·유한만 남겨 정규화한다(비파괴). d 가 안 늘면 버린다. */
function sanitize(track: readonly TrackPoint[]): TrackPoint[] {
  if (!Array.isArray(track)) return [];
  const out: TrackPoint[] = [];
  for (const p of track) {
    if (!p) continue;
    const d = Number(p.d);
    const t = Number(p.t);
    if (!Number.isFinite(d) || !Number.isFinite(t)) continue;
    const last = out[out.length - 1];
    if (!last) {
      out.push({d, t});
    } else if (d > last.d + EPS && t >= last.t - EPS) {
      // 거리 단조 증가 + 시간 비감소일 때만 채택(정지·후진 노이즈 제외).
      out.push({d, t: Math.max(t, last.t)});
    }
  }
  return out;
}

/** 데이터점 a,b 사이에서 거리 x 에 해당하는 시간(선형보간). a.d ≤ x ≤ b.d 가정. */
function interpT(a: TrackPoint, b: TrackPoint, x: number): number {
  const span = b.d - a.d;
  if (span <= EPS) return a.t;
  const r = (x - a.d) / span;
  return a.t + r * (b.t - a.t);
}

/**
 * 시계열에서 정확히 D(km) 거리를 커버하는 최소 소요 시간(초). 총거리 < D 면 null.
 * 양끝 앵커(시작 데이터점 / 끝 데이터점)를 각각 투포인터로 평가해 전역 최소를 보장한다.
 */
export function bestEffortSec(track: readonly TrackPoint[], D: number): number | null {
  const p = sanitize(track);
  const n = p.length;
  if (n < 2 || !(D > 0)) return null;
  const total = p[n - 1].d - p[0].d;
  if (total < D - EPS) return null;

  let best = Infinity;

  // 앵커 A: 시작을 각 데이터점 i, 끝은 d[i]+D 보간. j 는 i 증가에 따라 단조 전진.
  let j = 1;
  for (let i = 0; i < n; i++) {
    const end = p[i].d + D;
    if (end > p[n - 1].d + EPS) break; // 이후 i 는 더 불가능(d 단조)
    if (j < i + 1) j = i + 1;
    while (j < n && p[j].d < end - EPS) j++;
    if (j >= n) break;
    best = Math.min(best, interpT(p[j - 1], p[j], end) - p[i].t);
  }

  // 앵커 B: 끝을 각 데이터점 j, 시작은 d[j]−D 보간. i 는 j 증가에 따라 단조 전진.
  let i2 = 0;
  for (let jj = 1; jj < n; jj++) {
    const start = p[jj].d - D;
    if (start < p[0].d - EPS) continue; // 아직 D 만큼 안 쌓임
    while (i2 + 1 < n && p[i2 + 1].d <= start + EPS) i2++;
    best = Math.min(best, p[jj].t - interpT(p[i2], p[i2 + 1], start));
  }

  return Number.isFinite(best) && best > 0 ? best : null;
}

export type RunBestEfforts = Partial<Record<BestEffortKey, number>>;

/** 한 런의 시계열에서 표준 거리별 베스트에포트(초)를 구한다. 못 채운 거리는 키 생략. */
export function runBestEfforts(track: readonly TrackPoint[]): RunBestEfforts {
  const out: RunBestEfforts = {};
  const p = sanitize(track);
  for (const d of STANDARD_DISTANCES) {
    const sec = bestEffortSec(p, d.km);
    if (sec != null) out[d.key] = sec;
  }
  return out;
}

/**
 * 여러 런의 베스트에포트를 거리별 최소로 집계 = 올타임 거리 PB.
 * 런별 요약(runBestEfforts)만 받아 min 하므로, PB 런을 지워도 자동으로 옳게 복구된다
 * (전역 캐시 한 개를 쓰면 삭제 후 틀린 값이 남는다 — 그 함정을 구조로 피한다).
 */
export function aggregateDistancePBs(perRun: readonly RunBestEfforts[]): RunBestEfforts {
  const out: RunBestEfforts = {};
  for (const d of STANDARD_DISTANCES) {
    let best: number | null = null;
    for (const r of perRun) {
      const v = r?.[d.key];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0 && (best == null || v < best)) best = v;
    }
    if (best != null) out[d.key] = best;
  }
  return out;
}
