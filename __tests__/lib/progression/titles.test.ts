// lib/progression/titles — 타이틀 카탈로그 + 헬퍼.
//
// 관찰 가능한 동작(behavioral):
//   · 각 사다리 임계 "경계"에서 정확히 언락된다(임계 미만은 잠금, 이상은 해제).
//   · 시간 기반 타이틀은 충분한 테뉴어가 충족될 때까지 잠긴 채로 둔다(날조 금지).
//   · hidden 타이틀(Early Bird/Night Runner/Comeback/Long Relationship)이 기준대로 언락.
//   · evaluateTitles 는 동일 ctx 에서 멱등(같은 키 집합)이고, 빈 ctx 에선 아무것도 언락 안 함.
//   · equip 은 정확히 하나만 장착(또는 0개) 불변식을 보장하고 입력을 변형하지 않는다.
//   · Rain Runner 는 카탈로그에 존재하지 않는다(날씨 미추적 → OMITTED).
//
// 순수 엔진(ctx 만 읽음)이라 AsyncStorage 를 쓰지 않는다 — 키 격리 자명.

import {
  PerShoeStats,
  ProgressionContext,
  ProgressionState,
} from '../../../lib/progression/types';
import {
  equip,
  evaluateTitles,
  titleDef,
  TITLES,
  TITLES_BY_KEY,
} from '../../../lib/progression/titles';

const DAY_MS = 86400000;
// 결정적 기준 시각(2026-06-12 로컬 자정) — context.test 와 동일 규약.
const NOW = new Date(2026, 5, 12).getTime();

function ymd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** NOW 기준 n일 전 'YYYY-MM-DD'(로컬 자정 정렬 → tenure 정확히 n일). */
function daysAgo(n: number): string {
  return ymd(NOW - n * DAY_MS);
}

