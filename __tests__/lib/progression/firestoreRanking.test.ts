// lib/progression/firestoreRanking — Firestore RankingProvider (순수·DI, Phase 3)
//
// 검증(행동): RankingStore(쿼리 원시연산) fake 를 주입해 firebase·네트워크 없이
// 결정적으로 테스트한다.
//  1) getLeaderboard: 상위 N 매핑 + rank 번호(1-based) + available:true.
//  2) getMyRanking: 순위(countAbove+1)·topPercent·±2 nearby 슬라이스.
//  3) seam 계약: 미로그인/엔트리 부재/잘못된 카테고리/store throw → throw 없이 available:false.
//  4) computeRankingStats: 이달 거리·활동일수·컬렉션·진척XP·평균 잔여수명(전기간 사용 km).
//  5) buildStoredEntry: 표시정보 보정(빈 닉네임→'러너') + updatedAt 주입(결정성).

import {
  createFirestoreRankingProvider,
  computeRankingStats,
  buildStoredEntry,
  RankingStore,
  StoredRankingEntry,
} from '../../../lib/progression/firestoreRanking';

function entry(uid: string, overrides: Partial<StoredRankingEntry> = {}): StoredRankingEntry {
  return {
    uid,
    nickname: `러너-${uid}`,
    rankTier: 'gold',
    rankColor: '#FFD700',
    equippedTitle: null,
    distance: 0,
    consistency: 0,
    shoeHealth: 0,
    collection: 0,
    progressPoints: 0,
    updatedAt: 1,
    ...overrides,
  };
}

/** 인메모리 fake store. 한 달(yearMonth)만 다룬다. */
function fakeStore(rows: StoredRankingEntry[]): RankingStore {
  const byUid = new Map(rows.map(r => [r.uid, r]));
  return {
    async topByCategory(category, _ym, limit) {
      return [...rows]
        .sort((a, b) => Number(b[category]) - Number(a[category]))
        .slice(0, limit);
    },
    async getEntry(uid) {
      return byUid.get(uid) ?? null;
    },
    async countAbove(category, _ym, score) {
      return rows.filter(r => Number(r[category]) > score).length;
    },
    async total() {
      return rows.length;
    },
    async publish() {
      /* no-op */
    },
  };
}

const YM = '2026-06';

describe('createFirestoreRankingProvider — getLeaderboard', () => {
  test('상위 정렬 + 1-based rank + available:true', async () => {
    const store = fakeStore([
      entry('a', {distance: 10}),
      entry('b', {distance: 30}),
      entry('c', {distance: 20}),
    ]);
    const p = createFirestoreRankingProvider(store, async () => 'a');
    const lb = await p.getLeaderboard('distance', YM);
    expect(lb.available).toBe(true);
    expect(lb.entries.map(e => e.uid)).toEqual(['b', 'c', 'a']);
    expect(lb.entries.map(e => e.rank)).toEqual([1, 2, 3]);
    expect(lb.entries[0].score).toBe(30);
  });

  test('잘못된 카테고리 → available:false, 빈 엔트리', async () => {
    const store = fakeStore([entry('a', {distance: 10})]);
    const p = createFirestoreRankingProvider(store, async () => 'a');
    const lb = await p.getLeaderboard('bogus', YM);
    expect(lb.available).toBe(false);
    expect(lb.entries).toEqual([]);
  });

  test('store 가 throw 해도 available:false 로 폴백(가짜 경쟁자 금지)', async () => {
    const store = fakeStore([]);
    store.topByCategory = async () => {
      throw new Error('firestore down');
    };
    const p = createFirestoreRankingProvider(store, async () => 'a');
    const lb = await p.getLeaderboard('distance', YM);
    expect(lb.available).toBe(false);
    expect(lb.entries).toEqual([]);
  });
});

