/**
 * 몸무게 보정 왕복 안정성 — 등록/편집 화면이 **유효 수명**을 보여주고 **기저 수명**을
 * 저장하기 때문에 반드시 성립해야 하는 계약(2026-08-04).
 *
 * 화면: 621km 를 보여주고 저장은 650km. 다시 열면 또 621km 여야 한다.
 * 한 칸이라도 어긋나면 사용자가 볼 때마다 숫자가 1씩 흘러내린다.
 *
 * @format
 */
import {
  effectiveMaxKm,
  baseMaxKmFromEffective,
  weightDurabilityFactor,
  WEIGHT_DURABILITY_REF_KG,
  MIN_SHOE_MAX_KM,
  MAX_SHOE_MAX_KM,
} from '../../lib/shoe';

describe('weightDurabilityFactor — 경계와 방향', () => {
  test('기준 몸무게에서는 계수 1 — 미설정 사용자의 숫자가 흔들리지 않는다', () => {
    expect(weightDurabilityFactor(WEIGHT_DURABILITY_REF_KG)).toBe(1);
    expect(weightDurabilityFactor(0)).toBe(1);
    expect(weightDurabilityFactor(null)).toBe(1);
    expect(weightDurabilityFactor(undefined)).toBe(1);
  });

  test('무거울수록 짧고 가벼울수록 길다(단조)', () => {
    expect(weightDurabilityFactor(80)).toBeLessThan(1);
    expect(weightDurabilityFactor(50)).toBeGreaterThan(1);
    expect(weightDurabilityFactor(90)).toBeLessThan(weightDurabilityFactor(80));
  });

  test('±10% 를 넘지 않는다 — 극단 몸무게에서도 과장하지 않는다', () => {
    for (const w of [20, 30, 40, 120, 150, 250]) {
      const f = weightDurabilityFactor(w);
      expect(f).toBeGreaterThanOrEqual(0.9);
      expect(f).toBeLessThanOrEqual(1.1);
    }
  });
});

describe('유효 ↔ 기저 왕복', () => {
  // 실제로 쓰이는 전 구간을 훑는다: 몸무게 30~150kg × 수명 100~2000km.
  const weights = Array.from({length: 25}, (_, i) => 30 + i * 5);   // 30..150
  const bases = Array.from({length: 39}, (_, i) => 100 + i * 50);   // 100..2000

  test('보여준 값(유효)을 저장(기저)했다 다시 보여주면 같은 값이다', () => {
    const drift: string[] = [];
    for (const w of weights) {
      for (const b of bases) {
        const shown = effectiveMaxKm(b, w);          // 화면이 보여준 값
        const stored = baseMaxKmFromEffective(shown, w); // 저장한 값
        const again = effectiveMaxKm(stored, w);     // 다시 열었을 때
        if (again !== shown) drift.push(`w=${w} base=${b} shown=${shown} again=${again}`);
      }
    }
    expect(drift).toEqual([]);
  });

  // 사용자가 **직접 입력한** 값은 '도달 불가능한 값'일 수 있다. 계수가 1보다 크면
  // (65kg 미만 러너) b→round(b·f) 가 일부 정수를 건너뛰기 때문이다. 그런 값은 가장
  // 가까운 도달 가능한 값으로 떨어지는데, 계약은 두 가지다: **오차 ≤1km**, 그리고
  // **한 번만** 어긋난다(그다음부터 고정점). 숫자가 계속 흘러내리면 안 된다.
  test('직접 입력값은 최대 1km 만 보정되고, 그 뒤로는 고정점이다', () => {
    const tooFar: string[] = [];
    const notFixed: string[] = [];
    for (const w of weights) {
      for (let shown = MIN_SHOE_MAX_KM; shown <= MAX_SHOE_MAX_KM; shown += 7) {
        const settled = effectiveMaxKm(baseMaxKmFromEffective(shown, w), w);
        if (Math.abs(settled - shown) > 1) tooFar.push(`w=${w} ${shown}→${settled}`);
        // 한 번 정착한 값은 다시 왕복해도 그대로여야 한다(계속 흘러가지 않는다).
        const again = effectiveMaxKm(baseMaxKmFromEffective(settled, w), w);
        if (again !== settled) notFixed.push(`w=${w} ${settled}→${again}`);
      }
    }
    expect(tooFar).toEqual([]);
    expect(notFixed).toEqual([]);
  });

  test('카탈로그 권장값에서 출발한 값은 오차 0 이다 — 대부분의 사용자가 이 경로다', () => {
    // 사용자가 숫자를 손대지 않으면 화면이 보여준 값이 곧 유효값이라 왕복이 정확하다.
    const drift: string[] = [];
    for (const w of weights) {
      for (const b of [450, 560, 640, 650, 700, 850]) {   // 실제 카테고리 권장값
        const shown = effectiveMaxKm(b, w);
        const again = effectiveMaxKm(baseMaxKmFromEffective(shown, w), w);
        if (again !== shown) drift.push(`w=${w} base=${b} ${shown}→${again}`);
      }
    }
    expect(drift).toEqual([]);
  });

  test('기준 몸무게·미설정이면 유효 = 기저(변환이 아무것도 하지 않는다)', () => {
    for (const b of bases) {
      expect(effectiveMaxKm(b, WEIGHT_DURABILITY_REF_KG)).toBe(b);
      expect(baseMaxKmFromEffective(b, WEIGHT_DURABILITY_REF_KG)).toBe(b);
      expect(baseMaxKmFromEffective(b, 0)).toBe(b);
    }
  });

  test('0·비정상 입력은 0 을 돌려준다 — 호출부의 validateMaxKm 가 잡게 남긴다', () => {
    expect(baseMaxKmFromEffective(0, 80)).toBe(0);
    expect(baseMaxKmFromEffective(-5, 80)).toBe(0);
    expect(baseMaxKmFromEffective(NaN, 80)).toBe(0);
  });
});
