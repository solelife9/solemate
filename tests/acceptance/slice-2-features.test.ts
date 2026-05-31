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
import { kmToDisplay, fmtDistance } from '../../lib/units';
import { weeklyProgress, currentStreak } from '../../lib/goals';

describe('차별점: 신발 모델 DB 권장 수명 자동 추천', () => {
  test('검증된 시드 DB는 유명 브랜드 다수 모델을 포함한다(≥100)', () => {
    expect(Array.isArray(SHOE_MODELS)).toBe(true);
    expect(SHOE_MODELS.length).toBeGreaterThanOrEqual(100);
  });

  test('데일리 트레이너는 ~700km, 카본 레이싱은 ~320km 권장', () => {
    // 알려진 모델 → 카테고리 기반 권장 수명
    expect(getRecommendedLifespanKm({ brand: 'NIKE', model: 'Pegasus 41' })).toBe(700);
    expect(getRecommendedLifespanKm({ brand: 'NIKE', model: 'Vaporfly 4' })).toBe(320);
  });

  test('모델 미지정/미매칭 → 카테고리 기본, 없으면 데일리(700) fallback', () => {
    expect(getRecommendedLifespanKm({ brand: 'NIKE', model: '존재하지않는모델XYZ' })).toBe(700);
    expect(getRecommendedLifespanKm({ category: 'carbon_racing' })).toBe(320);
    expect(getRecommendedLifespanKm({})).toBe(700);
  });
});

describe('단위 설정(km↔mi) 환산', () => {
  test('km→mi 표시 환산', () => {
    expect(kmToDisplay(10, 'km')).toBeCloseTo(10, 3);
    expect(kmToDisplay(10, 'mi')).toBeCloseTo(6.2137, 2);
  });
  test('fmtDistance는 단위 라벨 포함', () => {
    expect(fmtDistance(5, 'km')).toMatch(/km/);
    expect(fmtDistance(5, 'mi')).toMatch(/mi/);
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
  test('연속 러닝 스트릭(0km 날은 비런으로 끊김 처리 정책 확인)', () => {
    const s = currentStreak([
      { run_date: '2026-06-01', km: 5 },
      { run_date: '2026-06-02', km: 3 },
    ], '2026-06-02');
    expect(s).toBeGreaterThanOrEqual(2);
  });
});
