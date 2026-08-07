// lib/progression/firestoreRankingStore — Firestore RankingStore 배선 (Phase 3)
//
// 검증(행동): jest.setup 의 인메모리 firestore 목으로 publish→읽기 라운드트립을 단언한다.
//  1) firestoreRankingStore: publish 후 topByCategory(정렬+limit)·getEntry·countAbove·total.
//  2) publishMyRanking: **서버 발행 경로**를 탄다(2026-08-07 — 점수 위조 차단으로 쓰기가
//     Cloud Functions 전용이 됐다). 여기서는 '무엇을 보내는가'와 'Firestore 에 직접 쓰지
//     않는가'를 본다. 점수 재계산 규칙 자체는 __tests__/functions/ranking.test.ts.
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

describe('publishMyRanking — 서버 발행 경로', () => {
  const NOW = Date.UTC(2026, 5, 15); // 2026-06
  const args = {
    nickname: '나',
    rankTier: 'platinum' as const,
    rankColor: '#14B8A6',
    equippedTitle: 'shoe_master',
    runs: [{shoe_id: 's1', km: 12, run_date: '2026-06-02'}],
    shoes: [{id: 's1', max_km: 600, start_km: 0}],
    progressPoints: 300,
    nowMs: NOW,
  };
  const fetchMock = () => (global as unknown as {fetch: jest.Mock}).fetch;

  beforeEach(() => {
    (global as unknown as {fetch: jest.Mock}).fetch = jest.fn(() =>
      Promise.resolve({ok: true, json: () => Promise.resolve({ok: true, published: true})}),
    );
  });

  test('ID 토큰을 실어 표시정보만 보낸다 — 점수는 서버가 기록에서 다시 계산한다', async () => {
    await signInWithCredential(getAuth(), {uid: 'me'} as never);
    expect(await publishMyRanking(args)).toBe(true);

    const [url, opts] = fetchMock().mock.calls[0];
    expect(String(url)).toContain('/api/ranking/publish');
    expect(opts.headers.Authorization).toMatch(/^Bearer /);
    const sent = JSON.parse(opts.body);
    expect(sent.yearMonth).toBe(yearMonthOf(NOW));
    expect(sent.nickname).toBe('나');
    expect(sent.equippedTitle).toBe('shoe_master');
    expect(sent.progressPoints).toBe(300);
    // **거리·활동일수는 보내지 않는다.** 보내면 서버가 그걸 쓸 유혹이 생기고, 그 순간
    // 위조 차단이 무의미해진다. 이 단언이 그 경계를 지킨다.
    expect(sent.distance).toBeUndefined();
    expect(sent.consistency).toBeUndefined();
  });

  test('Firestore 에 **직접 쓰지 않는다** — 규칙이 막았고, 뚫으려 들면 안 된다', async () => {
    await signInWithCredential(getAuth(), {uid: 'me'} as never);
    await publishMyRanking(args);
    expect(await firestoreRankingStore.total(yearMonthOf(NOW))).toBe(0);
  });

  test('서버가 "안 올렸다"고 하면 false', async () => {
    await signInWithCredential(getAuth(), {uid: 'me'} as never);
    fetchMock().mockResolvedValue({ok: true, json: () => Promise.resolve({ok: true, published: false})});
    expect(await publishMyRanking(args)).toBe(false);
  });

  test('서버 오류·네트워크 실패는 false — 동기 흐름을 막지 않는다', async () => {
    await signInWithCredential(getAuth(), {uid: 'me'} as never);
    fetchMock().mockResolvedValue({ok: false, status: 500});
    expect(await publishMyRanking(args)).toBe(false);
    fetchMock().mockRejectedValue(new Error('offline'));
    await expect(publishMyRanking(args)).resolves.toBe(false);
  });

  test('미로그인 → false, 서버를 부르지도 않는다', async () => {
    expect(await publishMyRanking({...args, equippedTitle: null})).toBe(false);
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(await firestoreRankingStore.total(yearMonthOf(NOW))).toBe(0);
  });
});

describe('keegoFirestoreRankingProvider (라이브 배선)', () => {
  const NOW = Date.UTC(2026, 5, 15);

  test('발행된 엔트리를 provider 가 읽어 내 순위를 준다', async () => {
    await signInWithCredential(getAuth(), {uid: 'me'} as any);
    const ym = yearMonthOf(NOW);
    // 이 describe 가 보는 것은 **읽기 배선**이다(발행은 이제 서버가 한다).
    // 그래서 엔트리는 store 로 직접 심는다 — 서버 왕복을 흉내 낼 이유가 없다.
    await firestoreRankingStore.publish(ym, storedEntry('rival', 100));
    await firestoreRankingStore.publish(ym, storedEntry('me', 50));
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
// 이 규칙은 **서버로 옮겼다**(2026-08-07). 거리·활동일수를 아는 쪽이 서버뿐이기 때문이다.
// 검증은 __tests__/functions/ranking.test.ts 의 '활동 게이트' describe 에 있다.

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
