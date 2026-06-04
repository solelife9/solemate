/**
 * lib/replacementForecast 단위 테스트 — 교체 예측(순수 함수).
 *
 * 관찰 가능한 계약을 검증한다(휴리스틱 계수가 아니라 *분기*와 *안전성*):
 *   S6-4 정상(ok): 잔여>0·최근주행 있음 → weeksRemaining>0·etaISO 존재,
 *        confidence = 최근창 런≥3 ? high : low.
 *        불변식: etaISO == now + weeksRemaining 주(출력↔출력, days↔weeks 혼동 차단).
 *        타당성: 알려진 입력 → weeksRemaining 가 합리적 자릿수 band 안(rate 오류 차단).
 *        overdue: 잔여≤0 → reason 'overdue', weeks 0, eta = now.
 *        no_recent: 최근 28일 주행 0 → reason 'no_recent', weeks/eta = null.
 *        분기 우선순위: 잔여≤0 AND 최근런0 → overdue 가 no_recent 보다 우선.
 *   A6-2 엣지: 결측·0·음수·비유한 입력에서 weeksRemaining 에 NaN/Infinity/음수 없음.
 *   경계: 최근창 런이 정확히 3개 → confidence 'high'; now−28d 정각 = 창 안.
 *
 * 순수 단위 — react-test-renderer/AsyncStorage 불요(no면 IO 는 surfaceOf 콜백으로 주입).
 *
 * @format
 */
import {
  forecastReplacement,
  type ForecastRun,
} from '../../lib/replacementForecast';
import {targetKmFor, effectiveWearKm, type WearShoe} from '../../lib/wearModel';

// 고정 기준시각(결정적 테스트).
const NOW = new Date('2026-06-04T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** now 로부터 daysAgo 일 전 ISO. */
function daysAgoISO(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

/** 최근창 안의 런 하나(distance·duration·날짜 지정). */
function recentRun(id: string, daysAgo: number, distance = 8): ForecastRun {
  return {id, distance_km: distance, duration_s: distance * 330, date: daysAgoISO(daysAgo)};
}

describe('S6-4 정상(ok)', () => {
  test('잔여>0·최근주행 있음 → weeks>0·etaISO 존재', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const runs: ForecastRun[] = [
      recentRun('r1', 2),
      recentRun('r2', 9),
      recentRun('r3', 16),
    ];
    const f = forecastReplacement(shoe, runs, {now: NOW});

    expect(f.reason).toBe('ok');
    expect(f.kmRemaining).toBeGreaterThan(0);
    expect(f.weeksRemaining).not.toBeNull();
    expect(f.weeksRemaining as number).toBeGreaterThan(0);
    expect(Number.isFinite(f.weeksRemaining as number)).toBe(true);
    expect(f.etaISO).not.toBeNull();
    // etaISO 는 now 이후의 유효 ISO.
    const etaMs = new Date(f.etaISO as string).getTime();
    expect(Number.isFinite(etaMs)).toBe(true);
    expect(etaMs).toBeGreaterThan(NOW.getTime());
    // 불변식: etaISO 는 정확히 now + weeksRemaining 주(週)여야 한다.
    // days↔weeks 혼동·잘못된 배수·stale weeks 버그를 잡는다. 공개 출력↔출력만
    // 비교하며 구현 상수(rate 계수 등)는 참조하지 않는다(오라클 누수 금지).
    expect(etaMs).toBeCloseTo(
      NOW.getTime() + (f.weeksRemaining as number) * 7 * DAY,
      -3, // |diff| < 500ms (toISOString ms 절삭 오차만 허용)
    );
  });

  test('weeksRemaining 타당성 경계: 알려진 입력 → 합리적 자릿수 band', () => {
    // 최근 28일 실효 ~16km(8km×2, road·easy 페이스 → 보정 1.0), target 700,
    // ageWear 0(구매시점 결측). 잔여 ≈ 수백km / 주당 한자릿수km → 수십~수백 주.
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const runs: ForecastRun[] = [recentRun('r1', 4), recentRun('r2', 18)];
    const f = forecastReplacement(shoe, runs, {now: NOW});

    expect(f.reason).toBe('ok');
    const weeks = f.weeksRemaining as number;
    // rate 수식 총체적 오류(단위 혼동·잘못된 배수)를 잡는 자릿수 band:
    // 1주보다 크고 수백주(≈10년)보다 작아야 한다.
    expect(weeks).toBeGreaterThan(1);
    expect(weeks).toBeLessThan(520);
  });

  test('confidence: 최근창 런≥3 → high, <3 → low', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const three: ForecastRun[] = [recentRun('a', 1), recentRun('b', 5), recentRun('c', 10)];
    const two: ForecastRun[] = [recentRun('a', 1), recentRun('b', 5)];

    expect(forecastReplacement(shoe, three, {now: NOW}).confidence).toBe('high');
    expect(forecastReplacement(shoe, two, {now: NOW}).confidence).toBe('low');
  });

  test('kmRemaining = targetKmFor − effectiveWearKm (중복 구현 아님)', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const runs: ForecastRun[] = [recentRun('r1', 3), recentRun('r2', 12)];
    const f = forecastReplacement(shoe, runs, {now: NOW, weightKg: 75});
    const expected =
      targetKmFor(shoe) - effectiveWearKm(shoe, runs, {now: NOW, weightKg: 75});
    expect(f.kmRemaining).toBeCloseTo(expected, 6);
  });
});

