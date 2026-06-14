// lib/progression/remoteRanking — 네트워크 RankingProvider (Slice E)
//
// 검증(행동): 인증 헤더 전송, snake_case→camelCase 매핑, available 의미, 그리고
// seam 계약(토큰 부재/네트워크 실패/비-OK/파싱 실패 → throw 없이 available:false 폴백).
// fetchImpl·getToken 을 주입해 firebase/네트워크 없이 결정적으로 테스트한다.

import {createRemoteRankingProvider} from '../../../lib/progression/remoteRanking';

const BASE = 'https://backend.test';

function okJson(body: any): any {
  return {ok: true, status: 200, json: async () => body};
}

const LB_BODY = {
  category: 'distance',
  yearMonth: '2026-06',
  entries: [
    {
      uid: 'u1',
      rank: 1,
      score: 123.4,
      nickname: '러너원',
      rank_tier: 'legend',
      rank_color: '#FF6500',
      equipped_title: 'running_1000k',
    },
    {
      uid: 'u2',
      rank: 2,
      score: 80,
      nickname: '러너투',
      rank_tier: 'gold',
      rank_color: '#FFD700',
      equipped_title: null,
    },
  ],
};

const ME_BODY = {
  available: true,
  category: 'distance',
  yearMonth: '2026-06',
  total: 42,
  topPercent: 4.8,
  me: {
    uid: 'me',
    rank: 2,
    score: 80,
    nickname: '나',
    rank_tier: 'gold',
    rank_color: '#FFD700',
    equipped_title: 'shoe_master',
  },
  nearby: [
    {uid: 'u1', rank: 1, score: 90, nickname: 'A', rank_tier: 'gold', rank_color: '#FFD700', equipped_title: null},
    {uid: 'me', rank: 2, score: 80, nickname: '나', rank_tier: 'gold', rank_color: '#FFD700', equipped_title: 'shoe_master'},
    {uid: 'u3', rank: 3, score: 70, nickname: 'C', rank_tier: 'silver', rank_color: '#C0C0C0', equipped_title: null},
  ],
};

describe('createRemoteRankingProvider: getLeaderboard', () => {
  test('인증 헤더 전송 + snake→camel 매핑 + available:true', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okJson(LB_BODY));
    const provider = createRemoteRankingProvider({
      baseUrl: BASE,
      getToken: async () => 'TKN',
      fetchImpl: fetchImpl as any,
    });
    const lb = await provider.getLeaderboard('distance', '2026-06');

    // 인증 GET 호출 형태.
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/leaderboards/distance?yearMonth=2026-06`);
    expect(init.headers.Authorization).toBe('Bearer TKN');

    expect(lb.kind).toBe('remote');
    expect(lb.available).toBe(true);
    expect(lb.entries).toHaveLength(2);
    expect(lb.entries[0]).toEqual({
      uid: 'u1',
      yearMonth: '2026-06',
      category: 'distance',
      rank: 1,
      score: 123.4,
      nickname: '러너원',
      rankTier: 'legend',
      rankColor: '#FF6500',
      equippedTitle: 'running_1000k',
    });
    // equipped_title null → equippedTitle null.
    expect(lb.entries[1].equippedTitle).toBeNull();
  });

  test('토큰 없음 → fetch 미호출, available:false, entries:[]', async () => {
    const fetchImpl = jest.fn();
    const provider = createRemoteRankingProvider({
      baseUrl: BASE,
      getToken: async () => null,
      fetchImpl: fetchImpl as any,
    });
    const lb = await provider.getLeaderboard('distance', '2026-06');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lb.available).toBe(false);
    expect(lb.entries).toEqual([]);
  });

  test('비-OK 응답 → available:false(throw 없음)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ok: false, status: 503, json: async () => ({})});
    const provider = createRemoteRankingProvider({
      baseUrl: BASE,
      getToken: async () => 'TKN',
      fetchImpl: fetchImpl as any,
    });
    const lb = await provider.getLeaderboard('distance', '2026-06');
    expect(lb.available).toBe(false);
    expect(lb.entries).toEqual([]);
  });

  test('fetch 가 throw 해도 provider 는 throw 하지 않는다', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    const provider = createRemoteRankingProvider({
      baseUrl: BASE,
      getToken: async () => 'TKN',
      fetchImpl: fetchImpl as any,
    });
    await expect(provider.getLeaderboard('distance', '2026-06')).resolves.toMatchObject({
      available: false,
      entries: [],
    });
  });
});

describe('createRemoteRankingProvider: getMyRanking', () => {
  test('내 순위/상위%/주변 매핑 + available:true', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okJson(ME_BODY));
    const provider = createRemoteRankingProvider({
      baseUrl: BASE,
      getToken: async () => 'TKN',
      fetchImpl: fetchImpl as any,
    });
    const mine = await provider.getMyRanking('distance', '2026-06');

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/leaderboards/distance/me?yearMonth=2026-06`);

    expect(mine.kind).toBe('remote');
    expect(mine.available).toBe(true);
    expect(mine.total).toBe(42);
    expect(mine.topPercent).toBe(4.8);
    expect(mine.me).not.toBeNull();
    expect(mine.me!.rank).toBe(2);
    expect(mine.me!.rankTier).toBe('gold');
    expect(mine.me!.equippedTitle).toBe('shoe_master');
    expect(mine.nearby).toHaveLength(3);
  });

  test('백엔드 available:false / me 없음 → available:false, me:null', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      okJson({available: false, category: 'distance', yearMonth: '2026-06', total: 0, me: null, nearby: []}),
    );
    const provider = createRemoteRankingProvider({
      baseUrl: BASE,
      getToken: async () => 'TKN',
      fetchImpl: fetchImpl as any,
    });
    const mine = await provider.getMyRanking('distance', '2026-06');
    expect(mine.available).toBe(false);
    expect(mine.me).toBeNull();
    expect(mine.nearby).toEqual([]);
  });

  test('토큰 없음 → available:false, me:null(fetch 미호출)', async () => {
    const fetchImpl = jest.fn();
    const provider = createRemoteRankingProvider({
      baseUrl: BASE,
      getToken: async () => null,
      fetchImpl: fetchImpl as any,
    });
    const mine = await provider.getMyRanking('distance', '2026-06');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mine.available).toBe(false);
    expect(mine.me).toBeNull();
  });
});
