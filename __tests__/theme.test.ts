import {
  SPACE,
  RADIUS,
  TYPE,
  FONT,
  DISPLAY,
  BG,
  ACCENT,
  T1,
} from '../theme';

describe('SPACE scale', () => {
  test('exposes the full dp ramp consumers spread into padding/margin', () => {
    expect(SPACE).toEqual({xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32});
  });
  test('is monotonically increasing so larger keys mean more space', () => {
    const ramp = [SPACE.xs, SPACE.sm, SPACE.md, SPACE.lg, SPACE.xl, SPACE.xxl];
    const sorted = [...ramp].sort((a, b) => a - b);
    expect(ramp).toEqual(sorted);
  });
});

describe('RADIUS scale', () => {
  test('exposes the corner-radius ramp with a pill sentinel', () => {
    expect(RADIUS).toEqual({sm: 12, md: 16, lg: 20, xl: 24, pill: 999});
  });
  test('pill is large enough to fully round any reasonable control', () => {
    expect(RADIUS.pill).toBeGreaterThanOrEqual(999);
  });
});

describe('TYPE presets', () => {
  test('each preset is a spreadable {fontSize, fontWeight, letterSpacing} bundle', () => {
    for (const key of Object.keys(TYPE) as (keyof typeof TYPE)[]) {
      const preset = TYPE[key];
      expect(typeof preset.fontSize).toBe('number');
      expect(['400', '500', '600', '700']).toContain(preset.fontWeight);
      expect(typeof preset.letterSpacing).toBe('number');
    }
  });
  test('display is the largest preset and micro the smallest', () => {
    const sizes = Object.values(TYPE).map(p => p.fontSize);
    expect(TYPE.display.fontSize).toBe(Math.max(...sizes));
    expect(TYPE.micro.fontSize).toBe(Math.min(...sizes));
  });
  test('a preset spreads cleanly into a Text style alongside the font family', () => {
    const style = {fontFamily: FONT, ...TYPE.body};
    expect(style).toMatchObject({
      fontFamily: 'PretendardVariable',
      fontSize: TYPE.body.fontSize,
      fontWeight: TYPE.body.fontWeight,
    });
  });
});

describe('DISPLAY face (본문 Pretendard와 대비)', () => {
  test('DISPLAY는 디스플레이 페이스 Barlow, 본문 FONT는 Pretendard로 서로 다르다', () => {
    expect(FONT).toBe('PretendardVariable');
    expect(DISPLAY).toBe('Barlow-Medium');
    // 통일이 아니라 의도된 대비 — 큰 숫자·워드마크가 본문과 다른 페이스를 쓴다.
    expect(DISPLAY).not.toBe(FONT);
  });
});

describe('existing exports stay intact', () => {
  test('color and font tokens are unchanged for current screens', () => {
    expect(BG).toBe('#000000');
    expect(ACCENT).toBe('#FF6500');
    expect(T1).toBe('#FFFFFF');
    expect(FONT).toBe('PretendardVariable');
  });
});