function emptyCtx(over: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    now: NOW,
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

function perShoeMap(...shoes: PerShoeStats[]): Record<string, PerShoeStats> {
  const m: Record<string, PerShoeStats> = {};
  for (const s of shoes) m[s.id] = s;
  return m;
}

/** 활성·건강(미초과) 신발 — mgmt/rotation/injury 평가축을 1.0 으로 만드는 데 사용. */
function healthyShoe(id: string, firstWorn: string | null): PerShoeStats {
  return shoe({id, km: 100, maxKm: 600, runs: 5, retired: false, firstWorn});
}

// ============================================================================
// 1) running 사다리 — 누적 거리 경계 언락
// ============================================================================
describe('running 사다리: 누적 거리 경계', () => {
  const cases: Array<[number, string]> = [
    [100, 'running_100k'],
    [500, 'running_500k'],
    [1000, 'running_1000k'],
    [5000, 'running_5000k'],
    [10000, 'running_10000k'],
    [25000, 'running_25000k'],
  ];

  test('첫 런(runCount≥1) → running_beginner 만, 거리 0 이면 100k 미만', () => {
    const keys = evaluateTitles(emptyCtx({runCount: 1, cumulativeKm: 0}));
    expect(keys).toContain('running_beginner');
    expect(keys).not.toContain('running_100k');
  });

  test.each(cases)('누적 %dkm → %s 언락(경계)', (km, key) => {
    const at = evaluateTitles(emptyCtx({runCount: 1, cumulativeKm: km}));
    const below = evaluateTitles(
      emptyCtx({runCount: 1, cumulativeKm: km - 0.01}),
    );
    expect(at).toContain(key);
    expect(below).not.toContain(key);
  });

  test('누적 600km → beginner·100k·500k 모두 언락, 1000k 는 아직', () => {
    const keys = evaluateTitles(emptyCtx({runCount: 1, cumulativeKm: 600}));
    expect(keys).toEqual(
      expect.arrayContaining([
        'running_beginner',
        'running_100k',
        'running_500k',
      ]),
    );
    expect(keys).not.toContain('running_1000k');
  });
});

// ============================================================================
// 2) shoeManagement 사다리 — 컬렉션 수 + 관리 품질·기간
// ============================================================================
describe('shoeManagement 사다리', () => {
  const counts: Array<[number, string]> = [
    [1, 'shoe_beginner'],
    [3, 'shoe_enthusiast'],
    [5, 'shoe_rotation_runner'],
    [10, 'shoe_collector'],
  ];
  test.each(counts)('등록 %d켤레 → %s 언락(경계)', (n, key) => {
    expect(evaluateTitles(emptyCtx({registeredShoeCount: n}))).toContain(key);
    expect(
      evaluateTitles(emptyCtx({registeredShoeCount: n - 1})),
    ).not.toContain(key);
  });

  test('Shoe Master: mgmt≥0.9 & 테뉴어≥6개월 — 경계(182일)', () => {
    const at = emptyCtx({
      perShoe: perShoeMap(healthyShoe('a', daysAgo(182))),
    });
    const below = emptyCtx({
      perShoe: perShoeMap(healthyShoe('a', daysAgo(181))),
    });
    expect(evaluateTitles(at)).toContain('shoe_master');
    expect(evaluateTitles(below)).not.toContain('shoe_master');
  });

  test('KEEGO Master: ≥12개월, Keep Going: mgmt≥0.95 & ≥12개월', () => {
    const yr = emptyCtx({perShoe: perShoeMap(healthyShoe('a', daysAgo(365)))});
    const keys = evaluateTitles(yr);
    expect(keys).toContain('keego_master');
    expect(keys).toContain('keep_going'); // 전부 건강 → mgmt=1 ≥0.95
    // 6개월만으론 12개월 타이틀은 잠금.
    const half = evaluateTitles(
      emptyCtx({perShoe: perShoeMap(healthyShoe('a', daysAgo(182)))}),
    );
    expect(half).not.toContain('keego_master');
    expect(half).not.toContain('keep_going');
  });
});

// ============================================================================
// 3) rotation 사다리 — 사용 켤레 + 균형·기간
// ============================================================================
describe('rotation 사다리', () => {
  test('Rotation Starter: 사용(런≥1) 2켤레 경계', () => {
    const two = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', runs: 1, km: 10}),
        shoe({id: 'b', runs: 1, km: 10}),
      ),
    });
    const one = emptyCtx({perShoe: perShoeMap(shoe({id: 'a', runs: 5, km: 50}))});
    expect(evaluateTitles(two)).toContain('rotation_starter');
    expect(evaluateTitles(one)).not.toContain('rotation_starter');
  });

  test('Balanced Runner: 일관 사용(런≥3) 3켤레', () => {
    const three = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', runs: 3, km: 30}),
        shoe({id: 'b', runs: 3, km: 30}),
        shoe({id: 'c', runs: 3, km: 30}),
      ),
    });
    expect(evaluateTitles(three)).toContain('rotation_balanced');
    // 한 켤레만 일회성(런 2) → 일관 3켤레 미충족.
    const weak = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', runs: 3, km: 30}),
        shoe({id: 'b', runs: 3, km: 30}),
        shoe({id: 'c', runs: 2, km: 20}),
      ),
    });
    expect(evaluateTitles(weak)).not.toContain('rotation_balanced');
  });

  test('Rotation Expert: rotation≥0.7 & 테뉴어 3mo / Architect·Legend: ≥0.8·0.9 & 2yr', () => {
    // 균등 사용 2켤레 → rotation 평가축 = 1.0.
    const balanced = (firstWorn: string) =>
      emptyCtx({
        perShoe: perShoeMap(
          shoe({id: 'a', km: 300, maxKm: 600, runs: 30, firstWorn}),
          shoe({id: 'b', km: 300, maxKm: 600, runs: 30, firstWorn}),
        ),
      });
    expect(evaluateTitles(balanced(daysAgo(90)))).toContain('rotation_expert');
    expect(evaluateTitles(balanced(daysAgo(89)))).not.toContain(
      'rotation_expert',
    );
    // 균형이 충분하면 architect/legend 도(rotation=1 ≥0.8,0.9) 2년에서 함께.
    expect(evaluateTitles(balanced(daysAgo(730)))).toEqual(
      expect.arrayContaining(['rotation_architect', 'rotation_legend']),
    );
  });
});

