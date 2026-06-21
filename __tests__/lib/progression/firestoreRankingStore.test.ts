// lib/progression/firestoreRankingStore — Firestore RankingStore 배선 (Phase 3)
//
// 검증(행동): jest.setup 의 인메모리 firestore 목으로 publish→읽기 라운드트립을 단언한다.
//  1) firestoreRankingStore: publish 후 topByCategory(정렬+limit)·getEntry·countAbove·total.
//  2) publishMyRanking: 로그인 uid 로 leaderboards/{ym}/entries/{uid} 발행, 미로그인 → false.
//  3) keegoFirestoreRankingProvider: 발행된 엔트리를 라이브 provider 가 그대로 읽는다.

import {getAuth, signInWithCredential, signOut} from '@react-native-firebase/auth';
import * as firestore from '@react-native-firebase/firestore';
import {
  firestoreRankingStore,
  keegoFirestoreRankingProvider,
  publishMyRanking,
  yearMonthOf,
} from '../../../lib/progression/firestoreRankingStore';
import {buildStoredEntry} from '../../../lib/progression/firestoreRanking';
import {RankTier} from '../../../lib/progression/types';

const YM = '2026-06';

function storedEntry(uid: string, distance: number, tier: RankTier = 'gold') {
  return buildStoredEntry({
    uid,
    nickname: `러너-${uid}`,
    rankTier: tier,
    rankColor: '#FFD700',
    stats: {distance, consistency: 1, shoeHealth: 50, collection: 1, progressPoints: distance * 10},
    updatedAt: 1,
  });
}

beforeEach(async () => {
  (firestore as any).__reset();
  await signOut(getAuth());
});

describe('firestoreRankingStore — 라운드트립', () => {
  test('publish 후 정렬·limit·getEntry·countAbove·total', async () => {
    await firestoreRankingStore.publish(YM, storedEntry('a', 10));
    await firestoreRankingStore.publish(YM, storedEntry('b', 30));
    await firestoreRankingStore.publish(YM, storedEntry('c', 20));

    const top2 = await firestoreRankingStore.topByCategory('distance', YM, 2);
    expect(top2.map(e => e.uid)).toEqual(['b', 'c']);

    const mine = await firestoreRankingStore.getEntry('c', YM);
    expect(mine?.distance).toBe(20);
    expect(await firestoreRankingStore.getEntry('zzz', YM)).toBeNull();

    expect(await firestoreRankingStore.countAbove('distance', YM, 20)).toBe(1); // b(30)
    expect(await firestoreRankingStore.total(YM)).toBe(3);
  });

  test('다른 달은 격리(leaderboards/{ym} 분리)', async () => {
    await firestoreRankingStore.publish('2026-05', storedEntry('a', 99));
    expect(await firestoreRankingStore.total(YM)).toBe(0);
    expect(await firestoreRankingStore.total('2026-05')).toBe(1);
  });
});

describe('publishMyRanking', () => {
  const NOW = Date.UTC(2026, 5, 15); // 2026-06

  test('로그인 uid 로 내 엔트리 발행', async () => {
    await signInWithCredential(getAuth(), {uid: 'me'} as any);
    const ok = await publishMyRanking({
      nickname: '나',
      rankTier: 'platinum',
      rankColor: '#14B8A6',
      equippedTitle: 'shoe_master',
      runs: [{shoe_id: 's1', km: 12, run_date: '2026-06-02'}],
      shoes: [{id: 's1', max_km: 600, start_km: 0}],
      progressPoints: 300,
      nowMs: NOW,
    });
    expect(ok).toBe(true);
    const ym = yearMonthOf(NOW);
    const e = await firestoreRankingStore.getEntry('me', ym);
    expect(e?.uid).toBe('me');
    expect(e?.nickname).toBe('나');
    expect(e?.distance).toBe(12);
    expect(e?.equippedTitle).toBe('shoe_master');
    expect(e?.progressPoints).toBe(300);
  });

  test('미로그인 → false, 아무것도 쓰지 않음', async () => {
    const ok = await publishMyRanking({
      nickname: '나',
      rankTier: 'bronze',
      rankColor: '#CD7F32',
      runs: [],
      shoes: [],
      progressPoints: 0,
      nowMs: NOW,
    });
    expect(ok).toBe(false);
    expect(await firestoreRankingStore.total(yearMonthOf(NOW))).toBe(0);
  });
});

describe('keegoFirestoreRankingProvider (라이브 배선)', () => {
  const NOW = Date.UTC(2026, 5, 15);

  test('발행된 엔트리를 provider 가 읽어 내 순위를 준다', async () => {
    await signInWithCredential(getAuth(), {uid: 'me'} as any);
    const ym = yearMonthOf(NOW);
    await firestoreRankingStore.publish(ym, storedEntry('rival', 100));
    await publishMyRanking({
      nickname: '나',
      rankTier: 'gold',
      rankColor: '#FFD700',
      runs: [{shoe_id: 's1', km: 50, run_date: '2026-06-02'}],
      shoes: [{id: 's1', max_km: 600, start_km: 0}],
      progressPoints: 10,
      nowMs: NOW,
    });
    const lb = await keegoFirestoreRankingProvider.getLeaderboard('distance', ym);
    expect(lb.available).toBe(true);
    expect(lb.entries.map(e => e.uid)).toEqual(['rival', 'me']); // 100 > 50

    const mine = await keegoFirestoreRankingProvider.getMyRanking('distance', ym);
    expect(mine.kind).toBe('remote');
    if (mine.kind === 'remote') {
      expect(mine.me?.uid).toBe('me');
      expect(mine.me?.rank).toBe(2);
      expect(mine.total).toBe(2);
    }
  });
});

describe('yearMonthOf', () => {
  test('주입 시각 → YYYY-MM (zero-pad)', () => {
    expect(yearMonthOf(Date.UTC(2026, 0, 9))).toBe('2026-01');
    expect(yearMonthOf(Date.UTC(2026, 11, 31))).toBe('2026-12');
  });
});