describe('S6-4 overdue(잔여 ≤ 0)', () => {
  test('많이 닳은 신발 → reason overdue, weeks 0, eta = now', () => {
    // 짧은 수명 + 큰 주행으로 잔여를 음수로 만든다.
    const shoe: WearShoe = {id: 's-worn', target_km: 100};
    const runs: ForecastRun[] = [
      {id: 'r1', distance_km: 60, duration_s: 60 * 330, date: daysAgoISO(2)},
      {id: 'r2', distance_km: 60, duration_s: 60 * 330, date: daysAgoISO(5)},
    ];
    const f = forecastReplacement(shoe, runs, {now: NOW});

    expect(f.reason).toBe('overdue');
    expect(f.kmRemaining).toBeLessThanOrEqual(0);
    expect(f.weeksRemaining).toBe(0);
    expect(f.etaISO).toBe(NOW.toISOString());
  });
});

describe('S6-4 분기 우선순위(remaining≤0 이 no_recent 보다 먼저)', () => {
  test('잔여≤0 AND 최근런 0 → overdue 가 이긴다', () => {
    // 큰 주행을 전부 28일 창 밖(40·50·60일 전)에 둔다: 누적 마모는 target 초과
    // (잔여≤0)이면서 최근창 실효주행은 0. 스펙은 remaining≤0 을 먼저 검사하므로
    // 결과는 no_recent 가 아니라 overdue 여야 한다.
    const shoe: WearShoe = {id: 's-worn', target_km: 100};
    const runs: ForecastRun[] = [
      {id: 'r1', distance_km: 60, duration_s: 60 * 330, date: daysAgoISO(40)},
      {id: 'r2', distance_km: 60, duration_s: 60 * 330, date: daysAgoISO(50)},
      {id: 'r3', distance_km: 60, duration_s: 60 * 330, date: daysAgoISO(60)},
    ];
    const f = forecastReplacement(shoe, runs, {now: NOW});

    expect(f.kmRemaining).toBeLessThanOrEqual(0); // 누적 마모 > target
    expect(f.reason).toBe('overdue'); // ← no_recent 아님(remaining 먼저 검사)
    expect(f.weeksRemaining).toBe(0);
    expect(f.etaISO).toBe(NOW.toISOString());
  });
});

describe('경계: 정확히 28일 전 런은 최근창 안', () => {
  test('now−28d 정각 = 창 안(ok), 28d+1ms = 창 밖(no_recent)', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const base = {id: 'edge', distance_km: 8, duration_s: 8 * 330};
    const exactly28d: ForecastRun = {
      ...base,
      date: new Date(NOW.getTime() - 28 * DAY).toISOString(),
    };
    const justOutside: ForecastRun = {
      ...base,
      date: new Date(NOW.getTime() - (28 * DAY + 1)).toISOString(),
    };

    // 정확히 28일 전 = 창 경계 안 → 집계되어 ok.
    const inWindow = forecastReplacement(shoe, [exactly28d], {now: NOW});
    expect(inWindow.reason).toBe('ok');
    expect(inWindow.weeksRemaining as number).toBeGreaterThan(0);

    // 28일 + 1ms = 창 밖 → 집계 제외 → no_recent.
    const outWindow = forecastReplacement(shoe, [justOutside], {now: NOW});
    expect(outWindow.reason).toBe('no_recent');
  });
});

