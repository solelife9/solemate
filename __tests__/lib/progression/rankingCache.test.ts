/**
 * 리더보드 읽기 캐시 — 같은 조회를 두 번 사지 않는다.
 *
 * 배경: 명예의 전당은 진입 1회에 Firestore 를 약 103 읽기 한다(상위 100 + 내 엔트리 +
 * 집계 2). 화면 로드 effect 가 `category` 에 의존해 **칩을 누를 때마다 통째로 다시** 읽고,
 * 나갔다 들어오면 또 읽는다. 앱 전체가 하루 6 읽기인데 이 화면 한 번이 그 50일치라,
 * 무료 한도가 세 자릿수 사용자에서 깨진다 — 그 구간이 베타 모집 2단계다.
 *
 * 이 스위트는 절약뿐 아니라 **캐시가 만들면 안 되는 사고 셋**을 고정한다.
 *   ① 실패를 캐시하면 지하철에서 한 번 실패한 사용자가 TTL 동안 빈 화면에 갇힌다.
 *   ② 계정을 바꿨는데 앞사람 순위가 보이면 성능 문제가 아니라 **데이터 격리 사고**다.
 *   ③ TTL 이 지나면 반드시 다시 읽는다(영원히 낡은 순위를 보여주지 않는다).
 * @format
 */
import {withRankingCache, RANKING_CACHE_TTL_MS, RANKING_CACHE_MAX_ENTRIES} from '../../../lib/progression/rankingCache';
import type {RemoteLeaderboard, RemoteMyRanking} from '../../../lib/progression/types';

const board = (category: string, yearMonth: string, available = true): RemoteLeaderboard =>
  ({kind: 'remote', available, category, yearMonth, entries: []} as RemoteLeaderboard);

const my = (category: string, yearMonth: string, rank: number, available = true): RemoteMyRanking =>
  ({
    kind: 'remote', available, category, yearMonth, total: 10,
    topPercent: 10, me: available ? ({rank} as any) : null, nearby: [],
  } as unknown as RemoteMyRanking);

function makeInner(opts: {available?: boolean; rankByUid?: Record<string, number>} = {}) {
  const calls = {board: 0, mine: 0};
  let uid = 'u1';
  const inner = {
    async getLeaderboard(c: string, ym: string) { calls.board++; return board(c, ym, opts.available ?? true); },
    async getMyRanking(c: string, ym: string) {
      calls.mine++;
      return my(c, ym, opts.rankByUid?.[uid] ?? 1, opts.available ?? true);
    },
  };
  return {inner, calls, setUid: (u: string) => { uid = u; }, getUid: async () => uid};
}

