// ─── lib/raceCatalogRemote.ts — 원격 대회 카탈로그(캐시 + 증분 동기) ──────────
//
// 왜 필요한가(AUDIT 2 I-1): 부팅마다 Firestore 'races' 컬렉션 **전량(82문서)** 을 다시
// 읽고 있었다. 하루 앱 실행 3회면 246 읽기 — 사용자 한 명 하루 읽기의 **96%** 가 이
// 한 줄에서 나왔고, 무료 할당량이 일간 활성 192명에서 소진되는 원인이었다.
//
// 대회 목록은 **연 단위로 바뀌는 데이터**다. 실행 단위로 읽을 이유가 없다.
//
// 이 모듈은 lib/shoeCatalogRemote 와 **같은 규약**이다(신발 카탈로그가 이미 이 문제를
// 옳게 풀어 뒀다 — 새 패턴을 발명하지 않고 그대로 따른다):
//
//  1) **원격은 추가/갱신만 한다.** 번들 시드(SEED_RACES)를 지우지 않는다 — 서버 실수
//     한 번이 사용자의 대회 감지를 통째로 망가뜨리면 안 된다.
//  2) **실패는 조용히 삼킨다.** 오프라인·로그아웃·장애 어디서든 시드로 그냥 동작한다.
//  3) **바뀐 것만 받는다.** 24시간에 한 번, 마지막으로 본 시각 이후만(보통 0건).
//
// 하루 읽기: 246 → 약 1.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {SEED_RACES, type RaceEvent} from '../data/raceEvents';
import {fetchRacesUpdatedAfter, mergeRaces} from './raceStore';

/** 캐시 키. 스키마가 바뀌면 v 를 올려 옛 캐시를 무시한다(마이그레이션 대신 폐기). */
export const CACHE_KEY = 'keego.raceCatalogRemote.v1';

/** 동기 간격 — 대회 일정은 하루에도 몇 번씩 바뀌는 데이터가 아니다. */
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface RemoteRaceCache {
  /** 서버가 찍은 updatedAt 중 우리가 본 최대값(ms). 다음 조회의 기준점. */
  cursorMs: number;
  /** 마지막으로 **시도**한 시각(ms). 실패해도 갱신한다 — 안 그러면 매 실행 재시도한다. */
  lastAttemptMs: number;
  /** id → 대회. 배열이 아니라 맵인 이유: 증분으로 받은 문서를 id 로 덮어써야 한다. */
  byId: Record<string, RaceEvent>;
}

const EMPTY: RemoteRaceCache = {cursorMs: 0, lastAttemptMs: 0, byId: {}};

/** 캐시를 읽는다. 손상·부재는 빈 캐시로 — 절대 throw 하지 않는다. */
export async function loadCache(): Promise<RemoteRaceCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<RemoteRaceCache>;
    if (!p || typeof p !== 'object' || !p.byId || typeof p.byId !== 'object') return EMPTY;
    return {
      cursorMs: Number.isFinite(p.cursorMs) ? (p.cursorMs as number) : 0,
      lastAttemptMs: Number.isFinite(p.lastAttemptMs) ? (p.lastAttemptMs as number) : 0,
      byId: p.byId as Record<string, RaceEvent>,
    };
  } catch {
    return EMPTY;
  }
}

async function saveCache(c: RemoteRaceCache): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* 저장 실패는 다음 실행에 다시 받으면 그만이다 */
  }
}

/** 캐시에 담긴 대회들(순서는 id 순으로 고정 — 목록이 실행마다 흔들리지 않게). */
export function cachedRaces(c: RemoteRaceCache): RaceEvent[] {
  return Object.keys(c.byId)
    .sort()
    .map(k => c.byId[k]);
}

/**
 * 새로 받을 때가 됐는가. 간격 안이면 네트워크를 건드리지 않는다.
 * `now` 를 인자로 받는 이유는 테스트에서 시계를 고정하기 위해서다.
 */
export function isDue(c: RemoteRaceCache, now: number, intervalMs = SYNC_INTERVAL_MS): boolean {
  if (!c.lastAttemptMs) return true;
  // 기기 시계를 뒤로 돌린 경우(미래 값이 저장돼 영영 안 도는 것)도 만기로 본다.
  if (c.lastAttemptMs > now) return true;
  return now - c.lastAttemptMs >= intervalMs;
}

/**
 * 캐시를 읽고, 필요하면 서버에서 **바뀐 것만** 받아 합친 뒤 **시드와 머지해** 돌려준다.
 *
 * 항상 "지금 쓸 수 있는 대회 목록"을 돌려준다 — 네트워크가 죽어도 시드 + 캐시로 간다.
 * 호출부는 성공/실패를 구분할 필요가 없다.
 */
export async function syncRemoteRaces(opts?: {
  now?: number;
  force?: boolean;
}): Promise<RaceEvent[]> {
  const now = opts?.now ?? Date.now();
  const cache = await loadCache();
  if (!opts?.force && !isDue(cache, now)) return mergeRaces(SEED_RACES, cachedRaces(cache));

  let next: RemoteRaceCache = {...cache, lastAttemptMs: now};
  const res = await fetchRacesUpdatedAfter(cache.cursorMs || null);
  if (res) {
    if (res.races.length) {
      const byId = {...cache.byId};
      for (const r of res.races) if (r?.id) byId[r.id] = r;
      next = {cursorMs: Math.max(cache.cursorMs, res.maxUpdatedAtMs), lastAttemptMs: now, byId};
    } else {
      next = {...next, cursorMs: Math.max(cache.cursorMs, res.maxUpdatedAtMs)};
    }
  }
  // res === null(실패)이어도 시도 시각은 남긴다 — 안 그러면 매 실행 재시도한다.
  await saveCache(next);
  return mergeRaces(SEED_RACES, cachedRaces(next));
}
