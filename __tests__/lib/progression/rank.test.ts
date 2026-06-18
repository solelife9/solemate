// lib/progression/rank — XP 기반 7단계 랭크 엔진(재설계).
//
// 관찰 가능한 동작:
//   · 랭크 = 총 획득 XP(ctx.achievementPoints, 업적 합산). 계단식 7단계 티어.
//   · 티어 XP 하한: bronze 0 / silver 100 / gold 300 / platinum 700 /
//     diamond 1,500 / master 3,000 / legend 5,000.
//   · 경계 XP → 정확한 티어 + 색(theme.TIER_COLORS).
//   · 빈 컨텍스트 → Bronze, xp 0.
//   · 신규(3.5km/1run/새 신발) → Bronze, 낮은 XP(공짜 점수 없음).
//   · XP 가 늘수록 종합 점수 단조 증가.
//   · NaN/음수/누락 → 유한 XP(≥0), throw 없음.
//   · score = xp(backward-compat alias).
//
// ctx 만 읽는 순수 함수(AsyncStorage 미사용).

import {TIER_COLORS} from '../../../theme';
import {buildContext} from '../../../lib/progression/context';
import {
  colorForTier,
  computeRank,
  tierForXp,
  RANK_XP,
} from '../../../lib/progression/rank';
import {
  PerShoeStats,
  ProgressionContext,
  RankTier,
} from '../../../lib/progression/types';

function emptyCtx(over: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    now: 0,
    cumulativeKm: 0,
    runCount: 0,
    totalDurationS: 0,
    longestRunKm: 0,
    bestPaceSec: null,
    avgPaceSec: null,
    currentStreak: 0,
    longestStreak: 0,
    weeklyActiveRatio: 0,
    earlyRunCount: 0,
    nightRunCount: 0,
    longestGapDays: 0,
    registeredShoeCount: 0,
    retiredShoeCount: 0,
    perShoe: {},
    earnedTitleKeys: [],
    earnedTitleCount: 0,
    completedChallengeCount: 0,
    achievementPoints: 0,
    ...over,
  };
}

function shoe(over: Partial<PerShoeStats> & {id: string}): PerShoeStats {
  return {
    id: over.id,
    name: over.name ?? over.id,
    km: over.km ?? 0,
    runs: over.runs ?? 0,
    firstWorn: over.firstWorn ?? null,
    lastWorn: over.lastWorn ?? null,
    retired: over.retired ?? false,
    maxKm: over.maxKm ?? 0,
  };
}

// ── 1) 티어 XP 하한 노출 ────────────────────────────────────────────────────────
describe('RANK_XP: 7단계 티어 XP 하한', () => {
  test('계단식 하한 = 0/100/300/700/1500/3000/5000', () => {
    expect(RANK_XP).toEqual({
      bronze: 0,
      silver: 100,
      gold: 300,
      platinum: 700,
      diamond: 1500,
      master: 3000,
      legend: 5000,
    });
  });

  test('하한이 단조 증가(엄격)', () => {
    const order: RankTier[] = [
      'bronze',
      'silver',
      'gold',
      'platinum',
      'diamond',
      'master',
      'legend',
    ];
    for (let i = 1; i < order.length; i++) {
      expect(RANK_XP[order[i]]).toBeGreaterThan(RANK_XP[order[i - 1]]);
    }
  });
});

// ── 2) 경계 XP → 티어 + 색 ──────────────────────────────────────────────────────
describe('tierForXp: 경계 XP → 티어 + 색', () => {
  // 각 티어 직전(하한-1)은 이전 티어, 하한 정각은 새 티어.
  const cases: Array<[number, RankTier]> = [
    [0, 'bronze'],
    [99, 'bronze'],
    [100, 'silver'],
    [299, 'silver'],
    [300, 'gold'],
    [699, 'gold'],
    [700, 'platinum'],
    [1499, 'platinum'],
    [1500, 'diamond'],
    [2999, 'diamond'],
    [3000, 'master'],
    [4999, 'master'],
    [5000, 'legend'],
    [99999, 'legend'],
  ];
  test.each(cases)('xp %d → %s', (xp, tier) => {
    expect(tierForXp(xp)).toBe(tier);
    expect(colorForTier(tierForXp(xp))).toBe(TIER_COLORS[tier]);
  });

  test('0·음수·NaN → Bronze', () => {
    expect(tierForXp(0)).toBe('bronze');
    expect(tierForXp(-50)).toBe('bronze');
    expect(tierForXp(NaN)).toBe('bronze');
  });
});

