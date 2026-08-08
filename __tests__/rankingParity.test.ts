// rankingParity.test.ts — **앱과 서버가 같은 데이터에서 같은 점수를 낸다.**
//
// 리더보드 점수는 이제 서버(`functions/ranking.js`)가 계산해서 쓴다. 그런데 앱에도
// 같은 계산이 남아 있다(`lib/progression/firestoreRanking.computeRankingStats` — 화면이
// 내 점수를 미리 보여주고, 오프라인에서도 로컬 리더보드를 만든다).
//
// **같은 규칙이 두 벌 있으면 반드시 갈라진다.** 갈라지면 사용자는 앱에서 본 숫자와
// 순위표의 숫자가 다른 것을 보게 되고, 그건 Truth only 위반이면서 동시에 "우리 계산이
// 틀렸다"는 신고로 돌아온다. 그래서 **같은 입력을 두 구현에 통과시켜 대조**한다.
//
// 이 파일이 빨개졌다면 한쪽만 고친 것이다 — 둘 다 고쳐야 한다.
import {computeRankingStats} from '../lib/progression/firestoreRanking';

const server = require('../functions/ranking.js') as {
  monthStats: (runs: unknown[], ym: string) => {distance: number; consistency: number};
  validYearMonth: (ym: unknown) => boolean;
  CAPS: Record<string, number>;
};

const YM = '2026-08';

type R = {id: string; run_date: string; km: number; shoe_id?: string; deleted?: boolean};

/** 두 구현에 같은 입력을 넣고 distance·consistency 를 맞춰 본다. */
function bothAgree(runs: R[], ym = YM) {
  const app = computeRankingStats({runs: runs as never, shoes: [], yearMonth: ym, progressPoints: 0});
  const srv = server.monthStats(runs, ym);
  expect({distance: srv.distance, consistency: srv.consistency}).toEqual({
    distance: app.distance,
    consistency: app.consistency,
  });
  return srv;
}

describe('앱 ↔ 서버 점수 일치', () => {
  it('기본 — 그달 러닝의 거리 합과 활동 일수', () => {
    const got = bothAgree([
      {id: '1', run_date: '2026-08-01', km: 5},
      {id: '2', run_date: '2026-08-03', km: 10.4},
      {id: '3', run_date: '2026-08-03', km: 3.6}, // 같은 날 두 번 = 하루
    ]);
    expect(got).toEqual({distance: 19, consistency: 2});
  });

  it('다른 달은 세지 않는다', () => {
    const got = bothAgree([
      {id: '1', run_date: '2026-07-31', km: 42},
      {id: '2', run_date: '2026-08-01', km: 5},
      {id: '3', run_date: '2026-09-01', km: 42},
    ]);
    expect(got).toEqual({distance: 5, consistency: 1});
  });

  it('시간 접미사가 붙어도 하루는 하루다', () => {
    // 예전 사고: run_date 에 시간이 실리면 같은 날이 이틀로 셈돼 꾸준함이 부풀었다.
    const got = bothAgree([
      {id: '1', run_date: '2026-08-05T06:00:00Z', km: 5},
      {id: '2', run_date: '2026-08-05T19:30:00Z', km: 5},
    ]);
    expect(got.consistency).toBe(1);
  });

  it('묘비(삭제된 러닝)는 세지 않는다', () => {
    const got = bothAgree([
      {id: '1', run_date: '2026-08-01', km: 5},
      {id: '2', run_date: '2026-08-02', km: 100, deleted: true},
    ]);
    expect(got).toEqual({distance: 5, consistency: 1});
  });

  it('빈 목록', () => {
    expect(bothAgree([])).toEqual({distance: 0, consistency: 0});
  });

  it('소수 반올림 규칙이 같다(0.1km 단위)', () => {
    const got = bothAgree([
      {id: '1', run_date: '2026-08-01', km: 3.333},
      {id: '2', run_date: '2026-08-02', km: 3.333},
      {id: '3', run_date: '2026-08-03', km: 3.334},
    ]);
    expect(got.distance).toBe(10);
  });

  it('이상한 값(문자열·NaN·음수)에도 던지지 않고 같은 답', () => {
    bothAgree([
      {id: '1', run_date: '2026-08-01', km: NaN},
      {id: '2', run_date: '2026-08-02', km: 'abc' as unknown as number},
      {id: '3', run_date: '', km: 5},
      null as any,
    ]);
  });
});

describe('서버 입력 검증', () => {
  it('yearMonth 형태를 강제한다', () => {
    for (const ok of ['2026-01', '2026-12', '1999-08']) expect(server.validYearMonth(ok)).toBe(true);
    for (const bad of ['2026-13', '2026-00', '2026-8', '26-08', '', null, undefined, 42, '2026-08-01'])
      expect(server.validYearMonth(bad)).toBe(false);
  });

  // 예전엔 여기서 "서버 CAPS == firestore.rules 상한"을 대조했다. 규칙에서 상한을
  // 걷어내면서(호출부가 사라져 죽은 코드가 됐다) 그 대조는 성립하지 않는다.
  // 대신 **더 중요한 것**을 고정한다: 클라이언트 쓰기가 닫혀 있는가.
  // 이 줄이 다시 열리면 서버 재계산이 통째로 무의미해진다 — 앱이 서버를 거치지 않고
  // 직접 쓰면 그만이기 때문이다. 에뮬레이터 없이도 걸리게 소스에서 본다.
  it('firestore.rules 가 리더보드 클라이언트 쓰기를 닫아 두고 있다', () => {
    const rules = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'firestore.rules'),
      'utf8',
    ) as string;
    const block = /match \/leaderboards\/\{yearMonth\}\/entries\/\{uid\} \{[\s\S]*?\n {4}\}/.exec(rules);
    expect(block).not.toBeNull();
    const body = block![0];
    expect(body).toMatch(/allow create, update: if false;/);
    // 읽기와 본인 삭제는 살아 있어야 한다 — 삭제가 막히면 파기 요건이 깨진다.
    expect(body).toMatch(/allow read: if signedIn\(\);/);
    expect(body).toMatch(/allow delete: if signedIn\(\) && request\.auth\.uid == uid;/);
  });

  // 상한은 **근거가 있어야 한다.** 10,000 이던 시절엔 실제 최대(≈6,310)보다 58% 높아서,
  // 아무도 평생 못 미치는 값을 쓸 수 있었다(2026-08-08). 지금은 실제 최대 위에 최소한의
  // 여유만 둔다 — 여유가 0 이면 정직하게 달성한 사람의 점수를 조용히 깎게 되고(clamp 는
  // 거부가 아니다), 여유가 크면 그만큼이 조작 가능 폭이 된다.
  it('진척 포인트 상한이 실제 획득 가능 최대(≈6,310) 바로 위에 있다', () => {
    const MAX_ACHIEVABLE = 6310; // lib/progression/rank.ts 헤더의 산출값
    expect(server.CAPS.progressPoints).toBeGreaterThan(MAX_ACHIEVABLE);
    expect(server.CAPS.progressPoints).toBeLessThanOrEqual(Math.round(MAX_ACHIEVABLE * 1.2));
  });

  it('상한은 서버에 있고, 다섯 축 전부 값이 잡혀 있다', () => {
    expect(Object.keys(server.CAPS).sort()).toEqual(
      ['collection', 'consistency', 'distance', 'progressPoints', 'shoeHealth'].sort(),
    );
    for (const [field, cap] of Object.entries(server.CAPS)) {
      expect({field, ok: typeof cap === 'number' && cap > 0}).toEqual({field, ok: true});
    }
  });
});
