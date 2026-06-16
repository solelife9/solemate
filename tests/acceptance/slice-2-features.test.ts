// ============================================================================
// Acceptance tests — Slice 2: 미완성 UI 연결 + shoe-first 신규 기능 + 신발 인텔리전스
// slice: 2   tag: @slice-2
//
// Pure-logic contracts for Slice 2. UI/integration behaviors (settings persistence,
// course map, export, photo, recommendation chips) are covered by per-job
// integration tests. These will fail until the Slice 2 modules exist (TDD).
//
// Contracts:
//   data/shoeModels.ts — SHOE_MODELS, getRecommendedLifespanKm, categoryLifespanKm
//   lib/units.ts       — kmToDisplay, displayToKm, fmtDistance (km|mi)
//   lib/goals.ts       — weeklyProgress, currentStreak, personalRecords
// ============================================================================

import {
  getRecommendedLifespanKm,
  SHOE_MODELS,
} from '../../data/shoeModels';
import { kmToDisplay, displayToKm, fmtDistance, KM_PER_MI } from '../../lib/units';
import {
  weeklyProgress,
  currentStreak,
  personalRecords,
} from '../../lib/goals';

describe('차별점: 신발 모델 DB 권장 수명 자동 추천', () => {
  test('검증된 시드 DB는 유명 브랜드 다수 모델을 포함한다(≥100)', () => {
    expect(Array.isArray(SHOE_MODELS)).toBe(true);
    expect(SHOE_MODELS.length).toBeGreaterThanOrEqual(100);
  });

  test('데일리 트레이너는 ~650km, 카본 레이싱은 ~450km 권장', () => {
    // 알려진 모델 → 카테고리 기반 권장 수명
    expect(getRecommendedLifespanKm({ brand: 'NIKE', model: 'Pegasus 41' })).toBe(650);
    expect(getRecommendedLifespanKm({ brand: 'NIKE', model: 'Vaporfly 4' })).toBe(450);
  });

  test('모델 미지정/미매칭 → 카테고리 기본, 없으면 데일리(650) fallback', () => {
    expect(getRecommendedLifespanKm({ brand: 'NIKE', model: '존재하지않는모델XYZ' })).toBe(650);
    expect(getRecommendedLifespanKm({ category: 'carbon_racing' })).toBe(450);
    expect(getRecommendedLifespanKm({})).toBe(650);
  });
});

describe('단위 설정(km↔mi) 환산', () => {
  test('km→mi 표시 환산', () => {
    expect(kmToDisplay(10, 'km')).toBeCloseTo(10, 3);
    expect(kmToDisplay(10, 'mi')).toBeCloseTo(6.2137, 2);
  });

  test('displayToKm: km은 항등, mi는 1.60934 곱(저장 표준 복원)', () => {
    // km 단위는 표시값=저장값
    expect(displayToKm(10, 'km')).toBe(10);
    // mi→km 환산 명시: 1mi = 1.60934km
    expect(displayToKm(1, 'mi')).toBeCloseTo(KM_PER_MI, 5);
    expect(displayToKm(5, 'mi')).toBeCloseTo(5 * KM_PER_MI, 5);
    // round-trip: 10km을 mi로 표시(≈6.2137mi)했다가 다시 km로 복원하면 10km
    expect(displayToKm(6.2137, 'mi')).toBeCloseTo(10, 2);
    expect(displayToKm(kmToDisplay(10, 'mi'), 'mi')).toBeCloseTo(10, 5);
  });

  test('fmtDistance는 환산된 숫자값과 단위 라벨을 함께 표시', () => {
    // km: 라벨 + 환산값(5.0) 그대로
    expect(fmtDistance(5, 'km')).toBe('5.0 km');
    // mi: 라벨 + 실제 환산 숫자(5km ≈ 3.1mi) — 라벨만이 아니라 값도 단언
    expect(fmtDistance(5, 'mi')).toMatch(/mi/);
    expect(fmtDistance(5, 'mi')).toContain('3.1');
    expect(fmtDistance(5, 'mi')).toBe('3.1 mi');
  });
});

