import {estimateCalories, estimateCaloriesTotal, KCAL_PER_KG_PER_KM, KCAL_NET_PER_KG_PER_KM, REST_KCAL_PER_KG_PER_HR} from '../../lib/calories';
import {DEFAULT_WEIGHT_KG} from '../../lib/settings';

describe('estimateCalories', () => {
  it('계산: 체중 × 거리 × 1.036 (정수 반올림)', () => {
    // 65kg × 5km × 1.036 = 336.7 → 337
    expect(estimateCalories(5, 65)).toBe(Math.round(65 * 5 * KCAL_PER_KG_PER_KM));
    expect(estimateCalories(5, 65)).toBe(337);
  });

  it('체중이 클수록 더 많은 칼로리', () => {
    expect(estimateCalories(10, 80)).toBeGreaterThan(estimateCalories(10, 60));
  });

  it('거리 0/음수/NaN → 0', () => {
    expect(estimateCalories(0, 70)).toBe(0);
    expect(estimateCalories(-3, 70)).toBe(0);
    expect(estimateCalories(NaN, 70)).toBe(0);
  });

  it('체중이 비정상이면 기본 체중으로 폴백', () => {
    expect(estimateCalories(5, 0)).toBe(estimateCalories(5, DEFAULT_WEIGHT_KG));
    expect(estimateCalories(5, NaN as any)).toBe(estimateCalories(5, DEFAULT_WEIGHT_KG));
  });
});

describe('estimateCaloriesTotal (활동 + 안정 = 총 소모)', () => {
  it('활동(net·거리) + 안정(시간)을 합산한다 — 경쟁앱 총 칼로리 정의', () => {
    // 65kg · 3.11km · 1088s(18:08). 활동분은 net 계수 — gross(1.036)를 쓰면
    // 안정 대사가 이중 계산돼 Garmin 대비 +18% 과대(2026-07-17 비교런 근본수정).
    const active = 65 * 3.11 * KCAL_NET_PER_KG_PER_KM;
    const resting = 65 * (1088 / 3600) * REST_KCAL_PER_KG_PER_HR;
    expect(estimateCaloriesTotal(3.11, 1088, 65)).toBe(Math.round(active + resting));
  });

  it('net + 안정 총합은 gross 단독 추정(estimateCalories)과 근사한다 — 이중 계산 없음', () => {
    // 30분/5km/65kg: gross 단독 337 vs net+안정 320 — 총합이 gross 를 크게 넘으면 이중 계산.
    const total = estimateCaloriesTotal(5, 1800, 65);
    const gross = estimateCalories(5, 65);
    expect(total).toBeLessThanOrEqual(gross);
    expect(total).toBeGreaterThan(gross * 0.85);
  });

  it('시간 0/누락이면 활동분만(안정 0)', () => {
    expect(estimateCaloriesTotal(5, 0, 65)).toBe(Math.round(65 * 5 * KCAL_NET_PER_KG_PER_KM));
    expect(estimateCaloriesTotal(5, NaN as any, 65)).toBe(Math.round(65 * 5 * KCAL_NET_PER_KG_PER_KM));
  });

  it('거리 0 + 시간만 있어도 안정 대사분은 잡힌다(맨몸 시간)', () => {
    expect(estimateCaloriesTotal(0, 3600, 65)).toBe(Math.round(65 * REST_KCAL_PER_KG_PER_HR));
  });

  it('체중 비정상이면 기본 체중 폴백', () => {
    expect(estimateCaloriesTotal(5, 1000, 0)).toBe(estimateCaloriesTotal(5, 1000, DEFAULT_WEIGHT_KG));
  });
});
