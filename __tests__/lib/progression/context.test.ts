// lib/progression/context — buildContext 집계.
//
// 관찰 가능한 동작: 시드된 런/신발에서 누적거리·런 수·시간·신발별 통계·스트릭·시간대
// 버킷·최장 런·페이스·공백·주간 활성도를 정확히 파생하고, 빈/비정상 입력에서 NaN/throw
// 없이 0(또는 null)으로 방어한다. PURE — 입력을 변형하지 않는다.

import {buildContext} from '../../../lib/progression/context';
import {EarnedTitle} from '../../../lib/progression/types';

// 결정적 기준 시각(2026-06-12 로컬 자정).
const NOW = new Date(2026, 5, 12).getTime();

const runs: BackendRun[] = [
  {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-06-01', duration: 1500, run_time: '06:30'},
  {id: 'r2', shoe_id: 's1', km: 10, run_date: '2026-06-02', duration: 2400, run_time: '04:30'}, // 새벽(05시 이전)
  {id: 'r3', shoe_id: 's1', km: 8, run_date: '2026-06-03', duration: 2400, run_time: '22:30'}, // 야간(22시 이후)
  {id: 'r4', shoe_id: 's2', km: 12, run_date: '2026-06-09', duration: 3600, run_time: '23:10'}, // 야간 + 공백 후 복귀
];

const shoes: BackendShoe[] = [
  {id: 's1', name: 'Pegasus 40', max_km: 600, retired: false},
  {id: 's2', name: 'Vaporfly 3', max_km: 500, retired: true},
  {id: 's3', name: 'Boston 12', max_km: 400, retired: false}, // 런 0인 신발
];

const earned: EarnedTitle[] = [
  {key: 'running_100k', unlockedAt: '', isEquipped: true},
  {key: 'rotation_3', unlockedAt: '', isEquipped: false},
];

const challenges = [{completed: true}, {completed: false}, {completed: true}];

describe('buildContext aggregation', () => {
  const ctx = buildContext(runs, shoes, earned, challenges, NOW);

  test('누적 거리·런 수·총 시간', () => {
    expect(ctx.cumulativeKm).toBeCloseTo(35, 5);
    expect(ctx.runCount).toBe(4);
    expect(ctx.totalDurationS).toBe(1500 + 2400 + 2400 + 3600);
  });

  test('신발별 통계: km/runs/firstWorn/lastWorn/retired', () => {
    expect(ctx.perShoe.s1).toMatchObject({
      km: 23,
      runs: 3,
      firstWorn: '2026-06-01',
      lastWorn: '2026-06-03',
      retired: false,
      maxKm: 600,
    });
    expect(ctx.perShoe.s2).toMatchObject({
      km: 12,
      runs: 1,
      firstWorn: '2026-06-09',
      lastWorn: '2026-06-09',
      retired: true,
    });
    // 런 0인 신발도 시드되어 등록 사실을 보존(km/runs 0).
    expect(ctx.perShoe.s3).toMatchObject({km: 0, runs: 0, firstWorn: null, retired: false});
  });

  test('등록/은퇴 신발 수', () => {
    expect(ctx.registeredShoeCount).toBe(3);
    expect(ctx.retiredShoeCount).toBe(1);
  });

  test('시간대 버킷: Early(<05:00) / Night(>=22:00)', () => {
    expect(ctx.earlyRunCount).toBe(1); // 04:30
    expect(ctx.nightRunCount).toBe(2); // 22:30, 23:10
  });

  test('스트릭: 최장 3일(6/1~6/3), 현재 1(마지막 6/9 단독)', () => {
    expect(ctx.longestStreak).toBe(3);
    expect(ctx.currentStreak).toBe(1);
  });

  test('최장 공백(Comeback 판정용): 6/3→6/9 = 6일', () => {
    expect(ctx.longestGapDays).toBe(6);
  });

  test('최장 런 / 최고·평균 페이스(lib/records 재사용)', () => {
    expect(ctx.longestRunKm).toBe(12);
    expect(ctx.bestPaceSec).toBe(240); // 10km/2400s
    expect(ctx.avgPaceSec).toBeCloseTo((1500 + 2400 + 2400 + 3600) / 35, 5);
  });

  test('5km+ 최고 페이스(Speedster용): 모든 런 ≥5km → 최속 10km@2400s=240', () => {
    expect(ctx.bestPace5kSec).toBe(240);
  });

  test('주간 활성도 비율(0..1)', () => {
    // 첫 런 6/1 ~ now 6/12: 2주 span, 활성 주 2개(6/1주 + 6/9주) → 1.0
    expect(ctx.weeklyActiveRatio).toBeCloseTo(1, 5);
  });

  test('타이틀/챌린지 참여 사실', () => {
    expect(ctx.earnedTitleKeys).toEqual(['running_100k', 'rotation_3']);
    expect(ctx.earnedTitleCount).toBe(2);
    expect(ctx.completedChallengeCount).toBe(2);
  });

  test('PURE: 입력 배열/객체를 변형하지 않는다', () => {
    const runsCopy = JSON.parse(JSON.stringify(runs));
    const shoesCopy = JSON.parse(JSON.stringify(shoes));
    buildContext(runs, shoes, earned, challenges, NOW);
    expect(runs).toEqual(runsCopy);
    expect(shoes).toEqual(shoesCopy);
  });
});

describe('buildContext server total_km truth', () => {
  test('서버 total_km 가 있으면 런 합산 대신 그것을 우선', () => {
    const ctx = buildContext(
      [{id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-06-01', duration: 1500}],
      [{id: 's1', name: 'A', max_km: 600, total_km: 480}],
      [],
      [],
      NOW,
    );
    expect(ctx.perShoe.s1.km).toBe(480); // 런 합산 5 가 아니라 서버 truth 480
    expect(ctx.perShoe.s1.runs).toBe(1);
  });
});

describe('buildContext edge/defensive', () => {
  test('빈 입력 → 모든 집계 0/null, perShoe {} , throw 없음', () => {
    const ctx = buildContext([], [], [], [], NOW);
    expect(ctx.cumulativeKm).toBe(0);
    expect(ctx.runCount).toBe(0);
    expect(ctx.totalDurationS).toBe(0);
    expect(ctx.longestRunKm).toBe(0);
    expect(ctx.bestPaceSec).toBeNull();
    expect(ctx.bestPace5kSec).toBeNull();
    expect(ctx.avgPaceSec).toBeNull();
    expect(ctx.currentStreak).toBe(0);
    expect(ctx.longestStreak).toBe(0);
    expect(ctx.longestGapDays).toBe(0);
    expect(ctx.weeklyActiveRatio).toBe(0);
    expect(ctx.perShoe).toEqual({});
    expect(ctx.registeredShoeCount).toBe(0);
  });

  test('5km+ 페이스의 거리 바닥: <5km 빠른 질주는 무시, ≥5km 런만 집계', () => {
    // 3km를 매우 빠르게(210s/km) + 6km를 280s/km. 거리 바닥 5km → 6km 런만 후보.
    const r: BackendRun[] = [
      {id: 'a', shoe_id: 's1', km: 3, run_date: '2026-06-01', duration: 630}, // 210s/km, 그러나 <5km
      {id: 'b', shoe_id: 's1', km: 6, run_date: '2026-06-02', duration: 1680}, // 280s/km, ≥5km
    ];
    const ctx = buildContext(r, [], [], [], NOW);
    expect(ctx.bestPaceSec).toBe(210); // 1km 바닥 기준은 3km 질주가 최속
    expect(ctx.bestPace5kSec).toBe(280); // 5km 바닥 기준은 6km 런만
  });

  test('5km+ 런이 하나도 없으면 bestPace5kSec=null', () => {
    const r: BackendRun[] = [
      {id: 'a', shoe_id: 's1', km: 4.9, run_date: '2026-06-01', duration: 1200},
    ];
    const ctx = buildContext(r, [], [], [], NOW);
    expect(ctx.bestPace5kSec).toBeNull();
  });

  test('null/undefined 입력도 안전(빈 컨텍스트)', () => {
    const ctx = buildContext(
      undefined as unknown as BackendRun[],
      null as unknown as BackendShoe[],
      undefined,
      undefined,
      NOW,
    );
    expect(ctx.runCount).toBe(0);
    expect(ctx.cumulativeKm).toBe(0);
  });

  test('NaN/음수/누락 필드는 0 으로 방어(누적에 미오염)', () => {
    const ctx = buildContext(
      [
        {id: 'r1', shoe_id: 's1', km: 'abc' as unknown as string, run_date: '2026-06-01', duration: -100},
        {id: 'r2', shoe_id: 's1', km: 10, run_date: 'bad-date', duration: 2400},
        {id: 'r3', shoe_id: 's1', km: NaN as unknown as number, run_date: '2026-06-02', duration: 1200},
      ],
      [{id: 's1', name: 'A', max_km: NaN as unknown as number}],
      [],
      [],
      NOW,
    );
    expect(ctx.cumulativeKm).toBe(10); // 'abc'·NaN → 0, 10 만 합산
    expect(Number.isFinite(ctx.cumulativeKm)).toBe(true);
    expect(ctx.perShoe.s1.maxKm).toBe(0); // NaN max_km → 0
    // 잘못된 run_date 는 스트릭/공백에서 제외(throw 없이).
    expect(ctx.longestStreak).toBeGreaterThanOrEqual(0);
  });

  test('now 가 비유한이면 0 으로 대체(throw 없음)', () => {
    const ctx = buildContext(runs, shoes, earned, challenges, NaN);
    expect(ctx.now).toBe(0);
    expect(Number.isFinite(ctx.weeklyActiveRatio)).toBe(true);
  });
});
