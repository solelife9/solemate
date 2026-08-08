// functions/ranking — 리더보드 점수를 **서버가 다시 계산한다.**
//
// 여기가 지키는 것:
//  1) 점수는 **그 사용자의 실제 기록**에서 나온다. 앱이 보낸 distance/consistency 는
//     쳐다보지도 않는다 — 그게 이 변경의 전부다.
//  2) 이번 달에 달리지 않았으면 명단에서 **내린다**(안 올리는 것만으로는 지난달 줄이 남는다).
//  3) 상한을 넘는 값은 조인다. 음수는 정렬을 뒤집는 장난이라 반드시 막는다.
//  4) uid 는 **토큰에서만** 온다. 본문의 uid 를 믿으면 남의 이름으로 발행할 수 있다.
//
// Firestore 는 이 파일 안에서 최소 페이크로 대체한다(에뮬레이터 불필요) — 검증 대상이
// Firestore 동작이 아니라 **우리 규칙**이기 때문이다.

const {publishRanking, monthStats, CAPS} = require('../../functions/ranking.js');

type Doc = Record<string, unknown>;

/** where/get 만 지원하는 최소 firestore 페이크. 쿼리 조건은 무시하고 전부 돌려준다 —
 *  서버 코드가 월 판정을 **다시** 하므로 그래도 결과가 같아야 한다(그 자체가 검증이다). */
function fakeDb(seed: {runs?: Doc[]; shoes?: Doc[]}) {
  const written: Record<string, Doc | null> = {};
  const col = (docs: Doc[]) => ({
    where: () => col(docs),
    get: async () => ({docs: docs.map((d) => ({data: () => d}))}),
  });
  return {
    written,
    collection(name: string) {
      if (name === 'leaderboards') {
        return {
          doc: (ym: string) => ({
            collection: () => ({
              doc: (uid: string) => ({
                set: async (v: Doc) => {
                  written[`${ym}/${uid}`] = v;
                },
                delete: async () => {
                  written[`${ym}/${uid}`] = null;
                },
              }),
            }),
          }),
        };
      }
      // userBackups
      return {
        doc: () => ({
          collection: (sub: string) => col(sub === 'runs' ? seed.runs || [] : seed.shoes || []),
        }),
      };
    },
  };
}

const YM = '2026-08';
const body = (over: Doc = {}) => ({
  yearMonth: YM,
  nickname: '나',
  rankTier: 'gold',
  rankColor: '#FFD700',
  progressPoints: 300,
  shoeHealth: 55,
  ...over,
});

describe('점수는 사용자의 기록에서 나온다', () => {
  it('앱이 보낸 거리는 무시하고 기록으로 다시 계산한다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-01', km: 5}, {run_date: '2026-08-02', km: 7}]});
    // 앱이 999km 를 우겨도 소용없다 — 애초에 이 필드를 읽지 않는다.
    const r = await publishRanking(db, 'u1', body({distance: 999, consistency: 31}));
    expect(r.published).toBe(true);
    expect(db.written[`${YM}/u1`]).toMatchObject({distance: 12, consistency: 2});
  });

  it('묘비(삭제된 러닝)는 세지 않는다', async () => {
    const db = fakeDb({
      runs: [{run_date: '2026-08-01', km: 5}, {run_date: '2026-08-02', km: 100, deleted: true}],
    });
    await publishRanking(db, 'u1', body());
    expect(db.written[`${YM}/u1`]).toMatchObject({distance: 5, consistency: 1});
  });

  it('다른 달 러닝이 섞여 들어와도 그달만 센다 — 쿼리가 아니라 코드가 판정한다', async () => {
    // 페이크는 where 를 무시하고 전부 돌려준다. 그래도 결과가 맞아야 한다.
    const db = fakeDb({
      runs: [
        {run_date: '2026-07-31', km: 42},
        {run_date: '2026-08-10', km: 8},
        {run_date: '2026-09-01', km: 42},
      ],
    });
    await publishRanking(db, 'u1', body());
    expect(db.written[`${YM}/u1`]).toMatchObject({distance: 8, consistency: 1});
  });

  it('신발 수는 살아있는 것만 센다', async () => {
    const db = fakeDb({
      runs: [{run_date: '2026-08-01', km: 5}],
      shoes: [{id: 'a'}, {id: 'b'}, {id: 'c', deleted: true}],
    });
    await publishRanking(db, 'u1', body());
    expect(db.written[`${YM}/u1`]).toMatchObject({collection: 2});
  });

  it('uid 는 인자로 받은 것(=토큰)만 쓴다 — 본문의 uid 는 무시', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-01', km: 5}]});
    await publishRanking(db, 'u1', body({uid: 'victim'}));
    expect(db.written['2026-08/victim']).toBeUndefined();
    expect(db.written[`${YM}/u1`]).toMatchObject({uid: 'u1'});
  });
});

