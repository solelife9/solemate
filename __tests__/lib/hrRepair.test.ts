// lib/hrRepair — 지난 러닝의 심박 소급 복구.
//
// 배경: 민우님 폰 실측에서 **36건 중 심박이 있는 건 1건**이었다. 애플 건강 연동이
// 꺼져 있던 동안 달린 기록이라 앱이 HealthKit 을 읽을 수 없었다. 기존 백필
// (lib/hrBackfill)은 12시간 안의 런만 대상이라, 뒤늦게 연동을 켠 사용자의 과거 기록은
// 대기열에 등록된 적조차 없어 영영 비어 있다. 이 모듈이 그 구멍을 메운다.

import {
  pickRepairCandidates,
  repairHeartRates,
  type RepairCandidate,
  type HrRepairPort,
  REPAIR_WINDOW_DAYS,
} from '../../lib/hrRepair';

const TODAY = '2026-08-04';
const run = (over: Partial<RepairCandidate> = {}): RepairCandidate => ({
  id: 'r1',
  runDate: '2026-08-01',
  durationS: 1800,
  heartRate: 0,
  ...over,
});

describe('pickRepairCandidates — 무엇을 고치려 드는가', () => {
  test('심박이 없는 런만 고른다 — 있는 값은 건드리지 않는다', () => {
    const picked = pickRepairCandidates(
      [run({id: 'a', heartRate: 0}), run({id: 'b', heartRate: 154}), run({id: 'c'})],
      TODAY,
    );
    expect(picked.map(r => r.id)).toEqual(['a', 'c']);
  });

  test('날짜를 모르면 고르지 않는다 — HealthKit 에서 찾을 방법이 없다', () => {
    expect(pickRepairCandidates([run({runDate: ''}), run({runDate: '2026-8-1'})], TODAY)).toEqual([]);
  });

  test('1분 미만은 고르지 않는다 — 워크아웃 매칭이 무의미하다', () => {
    expect(pickRepairCandidates([run({durationS: 30})], TODAY)).toEqual([]);
  });

  test('창 밖(오래된) 런은 고르지 않는다', () => {
    const old = run({id: 'old', runDate: '2025-01-01'});
    expect(pickRepairCandidates([old], TODAY, {windowDays: REPAIR_WINDOW_DAYS})).toEqual([]);
  });

  test('최신순으로 준다 — 최근일수록 HealthKit 에 남아 있고 체력 추정에도 먼저 쓰인다', () => {
    const picked = pickRepairCandidates(
      [run({id: 'old', runDate: '2026-06-01'}), run({id: 'new', runDate: '2026-08-02'})],
      TODAY,
    );
    expect(picked.map(r => r.id)).toEqual(['new', 'old']);
  });

  test('상한을 넘지 않는다 — HealthKit 을 무한정 훑지 않는다', () => {
    const many = Array.from({length: 100}, (_, i) => run({id: `r${i}`}));
    expect(pickRepairCandidates(many, TODAY, {max: 10})).toHaveLength(10);
  });
});

describe('repairHeartRates — 없는 값을 지어내지 않는다', () => {
  const port = (over: Partial<HrRepairPort> = {}): HrRepairPort => ({
    findWindow: jest.fn(async () => ({startMs: 1000, endMs: 2000})),
    backfill: jest.fn(async () => 42),
    ...over,
  });

  test('워크아웃을 찾고 심박을 채우면 복구로 센다', async () => {
    const p = port();
    const res = await repairHeartRates(p, [run({id: 'a'}), run({id: 'b'})]);
    expect(res).toEqual({repaired: 2, attempted: 2});
  });

  test('워크아웃을 못 찾으면 건너뛴다 — 시간창을 추측하지 않는다', async () => {
    const backfill = jest.fn(async () => 42);
    const p = port({findWindow: jest.fn(async () => null), backfill});
    const res = await repairHeartRates(p, [run()]);
    expect(backfill).not.toHaveBeenCalled(); // 창이 없으면 조회 자체를 안 한다
    expect(res).toEqual({repaired: 0, attempted: 1});
  });

  test('그 시간대에 심박이 없으면 복구로 세지 않는다', async () => {
    const p = port({backfill: jest.fn(async () => 0)});
    const res = await repairHeartRates(p, [run()]);
    expect(res).toEqual({repaired: 0, attempted: 1});
  });

  test('한 건이 throw 해도 나머지는 계속한다', async () => {
    let n = 0;
    const p = port({
      findWindow: jest.fn(async () => {
        n += 1;
        if (n === 1) throw new Error('healthkit down');
        return {startMs: 1000, endMs: 2000};
      }),
    });
    const res = await repairHeartRates(p, [run({id: 'a'}), run({id: 'b'})]);
    expect(res).toEqual({repaired: 1, attempted: 2});
  });

  test('빈 목록은 조용히 0', async () => {
    expect(await repairHeartRates(port(), [])).toEqual({repaired: 0, attempted: 0});
  });
});