// ── 3) computeRank: 결과 형태 + 다음 티어/진행도 ─────────────────────────────────
describe('computeRank: XP → 랭크 결과', () => {
  test('티어 하한 정각 → progressPercent 0, 다음 티어/필요 XP 정확', () => {
    const r = computeRank(emptyCtx({achievementPoints: 100})); // silver 하한
    expect(r.xp).toBe(100);
    expect(r.tier).toBe('silver');
    expect(r.color).toBe(TIER_COLORS.silver);
    expect(r.nextTier).toBe('gold');
    expect(r.xpForNext).toBe(200); // 300 - 100
    expect(r.progressPercent).toBe(0);
    expect(r.score).toBe(r.xp); // backward-compat alias
  });

  test('티어 중간 → progressPercent 비례', () => {
    // silver(100)~gold(300) 구간 절반 = 200
    const r = computeRank(emptyCtx({achievementPoints: 200}));
    expect(r.tier).toBe('silver');
    expect(r.progressPercent).toBe(50);
    expect(r.xpForNext).toBe(100);
  });

  test('legend(최고 티어) → nextTier null, xpForNext 0, progress 100', () => {
    const r = computeRank(emptyCtx({achievementPoints: 5000}));
    expect(r.tier).toBe('legend');
    expect(r.color).toBe(TIER_COLORS.legend);
    expect(r.nextTier).toBeNull();
    expect(r.xpForNext).toBe(0);
    expect(r.progressPercent).toBe(100);
  });
});

// ── 4) 빈 컨텍스트 ──────────────────────────────────────────────────────────────
describe('빈 컨텍스트', () => {
  test('모든 사실 0 → xp 0, Bronze, throw 없음', () => {
    const r = computeRank(emptyCtx());
    expect(r.xp).toBe(0);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('bronze');
    expect(r.color).toBe(TIER_COLORS.bronze);
    expect(r.nextTier).toBe('silver');
  });

  test('null/비정상 입력 → Bronze 0, throw 없음', () => {
    // @ts-expect-error 의도적 비정상 입력
    const r = computeRank(null);
    expect(r.xp).toBe(0);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('bronze');
  });

  test('buildContext(빈 입력)도 Bronze 0', () => {
    const r = computeRank(buildContext([], [], [], [], 0));
    expect(r.xp).toBe(0);
    expect(r.tier).toBe('bronze');
  });
});

// ── 5) 신규 사용자는 공짜 점수를 받지 않는다 ────────────────────────────────────
describe('신규 사용자는 공짜 점수를 받지 않는다', () => {
  test('3.5km · 1런 · 새 신발 1켤레 → Bronze, 낮은 XP', () => {
    const ctx = buildContext(
      [{id: 'r', shoe_id: 's', km: 3.5, run_date: '2026-06-01', duration: 1200, run_time: '07:00'}] as BackendRun[],
      [{id: 's', name: 'S', max_km: 600, total_km: 3.5, retired: false}] as BackendShoe[],
      [],
      [],
      Date.UTC(2026, 5, 2),
    );
    const r = computeRank(ctx);
    expect(r.tier).toBe('bronze');
    expect(r.xp).toBeLessThan(RANK_XP.silver); // < 100
  });
});

