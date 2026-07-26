// 거리 PB 캐시·마이그레이션·삭제복구 검증. paceTrack I/O·캐시는 목 deps 로 주입.
import {getDistancePBs, invalidateRun, type PBCache, type PBStoreDeps} from '../../lib/distancePBStore';
import type {TrackPoint} from '../../lib/bestEfforts';

// 300s/km 일정 페이스로 거리 km 만큼의 트랙 생성(5K=1500s, 10K=3000s ...).
function track(km: number, paceSec = 300): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let d = 0; d <= km + 1e-9; d += 1) pts.push({d, t: Math.round(d * paceSec)});
  if (pts[pts.length - 1].d < km) pts.push({d: km, t: Math.round(km * paceSec)});
  return pts;
}

function mkDeps(tracks: Record<string, TrackPoint[] | null>) {
  let cache: PBCache | null = null;
  const loadCalls: string[] = [];
  const deps: PBStoreDeps = {
    loadTrack: async (id) => { loadCalls.push(id); return tracks[id] ?? null; },
    getCache: async () => cache,
    setCache: async (c) => { cache = JSON.parse(JSON.stringify(c)); },
  };
  return {deps, loadCalls, getCache: () => cache};
}

describe('getDistancePBs — 마이그레이션/캐시', () => {
  test('기존 런들의 paceTrack 을 읽어 PB backfill', async () => {
    const {deps, loadCalls} = mkDeps({r1: track(6, 300), r2: track(12, 280)});
    const pb = await getDistancePBs(['r1', 'r2'], deps);
    expect(pb['5k']).toBeCloseTo(1400, 0);           // min(r1 1500, r2 1400) — r2 가 더 빠름
    expect(pb['10k']).toBeCloseTo(2800, 0);          // r2 만 10K 완주(280s/km)
    expect(pb.half).toBeUndefined();              // 아무도 21km 못 뜀
    expect(loadCalls.sort()).toEqual(['r1', 'r2']);
  });

  test('캐시 히트 — 두 번째 조회는 트랙을 다시 안 읽는다', async () => {
    const {deps, loadCalls} = mkDeps({r1: track(6)});
    await getDistancePBs(['r1'], deps);
    expect(loadCalls).toEqual(['r1']);
    await getDistancePBs(['r1'], deps);
    expect(loadCalls).toEqual(['r1']); // 재읽기 없음
  });

  test('신규 런만 추가 로드', async () => {
    const {deps, loadCalls} = mkDeps({r1: track(6), r2: track(6, 250)});
    await getDistancePBs(['r1'], deps);
    loadCalls.length = 0;
    const pb = await getDistancePBs(['r1', 'r2'], deps);
    expect(loadCalls).toEqual(['r2']);       // r1 은 캐시, r2 만 로드
    expect(pb['5k']).toBeCloseTo(1250, 0);   // r2(250s/km)가 더 빠름
  });

  test('삭제 안전 — PB 런을 지우면 PB 가 자동 복구', async () => {
    const {deps} = mkDeps({slow: track(6, 300), fast: track(6, 250)});
    let pb = await getDistancePBs(['slow', 'fast'], deps);
    expect(pb['5k']).toBeCloseTo(1250, 0);   // fast 가 PB
    pb = await getDistancePBs(['slow'], deps); // fast 삭제
    expect(pb['5k']).toBeCloseTo(1500, 0);   // slow 로 복구(전역 캐시 함정 회피)
  });

  test('트랙 없는(수동입력) 런은 계산됨 표식만, PB 미기여', async () => {
    const {deps, loadCalls} = mkDeps({manual: null});
    const pb = await getDistancePBs(['manual'], deps);
    expect(pb['5k']).toBeUndefined();
    // 재조회 시 다시 로드하지 않는다(빈 표식 캐시).
    loadCalls.length = 0;
    await getDistancePBs(['manual'], deps);
    expect(loadCalls).toEqual([]);
  });

  test('invalidateRun — 편집된 런은 다음 조회 때 재계산', async () => {
    const tracks: Record<string, TrackPoint[] | null> = {r1: track(6, 300)};
    const {deps, loadCalls} = mkDeps(tracks);
    await getDistancePBs(['r1'], deps);
    await invalidateRun('r1', deps);
    tracks.r1 = track(6, 250); // 편집으로 더 빨라짐
    loadCalls.length = 0;
    const pb = await getDistancePBs(['r1'], deps);
    expect(loadCalls).toEqual(['r1']);
    expect(pb['5k']).toBeCloseTo(1250, 0);
  });
});
