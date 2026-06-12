// lib/progression/retirement — 은퇴 요약/하이라이트/Most Memorable + 레코드 헬퍼.
//
// 관찰 가능한 동작:
//   · 요약 집계(거리/런수/시간/평균·최고 페이스/최장 런/첫·마지막 일자/사용기간)가
//     그 신발의 **실제 런과 정확히 일치**하고, 다른 신발의 런은 섞이지 않는다.
//   · 하이라이트는 실제 달성한 것만(자격 런 없으면 half/marathon 절대 없음 — 날조 금지).
//   · Most Memorable Moment = 우선순위 1위 하이라이트(highlights[0]).
//   · addRetiredShoeRecord 는 입력 불변·shoeId 멱등으로 retiredShoes 만 확장한다.
//
// 순수 함수 — buildContext 로 만든 ctx 와 BackendRun/BackendShoe 입력만 읽는다.
import {buildContext} from '../../../lib/progression/context';
import {
  RETIREMENT_HIGHLIGHT_KEYS as H,
  addRetiredShoeRecord,
  buildRetiredShoeRecord,
  buildRetirementSummary,
  mostMemorableMoment,
} from '../../../lib/progression/retirement';
import {defaultProgressionState} from '../../../lib/progression/storage';
import {RetiredShoeRecord} from '../../../lib/progression/types';

function run(over: Partial<BackendRun> & {shoe_id: string}): BackendRun {
  return {
    id: over.id ?? `r_${Math.random()}`,
    shoe_id: over.shoe_id,
    km: over.km ?? 0,
    run_date: over.run_date ?? '2026-01-01',
    duration: over.duration,
    run_time: over.run_time,
  };
}

const SHOE: BackendShoe = {id: 's1', name: 'Nike Pegasus 40', max_km: 500};
const NOW = new Date(2026, 3, 1).getTime(); // 2026-04-01 로컬 자정

describe('buildRetirementSummary 집계(실제 런만)', () => {
  const runs: BackendRun[] = [
    run({id: 'a', shoe_id: 's1', km: 10, duration: 3000, run_date: '2026-01-01'}),
    run({id: 'b', shoe_id: 's1', km: 5, duration: 1800, run_date: '2026-03-01'}),
    // 다른 신발(s2) — 더 멀고 더 느림. s1 집계에 섞이면 안 됨.
    run({id: 'c', shoe_id: 's2', km: 100, duration: 40000, run_date: '2026-02-01'}),
  ];
  const ctx = buildContext(runs, [SHOE, {id: 's2', name: 'Other'}], [], [], NOW);
  const s = buildRetirementSummary(SHOE, runs, ctx, NOW);

  test('거리/런수/시간이 그 신발 런과 일치(타 신발 제외)', () => {
    expect(s.totalKm).toBe(15);
    expect(s.runCount).toBe(2);
    expect(s.totalDurationS).toBe(4800);
  });

  test('평균/최고 페이스·최장 런', () => {
    expect(s.avgPaceSec).toBe(320); // 4800s / 15km
    expect(s.bestPaceSec).toBe(300); // 3000/10 (가장 빠름)
    expect(s.longestRunKm).toBe(10);
  });

  test('첫/마지막 런 일자·사용 기간(첫 런→은퇴일 now)', () => {
    expect(s.firstRunDate).toBe('2026-01-01');
    expect(s.lastRunDate).toBe('2026-03-01');
    expect(s.usageDays).toBe(90); // 2026-01-01 → 2026-04-01
  });

  test('하이라이트: 10k + 그 신발이 보유한 페이스 PB(전역 최고)', () => {
    // s1 의 최고 페이스(300)가 전역 최고 → pbFastestPace. 최장 런(10)은 전역 최장(100)
    // 이 아니므로 pbLongestRun 없음. 풀/하프 자격 런 없음.
    expect(s.highlights).toContain(H.tenK);
    expect(s.highlights).toContain(H.pbFastestPace);
    expect(s.highlights).not.toContain(H.pbLongestRun);
    expect(s.highlights).not.toContain(H.halfMarathon);
    expect(s.highlights).not.toContain(H.marathon);
  });

  test('Most Memorable = 우선순위 1위(pbFastestPace > tenK)', () => {
    expect(s.mostMemorable).toBe(H.pbFastestPace);
    expect(s.mostMemorable).toBe(s.highlights[0]);
  });

  test('입력(runs/shoe)을 변형하지 않는다', () => {
    const before = JSON.stringify({runs, SHOE});
    buildRetirementSummary(SHOE, runs, ctx, NOW);
    expect(JSON.stringify({runs, SHOE})).toBe(before);
  });
});

