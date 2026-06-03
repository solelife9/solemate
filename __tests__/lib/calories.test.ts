import {estimateCalories, KCAL_PER_KG_PER_KM} from '../../lib/calories';
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