describe('러닝 목표 달성률 & 스트릭(실데이터)', () => {
  const monday = '2026-06-01'; // week reference
  const runs = [
    { run_date: '2026-06-01', km: 5 },
    { run_date: '2026-06-02', km: 7 },
    { run_date: '2026-06-03', km: 0 },
  ];
  test('주간 목표 대비 진행률', () => {
    const p = weeklyProgress(runs, 30, monday);
    expect(p.totalKm).toBeCloseTo(12, 5);
    expect(p.percent).toBeCloseTo(40, 0); // 12/30
  });

  test('weeklyProgress: 주 경계(mondayISO~+7일) 밖 런은 합산에서 제외', () => {
    // monday='2026-06-01'(월) → 주: 06-01 00:00 ~ 06-08 00:00(배타)
    const boundaryRuns = [
      { run_date: '2026-05-31', km: 100 }, // mondayISO 이전(일) → 제외
      { run_date: '2026-06-01', km: 5 }, // 주 시작(포함)
      { run_date: '2026-06-07', km: 7 }, // 그 주 일요일(포함)
      { run_date: '2026-06-08', km: 100 }, // 다음 주 월요일(배타 → 제외)
    ];
    const p = weeklyProgress(boundaryRuns, 30, monday);
    // mondayISO를 무시하면 212가 되어 통과 불가 — 주 안 런(5+7)만 집계되어야 함
    expect(p.totalKm).toBe(12);
    expect(p.percent).toBe(40); // 12/30 → 40%
  });

  test('연속 러닝 스트릭: 정확히 2일(off-by-one 차단)', () => {
    const s = currentStreak([
      { run_date: '2026-06-01', km: 5 },
      { run_date: '2026-06-02', km: 3 },
    ], '2026-06-02');
    expect(s).toBe(2);
  });

  test('스트릭: 오늘이 0km(비런)이면 끊겨 0', () => {
    // 정책: 0km 날은 비런 → 스트릭 끊김. 오늘이 0km이면 streak=0.
    const s = currentStreak([
      { run_date: '2026-06-01', km: 5 },
      { run_date: '2026-06-02', km: 0 },
    ], '2026-06-02');
    expect(s).toBe(0);
  });

  test('스트릭: 중간에 빠진 날(gap)이 있으면 끊김', () => {
    // 06-04 누락 → 오늘(06-05)부터 역행하면 06-04에서 끊겨 streak=1
    const s = currentStreak([
      { run_date: '2026-06-01', km: 5 },
      { run_date: '2026-06-02', km: 3 },
      { run_date: '2026-06-05', km: 4 },
    ], '2026-06-05');
    expect(s).toBe(1);
  });
});

describe('개인 기록(PR) 집계', () => {
  test('최고 페이스 1k/5k(초)와 최장 거리(km)를 집계', () => {
    const pr = personalRecords([
      { run_date: '2026-05-20', km: 10, durationS: 3000 }, // 300s/km
      { run_date: '2026-05-22', km: 5, durationS: 1400 }, // 280s/km(더 빠름)
      { run_date: '2026-05-24', km: 0.5, durationS: 200 }, // 1km 미만 → 페이스 제외
    ]);
    expect(pr.fastest1k).toBeCloseTo(280, 5);
    expect(pr.fastest5k).toBeCloseTo(1400, 5);
    expect(pr.longest).toBe(10);
  });

  test('5km 미만만 있으면 fastest5k는 null', () => {
    const pr = personalRecords([
      { run_date: '2026-05-20', km: 2, durationS: 600 },
    ]);
    expect(pr.fastest5k).toBeNull();
    expect(pr.fastest1k).toBeCloseTo(300, 5);
    expect(pr.longest).toBe(2);
  });

  test('기록이 없으면 모두 null', () => {
    expect(personalRecords([])).toEqual({
      fastest1k: null,
      fastest5k: null,
      longest: null,
    });
  });
});