describe('하이라이트 real-only(날조 금지)', () => {
  function summaryFor(runs: BackendRun[], shoe = SHOE) {
    const ctx = buildContext(runs, [shoe], [], [], NOW);
    return buildRetirementSummary(shoe, runs, ctx, NOW);
  }

  test('짧은 런만 → marathon/half/10k 없음, 기본 longestRun 만', () => {
    const s = summaryFor([
      run({shoe_id: 's1', km: 5, duration: 1800}),
      run({shoe_id: 's1', km: 3, duration: 1200}),
    ]);
    expect(s.highlights).not.toContain(H.marathon);
    expect(s.highlights).not.toContain(H.halfMarathon);
    expect(s.highlights).not.toContain(H.tenK);
    expect(s.highlights).toContain(H.longestRun);
  });

  test('하프 자격 런(≥21.0975km) → halfMarathon, marathon 은 없음', () => {
    const s = summaryFor([run({shoe_id: 's1', km: 21.5, duration: 7000})]);
    expect(s.highlights).toContain(H.halfMarathon);
    expect(s.highlights).not.toContain(H.marathon);
  });

  test('풀코스 자격 런(≥42.195km) → marathon', () => {
    const s = summaryFor([run({shoe_id: 's1', km: 43, duration: 15000})]);
    expect(s.highlights).toContain(H.marathon);
  });

  test('런 없음 → 하이라이트 없음, mostMemorable null', () => {
    const s = summaryFor([]);
    expect(s.highlights).toEqual([]);
    expect(s.mostMemorable).toBeNull();
  });
});

describe('Most Memorable Moment 선택(결정적 우선순위)', () => {
  test('풀코스 + 누적 500km → marathon 이 최우선', () => {
    const runs: BackendRun[] = [
      run({shoe_id: 's1', km: 43, duration: 15000, run_date: '2026-01-01'}),
      run({shoe_id: 's1', km: 300, duration: 110000, run_date: '2026-02-01'}),
      run({shoe_id: 's1', km: 300, duration: 110000, run_date: '2026-03-01'}),
    ];
    const ctx = buildContext(runs, [SHOE], [], [], NOW);
    const s = buildRetirementSummary(SHOE, runs, ctx, NOW);
    expect(s.highlights).toContain(H.marathon);
    expect(s.highlights).toContain(H.trustedPartner500); // 누적 643km
    expect(s.mostMemorable).toBe(H.marathon);
    expect(s.highlights[0]).toBe(H.marathon);
  });

  test('mostMemorableMoment 헬퍼는 highlights[0] 반환(빈 배열 → null)', () => {
    expect(mostMemorableMoment([H.marathon, H.tenK])).toBe(H.marathon);
    expect(mostMemorableMoment([])).toBeNull();
    expect(mostMemorableMoment(null)).toBeNull();
  });
});

describe('addRetiredShoeRecord 순수/멱등', () => {
  const rec: RetiredShoeRecord = {
    shoeId: 's1',
    name: 'Pegasus 40',
    km: 500,
    retiredAt: '2026-04-01T00:00:00.000Z',
    retireYear: 2026,
    grade: 'perfect',
  };

  test('레코드를 retiredShoes 에 ADDITIVE 추가(입력 불변)', () => {
    const state = defaultProgressionState();
    const next = addRetiredShoeRecord(state, rec);
    expect(next.retiredShoes).toHaveLength(1);
    expect(next.retiredShoes[0]).toEqual(rec);
    expect(state.retiredShoes).toHaveLength(0); // 원본 불변
  });

  test('같은 shoeId 재추가는 멱등(동일 참조, 변경 없음)', () => {
    const state = defaultProgressionState();
    const next = addRetiredShoeRecord(state, rec);
    const again = addRetiredShoeRecord(next, rec);
    expect(again).toBe(next);
    expect(again.retiredShoes).toHaveLength(1);
  });

  test('다른 신발은 정상 추가', () => {
    const next = addRetiredShoeRecord(defaultProgressionState(), rec);
    const n2 = addRetiredShoeRecord(next, {...rec, shoeId: 's2'});
    expect(n2.retiredShoes.map(r => r.shoeId)).toEqual(['s1', 's2']);
  });

  test('무효 레코드(null/빈 shoeId) → 입력 그대로', () => {
    const state = defaultProgressionState();
    expect(addRetiredShoeRecord(state, null)).toBe(state);
    expect(addRetiredShoeRecord(state, {...rec, shoeId: ''}).retiredShoes).toHaveLength(
      0,
    );
  });

  test('다른 키(earnedTitles/points)는 보존', () => {
    const state = {
      ...defaultProgressionState(),
      points: 75,
      seenUnlocks: ['x'],
    };
    const next = addRetiredShoeRecord(state, rec);
    expect(next.points).toBe(75);
    expect(next.seenUnlocks).toEqual(['x']);
  });
});

describe('buildRetiredShoeRecord', () => {
  const s = buildRetirementSummary(
    SHOE,
    [run({shoe_id: 's1', km: 500, duration: 150000, run_date: '2026-01-01'})],
    buildContext([], [SHOE], [], [], NOW),
    NOW,
  );

  test('요약 → 레코드(연도/ISO/요약 보존)', () => {
    const rec = buildRetiredShoeRecord(s, 500, NOW);
    expect(rec.shoeId).toBe('s1');
    expect(rec.name).toBe('Nike Pegasus 40');
    expect(rec.km).toBe(500);
    expect(rec.retireYear).toBe(2026);
    expect(rec.retiredAt).toContain('2026-');
    expect(rec.summary).toBe(s);
    expect(rec.grade).toBe(s.grade);
  });

  test('km 비정상 → summary.totalKm 폴백', () => {
    const rec = buildRetiredShoeRecord(s, NaN, NOW);
    expect(rec.km).toBe(s.totalKm);
  });
});