describe('리더보드 읽기 캐시', () => {
  test('같은 카테고리·월을 다시 물으면 원본을 다시 읽지 않는다', async () => {
    const {inner, calls, getUid} = makeInner();
    let t = 1000;
    const p = withRankingCache(inner, {getUid, now: () => t});

    await p.getLeaderboard('distance', '2026-08');
    await p.getLeaderboard('distance', '2026-08');
    await p.getLeaderboard('distance', '2026-08');
    expect(calls.board).toBe(1); // 3회 진입 → 1회 읽기
  });

  test('탭을 훑고 되돌아와도 카테고리마다 딱 한 번만 읽는다', async () => {
    const {inner, calls, getUid} = makeInner();
    const p = withRankingCache(inner, {getUid, now: () => 0});
    for (const c of ['distance', 'consistency', 'progressPoints', 'distance', 'consistency']) {
      await p.getLeaderboard(c, '2026-08');
      await p.getMyRanking(c, '2026-08');
    }
    // 5번 훑었지만 서로 다른 카테고리는 3개뿐이다.
    expect(calls.board).toBe(3);
    expect(calls.mine).toBe(3);
  });

  test('TTL 이 지나면 다시 읽는다 — 영원히 낡은 순위를 보여주지 않는다', async () => {
    const {inner, calls, getUid} = makeInner();
    let t = 0;
    const p = withRankingCache(inner, {getUid, now: () => t});
    await p.getLeaderboard('distance', '2026-08');
    t += RANKING_CACHE_TTL_MS - 1;
    await p.getLeaderboard('distance', '2026-08');
    expect(calls.board).toBe(1); // 아직 유효
    t += 2;
    await p.getLeaderboard('distance', '2026-08');
    expect(calls.board).toBe(2); // 만료 → 재조회
  });

  test('❶ 실패는 캐시하지 않는다 — 한 번 실패했다고 TTL 동안 빈 화면에 갇히면 안 된다', async () => {
    const {inner, calls, getUid} = makeInner({available: false});
    const p = withRankingCache(inner, {getUid, now: () => 0});
    await p.getLeaderboard('distance', '2026-08');
    await p.getLeaderboard('distance', '2026-08');
    await p.getMyRanking('distance', '2026-08');
    await p.getMyRanking('distance', '2026-08');
    expect(calls.board).toBe(2); // 매번 다시 시도한다
    expect(calls.mine).toBe(2);
  });

  test('❷ 계정이 바뀌면 내 순위를 재사용하지 않는다 — 앞사람 순위가 보이면 격리 사고다', async () => {
    const {inner, calls, getUid, setUid} = makeInner({rankByUid: {u1: 7, u2: 42}});
    const p = withRankingCache(inner, {getUid, now: () => 0});

    const a = await p.getMyRanking('distance', '2026-08');
    expect((a as any).me.rank).toBe(7);

    setUid('u2');
    const b = await p.getMyRanking('distance', '2026-08');
    expect((b as any).me.rank).toBe(42); // 캐시가 아니라 새로 읽었다
    expect(calls.mine).toBe(2);

    // 되돌아와도 각자 자기 값을 본다(서로 덮어쓰지 않는다).
    setUid('u1');
    expect(((await p.getMyRanking('distance', '2026-08')) as any).me.rank).toBe(7);
    expect(calls.mine).toBe(2); // u1 것은 캐시에 남아 있었다
  });

  test('❷-b 미로그인이면 캐시를 타지 않는다 — 키를 못 만드는데 섞으면 안 된다', async () => {
    const calls = {mine: 0};
    const inner = {
      async getLeaderboard(c: string, ym: string) { return board(c, ym); },
      async getMyRanking(c: string, ym: string) { calls.mine++; return my(c, ym, 1); },
    };
    const p = withRankingCache(inner, {getUid: async () => null, now: () => 0});
    await p.getMyRanking('distance', '2026-08');
    await p.getMyRanking('distance', '2026-08');
    expect(calls.mine).toBe(2);
  });

  test('uid 조회가 실패해도 죽지 않고 원본에 맡긴다', async () => {
    const {inner, calls} = makeInner();
    const p = withRankingCache(inner, {getUid: async () => { throw new Error('auth'); }, now: () => 0});
    await expect(p.getMyRanking('distance', '2026-08')).resolves.toBeTruthy();
    expect(calls.mine).toBe(1);
  });

  test('보관 상한을 넘으면 오래된 것부터 버린다 — 맵이 무한히 자라지 않는다', async () => {
    const {inner, calls, getUid} = makeInner();
    const p = withRankingCache(inner, {getUid, now: () => 0});
    for (let i = 0; i < RANKING_CACHE_MAX_ENTRIES + 5; i++) {
      await p.getLeaderboard('distance', `2020-${String((i % 12) + 1).padStart(2, '0')}-${i}`);
    }
    const before = calls.board;
    // 가장 최근 것은 아직 캐시에 있다.
    await p.getLeaderboard('distance', `2020-${String(((RANKING_CACHE_MAX_ENTRIES + 4) % 12) + 1).padStart(2, '0')}-${RANKING_CACHE_MAX_ENTRIES + 4}`);
    expect(calls.board).toBe(before);
  });

  // ── 배선 확인 ────────────────────────────────────────────────────────────
  // 순수 모듈만 검사하면 "캐시는 옳은데 앱이 안 쓰는" 상태를 못 잡는다.
  // 2026-08-07 고도 버그가 정확히 그것이었다 — 상한을 만들어 놓고 호출부 세 곳이
  // 인자를 안 넘겨 3주간 한 번도 실행된 적이 없었다. 그래서 실물 provider 를 본다.
  test('앱이 쓰는 provider 가 실제로 캐시로 감싸져 있다', () => {
    const {keegoFirestoreRankingProvider} = require('../../../lib/progression/firestoreRankingStore');
    expect(typeof (keegoFirestoreRankingProvider as any).clearRankingCache).toBe('function');
  });

  test('clearRankingCache 로 비우면 다시 읽는다(로그아웃·계정 전환용)', async () => {
    const {inner, calls, getUid} = makeInner();
    const p = withRankingCache(inner, {getUid, now: () => 0});
    await p.getLeaderboard('distance', '2026-08');
    p.clearRankingCache();
    await p.getLeaderboard('distance', '2026-08');
    expect(calls.board).toBe(2);
  });
});