// ── 6) XP 가 늘수록 종합 점수 단조 증가 ─────────────────────────────────────────
describe('XP 단조 증가', () => {
  test('achievementPoints 가 늘면 score(=xp)가 오른다', () => {
    const low = computeRank(emptyCtx({achievementPoints: 100}));
    const mid = computeRank(emptyCtx({achievementPoints: 1500}));
    const high = computeRank(emptyCtx({achievementPoints: 5000}));
    expect(mid.score).toBeGreaterThan(low.score);
    expect(high.score).toBeGreaterThan(mid.score);
    expect(low.tier).toBe('silver');
    expect(mid.tier).toBe('diamond');
    expect(high.tier).toBe('legend');
  });

  test('실데이터: 활동 많은 ctx 가 적은 ctx 보다 높은 티어/점수', () => {
    const small = computeRank(
      buildContext(
        [{id: 'r', shoe_id: 's', km: 5, run_date: '2026-01-01', duration: 1800, run_time: '07:00'}] as BackendRun[],
        [{id: 's', name: 'S', max_km: 600, total_km: 5, retired: false}] as BackendShoe[],
        [],
        [],
        Date.UTC(2026, 0, 2),
      ),
    );

    const bigRuns: BackendRun[] = [];
    for (let i = 0; i < 300; i++) {
      const day = String((i % 27) + 1).padStart(2, '0');
      bigRuns.push({
        id: `r${i}`,
        shoe_id: `s${i % 5}`,
        km: 20 + (i % 25),
        run_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${day}`,
        duration: 1800,
        run_time: '04:00',
      } as BackendRun);
    }
    const bigShoes: BackendShoe[] = [];
    for (let i = 0; i < 5; i++) {
      bigShoes.push({id: `s${i}`, name: `S${i}`, max_km: 600, total_km: 600, retired: i < 3} as BackendShoe);
    }
    const big = computeRank(buildContext(bigRuns, bigShoes, [], [], Date.UTC(2027, 0, 1)));

    expect(big.score).toBeGreaterThan(small.score);
    expect(RANK_XP[big.tier]).toBeGreaterThanOrEqual(RANK_XP[small.tier]);
  });
});

// ── 7) NaN/음수/누락 방어 ──────────────────────────────────────────────────────
describe('NaN/음수/누락 방어', () => {
  test('비정상 achievementPoints → xp 유한(≥0), throw 없음', () => {
    for (const bad of [NaN, -50, Infinity, -Infinity, undefined]) {
      const r = computeRank(emptyCtx({achievementPoints: bad as number}));
      expect(Number.isFinite(r.xp)).toBe(true);
      expect(r.xp).toBeGreaterThanOrEqual(0);
      expect(r.score).toBe(r.xp);
      expect(r.progressPercent).toBeGreaterThanOrEqual(0);
      expect(r.progressPercent).toBeLessThanOrEqual(100);
    }
  });

  test('비정상 사실(buildContext 경유) → 유한 xp, Bronze 근처, throw 없음', () => {
    const r = computeRank(
      buildContext(
        [{id: 'r', shoe_id: 's', km: NaN as unknown as number, run_date: 'bad', duration: -10, run_time: 'xx'}] as BackendRun[],
        [{id: 's', name: 'S', max_km: -100, total_km: NaN as unknown as number, retired: false}] as BackendShoe[],
        [],
        [],
        NaN,
      ),
    );
    expect(Number.isFinite(r.xp)).toBe(true);
    expect(r.xp).toBeGreaterThanOrEqual(0);
    expect(r.tier).toBe('bronze');
  });
});

// ── 8) 성능: 1000런/30신발 ctx 1회 computeRank < 50ms ──────────────────────────
describe('성능 예산', () => {
  test('1000런/30신발 ctx computeRank < 50ms', () => {
    const runs: BackendRun[] = [];
    for (let i = 0; i < 1000; i++) {
      const day = String((i % 27) + 1).padStart(2, '0');
      runs.push({
        id: `run${i}`,
        shoe_id: `shoe${i % 30}`,
        km: 5 + (i % 15),
        run_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${day}`,
        duration: 1800 + (i % 600),
        run_time: '07:00',
      } as BackendRun);
    }
    const shoes: BackendShoe[] = [];
    for (let i = 0; i < 30; i++) {
      shoes.push({
        id: `shoe${i}`,
        name: `Shoe ${i}`,
        max_km: 600,
        retired: i % 5 === 0,
      } as BackendShoe);
    }
    const ctx = buildContext(runs, shoes, [], [], new Date(2026, 11, 31).getTime());
    const t0 = Date.now();
    const r = computeRank(ctx);
    const elapsed = Date.now() - t0;
    expect(Number.isFinite(r.score)).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });
});
