/**
 * 무게 기준 사이즈 통일 — 계약.
 *
 * 지키는 것:
 *  1) 사이즈 이름만 바꾼다. 모르면 null 이고, **null 을 표준으로 가정하지 않는다**
 *  2) 같은 사이즈의 다른 표기는 같은 값이 된다(그래야 비교가 막히지 않는다)
 *  3) 기준을 하나라도 모르면 두 무게는 비교 불가다
 */
import {
  normalizeWeightBasis,
  basisComparable,
  STANDARD_BASIS,
} from '../../lib/shoeWeightBasis';

describe('표기 통일', () => {
  it('같은 사이즈의 여러 표기가 한 값이 된다', () => {
    for (const v of ['US9', 'US 9', 'M9', '사이즈 9', '유니섹스 사이즈 9', 'US9(유니섹스)', '270mm']) {
      expect(normalizeWeightBasis(v)).toBe('270mm');
    }
  });

  it('반 사이즈도 구분한다', () => {
    expect(normalizeWeightBasis('US9.5')).toBe('275mm');
    expect(normalizeWeightBasis('US M8.5')).toBe('265mm');
  });

  it('mm 로 적힌 건 그대로 둔다', () => {
    expect(normalizeWeightBasis('265mm')).toBe('265mm');
    expect(normalizeWeightBasis('240mm')).toBe('240mm');
  });

  it('UK·EU 도 받는다', () => {
    expect(normalizeWeightBasis('UK9')).toBe('280mm');
    expect(normalizeWeightBasis('EU44')).toBe('280mm');
    expect(normalizeWeightBasis('EU42')).toBe('265mm');
  });

  it('남녀 병기는 남성 쪽을 쓴다 — 우리 표준이 남성 사이즈다', () => {
    expect(normalizeWeightBasis('M8.5/W9.5')).toBe('265mm');
    expect(normalizeWeightBasis('유니섹스 M6.0/W7.5')).toBe('240mm');
    expect(normalizeWeightBasis('M5.0/W6.0')).toBe('230mm');
  });

  it('여성 사이즈만 적혀 있으면 여성 표로 환산한다', () => {
    expect(normalizeWeightBasis('W8')).toBe('250mm');
    expect(normalizeWeightBasis('여성 US 8')).toBe('250mm');
  });

  it('US10 은 카루처럼 남성 기준이 다른 브랜드용이다', () => {
    expect(normalizeWeightBasis('US10')).toBe('280mm');
  });
});

describe('모르는 것', () => {
  it('빈 값·null 은 null', () => {
    expect(normalizeWeightBasis(null)).toBeNull();
    expect(normalizeWeightBasis(undefined)).toBeNull();
    expect(normalizeWeightBasis('')).toBeNull();
    expect(normalizeWeightBasis('   ')).toBeNull();
  });

  it('"미표기"처럼 모른다고 적힌 것도 null', () => {
    expect(normalizeWeightBasis('기준 미표기')).toBeNull();
    expect(normalizeWeightBasis('유니섹스(사이즈 미표기)')).toBeNull();
  });

  it('사이즈표에 없는 값은 지어내지 않는다', () => {
    expect(normalizeWeightBasis('US 42')).toBeNull();
    expect(normalizeWeightBasis('그냥 아무 말')).toBeNull();
  });
});

describe('비교 가능한가', () => {
  it('같은 기준이면 비교할 수 있다(표기가 달라도)', () => {
    expect(basisComparable('US9', 'M9')).toBe(true);
    expect(basisComparable('270mm', '사이즈 9')).toBe(true);
  });

  it('기준이 다르면 비교하지 않는다', () => {
    expect(basisComparable('US9', 'US9.5')).toBe(false);
    expect(basisComparable('270mm', '265mm')).toBe(false);
  });

  it('하나라도 모르면 비교하지 않는다 — 모르는 걸 표준이라 가정하지 않는다', () => {
    expect(basisComparable('US9', null)).toBe(false);
    expect(basisComparable(null, null)).toBe(false);
    expect(basisComparable('US9', '기준 미표기')).toBe(false);
  });

  it('표준은 270mm(남성 US9)', () => {
    expect(STANDARD_BASIS).toBe('270mm');
    expect(normalizeWeightBasis('US9')).toBe(STANDARD_BASIS);
  });
});
