// lib/progression/rank — computeRank 합성 랭크 엔진.
//
// 관찰 가능한 동작(behavioral):
//   · 경계 점수가 정확한 티어 + 티어 색(theme.TIER_COLORS)으로 매핑된다.
//   · 빈 컨텍스트 → Bronze, score 0, throw 없음.
//   · 초장거리·나머지 0 유저는 Legend 에 도달하지 못한다(거리 단독 금지, anti-scenario 2).
//   · NaN/음수/누락 입력은 0 으로 클램프(점수 유한, throw 없음).
//   · 문서화된 합성 ~1000명 인구가 목표 티어 피라미드를 ±6pp 안에서 재현한다.
//   · 1000런/30신발 컨텍스트 1회 computeRank < 50ms(성능 예산).
//
// 이 엔진은 ctx 만 읽는 순수 함수라 AsyncStorage 를 쓰지 않는다(키 격리 자명).

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

// ── 헬퍼: 비어있는 컨텍스트(모든 사실 0) ──────────────────────────────────────
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

// ============================================================================
// 1) 경계 점수 → 티어 + 색
// ============================================================================
describe('tierForScore: 경계 점수가 정확한 티어 + 색으로 매핑', () => {
  const cases: Array<[number, RankTier]> = [
    [24, 'bronze'],
    [25, 'silver'],
    [44, 'silver'],
    [45, 'gold'],
    [61, 'gold'],
    [62, 'platinum'],
    [77, 'platinum'],
    [78, 'diamond'],
    [89, 'diamond'],
    [90, 'master'],
    [96, 'master'],
    [97, 'legend'],
    [100, 'legend'],
  ];
  test.each(cases)('score %d → %s', (score, tier) => {
    expect(tierForScore(score)).toBe(tier);
    expect(colorForTier(tierForScore(score))).toBe(TIER_COLORS[tier]);
  });

  test('0·음수·NaN 점수 → Bronze', () => {
    expect(tierForScore(0)).toBe('bronze');
    expect(tierForScore(-50)).toBe('bronze');
    expect(tierForScore(NaN)).toBe('bronze');
  });

  test('TIER_CUTOFFS 는 spec 권위 컷오프를 노출', () => {
    expect(TIER_CUTOFFS).toEqual([
      [97, 'legend'],
      [90, 'master'],
      [78, 'diamond'],
      [62, 'platinum'],
      [45, 'gold'],
      [25, 'silver'],
      [0, 'bronze'],
    ]);
  });
});

// ============================================================================
// 2) 빈 컨텍스트 → Bronze, score 0
// ============================================================================
describe('빈 컨텍스트', () => {
  test('모든 사실 0 → score 0, Bronze, 색 일치, throw 없음', () => {
    const r = computeRank(emptyCtx());
    expect(r.score).toBe(0);
    expect(r.tier).toBe('bronze');
    expect(r.color).toBe(TIER_COLORS.bronze);
    expect(r.pillars).toEqual({
      running: 0,
      consistency: 0,
      shoeManagement: 0,
      rotation: 0,
      injuryPrevention: 0,
      engagement: 0,
    });
  });

  test('buildContext(빈 입력)도 동일하게 Bronze 0', () => {
    const r = computeRank(buildContext([], [], [], [], 0));
    expect(r.score).toBe(0);
    expect(r.tier).toBe('bronze');
  });
});

