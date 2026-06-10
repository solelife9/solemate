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

describe('DISPLAY face (디자인 마무리: Pretendard 전면 통일)', () => {
  test('DISPLAY와 본문 FONT 모두 Pretendard — 모든 글씨를 하나로 통일(사용자 요청)', () => {
    // 디자인 마무리 핸드오프 정합: 사진의 큰 숫자가 Barlow 그로테스크가 아니라 본문과 같은
    // Pretendard. 사용자 요청('모든 글씨 Pretendard 통일')으로 Barlow 디스플레이 대비 철회.
    expect(FONT).toBe('PretendardVariable');
    expect(DISPLAY).toBe('PretendardVariable');
    expect(DISPLAY).toBe(FONT);
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
