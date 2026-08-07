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

// ─── 이번 달에 달리지 않았으면 명단에 없다 (2026-08-04) ────────────────────────
// 실제 리더보드를 열어 보니 **엔트리 5개가 전부 거리 0km · 활동 0일**이었다(민우님
// 테스트 계정들). 발행이 활동 여부를 안 보고 클라우드 동기마다 돌았기 때문이다.
// 그러면 두 가지가 깨진다:
//   · 화면 라벨이 거짓이 된다 — 진척 포인트 축은 "…에 **달린 러너 중**"이라고 적혀 있다.
//   · 첫 사용자가 랭킹을 열면 `러너 0km` 가 늘어선 죽은 표를 본다.
describe('publishMyRanking — 활동 게이트', () => {
  const NOW = Date.UTC(2026, 5, 15); // 2026-06
  const ym = yearMonthOf(NOW);

  test('이번 달 러닝이 없으면 발행하지 않는다', async () => {
    await signInWithCredential(getAuth(), {uid: 'idle'} as any);
    const ok = await publishMyRanking({
      nickname: '나', rankTier: 'silver', rankColor: '#C0C0C0',
      runs: [{shoe_id: 's1', km: 10, run_date: '2026-04-02'}], // 지난달
      shoes: [{id: 's1', max_km: 600, start_km: 0}],
      progressPoints: 260, // XP 는 있어도 이번 달 활동이 아니다
      nowMs: NOW,
    });
    expect(ok).toBe(false);
    expect(await firestoreRankingStore.getEntry('idle', ym)).toBeNull();
  });

  test('달렸다가 그 기록을 지우면 명단에서 **내려간다**', async () => {
    await signInWithCredential(getAuth(), {uid: 'gone'} as any);
    const base = {
      nickname: '나', rankTier: 'silver' as const, rankColor: '#C0C0C0',
      shoes: [{id: 's1', max_km: 600, start_km: 0}], progressPoints: 100, nowMs: NOW,
    };
    // 먼저 달려서 올라간다
    expect(await publishMyRanking({...base, runs: [{shoe_id: 's1', km: 5, run_date: '2026-06-02'}]})).toBe(true);
    expect(await firestoreRankingStore.getEntry('gone', ym)).not.toBeNull();
    // 그 런이 사라지면 — 발행을 '안 하는' 것만으로는 이미 올라간 줄이 남는다
    expect(await publishMyRanking({...base, runs: []})).toBe(false);
    expect(await firestoreRankingStore.getEntry('gone', ym)).toBeNull();
  });

  test('거리는 0 이어도 활동일이 있으면 올린다 — 아주 짧은 러닝도 달린 것이다', async () => {
    await signInWithCredential(getAuth(), {uid: 'tiny'} as any);
    const ok = await publishMyRanking({
      nickname: '나', rankTier: 'bronze', rankColor: '#CD7F32',
      runs: [{shoe_id: 's1', km: 0, run_date: '2026-06-03'}],
      shoes: [{id: 's1', max_km: 600, start_km: 0}],
      progressPoints: 0, nowMs: NOW,
    });
    expect(ok).toBe(true);
  });
});

// ============================================================================
// 「1,2,3위는 뭘 신나」가 화면에 뜬 적이 없었다 (2026-08-07 감사)
//
// 엔트리에 신발을 담아 두는 이유는 **추가 읽기 0**이다(랭킹 화면은 어차피 상위 100명
// 엔트리를 읽으므로, 프로필을 따로 읽으면 100명 × 1읽기가 더 붙는다).
// 그런데 읽기 쪽 정규화(toStored)가 shoes 를 **복사하지 않았다.** 발행할 땐 실어 보내고
// 읽을 땐 통째로 버리고 있었으니, 그 기능은 한 번도 동작한 적이 없다.
// ============================================================================
describe('랭킹 엔트리의 신발', () => {
  const YM2 = '2026-08';
  test('발행한 신발이 읽을 때 살아남는다', async () => {
    const uid = 'u-shoes';
    await firestoreRankingStore.publish(YM2, {
      ...storedEntry(uid, 42),
      shoes: [
        {brand: 'Nike', model: 'Pegasus 41', usedKm: 320},
        {brand: 'Asics', model: 'Novablast 5', usedKm: 110},
      ],
    } as never);

    const back = await firestoreRankingStore.getEntry(uid, YM2);
    expect(back?.shoes).toHaveLength(2);
    expect(back?.shoes?.[0]).toMatchObject({brand: 'Nike', model: 'Pegasus 41', usedKm: 320});
  });

  test('신발이 없던 옛 엔트리는 필드 없이 그대로 읽힌다(하위호환)', async () => {
    const uid = 'u-legacy';
    await firestoreRankingStore.publish(YM2, storedEntry(uid, 10));
    const back = await firestoreRankingStore.getEntry(uid, YM2);
    expect(back?.shoes).toBeUndefined();
  });

  test('목록 조회에서도 신발이 따라온다 — 화면이 읽는 경로', async () => {
    const uid = 'u-top';
    await firestoreRankingStore.publish(YM2, {
      ...storedEntry(uid, 99),
      shoes: [{brand: 'Hoka', model: 'Clifton 10', usedKm: 55}],
    } as never);
    const top = await firestoreRankingStore.topByCategory('distance', YM2, 10);
    const mine = top.find(e => e.uid === uid);
    expect(mine?.shoes?.[0]?.model).toBe('Clifton 10');
  });
});