describe('활동 게이트 — 이번 달에 달리지 않았으면 내린다', () => {
  it('그달 러닝이 없으면 엔트리를 지운다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-07-02', km: 10}]}); // 지난달
    const r = await publishRanking(db, 'idle', body({progressPoints: 6000}));
    expect(r.published).toBe(false);
    expect(db.written[`${YM}/idle`]).toBeNull(); // 안 올린 게 아니라 **지웠다**
  });

  it('거리는 0 이어도 활동일이 있으면 올린다 — 아주 짧은 러닝도 달린 것이다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-03', km: 0}]});
    const r = await publishRanking(db, 'tiny', body());
    expect(r.published).toBe(true);
    expect(db.written[`${YM}/tiny`]).toMatchObject({distance: 0, consistency: 1});
  });
});

describe('상한과 방어', () => {
  it('앱이 보낸 progressPoints·shoeHealth 를 상한으로 조인다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-01', km: 5}]});
    await publishRanking(db, 'u1', body({progressPoints: 9e9, shoeHealth: 900}));
    expect(db.written[`${YM}/u1`]).toMatchObject({
      progressPoints: CAPS.progressPoints,
      shoeHealth: CAPS.shoeHealth,
    });
  });

  it('음수는 0 으로 — 정렬을 뒤집는 장난을 막는다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-01', km: 5}]});
    await publishRanking(db, 'u1', body({progressPoints: -1, shoeHealth: -50}));
    expect(db.written[`${YM}/u1`]).toMatchObject({progressPoints: 0, shoeHealth: 0});
  });

  it('닉네임 길이를 자른다 — 긴 문자열은 남의 화면까지 늘어뜨린다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-01', km: 5}]});
    await publishRanking(db, 'u1', body({nickname: '가'.repeat(200)}));
    expect(String((db.written[`${YM}/u1`] as Doc).nickname)).toHaveLength(40);
  });

  it('신발 요약은 3켤레까지, 형태가 아닌 것은 버린다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-01', km: 5}]});
    await publishRanking(
      db,
      'u1',
      body({
        shoes_summary: [
          {brand: 'Nike', model: 'Pegasus 41', usedKm: 320},
          {brand: 'Asics', model: 'Novablast 5', usedKm: 110},
          {brand: 'Hoka', model: 'Clifton 10', usedKm: 40},
          {brand: 'On', model: 'Cloudmonster', usedKm: 10},
          {brand: 123, model: null},
        ],
      }),
    );
    expect((db.written[`${YM}/u1`] as {shoes: unknown[]}).shoes).toHaveLength(3);
  });

  it('잘못된 yearMonth 는 아무것도 쓰지 않는다', async () => {
    const db = fakeDb({runs: [{run_date: '2026-08-01', km: 5}]});
    for (const bad of ['2026-13', '26-08', '', null]) {
      const r = await publishRanking(db, 'u1', body({yearMonth: bad}));
      expect(r.ok).toBe(false);
    }
    expect(Object.keys(db.written)).toHaveLength(0);
  });
});

describe('monthStats — 순수 규칙', () => {
  it('빈 입력·이상한 입력에도 던지지 않는다', () => {
    expect(monthStats(null, YM)).toEqual({distance: 0, consistency: 0});
    expect(monthStats([null, undefined, {}, {run_date: 5}], YM)).toEqual({distance: 0, consistency: 0});
  });
});