describe('createFirestoreRankingProvider — getMyRanking', () => {
  test('순위·topPercent·nearby(±2 슬라이스)', async () => {
    // 점수 내림차순: e>d>c>b>a (me=c → rank 3)
    const rows = [
      entry('a', {distance: 10}),
      entry('b', {distance: 20}),
      entry('c', {distance: 30}),
      entry('d', {distance: 40}),
      entry('e', {distance: 50}),
    ];
    const p = createFirestoreRankingProvider(fakeStore(rows), async () => 'c');
    const mine = await p.getMyRanking('distance', YM);
    expect(mine.available).toBe(true);
    expect(mine.me?.uid).toBe('c');
    expect(mine.me?.rank).toBe(3);
    expect(mine.total).toBe(5);
    expect(mine.topPercent).toBe(60); // round(3/5*100)
    // idx(c)=2 → from=0 → slice(0,5) = e,d,c,b,a
    expect(mine.nearby.map(e => e.uid)).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(mine.nearby.map(e => e.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  test('미로그인(uid null) → available:false', async () => {
    const p = createFirestoreRankingProvider(fakeStore([entry('a')]), async () => null);
    const mine = await p.getMyRanking('distance', YM);
    expect(mine.available).toBe(false);
    expect(mine.me).toBeNull();
  });

  test('내 엔트리 부재 → available:false', async () => {
    const p = createFirestoreRankingProvider(fakeStore([entry('a')]), async () => 'zzz');
    const mine = await p.getMyRanking('distance', YM);
    expect(mine.available).toBe(false);
    expect(mine.me).toBeNull();
  });

  test('상위 100 밖이면 nearby=나만', async () => {
    const rows: StoredRankingEntry[] = [];
    for (let i = 0; i < 120; i++) rows.push(entry(`u${i}`, {distance: 1000 - i}));
    rows.push(entry('me', {distance: 1})); // 꼴찌권 → 상위100 밖
    const p = createFirestoreRankingProvider(fakeStore(rows), async () => 'me');
    const mine = await p.getMyRanking('distance', YM);
    expect(mine.available).toBe(true);
    expect(mine.nearby.map(e => e.uid)).toEqual(['me']);
    expect(mine.me?.rank).toBe(121); // countAbove(120) + 1
  });
});

describe('computeRankingStats', () => {
  test('이달 거리/활동일수/컬렉션/진척XP/평균잔여수명', () => {
    const runs = [
      {shoe_id: 's1', km: 5, run_date: '2026-06-01'},
      {shoe_id: 's1', km: 7, run_date: '2026-06-01'}, // 같은 날 → 활동일수 1
      {shoe_id: 's2', km: 3, run_date: '2026-06-05'},
      {shoe_id: 's1', km: 100, run_date: '2026-05-20'}, // 지난달 → 거리/일수 제외, 마모엔 포함
    ];
    const shoes = [
      {id: 's1', max_km: 600, start_km: 0},
      {id: 's2', max_km: 300, start_km: 0},
    ];
    const stats = computeRankingStats({runs, shoes, yearMonth: '2026-06', progressPoints: 250});
    expect(stats.distance).toBe(15); // 5+7+3 (이달)
    expect(stats.consistency).toBe(2); // 06-01, 06-05
    expect(stats.collection).toBe(2);
    expect(stats.progressPoints).toBe(250);
    // s1 used = 5+7+100=112 → 잔여 (1-112/600)*100=81.33; s2 used=3 → (1-3/300)*100=99
    // 평균 = (81.33+99)/2 = 90.166… → 90.2
    expect(stats.shoeHealth).toBe(90.2);
  });

  test('max_km 0/누락 신발은 마모 평균에서 제외; 데이터 없으면 0', () => {
    const stats = computeRankingStats({runs: [], shoes: [{id: 's1', max_km: 0}], yearMonth: '2026-06', progressPoints: 0});
    expect(stats).toEqual({distance: 0, consistency: 0, shoeHealth: 0, collection: 1, progressPoints: 0});
  });

  test('NaN/누락 입력 → 0 (throw 없음)', () => {
    const stats = computeRankingStats({
      runs: [{km: 'x' as any, run_date: '2026-06-02'}],
      shoes: [{} as any],
      yearMonth: '2026-06',
      progressPoints: NaN as any,
    });
    expect(stats.distance).toBe(0);
    expect(stats.consistency).toBe(1);
    expect(stats.progressPoints).toBe(0);
  });
});

describe('buildStoredEntry', () => {
  test('표시정보 보정 + updatedAt 주입', () => {
    const e = buildStoredEntry({
      uid: 'me',
      nickname: '   ' as any,
      rankTier: 'platinum',
      rankColor: '#14B8A6',
      stats: {distance: 12.3, consistency: 4, shoeHealth: 88, collection: 3, progressPoints: 500},
      updatedAt: 1718900000000,
    });
    // 빈 닉네임은 buildStoredEntry 에선 그대로(공백)지만 falsy 가 아니므로 유지 — toEntry 가
    // 표시 시 '러너'로 폴백. 여기선 점수/메타 보존만 단언.
    expect(e.uid).toBe('me');
    expect(e.rankTier).toBe('platinum');
    expect(e.equippedTitle).toBeNull();
    expect(e.distance).toBe(12.3);
    expect(e.progressPoints).toBe(500);
    expect(e.updatedAt).toBe(1718900000000);
  });

  test('빈 닉네임 → 러너 폴백', () => {
    const e = buildStoredEntry({
      uid: 'me',
      nickname: '',
      rankTier: 'bronze',
      rankColor: '#CD7F32',
      stats: {distance: 0, consistency: 0, shoeHealth: 0, collection: 0, progressPoints: 0},
      updatedAt: 1,
    });
    expect(e.nickname).toBe('러너');
  });
});
