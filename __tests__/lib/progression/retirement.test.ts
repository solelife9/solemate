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
import {targetKmFor} from '../../../lib/wearModel';

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

  // 회귀 가드(code_critic product_bug #3): UPSERT — 보관 복원 후 재은퇴 시 km/등급 갱신.
  test('같은 shoeId 재은퇴(내용 다름)는 stale 레코드를 최신으로 교체(여전히 1개)', () => {
    const first = addRetiredShoeRecord(defaultProgressionState(), {
      ...rec,
      km: 200,
      grade: 'standard',
      retireYear: 2025,
    });
    // 복원 → 추가 런 → 재은퇴: 더 큰 km/높은 등급/새 연도로 다시 기록.
    const updated = addRetiredShoeRecord(first, {
      ...rec,
      km: 540,
      grade: 'perfect',
      retireYear: 2026,
    });
    expect(updated.retiredShoes).toHaveLength(1); // 신발당 1개 유지(사라지지 않음)
    expect(updated.retiredShoes[0].km).toBe(540); // 최신 거리로 갱신
    expect(updated.retiredShoes[0].grade).toBe('perfect'); // 최신 등급으로 갱신
    expect(updated.retiredShoes[0].retireYear).toBe(2026);
    expect(updated).not.toBe(first); // 내용 변경 → 새 상태
  });

  test('교체 시 원래 위치를 유지(다른 신발 순서 보존)', () => {
    let st = addRetiredShoeRecord(defaultProgressionState(), {...rec, shoeId: 's1', km: 100});
    st = addRetiredShoeRecord(st, {...rec, shoeId: 's2', km: 200});
    st = addRetiredShoeRecord(st, {...rec, shoeId: 's1', km: 999}); // s1 재은퇴
    expect(st.retiredShoes.map(r => r.shoeId)).toEqual(['s1', 's2']); // 순서 보존
    expect(st.retiredShoes[0].km).toBe(999); // s1 갱신
    expect(st.retiredShoes[1].km).toBe(200); // s2 불변
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

// ── 등급/하이라이트 통합 배선(signature: retirement.ts → grade) ────────────────
// buildRetirementSummary 안에서만 사는 배선(recommendedKmFor + usedKm 우선순위 +
// 하이라이트→등급)이 실제로 grade 를 움직이는지를 end-to-end 로 못박는다. 은퇴 신발은
// retired:true 라 shoeManagement 분모에서 빠지므로(mgmt=0) Hall of Fame 승격이 일어나지
// 않아 base 밴드가 그대로 노출된다 — 밴드 수학만으로 등급을 결정적으로 검증할 수 있다.
describe('등급/하이라이트 통합 배선(signature)', () => {
  test('시나리오 11: max_km=500 + 누적 ~512km → grade==="perfect"', () => {
    // 512/500 = 1.024 → |c−1|=0.024 ≤ 0.05 → perfect. recommendedKmFor(max_km) +
    // usedKm(perShoe.km) 배선이 모두 옳아야만 이 등급이 나온다(tautology 아님).
    const retired: BackendShoe = {...SHOE, retired: true};
    const runs: BackendRun[] = [
      run({shoe_id: 's1', km: 200, duration: 60000, run_date: '2026-01-01'}),
      run({shoe_id: 's1', km: 200, duration: 60000, run_date: '2026-02-01'}),
      run({shoe_id: 's1', km: 112, duration: 33600, run_date: '2026-03-01'}),
    ];
    const ctx = buildContext(runs, [retired], [], [], NOW);
    const s = buildRetirementSummary(retired, runs, ctx, NOW);
    expect(s.totalKm).toBe(512);
    expect(s.grade).toBe('perfect');
  });

  test('usedKm 서버 truth(perShoe.km) 우선 — 런 합과 다르면 perShoe.km 가 등급을 결정', () => {
    // 서버 total_km=500(→ perShoe.km=500)인데 동기된 런은 100km뿐. usedKm 가 런 합(100)
    // 을 쓰면 c=0.2 → standard, perShoe.km(500)를 쓰면 c=1.0 → perfect. perfect 면 우선순위
    // (usedKm = perShoe.km>0 ? perShoe.km : totalKm)가 지켜진 것.
    const shoe: BackendShoe = {
      id: 's1',
      name: 'Nike Pegasus 40',
      max_km: 500,
      total_km: 500,
      retired: true,
    };
    const runs: BackendRun[] = [
      run({shoe_id: 's1', km: 60, duration: 18000, run_date: '2026-01-01'}),
      run({shoe_id: 's1', km: 40, duration: 12000, run_date: '2026-02-01'}),
    ];
    const ctx = buildContext(runs, [shoe], [], [], NOW);
    const s = buildRetirementSummary(shoe, runs, ctx, NOW);
    expect(s.totalKm).toBe(100); // 런 합만으로는 standard(c=0.2)일 거리
    expect(ctx.perShoe.s1.km).toBe(500); // 서버 truth
    expect(s.grade).toBe('perfect'); // perShoe.km 우선이 적용된 증거
  });

  test('recommendedKm 폴백(max_km 없음 → targetKmFor(name))이 등급을 구동', () => {
    // max_km 부재 → recommendedKmFor 는 모델명 파싱(wearModel.targetKmFor)로 폴백.
    // 폴백이 안 먹으면 rec≤0 → standard. 누적을 rec 에 맞추면 perfect 가 나와 폴백 분기 확인.
    const name = 'Mystery Runner 9000'; // 미등록 모델 → DEFAULT_LIFESPAN_KM
    const rec = targetKmFor({name}); // == 700
    expect(rec).toBeGreaterThan(0);
    const shoe: BackendShoe = {id: 's1', name, retired: true}; // max_km 없음
    const runs: BackendRun[] = [
      run({shoe_id: 's1', km: rec / 2, duration: 100000, run_date: '2026-01-01'}),
      run({shoe_id: 's1', km: rec / 2, duration: 100000, run_date: '2026-02-01'}),
    ];
    const ctx = buildContext(runs, [shoe], [], [], NOW);
    const s = buildRetirementSummary(shoe, runs, ctx, NOW);
    expect(s.totalKm).toBe(rec); // usedKm ≈ rec → c=1.0
    expect(s.grade).toBe('perfect'); // 폴백 rec 가 없으면 불가능한 등급
  });

  test('pbLongestRun: 그 신발 최장 런이 전역 최장과 동률이면 하이라이트에 포함(positive)', () => {
    // 단일 신발 → 그 신발 최장 런이 곧 전역 최장 → holdsDistancePB. hasRealPB 도 충족.
    const runs: BackendRun[] = [
      run({shoe_id: 's1', km: 15, duration: 5400, run_date: '2026-01-01'}),
      run({shoe_id: 's1', km: 8, duration: 3000, run_date: '2026-02-01'}),
    ];
    const ctx = buildContext(runs, [SHOE], [], [], NOW);
    expect(ctx.longestRunKm).toBe(15); // 전역 최장
    const s = buildRetirementSummary(SHOE, runs, ctx, NOW);
    expect(s.longestRunKm).toBe(15);
    expect(s.highlights).toContain(H.pbLongestRun);
  });

  test('longHaul1000: 누적 ≥1000km → longHaul1000 포함 & trustedPartner500 상호배타로 제외', () => {
    const runs: BackendRun[] = [
      run({shoe_id: 's1', km: 600, duration: 200000, run_date: '2026-01-01'}),
      run({shoe_id: 's1', km: 500, duration: 170000, run_date: '2026-02-01'}),
    ];
    const ctx = buildContext(runs, [SHOE], [], [], NOW);
    const s = buildRetirementSummary(SHOE, runs, ctx, NOW);
    expect(s.totalKm).toBe(1100);
    expect(s.highlights).toContain(H.longHaul1000);
    expect(s.highlights).not.toContain(H.trustedPartner500); // 누적 마일스톤은 최고 1개
  });

  test('NULL PACE 안전 경로: 시간 결측/0 런 → avgPaceSec/bestPaceSec 모두 null', () => {
    const runs: BackendRun[] = [
      run({shoe_id: 's1', km: 10, run_date: '2026-01-01'}), // duration 결측
      run({shoe_id: 's1', km: 5, duration: 0, run_date: '2026-02-01'}), // duration 0
    ];
    const ctx = buildContext(runs, [SHOE], [], [], NOW);
    const s = buildRetirementSummary(SHOE, runs, ctx, NOW);
    expect(s.totalDurationS).toBe(0);
    expect(s.avgPaceSec).toBeNull();
    expect(s.bestPaceSec).toBeNull();
    expect(s.longestRunKm).toBe(10); // 거리 집계는 정상
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
