// ─── lib/shoeCatalogRemote.ts — 원격 신발 카탈로그(캐시 + 증분 동기화) ────────
//
// 왜 필요한가: 러닝화 목록이 앱 번들에 박혀 있으면 새 모델 하나 넣는 데 빌드·심사·
// 업데이트가 필요하다. 새 모델은 계속 나오고 shoe_requests 에 요청도 쌓이는데, 그 주기가
// 앱 릴리즈 주기에 묶이면 카탈로그는 구조적으로 낡는다(docs/shoes-spec.md §0).
//
// 설계에서 지킨 세 가지:
//
//  1) **원격은 추가만 한다.** 번들 목록을 덮지 않는다(data/shoeModels.ts mergeShoeModels).
//     서버 실수 한 번이 사용자가 쓰던 분류를 바꾸면 안 된다.
//  2) **실패는 조용히 삼킨다.** 비행기 모드·로그아웃·서버 장애 어디서든 등록 화면은
//     번들 목록으로 그냥 동작해야 한다. 카탈로그 갱신은 부가 기능이다.
//  3) **바뀐 것만 받는다.** 매 실행 500켤레를 읽으면 사용자 수만큼 요금이 는다.
//     마지막으로 본 시각 이후만 조회하고(보통 0건), 받은 건 로컬에 쌓아 캐시한다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {listShoesUpdatedAfter} from '../services/shoes';
import type {ShoeDocLike} from '../data/shoeModels';

/** 캐시 키. 스키마가 바뀌면 v 를 올려 옛 캐시를 무시한다(마이그레이션 대신 폐기). */
export const CACHE_KEY = 'keego.shoeCatalogRemote.v1';

/** 동기화 간격 — 카탈로그는 하루에도 몇 번씩 바뀌는 데이터가 아니다. */
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface RemoteCatalogCache {
  /** 서버가 찍은 updatedAt 중 우리가 본 최대값(ms). 다음 조회의 기준점. */
  cursorMs: number;
  /** 마지막으로 **시도**한 시각(ms). 실패해도 갱신한다 — 안 그러면 매 실행 재시도한다. */
  lastAttemptMs: number;
  /** id → 문서. 배열이 아니라 맵인 이유: 증분으로 받은 문서를 id 로 덮어써야 한다. */
  byId: Record<string, ShoeDocLike>;
}

const EMPTY: RemoteCatalogCache = {cursorMs: 0, lastAttemptMs: 0, byId: {}};

/** 캐시를 읽는다. 손상·부재는 빈 캐시로 — 절대 throw 하지 않는다. */
export async function loadCache(): Promise<RemoteCatalogCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<RemoteCatalogCache>;
    if (!p || typeof p !== 'object' || !p.byId || typeof p.byId !== 'object') return EMPTY;
    return {
      cursorMs: Number.isFinite(p.cursorMs) ? (p.cursorMs as number) : 0,
      lastAttemptMs: Number.isFinite(p.lastAttemptMs) ? (p.lastAttemptMs as number) : 0,
      byId: p.byId as Record<string, ShoeDocLike>,
    };
  } catch {
    return EMPTY;
  }
}

async function saveCache(c: RemoteCatalogCache): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* 저장 실패는 다음 실행에 다시 받으면 그만이다 */
  }
}

/** 캐시에 담긴 문서들(순서는 id 순으로 고정 — 목록이 실행마다 흔들리지 않게). */
export function cachedDocs(c: RemoteCatalogCache): ShoeDocLike[] {
  return Object.keys(c.byId).sort().map((k) => c.byId[k]);
}

/**
 * 새로 받을 때가 됐는가. 간격 안이면 네트워크를 건드리지 않는다.
 * `now` 를 인자로 받는 이유는 테스트에서 시계를 고정하기 위해서다.
 */
export function isDue(c: RemoteCatalogCache, now: number, intervalMs = SYNC_INTERVAL_MS): boolean {
  if (!c.lastAttemptMs) return true;
  // 기기 시계를 뒤로 돌린 경우(미래 값이 저장돼 영영 안 도는 것)도 만기로 본다.
  if (c.lastAttemptMs > now) return true;
  return now - c.lastAttemptMs >= intervalMs;
}

/**
 * 캐시를 읽고, 필요하면 서버에서 **바뀐 것만** 받아 합친다.
 *
 * 돌려주는 값은 항상 "지금 쓸 수 있는 문서 목록"이다 — 네트워크가 죽어도 캐시된 걸
 * 그대로 준다. 호출부는 성공/실패를 구분할 필요가 없다.
 */
export async function syncRemoteCatalog(opts?: {
  now?: number;
  force?: boolean;
}): Promise<ShoeDocLike[]> {
  const now = opts?.now ?? Date.now();
  const cache = await loadCache();
  if (!opts?.force && !isDue(cache, now)) return cachedDocs(cache);

  let next: RemoteCatalogCache = {...cache, lastAttemptMs: now};
  try {
    const {docs, maxUpdatedAtMs} = await listShoesUpdatedAfter(cache.cursorMs || null);
    if (docs.length) {
      const byId = {...cache.byId};
      for (const d of docs) {
        const id = (d as {id?: string}).id;
        if (typeof id === 'string' && id) byId[id] = d as ShoeDocLike;
      }
      next = {cursorMs: Math.max(cache.cursorMs, maxUpdatedAtMs), lastAttemptMs: now, byId};
    } else {
      next = {...next, cursorMs: Math.max(cache.cursorMs, maxUpdatedAtMs)};
    }
    await saveCache(next);
  } catch {
    // 로그아웃(규칙상 읽기 거부)·오프라인·장애 — 캐시로 계속 간다. 다만 시도 시각은
    // 남겨서 매 실행 재시도하지 않게 한다.
    await saveCache(next);
  }
  return cachedDocs(next);
}
