// lib/progression/ranking — 랭킹 seam 로컬 stub.
//
// 관찰 가능한 동작(behavioral):
//   · getLeaderboard → available:false, entries:[] — 발명한 타인 데이터 없음(anti-scenario 5).
//   · getMyRanking   → available:false, me = 내 로컬 스냅샷(점수/티어/색) 또는 null.
//     순위/상위% 같은 크로스유저 값은 백엔드 부재로 채우지 않는다.
//   · 인터페이스 계약(RankingProvider) 충족: 항상 즉시 resolve, throw 없음.
//
// 순수 stub — 네트워크/AsyncStorage 미사용.

import {
  createLocalRankingProvider,
  localRankingProvider,
} from '../../../lib/progression/ranking';
import {RankResult} from '../../../lib/progression/types';

const rank: RankResult = {
  score: 73.2,
  tier: 'platinum',
  color: '#14B8A6',
  pillars: {
    running: 0.5,
    consistency: 0.5,
    shoeManagement: 0.5,
    rotation: 0.5,
    injuryPrevention: 0.5,
    engagement: 0.5,
  },
};

describe('localRankingProvider: 리더보드 placeholder(가짜 경쟁자 금지)', () => {
  test('getLeaderboard → available:false, entries 비어 있음', async () => {
    const lb = await localRankingProvider.getLeaderboard('running', '2026-06');
    expect(lb.kind).toBe('local');
    expect(lb.available).toBe(false);
    expect(lb.entries).toEqual([]);
    expect(lb.category).toBe('running');
    expect(lb.yearMonth).toBe('2026-06');
  });

  test('바인딩 안 된 기본 stub → me=null(랭크 미표면화)', async () => {
    const mine = await localRankingProvider.getMyRanking('running', '2026-06');
    expect(mine.kind).toBe('local');
    expect(mine.available).toBe(false);
    expect(mine.me).toBeNull();
  });
});

describe('createLocalRankingProvider: 내 랭크 바인딩', () => {
  test('getMyRanking → me 는 로컬 스냅샷(점수/티어/색)만, 순위 없음', async () => {
    const provider = createLocalRankingProvider(rank);
    const mine = await provider.getMyRanking('running', '2026-06');
    expect(mine.available).toBe(false);
    expect(mine.me).toEqual({score: 73.2, tier: 'platinum', color: '#14B8A6'});
    // 크로스유저 값(순위/상위%)은 me 에 없다.
    expect(mine.me).not.toHaveProperty('rank');
    expect(mine.me).not.toHaveProperty('percentile');
  });

  test('리더보드는 여전히 빈 placeholder(경쟁자 발명 금지)', async () => {
    const provider = createLocalRankingProvider(rank);
    const lb = await provider.getLeaderboard('rotation', '2026-05');
    expect(lb.available).toBe(false);
    expect(lb.entries).toHaveLength(0);
  });

  test('비정상 rank 입력 → me=null(throw 없음)', async () => {
    const provider = createLocalRankingProvider(null);
    const mine = await provider.getMyRanking('running', '2026-06');
    expect(mine.me).toBeNull();
  });
});
