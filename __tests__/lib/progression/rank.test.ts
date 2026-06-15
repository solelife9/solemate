// lib/progression/rank — 업적 기반 3축 연속 랭크 엔진(재설계).
//
// 관찰 가능한 동작:
//   · 경계 점수 → 정확한 티어 + 색(새 컷오프 15/33/55/72/86/95).
//   · 빈 컨텍스트 → Bronze, score 0, pillars 3축 0.
//   · 신규(3.5km/1run/새 신발) → Bronze(공짜 점수 없음 — 핵심 수정).
//   · 거리 단독 최대 → 거리축 ~1.0 이지만 한 축(0.35)이라 골드가 천장(다차원 철학).
//   · 세 축 모두 최대 → Legend.
//   · 업적 진행률 기반이라 연속(달린 만큼 부드럽게 상승).
//   · NaN/음수/누락 → 유한 점수, throw 없음.
//
// ctx 만 읽는 순수 함수(AsyncStorage 미사용).

import {TIER_COLORS} from '../../../theme';
import {buildContext} from '../../../lib/progression/context';
import {
  colorForTier,
  computeRank,
  tierForScore,
  TIER_CUTOFFS,
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

// 세 축을 모두 최대로 채우는 컨텍스트(Legend).
function maxedCtx(): ProgressionContext {
  const now = Date.UTC(2027, 0, 1);
  return emptyCtx({
    now,
    cumulativeKm: 12000, // 거리축 전 사다리(≤10000) 충족
    longestRunKm: 42.3, // 하프·마라톤
    bestPace5kSec: 280, // 스피드스터
    runCount: 1100, // 러닝 횟수 전 사다리(≤1000)
    weeklyActiveRatio: 1, // 습관 형성 + 지속가능 습관 게이트
    registeredShoeCount: 12, // 소유 전 사다리(≤10)
    retiredShoeCount: 10,
    retirementCount: 10, // 은퇴 전 사다리(≤10)
    retirementGrades: Array(10).fill('perfect'),
    perShoe: {
      a: shoe({id: 'a', km: 100, maxKm: 600, firstWorn: '2025-01-01'}), // 활성·건강·장기
      b: shoe({id: 'b', km: 200, maxKm: 600, firstWorn: '2025-01-01'}),
    },
  });
}

// ── 1) 경계 점수 → 티어 + 색 ──────────────────────────────────────────────────
describe('tierForScore: 경계 점수 → 티어 + 색', () => {
  const cases: Array<[number, RankTier]> = [
    [14, 'bronze'],
    [15, 'silver'],
    [32, 'silver'],
    [33, 'gold'],
    [54, 'gold'],
    [55, 'platinum'],
    [71, 'platinum'],
    [72, 'diamond'],
    [85, 'diamond'],
    [86, 'master'],
    [94, 'master'],
    [95, 'legend'],
    [100, 'legend'],
  ];
  test.each(cases)('score %d → %s', (score, tier) => {
    expect(tierForScore(score)).toBe(tier);
    expect(colorForTier(tierForScore(score))).toBe(TIER_COLORS[tier]);
  });

  test('0·음수·NaN → Bronze', () => {
    expect(tierForScore(0)).toBe('bronze');
    expect(tierForScore(-50)).toBe('bronze');
    expect(tierForScore(NaN)).toBe('bronze');
  });

  test('TIER_CUTOFFS 노출(3축 보정)', () => {
    expect(TIER_CUTOFFS).toEqual([
      [95, 'legend'],
      [86, 'master'],
      [72, 'diamond'],
      [55, 'platinum'],
      [33, 'gold'],
      [15, 'silver'],
      [0, 'bronze'],
    ]);
  });
});

// ── 2) 빈 컨텍스트 ──────────────────────────────────────────────────────────────
describe('빈 컨텍스트', () => {
  test('모든 사실 0 → score 0, Bronze, 3축 0, throw 없음', () => {
    const r = computeRank(emptyCtx());
    expect(r.score).toBe(0);
    expect(r.tier).toBe('bronze');
    expect(r.color).toBe(TIER_COLORS.bronze);
    expect(r.pillars).toEqual({running: 0, consistency: 0, shoeManagement: 0});
  });

  test('null/비정상 입력 → Bronze 0, throw 없음', () => {
    // @ts-expect-error 의도적 비정상 입력
    const r = computeRank(null);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('bronze');
  });

  test('buildContext(빈 입력)도 Bronze 0', () => {
    const r = computeRank(buildContext([], [], [], [], 0));
    expect(r.score).toBe(0);
    expect(r.tier).toBe('bronze');
  });
});

// ── 3) 신규(3.5km) → Bronze (공짜 점수 없음·핵심 수정) ───────────────────────────
describe('신규 사용자는 공짜 점수를 받지 않는다', () => {
  test('3.5km · 1런 · 새 신발 1켤레 → Bronze, 낮은 점수', () => {
    const r = computeRank(
      emptyCtx({
        cumulativeKm: 3.5,
        runCount: 1,
        longestRunKm: 3.5,
        weeklyActiveRatio: 1, // 이번 주 1회여도
        registeredShoeCount: 1,
        perShoe: {s1: shoe({id: 's1', km: 3.5, maxKm: 600})},
      }),
    );
    expect(r.tier).toBe('bronze');
    expect(r.score).toBeLessThan(15);
    // 새 신발이 건강하다고 신발관리 축이 만점이 되지 않는다.
    expect(r.pillars.shoeManagement).toBeLessThan(0.3);
  });
});

// ── 4) 거리 단독 → 골드 천장(다차원 철학) ──────────────────────────────────────
describe('거리 단독으로는 골드가 천장', () => {
  test('거리 업적 전부 최대(나머지 0) → 거리축 ~1.0, 골드 이하, 플래티넘 아님', () => {
    const r = computeRank(
      emptyCtx({
        cumulativeKm: 12000,
        longestRunKm: 42.3,
        bestPace5kSec: 280,
        runCount: 1, // 거리 자체는 최대지만 꾸준함/신발은 0
      }),
    );
    expect(r.pillars.running).toBeGreaterThan(0.9);
    expect(r.pillars.shoeManagement).toBe(0);
    expect(r.score).toBeLessThanOrEqual(55); // 플래티넘(55) 미만 = 골드 이하
    expect(['bronze', 'silver', 'gold']).toContain(r.tier);
  });
});

// ── 5) 세 축 최대 → Legend ──────────────────────────────────────────────────────
describe('세 축 모두 최대 → Legend', () => {
  test('거리+꾸준함+신발관리 만점 → Legend, score ~100', () => {
    const r = computeRank(maxedCtx());
    expect(r.pillars.running).toBeGreaterThan(0.9);
    expect(r.pillars.consistency).toBeGreaterThan(0.9);
    expect(r.pillars.shoeManagement).toBeGreaterThan(0.9);
    expect(r.tier).toBe('legend');
    expect(r.score).toBeGreaterThanOrEqual(95);
  });
});

// ── 6) 연속성: 달린 만큼 부드럽게 상승(계단 아님) ───────────────────────────────
describe('업적 진행률 기반 연속 상승', () => {
  test('거리축: 누적 거리가 늘면 (업적 미해제여도) 거리축이 오른다', () => {
    const a = computeRank(emptyCtx({cumulativeKm: 30, runCount: 5})); // 업적 거의 미해제
    const b = computeRank(emptyCtx({cumulativeKm: 300, runCount: 5}));
    const c = computeRank(emptyCtx({cumulativeKm: 3000, runCount: 5}));
    expect(b.pillars.running).toBeGreaterThan(a.pillars.running);
    expect(c.pillars.running).toBeGreaterThan(b.pillars.running);
  });

  test('종합 점수도 활동이 늘수록 단조 증가', () => {
    const low = computeRank(emptyCtx({cumulativeKm: 100, runCount: 20}));
    const mid = computeRank(
      emptyCtx({cumulativeKm: 1500, runCount: 150, registeredShoeCount: 3}),
    );
    expect(mid.score).toBeGreaterThan(low.score);
  });
});

// ── 7) NaN/음수/누락 방어 ──────────────────────────────────────────────────────
describe('NaN/음수/누락 방어', () => {
  test('비정상 사실 → score 유한(0..100), pillars 0..1, throw 없음', () => {
    const r = computeRank(
      emptyCtx({
        cumulativeKm: NaN,
        longestRunKm: -50,
        weeklyActiveRatio: NaN,
        runCount: Infinity,
        registeredShoeCount: -3,
        perShoe: {s1: shoe({id: 's1', km: NaN, maxKm: -100})},
      }),
    );
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    Object.values(r.pillars).forEach(v => {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
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