// ============================================================================
// 4) injuryPrevention 사다리
// ============================================================================
describe('injuryPrevention 사다리', () => {
  test('Smart Runner: overdue(0.9) 전에 교체(은퇴)한 신발', () => {
    const smart = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 480, maxKm: 600, retired: true}), // ratio 0.8 → 조기교체
      ),
    });
    expect(evaluateTitles(smart)).toContain('injury_smart');
    // 한참 초과(ratio 1.3)에 은퇴 → 조기교체 아님.
    const late = emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 780, maxKm: 600, retired: true})),
    });
    expect(evaluateTitles(late)).not.toContain('injury_smart');
  });

  test('Smart Runner 경계(0.9 밴드): 0.85 는 조기교체, 0.95 는 이미 overdue → 아님', () => {
    // ratio 0.85(<0.9) → overdue 전 교체 = Smart.
    const below = emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 510, maxKm: 600, retired: true})),
    });
    expect(evaluateTitles(below)).toContain('injury_smart');
    // ratio 0.95(≥0.9) → 이미 overdue 밴드라 "조기 교체" 아님(allActiveHealthy·isOverdue 와 일관).
    const inBand = emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 570, maxKm: 600, retired: true})),
    });
    expect(evaluateTitles(inBand)).not.toContain('injury_smart');
  });

  test('Smart Runner: 한 번도 신지 않은(ratio 0) 은퇴 신발은 조기교체 아님', () => {
    const neverWorn = emptyCtx({
      perShoe: perShoeMap(shoe({id: 'a', km: 0, maxKm: 600, retired: true})),
    });
    expect(evaluateTitles(neverWorn)).not.toContain('injury_smart');
  });

  test('Wise Runner: 활성 신발 전부 건강(초과 없음)', () => {
    const wise = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}),
        shoe({id: 'b', km: 200, maxKm: 600}),
      ),
    });
    expect(evaluateTitles(wise)).toContain('injury_wise');
    // 한 켤레라도 초과(ratio≥0.9) → 미충족.
    const overdue = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 100, maxKm: 600}),
        shoe({id: 'b', km: 600, maxKm: 600}),
      ),
    });
    expect(evaluateTitles(overdue)).not.toContain('injury_wise');
  });

  test('Prevention Expert(6mo) → Master(1yr) → Iron(2yr): 기간 게이트', () => {
    const healthy = (firstWorn: string) =>
      emptyCtx({perShoe: perShoeMap(healthyShoe('a', firstWorn))});
    expect(evaluateTitles(healthy(daysAgo(182)))).toContain(
      'injury_prevention_expert',
    );
    expect(evaluateTitles(healthy(daysAgo(181)))).not.toContain(
      'injury_prevention_expert',
    );
    expect(evaluateTitles(healthy(daysAgo(365)))).toContain('injury_master');
    // 2년 + 전부 건강(injury 평가축=1 ≥0.95) → iron.
    expect(evaluateTitles(healthy(daysAgo(730)))).toEqual(
      expect.arrayContaining(['injury_iron']),
    );
  });
});

// ============================================================================
// 5) consistency 사다리
// ============================================================================
describe('consistency 사다리', () => {
  test('Consistent Start: runCount≥4 경계', () => {
    expect(evaluateTitles(emptyCtx({runCount: 4}))).toContain(
      'consistency_start',
    );
    expect(evaluateTitles(emptyCtx({runCount: 3}))).not.toContain(
      'consistency_start',
    );
  });

  test('주간 일관성 × 기간: 1mo/3mo/6mo/12mo/24mo + Never Stop', () => {
    const weekly = (ratio: number, firstWorn: string) =>
      emptyCtx({
        weeklyActiveRatio: ratio,
        perShoe: perShoeMap(shoe({id: 'a', runs: 30, km: 200, firstWorn})),
      });
    expect(evaluateTitles(weekly(0.75, daysAgo(30)))).toContain(
      'consistency_runner',
    );
    expect(evaluateTitles(weekly(0.75, daysAgo(29)))).not.toContain(
      'consistency_runner',
    );
    expect(evaluateTitles(weekly(0.75, daysAgo(90)))).toContain(
      'consistency_habit',
    );
    expect(evaluateTitles(weekly(0.75, daysAgo(182)))).toContain(
      'consistency_monthly',
    );
    expect(evaluateTitles(weekly(0.75, daysAgo(365)))).toContain(
      'consistency_annual',
    );
    expect(evaluateTitles(weekly(0.75, daysAgo(730)))).toContain(
      'consistency_steady',
    );
    // Never Stop 은 주간 0.9 필요 — 0.75 로는 잠금.
    expect(evaluateTitles(weekly(0.75, daysAgo(730)))).not.toContain(
      'consistency_never_stop',
    );
    expect(evaluateTitles(weekly(0.9, daysAgo(730)))).toContain(
      'consistency_never_stop',
    );
  });
});

// ============================================================================
// 6) hidden 타이틀
// ============================================================================
describe('hidden 타이틀', () => {
  test('Early Bird: 새벽 런≥20', () => {
    expect(evaluateTitles(emptyCtx({earlyRunCount: 20}))).toContain(
      'hidden_early_bird',
    );
    expect(evaluateTitles(emptyCtx({earlyRunCount: 19}))).not.toContain(
      'hidden_early_bird',
    );
  });

  test('Night Runner: 야간 런≥20', () => {
    expect(evaluateTitles(emptyCtx({nightRunCount: 20}))).toContain(
      'hidden_night_runner',
    );
    expect(evaluateTitles(emptyCtx({nightRunCount: 19}))).not.toContain(
      'hidden_night_runner',
    );
  });

  test('Comeback Runner: 30일 이상 공백 후 복귀', () => {
    expect(evaluateTitles(emptyCtx({longestGapDays: 30}))).toContain(
      'hidden_comeback',
    );
    expect(evaluateTitles(emptyCtx({longestGapDays: 29}))).not.toContain(
      'hidden_comeback',
    );
  });

  test('Long Relationship: 미은퇴 신발 첫 착용 >365일 전', () => {
    const old = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 200, maxKm: 600, firstWorn: daysAgo(366)}),
      ),
    });
    expect(evaluateTitles(old)).toContain('hidden_long_relationship');
    // 정확히 365일은 ">365" 미충족.
    const exactly = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 200, maxKm: 600, firstWorn: daysAgo(365)}),
      ),
    });
    expect(evaluateTitles(exactly)).not.toContain('hidden_long_relationship');
    // 은퇴 신발은 제외(여전히 함께가 아님).
    const retired = emptyCtx({
      perShoe: perShoeMap(
        shoe({id: 'a', km: 200, maxKm: 600, retired: true, firstWorn: daysAgo(400)}),
      ),
    });
    expect(evaluateTitles(retired)).not.toContain('hidden_long_relationship');
  });

  test('hidden 타이틀은 hidden:true 로 표시된다', () => {
    [
      'hidden_early_bird',
      'hidden_night_runner',
      'hidden_comeback',
      'hidden_long_relationship',
    ].forEach(k => expect(titleDef(k)?.hidden).toBe(true));
  });
});

