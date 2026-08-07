// ============================================================================
// lib/progression/rankingCache.ts — 리더보드 읽기 캐시(순수·DI)
// ============================================================================
// **왜 있는가.** 명예의 전당 화면은 진입 1회에 Firestore 를 약 103번 읽는다
// (상위 100 + 내 엔트리 1 + 집계 2). 그런데 화면의 로드 effect 의존성에 `category` 가
// 있어서 **칩을 누를 때마다 통째로 다시 읽고**, 화면을 나갔다 들어오면 또 읽는다.
// 탭 3개를 훑으면 309, 한 번 더 들어오면 618 이다.
//
// 이 숫자가 위험한 이유는 절대량이 아니라 **비율**이다. AUDIT 2 가 앱 전체를
// 하루 6 읽기로 줄여 놨는데(무료 한도 소진 192명 → 8,300명), 이 화면 한 번이 그 50일치다.
// 무료 한도(하루 5만 읽기)는 이 화면 때문에 **세 자릿수 사용자에서 깨진다** — 그리고
// 그 구간이 정확히 베타 모집 2단계(50명+)다. 「출시 후에 고쳐도 되는 것」으로 분류됐던
// 항목인데, 첫 코호트에서 터지므로 **모집 전 필수**로 승격됐다(FINAL-readiness §5).
//
// **왜 화면이 아니라 여기인가.** 화면 지역 상태로 캐시하면 언마운트에 사라져 재진입이
// 다시 100 읽기다. 실제 사용 패턴(진척 → 전당 → 뒤로 → 다시)이 정확히 그것이라
// 캐시는 **화면보다 오래 살아야** 한다.
//
// 계약: 원본 provider 와 동일(항상 resolve · throw 금지). 아래 세 가지를 지킨다.
//   1) **성공만 캐시한다.** available:false 를 캐시하면 지하철에서 한 번 실패한 사용자가
//      TTL 동안 빈 화면에 갇힌다 — 캐시가 장애를 연장하는 건 본말전도다.
//   2) **내 순위는 uid 로 키를 나눈다.** 계정을 바꿨는데 앞사람 순위가 보이면 그건
//      성능 문제가 아니라 데이터 격리 사고다(이 저장소가 S-1·C 로 두 번 겪었다).
//   3) **시계를 주입받는다.** Date.now 에 기대지 않아 테스트가 시간 이동을 할 수 있다.
// ============================================================================
import type {RemoteLeaderboard, RemoteMyRanking} from './types';

export interface CacheableRankingProvider {
  getLeaderboard(category: string, yearMonth: string): Promise<RemoteLeaderboard>;
  getMyRanking(category: string, yearMonth: string): Promise<RemoteMyRanking>;
}

/**
 * 캐시 수명. 월간 리더보드는 남이 발행해야 바뀌므로 초 단위 신선도가 필요 없다.
 * 5분이면 한 세션의 탐색(탭 전환·재진입)을 전부 덮으면서, 앱을 오래 켜 둔 사용자도
 * 몇 분 뒤엔 갱신된 순위를 본다.
 */
export const RANKING_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 보관 상한(카테고리 5 × 최근 몇 달). 넘으면 가장 오래된 것부터 버린다.
 * 실사용에선 절대 안 닿지만, 무한히 자라는 맵을 앱 수명 내내 들고 있지 않기 위해서다.
 */
export const RANKING_CACHE_MAX_ENTRIES = 24;

type Entry<T> = {at: number; value: T};

function put<T>(map: Map<string, Entry<T>>, key: string, value: T, at: number): void {
  // 재삽입 시 순서를 갱신해 LRU 처럼 동작하게 한다(Map 은 삽입 순서를 보존한다).
  if (map.has(key)) map.delete(key);
  map.set(key, {at, value});
  while (map.size > RANKING_CACHE_MAX_ENTRIES) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function get<T>(map: Map<string, Entry<T>>, key: string, now: number): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (now - hit.at >= RANKING_CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

export interface RankingCacheDeps {
  /** 현재 로그인 uid. 내 순위 캐시 키에 들어간다(계정 전환 격리). */
  getUid: () => Promise<string | null>;
  /** 시각(ms). 테스트가 시간을 옮길 수 있게 주입한다. */
  now?: () => number;
}

export interface CachedRankingProvider extends CacheableRankingProvider {
  /** 캐시를 비운다(로그아웃·계정 전환·테스트). */
  clearRankingCache(): void;
}

/**
 * provider 를 감싸 같은 (카테고리·월) 조회를 TTL 동안 재사용한다.
 * 원본의 계약(항상 resolve)을 그대로 유지하며, 실패는 캐시하지 않는다.
 */
export function withRankingCache(
  inner: CacheableRankingProvider,
  deps: RankingCacheDeps,
): CachedRankingProvider {
  const nowMs = deps.now ?? (() => Date.now());
  const boards = new Map<string, Entry<RemoteLeaderboard>>();
  const mine = new Map<string, Entry<RemoteMyRanking>>();

  return {
    async getLeaderboard(category, yearMonth) {
      const key = `${category}|${yearMonth}`;
      const cached = get(boards, key, nowMs());
      if (cached) return cached;
      const value = await inner.getLeaderboard(category, yearMonth);
      // 실패(available:false)는 캐시하지 않는다 — 다음 진입에서 다시 시도한다.
      if (value && value.available === true) put(boards, key, value, nowMs());
      return value;
    },

    async getMyRanking(category, yearMonth) {
      // uid 조회는 인증 상태 읽기라 Firestore 읽기가 아니다(과금 0).
      // 그래도 실패하면 캐시를 건너뛰고 원본에 맡긴다 — 키를 못 만들면 섞일 위험이 있다.
      let uid: string | null = null;
      try {
        uid = await deps.getUid();
      } catch {
        return inner.getMyRanking(category, yearMonth);
      }
      if (!uid) return inner.getMyRanking(category, yearMonth);
      const key = `${uid}|${category}|${yearMonth}`;
      const cached = get(mine, key, nowMs());
      if (cached) return cached;
      const value = await inner.getMyRanking(category, yearMonth);
      if (value && value.available === true) put(mine, key, value, nowMs());
      return value;
    },

    clearRankingCache() {
      boards.clear();
      mine.clear();
    },
  };
}
