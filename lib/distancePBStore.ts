// ============================================================================
// lib/distancePBStore.ts — 거리 PB 캐시·마이그레이션·집계
// ----------------------------------------------------------------------------
// 정책(정석):
//   · 런별 베스트에포트를 캐시(runId→요약)해 paceTrack 은 런당 한 번만 읽는다.
//   · 처음 보는 런은 paceTrack 을 읽어 계산(= 기존 런 backfill 마이그레이션과 동일 경로).
//   · 삭제된 런은 캐시에서 제거하고, PB 는 '현재 런들'만 집계 → PB 런을 지워도 자동 복구.
//   · 캐시가 없어도(초기·손상) 전량 재계산으로 항상 옳은 값을 낸다.
// 부작용(AsyncStorage·paceTrack I/O)은 전부 deps 로 주입 → 순수 로직만 테스트한다.
// ============================================================================

import {
  runBestEfforts,
  aggregateDistancePBs,
  type RunBestEfforts,
  type TrackPoint,
} from './bestEfforts';

export const PB_CACHE_KEY = 'distance_pb_cache_v1';

export type PBCache = Record<string, RunBestEfforts>;

export interface PBStoreDeps {
  /** 런의 (d,t) 시계열을 읽는다(paceTrack_<id>). 없으면 null. */
  loadTrack: (runId: string) => Promise<TrackPoint[] | null>;
  /** 캐시 맵을 읽는다(없으면 null). */
  getCache: () => Promise<PBCache | null>;
  /** 캐시 맵을 저장한다. */
  setCache: (cache: PBCache) => Promise<void>;
}

/**
 * 현재 런 id 집합에 대한 올타임 거리 PB를 구한다(캐시·마이그레이션·삭제복구 포함).
 * 반환은 거리키→최고초. 못 채운 거리는 키 생략.
 */
export async function getDistancePBs(
  runIds: readonly string[],
  deps: PBStoreDeps,
): Promise<RunBestEfforts> {
  const ids = (Array.isArray(runIds) ? runIds : []).map(String).filter(Boolean);
  const idSet = new Set(ids);
  const cache: PBCache = (await safe(deps.getCache())) ?? {};
  let changed = false;

  // 삭제된 런 캐시 정리.
  for (const key of Object.keys(cache)) {
    if (!idSet.has(key)) {
      delete cache[key];
      changed = true;
    }
  }

  // 처음 보는 런 계산(마이그레이션 + 신규). 빈 {} 도 '계산됨' 표식으로 저장해 재읽기 방지.
  for (const id of ids) {
    if (cache[id] !== undefined) continue;
    const track = await safe(deps.loadTrack(id));
    cache[id] = track && track.length >= 2 ? runBestEfforts(track) : {};
    changed = true;
  }

  if (changed) await safe(deps.setCache(cache));

  return aggregateDistancePBs(ids.map((id) => cache[id] ?? {}));
}

/** 특정 런이 갱신됐을 때(편집/재계산) 캐시에서 무효화한다 — 다음 조회 때 재계산. */
export async function invalidateRun(runId: string, deps: PBStoreDeps): Promise<void> {
  const cache: PBCache = (await safe(deps.getCache())) ?? {};
  if (cache[String(runId)] !== undefined) {
    delete cache[String(runId)];
    await safe(deps.setCache(cache));
  }
}

async function safe<T>(p: Promise<T> | T): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
