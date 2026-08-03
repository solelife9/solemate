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

/**
 * 캐시 미스 런의 paceTrack 을 한 번에 몇 개씩 읽을지. 지연(직렬)과 메모리(전량 병렬) 사이의 값.
 * 시계열 하나가 수십 KB 라 상한 없는 병렬은 재설치 직후 메모리 스파이크가 된다.
 */
export const PB_LOAD_CHUNK = 16;

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
  //
  // **직렬로 읽지 않는다**(2026-08-04 QA 감사 Q-4). 평소엔 캐시가 있어 새 런 한둘만 읽지만,
  // 재설치·기기 변경 직후 첫 부팅은 캐시가 비어 있어 **전량이 미스**다 — 런 1000건이면
  // paceTrack 읽기 1000번이 한 줄로 늘어서고, 그동안 거리 PB 가 비어 있다.
  // 한 번에 다 던지지도 않는다: paceTrack 은 런당 수십 KB 라 1000개를 동시에 메모리에
  // 올리는 쪽이 더 위험하다. 그래서 묶음 단위로 병렬 — 지연은 1/N 로 줄고 메모리 상한은 유지된다.
  const missing = ids.filter((id) => cache[id] === undefined);
  for (let i = 0; i < missing.length; i += PB_LOAD_CHUNK) {
    const chunk = missing.slice(i, i + PB_LOAD_CHUNK);
    const tracks = await Promise.all(chunk.map((id) => safe(deps.loadTrack(id))));
    chunk.forEach((id, j) => {
      const track = tracks[j];
      cache[id] = track && track.length >= 2 ? runBestEfforts(track) : {};
    });
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
