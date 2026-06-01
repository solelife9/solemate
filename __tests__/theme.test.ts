import {
  SPACE,
  RADIUS,
  TYPE,
  FONT,
  DISPLAY,
  DISPLAY_LEGACY,
  DISPLAY_TARGET,
  UNIFY_DISPLAY_FONT,
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

describe('DISPLAY font transition (Keego rebrand)', () => {
  test('Slice 3 unifies DISPLAY onto the Pretendard body face (Bebas retired)', () => {
    expect(UNIFY_DISPLAY_FONT).toBe(true);
    expect(DISPLAY).toBe(DISPLAY_TARGET);
    expect(DISPLAY).toBe(FONT);
    // The legacy face token is preserved but no longer the active DISPLAY.
    expect(DISPLAY_LEGACY).toBe('BebasNeue-Regular');
    expect(DISPLAY).not.toBe(DISPLAY_LEGACY);
  });
  test('the unified target is Pretendard so Slice 3 can flip one flag', () => {
    expect(DISPLAY_TARGET).toBe(FONT);
    // Mirror of the production ternary: flipping the flag moves DISPLAY to FONT.
    const flipped = true ? DISPLAY_TARGET : DISPLAY_LEGACY;
    expect(flipped).toBe(FONT);
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