describe('S6-4 no_recent(최근 28일 주행 0)', () => {
  test('최근 런이 없으면 reason no_recent, weeks/eta = null', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    // 모든 런이 28일 창 밖(40·60일 전).
    const runs: ForecastRun[] = [recentRun('old1', 40), recentRun('old2', 60)];
    const f = forecastReplacement(shoe, runs, {now: NOW});

    expect(f.reason).toBe('no_recent');
    expect(f.weeksRemaining).toBeNull();
    expect(f.etaISO).toBeNull();
    expect(f.kmRemaining).toBeGreaterThan(0); // 아직 수명은 남았다
  });

  test('런 배열이 비어도 no_recent (잔여>0)', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700, created_at: NOW.toISOString()};
    const f = forecastReplacement(shoe, [], {now: NOW});
    expect(f.reason).toBe('no_recent');
    expect(f.weeksRemaining).toBeNull();
    expect(f.etaISO).toBeNull();
  });

  test('날짜 필드는 date→run_date→created_at 순으로 인식된다', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    // run_date · created_at 만 가진 최근 런도 집계되어 ok 가 된다.
    const runs: ForecastRun[] = [
      {id: 'r1', distance_km: 8, duration_s: 8 * 330, run_date: daysAgoISO(3)},
      {id: 'r2', distance_km: 8, duration_s: 8 * 330, created_at: daysAgoISO(6)},
    ];
    const f = forecastReplacement(shoe, runs, {now: NOW});
    expect(f.reason).toBe('ok');
    expect(f.weeksRemaining as number).toBeGreaterThan(0);
  });
});

describe('경계: 최근창 런이 정확히 3개', () => {
  test('정확히 3개 → confidence high; 28일 경계 안/밖 구분', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    // 27·20·10일 전 = 창 안 3개, 30일 전 = 창 밖 1개.
    const runs: ForecastRun[] = [
      recentRun('in1', 27),
      recentRun('in2', 20),
      recentRun('in3', 10),
      recentRun('out', 30),
    ];
    const f = forecastReplacement(shoe, runs, {now: NOW});
    expect(f.confidence).toBe('high'); // 창 안 정확히 3개
    expect(f.reason).toBe('ok');
  });
});

describe('A6-2 엣지 — weeksRemaining 에 무NaN·무Infinity·무음수', () => {
  const sane = (f: {weeksRemaining: number | null; kmRemaining: number}) => {
    expect(Number.isFinite(f.kmRemaining)).toBe(true);
    if (f.weeksRemaining !== null) {
      expect(Number.isFinite(f.weeksRemaining)).toBe(true);
      expect(f.weeksRemaining).toBeGreaterThanOrEqual(0);
    }
  };

  test('온갖 결손 입력에서도 안전', () => {
    sane(forecastReplacement({} as WearShoe, [], {now: NOW}));
    sane(forecastReplacement({id: 's'}, null as never, {now: NOW}));
    sane(
      forecastReplacement(
        {id: 's', target_km: -1, created_at: 'not-a-date'},
        [
          {distance_km: NaN, date: daysAgoISO(2)} as ForecastRun,
          null as never,
          {distance_km: -3, date: 'garbage'} as ForecastRun,
          {distance_km: Infinity, date: daysAgoISO(1)} as ForecastRun,
        ],
        {weightKg: NaN, now: NOW},
      ),
    );
  });

  test('파싱 불가 날짜의 런은 최근창 집계서 제외 → no_recent', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const runs: ForecastRun[] = [
      {id: 'r1', distance_km: 8, duration_s: 8 * 330, date: 'not-a-date'},
      {id: 'r2', distance_km: 8, duration_s: 8 * 330}, // 날짜 결측
    ];
    const f = forecastReplacement(shoe, runs, {now: NOW});
    expect(f.reason).toBe('no_recent');
    expect(f.confidence).toBe('low'); // 집계된 최근 런 0개
  });

  test('미래 날짜 런은 최근창서 제외(now 초과)', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const runs: ForecastRun[] = [
      {id: 'r1', distance_km: 8, duration_s: 8 * 330, date: daysAgoISO(-3)}, // 3일 후
    ];
    const f = forecastReplacement(shoe, runs, {now: NOW});
    expect(f.reason).toBe('no_recent');
  });

  test('now 미지정이어도 동작(기본 new Date())', () => {
    const shoe: WearShoe = {id: 's1', target_km: 700};
    const f = forecastReplacement(shoe, []);
    sane(f);
    expect(['ok', 'overdue', 'no_recent']).toContain(f.reason);
  });
});