// ============================================================================
// 3) 거리 단독 금지(anti-scenario 2): 초장거리·나머지 0 → Legend 불가
// ============================================================================
describe('거리 단독으로는 상위 티어 불가', () => {
  test('누적 10만km + 단일 1000km, 나머지 0 → Legend 아님, score ≤ 25', () => {
    const r = computeRank(
      emptyCtx({cumulativeKm: 100000, longestRunKm: 1000}),
    );
    // running 평가축은 포화(≈1.0)하지만 가중치 0.25 → 25점 상한.
    expect(r.pillars.running).toBeGreaterThan(0.9);
    expect(r.score).toBeLessThanOrEqual(25);
    expect(r.tier).not.toBe('legend');
    expect(r.tier).not.toBe('master');
    expect(r.tier).not.toBe('diamond');
  });

  test('running 평가축은 거리가 커져도 1.0 으로 포화(한계효용 급감)', () => {
    const small = computeRank(emptyCtx({cumulativeKm: 4000, longestRunKm: 21}));
    const huge = computeRank(
      emptyCtx({cumulativeKm: 1_000_000, longestRunKm: 500}),
    );
    expect(huge.pillars.running).toBeLessThanOrEqual(1);
    expect(huge.pillars.running).toBeGreaterThan(small.pillars.running);
    // 거리가 250배여도 running 증가폭은 작다(포화).
    expect(huge.pillars.running - small.pillars.running).toBeLessThan(0.4);
  });
});

