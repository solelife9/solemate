/**
 * primitives.test.tsx — behavioural tests for the Slice 3 Keego UI primitives.
 *
 * These assert OBSERVABLE render output (real react-test-renderer trees), not
 * source strings: status colours follow theme tokens, the Keego wordmark renders
 * 'Keego' filled with the accent gradient, Metric lays value/unit out as two
 * baseline-aligned tabular-nums nodes, Button's variant branches emit different
 * surfaces, and TONE_BG stays channel-identical to its source colour tokens.
 * @format
 */

import React from 'react';
import {Text, View, StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  conditionColor,
  conditionTone,
  KeegoWordmark,
  Metric,
  Button,
  TONE_BG,
} from '../primitives';
import {
  GOOD,
  WARN,
  DANGER,
  ACCENT,
  ACCENT_2,
  CARD_HI,
  GRAD_TOP,
  GRAD_BOT,
  RADIUS,
  T3,
} from '../theme';

// ── helpers ──────────────────────────────────────────────────────────────────
function render(el: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

// react-native-svg is mocked to plain Views that keep displayName; we locate svg
// primitives by that name so we can read stopColor / text children.
const byName = (root: ReactTestRenderer.ReactTestInstance, name: string) =>
  root.findAll((n: any) => n && n.type && n.type.displayName === name);

// The Button's Pressable carries our style callback; find it by that prop so we
// can resolve the variant's surface (RN's Pressable isn't matchable by type).
const pressableStyle = (root: ReactTestRenderer.ReactTestInstance) => {
  const node = root.find(
    (n: any) =>
      n &&
      n.props &&
      n.props.accessibilityRole === 'button' &&
      typeof n.props.style === 'function',
  );
  return StyleSheet.flatten(node.props.style({pressed: false}));
};

const hexChannels = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};
const rgbaChannels = (rgba: string): [number, number, number] => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgba);
  if (!m) throw new Error(`not an rgba string: ${rgba}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

// ── conditionColor / conditionTone follow theme tokens ───────────────────────
describe('conditionColor / conditionTone map shoe condition → theme token', () => {
  test('교체 → DANGER / danger', () => {
    expect(conditionColor('교체')).toBe(DANGER);
    expect(conditionTone('교체')).toBe('danger');
  });
  test('주의 → WARN / warn', () => {
    expect(conditionColor('주의')).toBe(WARN);
    expect(conditionTone('주의')).toBe('warn');
  });
  test('양호 (and default) → GOOD / good', () => {
    expect(conditionColor('양호')).toBe(GOOD);
    expect(conditionTone('양호')).toBe('good');
  });
});

// ── KeegoWordmark renders the literal 'Keego' filled by the accent gradient ───
describe('KeegoWordmark', () => {
  test("renders an SVG <Text> whose content is exactly 'Keego'", () => {
    const {root} = render(<KeegoWordmark />);
    const texts = byName(root, 'Text');
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(texts.map(t => t.props.children)).toContain('Keego');
  });

  test('its gradient stops use the ACCENT → ACCENT_2 token pair', () => {
    const {root} = render(<KeegoWordmark />);
    const stopColors = byName(root, 'Stop').map(s => s.props.stopColor);
    expect(stopColors).toContain(ACCENT);
    expect(stopColors).toContain(ACCENT_2);
  });
});

// ── Metric lays value + unit out as two baseline-aligned tabular nodes ────────
describe('Metric', () => {
  test('renders value and unit as separate Text nodes (not concatenated)', () => {
    const {root} = render(<Metric value="0.0" unit="km" />);
    const texts = root.findAllByType(Text).map(t => t.props.children);
    // Two distinct leaf nodes, never a single "0.0km" string.
    expect(texts).toContain('0.0');
    expect(texts).toContain('km');
    expect(texts).not.toContain('0.0km');
  });

  test("the row is baseline-aligned so digits and unit sit on one line", () => {
    const {root} = render(<Metric value="0.0" unit="km" />);
    const row = root.findAllByType(View)[0];
    expect(StyleSheet.flatten(row.props.style).alignItems).toBe('baseline');
  });

  test("the value uses tabular-nums so digit width never jitters", () => {
    const {root} = render(<Metric value="0.0" unit="km" />);
    const valueNode = root
      .findAllByType(Text)
      .find(t => t.props.children === '0.0')!;
    expect(StyleSheet.flatten(valueNode.props.style).fontVariant).toEqual([
      'tabular-nums',
    ]);
  });
});

// ── Button variants emit different surfaces ──────────────────────────────────
describe('Button variant branch produces different output', () => {
  test('cta renders an SVG gradient fill layer', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(byName(root, 'Svg').length).toBeGreaterThanOrEqual(1);
  });

  test('ghost renders a CARD_HI surface with no gradient layer', () => {
    const {root} = render(<Button label="설정" variant="ghost" />);
    expect(byName(root, 'Svg')).toHaveLength(0);
    expect(pressableStyle(root).backgroundColor).toBe(CARD_HI);
  });

  test('cta surface is not the ghost CARD_HI surface', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(pressableStyle(root).backgroundColor).not.toBe(CARD_HI);
  });
});

// ── Button is the single CTA primitive (gradient/glow/radius unified) ─────────
// Resolve the Button's Pressable style under an arbitrary press state.
const pressableStyleAt = (
  root: ReactTestRenderer.ReactTestInstance,
  pressed: boolean,
) => {
  const node = root.find(
    (n: any) =>
      n &&
      n.props &&
      n.props.accessibilityRole === 'button' &&
      typeof n.props.style === 'function',
  );
  return StyleSheet.flatten(node.props.style({pressed}));
};

describe('Button — unified CTA surface (gradient · glow · radius token)', () => {
  test('cta gradient stops are the GRAD_TOP → GRAD_BOT theme token pair', () => {
    // Single source of truth: the orange fill comes from theme tokens, never a
    // hand-copied hex. A desync (or a screen re-introducing its own gradient)
    // would no longer match these tokens.
    const {root} = render(<Button label="시작" variant="cta" />);
    const stops = byName(root, 'Stop').map(s => s.props.stopColor);
    expect(stops).toContain(GRAD_TOP);
    expect(stops).toContain(GRAD_BOT);
  });

  test('cta carries an orange (ACCENT) glow shadow', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(pressableStyle(root).shadowColor).toBe(ACCENT);
  });

  test('cta corners use the single RADIUS.btn token (surface + gradient rect)', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(pressableStyle(root).borderRadius).toBe(RADIUS.btn);
    // The gradient Rect rounds itself to the same token (no overflow clip needed).
    const rects = byName(root, 'Rect');
    expect(rects.length).toBeGreaterThanOrEqual(1);
    expect(rects.some((r: any) => r.props.rx === RADIUS.btn)).toBe(true);
  });

  test('pressing a cta shrinks it (scale 0.97) — visible press feedback', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    const off = pressableStyleAt(root, false);
    const on = pressableStyleAt(root, true);
    expect(on).not.toEqual(off);
    expect(on.transform).toEqual([{scale: 0.97}]);
  });

  test('disabled cta drops the gradient and falls to the CARD_HI flat surface with a dimmed label', () => {
    const {root} = render(<Button label="브랜드를 선택하세요" disabled />);
    // No gradient layer when disabled.
    expect(byName(root, 'Svg')).toHaveLength(0);
    expect(pressableStyle(root).backgroundColor).toBe(CARD_HI);
    // Label is dimmed to the muted token (T3), not the bright T1.
    const label = root
      .findAllByType(Text)
      .find(t => t.props.children === '브랜드를 선택하세요')!;
    expect(StyleSheet.flatten(label.props.style).color).toBe(T3);
  });

  test('disabled cta does not fire onPress', () => {
    const onPress = jest.fn();
    const {root} = render(
      <Button label="대기" disabled onPress={onPress} />,
    );
    const node = root.find(
      (n: any) => n.props && n.props.accessibilityRole === 'button',
    );
    // onPress is gated to undefined while disabled (no-op even if invoked).
    expect(node.props.onPress).toBeUndefined();
    expect(node.props.accessibilityState).toEqual({disabled: true});
  });

  test('iconNode is rendered alongside the label (custom glyph passthrough)', () => {
    const {root} = render(
      <Button
        label="첫 러닝화 등록하기"
        iconNode={<View testID="cta-icon-node" />}
      />,
    );
    expect(
      root.findAll((n: any) => n.props && n.props.testID === 'cta-icon-node')
        .length,
    ).toBeGreaterThan(0);
  });
});

// ── TONE_BG stays a single source of truth with the colour tokens ────────────
describe('TONE_BG is derived from the colour tokens (no desync)', () => {
  test('good/warn/danger RGB channels match GOOD/WARN/DANGER hex exactly', () => {
    expect(rgbaChannels(TONE_BG.good)).toEqual(hexChannels(GOOD));
    expect(rgbaChannels(TONE_BG.warn)).toEqual(hexChannels(WARN));
    expect(rgbaChannels(TONE_BG.danger)).toEqual(hexChannels(DANGER));
  });
});