// ============================================================================
// 8) 멱등 재평가 + 빈 ctx 무언락(날조 금지)
// ============================================================================
describe('evaluateTitles 멱등 · 빈 입력', () => {
  test('빈 컨텍스트 → 아무 타이틀도 언락 안 함', () => {
    expect(evaluateTitles(emptyCtx())).toEqual([]);
  });

  test('동일 ctx 재평가 → 같은 키 집합(멱등)', () => {
    const ctx = emptyCtx({
      runCount: 5,
      cumulativeKm: 650,
      registeredShoeCount: 3,
    });
    const a = evaluateTitles(ctx);
    const b = evaluateTitles(ctx);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  test('비정상 입력에서 throw 없이 [] 반환', () => {
    // @ts-expect-error 의도적 비정상 입력.
    expect(evaluateTitles(null)).toEqual([]);
    // @ts-expect-error 의도적 비정상 입력.
    expect(evaluateTitles(undefined)).toEqual([]);
  });
});

// ============================================================================
// 9) equip — 정확히 하나만 장착 + 불변성
// ============================================================================
describe('equip: 정확히 하나만 장착', () => {
  function stateWith(...keys: string[]): ProgressionState {
    return {
      earnedTitles: keys.map((k, i) => ({
        key: k,
        unlockedAt: '',
        isEquipped: i === 0, // 첫 타이틀이 장착된 상태로 시작.
      })),
      equippedTitleKey: keys[0] ?? null,
      seenUnlocks: [],
      retiredShoes: [],
      points: 0,
    };
  }

  test('B 장착 → A 해제, B 만 장착(정확히 하나)', () => {
    const s0 = stateWith('running_beginner', 'running_100k');
    const s1 = equip(s0, 'running_100k');
    expect(s1.equippedTitleKey).toBe('running_100k');
    expect(s1.earnedTitles.filter(t => t.isEquipped).map(t => t.key)).toEqual([
      'running_100k',
    ]);
  });

  test('입력 state 를 변형하지 않는다(PURE)', () => {
    const s0 = stateWith('running_beginner', 'running_100k');
    const snapshot = JSON.stringify(s0);
    equip(s0, 'running_100k');
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  test('null 장착 → 전부 해제', () => {
    const s0 = stateWith('running_beginner', 'running_100k');
    const s1 = equip(s0, null);
    expect(s1.equippedTitleKey).toBeNull();
    expect(s1.earnedTitles.some(t => t.isEquipped)).toBe(false);
  });

  test('미보유 타이틀 장착 → 무변경(날조 금지)', () => {
    const s0 = stateWith('running_beginner');
    const s1 = equip(s0, 'running_25000k');
    expect(s1).toBe(s0); // 무변경(동일 참조).
    expect(s1.equippedTitleKey).toBe('running_beginner');
  });
});

// ============================================================================
// 10) 카탈로그 무결성 + Rain Runner 부재
// ============================================================================
describe('카탈로그 무결성', () => {
  test('Rain Runner 는 카탈로그에 존재하지 않는다(날씨 미추적 → OMITTED)', () => {
    expect(TITLES.some(t => /rain/i.test(t.key))).toBe(false);
    expect(TITLES.some(t => /rain runner/i.test(t.name))).toBe(false);
  });

  test('키는 고유하고 TITLES_BY_KEY 와 일치한다', () => {
    const keys = TITLES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(TITLES_BY_KEY).length).toBe(TITLES.length);
  });

  test('모든 카테고리 사다리가 존재한다', () => {
    const cats = new Set(TITLES.map(t => t.category));
    [
      'running',
      'shoeManagement',
      'rotation',
      'injuryPrevention',
      'consistency',
      'hidden',
    ].forEach(c => expect(cats.has(c as never)).toBe(true));
  });
});