// ============================================================================
// 4) NaN/음수/누락 클램프
// ============================================================================
describe('NaN/음수/누락 방어', () => {
  test('NaN·음수·Infinity 사실 → score 유한, throw 없음', () => {
    const ctx = emptyCtx({
      cumulativeKm: NaN,
      longestRunKm: -50,
      weeklyActiveRatio: NaN,
      longestStreak: -10,
      currentStreak: Infinity,
      earnedTitleCount: NaN,
      completedChallengeCount: -3,
      perShoe: {
        s1: shoe({id: 's1', km: NaN, maxKm: -100}),
        s2: shoe({id: 's2', km: Infinity, maxKm: NaN}),
      },
    });
    const r = computeRank(ctx);
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    Object.values(r.pillars).forEach(v => {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  test('weeklyActiveRatio>1 같은 과대 입력도 1 로 클램프', () => {
    const r = computeRank(
      emptyCtx({weeklyActiveRatio: 5, longestStreak: 999, currentStreak: 999}),
    );
    expect(r.pillars.consistency).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// 5) 평가축별 동작 스냅샷(관찰 가능한 단조성)
// ============================================================================
describe('평가축 동작', () => {
  test('shoeManagement: overdue 신발 비율이 높을수록 낮다', () => {
    const allHealthy = computeRank(
      emptyCtx({
        perShoe: {
          a: shoe({id: 'a', km: 100, maxKm: 600}),
          b: shoe({id: 'b', km: 200, maxKm: 600}),
        },
      }),
    );
    const halfOverdue = computeRank(
      emptyCtx({
        perShoe: {
          a: shoe({id: 'a', km: 600, maxKm: 600}), // overdue
          b: shoe({id: 'b', km: 200, maxKm: 600}),
        },
      }),
    );
    expect(allHealthy.pillars.shoeManagement).toBe(1);
    expect(halfOverdue.pillars.shoeManagement).toBe(0.5);
  });

  test('shoeManagement: 수명(maxKm) 미상 신발만 있으면 0 — 누락이 점수를 부풀리지 않고 injuryPrevention 과 일관', () => {
    // 활성 신발이 전부 maxKm 미상/쓰레기값(buildContext 가 0 으로 정규화) →
    // overdue 판정 불가이므로 '건강'으로 셀 수 없다. shoeManagement 기여 0 이어야.
    const unknownOnly = computeRank(
      emptyCtx({
        perShoe: {
          a: shoe({id: 'a', km: 320, maxKm: 0}), // 수명 미상
          b: shoe({id: 'b', km: 80, maxKm: 0}), // 수명 미상(쓰레기값 정규화)
        },
      }),
    );
    expect(unknownOnly.pillars.shoeManagement).toBe(0);
    // 동일 컨텍스트에서 injuryPrevention 도 0 — 두 평가축이 maxKm 미상을 동일하게 취급.
    expect(unknownOnly.pillars.injuryPrevention).toBe(0);
    expect(unknownOnly.pillars.shoeManagement).toBe(
      unknownOnly.pillars.injuryPrevention,
    );

    // 수명 미상 신발은 분모에서 제외 — 알려진 신발만 평가한다(미상이 깨끗한 비율을 희석 안 함).
    const mixed = computeRank(
      emptyCtx({
        perShoe: {
          known: shoe({id: 'known', km: 100, maxKm: 600}), // 정상(건강)
          unknown: shoe({id: 'unknown', km: 999, maxKm: 0}), // 미상 → 무시
        },
      }),
    );
    expect(mixed.pillars.shoeManagement).toBe(1); // 미상 제외 → 알려진 1켤레 모두 건강
  });

  test('rotation: 균등 사용일수록 높고, 1켤레면 0', () => {
    const single = computeRank(
      emptyCtx({perShoe: {a: shoe({id: 'a', km: 300, maxKm: 600})}}),
    );
    const balanced = computeRank(
      emptyCtx({
        perShoe: {
          a: shoe({id: 'a', km: 300, maxKm: 600}),
          b: shoe({id: 'b', km: 300, maxKm: 600}),
        },
      }),
    );
    const skewed = computeRank(
      emptyCtx({
        perShoe: {
          a: shoe({id: 'a', km: 590, maxKm: 600}),
          b: shoe({id: 'b', km: 10, maxKm: 600}),
        },
      }),
    );
    expect(single.pillars.rotation).toBe(0);
    expect(balanced.pillars.rotation).toBeCloseTo(1, 5);
    expect(skewed.pillars.rotation).toBeLessThan(balanced.pillars.rotation);
  });

  test('engagement: 타이틀+챌린지 합으로 증가, 상한 1', () => {
    const none = computeRank(emptyCtx());
    const some = computeRank(
      emptyCtx({earnedTitleCount: 6, completedChallengeCount: 3}),
    );
    const capped = computeRank(
      emptyCtx({earnedTitleCount: 100, completedChallengeCount: 100}),
    );
    expect(none.pillars.engagement).toBe(0);
    expect(some.pillars.engagement).toBeGreaterThan(0);
    expect(capped.pillars.engagement).toBe(1);
  });

  test('engagement: 업적 난이도 포인트도 반영(가산), 높은 rarity일수록 더 큼', () => {
    const base = computeRank(emptyCtx()).pillars.engagement;
    const withAch = computeRank(emptyCtx({achievementPoints: 300})).pillars
      .engagement;
    // 업적 포인트가 더해지면 engagement 가 오른다(타이틀/챌린지 0이어도).
    expect(withAch).toBeGreaterThan(base);

    // 동일 활동에서 더 어려운 업적(=더 많은 포인트)이 더 크게 기여.
    const lowRarity = computeRank(emptyCtx({achievementPoints: 50})).pillars
      .engagement; // 예: bronze 5개
    const highRarity = computeRank(emptyCtx({achievementPoints: 500})).pillars
      .engagement; // 예: master 1개
    expect(highRarity).toBeGreaterThan(lowRarity);

    // 가산이라 기존(타이틀+챌린지) 점수가 업적 추가로 내려가지 않는다.
    const titlesOnly = computeRank(
      emptyCtx({earnedTitleCount: 6, completedChallengeCount: 3}),
    ).pillars.engagement;
    const titlesPlusAch = computeRank(
      emptyCtx({
        earnedTitleCount: 6,
        completedChallengeCount: 3,
        achievementPoints: 250,
      }),
    ).pillars.engagement;
    expect(titlesPlusAch).toBeGreaterThanOrEqual(titlesOnly);
  });
});

// ============================================================================
// 6) 메모이제이션(같은 ctx 참조 → 같은 결과 객체)
// ============================================================================
describe('memoizable', () => {
  test('동일 ctx 참조 재호출 → 동일 결과(캐시)', () => {
    const ctx = emptyCtx({cumulativeKm: 1234, earnedTitleCount: 4});
    const a = computeRank(ctx);
    const b = computeRank(ctx);
    expect(a).toBe(b); // 같은 객체 참조(WeakMap 캐시)
  });
});

// ============================================================================
// 7) 문서화된 합성 ~1000명 인구 → 티어 피라미드 ±6pp
// ============================================================================
// 방법론(문서화):
//   각 합성 유저는 잠재 실력 L∈[0,1] 로 정의되고, 6개 평가축 입력을 L 에 단조 대응시켜
//   생성한다(running 누적/단일 거리는 log 포화의 역함수로, 스트릭·주간활성·신발관리·
//   로테이션·부상예방·참여도는 각 평가축이 ≈L 이 되도록). L 은 균등 표본 u=(i+0.5)/N 을
//   "랭크 피라미드 역CDF"(ANCHORS)로 변환해 뽑는다 — 즉 현실적 러너 인구의 실력 분포를
//   목표 티어 비율(B35/S25/G18/P12/D7/M2.5/L0.5 %)에 맞춰 모사한다. 결정적 해시 jitter 로
//   완벽한 단조성을 흐트러뜨려(경계 흐림) 공식의 강건성을 함께 검증한다.
const TARGETS: Record<RankTier, number> = {
  bronze: 35,
  silver: 25,
  gold: 18,
  platinum: 12,
  diamond: 7,
  master: 2.5,
  legend: 0.5,
};

// 랭크 피라미드 역CDF 앵커: 인구 분위 p → 잠재 실력 L(=목표 점수/100).
// (누적 인구비율, L) — 목표 티어 경계 점수에 인구 분위를 맞춘다.
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.0],
  [0.35, 0.25],
  [0.6, 0.45],
  [0.78, 0.62],
  [0.9, 0.78],
  [0.97, 0.9],
  [0.995, 0.97],
  [1.0, 1.0],
];

function piecewise(p: number, anchors: typeof ANCHORS): number {
  if (p <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (p <= x1) {
      const t = x1 === x0 ? 0 : (p - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return anchors[anchors.length - 1][1];
}

// 결정적 의사난수(정수 해시) — 시드 i → [0,1). RNG 모킹 불필요(순수·재현가능).
/* eslint-disable no-bitwise */
function hash01(i: number): number {
  let x = (i * 2654435761) >>> 0;
  x = ((x ^ (x >>> 15)) * 2246822519) >>> 0;
  x = ((x ^ (x >>> 13)) * 3266489917) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}
/* eslint-enable no-bitwise */

function clamp01(n: number): number {
  return n <= 0 ? 0 : n >= 1 ? 1 : n;
}

// n켤레 신발의 정규화 엔트로피가 targetH(0..1) 가 되도록 사용량(km) 분포를 만든다.
// 온도(beta)로 softmax 가중을 만들고 이분탐색으로 targetH 에 맞춘다(결정적).
const SHOE_POOL = 10;
function entropyKms(n: number, targetH: number): number[] {
  const normH = (beta: number): {h: number; w: number[]} => {
    const w = Array.from({length: n}, (_, j) => Math.exp(-beta * j));
    const total = w.reduce((a, b) => a + b, 0);
    let h = 0;
    for (const x of w) {
      const p = x / total;
      if (p > 0) h -= p * Math.log(p);
    }
    return {h: h / Math.log(n), w};
  };
  // targetH 클수록 beta 작음(균등). 이분탐색: beta∈[0,25].
  let lo = 0;
  let hi = 25;
  let mid = 0;
  for (let it = 0; it < 40; it++) {
    mid = (lo + hi) / 2;
    const {h} = normH(mid);
    if (h > targetH) lo = mid;
    else hi = mid; // h 는 beta 에 단조감소
  }
  const {w} = normH(mid);
  const max = Math.max(...w);
  // 5000 스케일 + floor 1(모든 신발 km>0 → rotation active 집합에 포함).
  return w.map(x => Math.max(1, Math.round((x / max) * 5000)));
}

// 잠재 실력 L 의 합성 유저 컨텍스트. 6개 평가축이 모두 ≈L 이 되도록 입력을 역산한다
// (running 은 log 포화의 역함수, 신발 평가축은 10켤레 풀의 비율·엔트로피로).
function makeUser(level: number): ProgressionContext {
  const L = clamp01(level);

  // running: log 포화의 역함수 → 누적/단일 모두 ≈L.
  const cumulativeKm = Math.expm1(L * Math.log1p(8000));
  const longestRunKm = Math.expm1(L * Math.log1p(42.195));

  // consistency: 주간활성/스트릭 ≈L.
  const weeklyActiveRatio = L;
  const longestStreak = Math.round(L * 30);
  const currentStreak = Math.round(L * 14);

  // engagement: (타이틀+챌린지)/24 ≈L.
  const earnedTitleCount = Math.round(L * 16);
  const completedChallengeCount = Math.round(L * 8);

  // 신발 풀(고정 10켤레): rotation=엔트로피≈L, shoeManagement=클린셰어≈L,
  // injuryPrevention=건강비율≈L. overdueCount 켤레를 초과마모로(maxKm=km), 나머지는 정상.
  const kms = entropyKms(SHOE_POOL, L);
  const overdueCount = Math.round((1 - L) * SHOE_POOL);
  const perShoe: Record<string, PerShoeStats> = {};
  for (let j = 0; j < SHOE_POOL; j++) {
    const km = kms[j];
    const overdue = j < overdueCount;
    const maxKm = overdue ? km : Math.max(1, Math.round(km / 0.3)); // ratio 1.0 vs 0.3
    perShoe[`a${j}`] = shoe({id: `a${j}`, km, maxKm, runs: 10, retired: false});
  }

  return emptyCtx({
    cumulativeKm,
    longestRunKm,
    weeklyActiveRatio,
    longestStreak,
    currentStreak,
    earnedTitleCount,
    completedChallengeCount,
    registeredShoeCount: SHOE_POOL,
    retiredShoeCount: 0,
    perShoe,
  });
}

describe('합성 인구 → 티어 피라미드', () => {
  const N = 1000;
  const counts: Record<RankTier, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    platinum: 0,
    diamond: 0,
    master: 0,
    legend: 0,
  };

  beforeAll(() => {
    for (let i = 0; i < N; i++) {
      const p = (i + 0.5) / N;
      // 피라미드 역CDF + 결정적 jitter(경계 흐림 → 강건성 검증).
      const jitter = (hash01(i) - 0.5) * 0.05;
      const L = clamp01(piecewise(p, ANCHORS) + jitter);
      const r = computeRank(makeUser(L));
      counts[r.tier] += 1;
    }
  });

  test('각 티어 비율이 목표의 ±6pp 이내', () => {
    const pct = (t: RankTier) => (counts[t] / N) * 100;
    // 디버그 가시성(실패 시 진단).
    console.log(
      'tier distribution %',
      (Object.keys(counts) as RankTier[]).reduce(
        (o, t) => ({...o, [t]: +pct(t).toFixed(1)}),
        {},
      ),
    );
    (Object.keys(TARGETS) as RankTier[]).forEach(t => {
      expect(Math.abs(pct(t) - TARGETS[t])).toBeLessThanOrEqual(6);
    });
  });

  test('피라미드 단조성: 상위 티어일수록 인구가 적다', () => {
    expect(counts.bronze).toBeGreaterThanOrEqual(counts.silver);
    expect(counts.silver).toBeGreaterThanOrEqual(counts.gold);
    expect(counts.gold).toBeGreaterThanOrEqual(counts.platinum);
    expect(counts.platinum).toBeGreaterThanOrEqual(counts.diamond);
    expect(counts.diamond).toBeGreaterThanOrEqual(counts.master);
    expect(counts.master).toBeGreaterThanOrEqual(counts.legend);
  });
});

// ============================================================================
// 8) 성능: 1000런/30신발 컨텍스트 1회 computeRank < 50ms
// ============================================================================
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
