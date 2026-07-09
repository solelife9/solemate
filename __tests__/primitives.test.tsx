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
  CARD_HI,
  RADIUS,
  T1,
  T3,
  GLASS,
  BRAND,
  withAlpha,
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

// ── KeegoWordmark — 소문자 'keego'·Helvetica Neue Medium·BRAND 파파야(2026-07-09 'B 서명+진행') ──
describe('KeegoWordmark', () => {
  test("renders the literal lowercase 'keego'", () => {
    const {root} = render(<KeegoWordmark />);
    const texts = byName(root, 'Text');
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(texts.map(t => t.props.children)).toContain('keego');
  });

  test('Helvetica Neue Medium + BRAND 파파야 — 그라데이션 없음(솔리드 서명)', () => {
    const {root} = render(<KeegoWordmark />);
    const t = byName(root, 'Text').find(n => n.props.children === 'keego')!;
    const st = Array.isArray(t.props.style) ? Object.assign({}, ...t.props.style.flat().filter(Boolean)) : t.props.style;
    expect(st.fontFamily).toBe('Helvetica Neue');
    expect(st.fontWeight).toBe('500');
    expect(st.color).toBe(BRAND);
    expect(byName(root, 'Stop').length).toBe(0); // 옛 그라데이션 폐기
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
// GlassEdge 는 onLayout 측정 후에만 Svg 를 그린다 — 테스트에서 레이아웃을 수동 발화한다.
const layoutGlassEdges = (root: ReactTestRenderer.ReactTestInstance, w = 240, h = 54) => {
  ReactTestRenderer.act(() => {
    root
      .findAll((n: any) => n.props && n.props.testID === 'glass-edge')
      .forEach((n: any) =>
        n.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: w, height: h}}}),
      );
  });
};

describe('Button variant branch produces different output', () => {
  test('cta renders a GlassEdge highlight layer', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(
      root.findAll((n: any) => n.props && n.props.testID === 'glass-edge').length,
    ).toBeGreaterThanOrEqual(1);
    layoutGlassEdges(root);
    expect(byName(root, 'Svg').length).toBeGreaterThanOrEqual(1);
  });

  test('ghost renders a CARD_HI surface with no glass layer', () => {
    const {root} = render(<Button label="설정" variant="ghost" />);
    expect(byName(root, 'Svg')).toHaveLength(0);
    expect(pressableStyle(root).backgroundColor).toBe(CARD_HI);
  });

  test('cta surface is the translucent glass, not the ghost CARD_HI surface', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(pressableStyle(root).backgroundColor).toBe(withAlpha(T1, 0.1));
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

describe('Button — unified CTA surface (glass · matte · radius token)', () => {
  test('cta glass edge is a corner-glint rim: TL keylight + BR reflection over a full hairline', () => {
    // 코너 글린트 계약(2026-07-09 확정 — 'B 대각 밸런스'): 전 둘레 헤어라인(edgeBase) 위에
    // 코너 4점 방사형 글린트 — 좌상 주광(edgeTL) > 우하 반사(edgeBR) > 우상/좌하(edgeTR/BL).
    // 위치투영 대각선 모델(넓은 버튼에서 좌우 변이 꺼지는 붕괴)은 폐지.
    const {root} = render(<Button label="시작" variant="cta" />);
    layoutGlassEdges(root);
    // 코너 방사형 글린트 = 주광(좌상)·반사(우하) 2점만 — 우상/좌하는 글린트 없음
    // (기기 피드백 2026-07-09: 빛에서 멀어질수록 자연 감쇠, 반대편 코너는 거의 안 보이게).
    const radials = byName(root, 'RadialGradient');
    expect(radials.length).toBe(2);
    const peakOf = (suffix: string) => {
      const g = radials.find((r: any) => String(r.props.id).endsWith(`-${suffix}`))!;
      const stops = g.props.children.filter((c: any) => c?.props?.stopColor === T1);
      return Math.max(...stops.map((c: any) => Number(c.props.stopOpacity)));
    };
    expect(peakOf('tl')).toBeCloseTo(GLASS.edgeTL); // 좌상 주광
    expect(peakOf('br')).toBeCloseTo(GLASS.edgeBR); // 우하 반사(대각 밸런스)
    expect(peakOf('tl')).toBeGreaterThan(peakOf('br')); // 주광 > 반사
    expect(GLASS.edgeTR).toBe(0); // 우상/좌하 글린트 폐지 계약
    expect(GLASS.edgeBL).toBe(0);
    // 전 둘레 헤어라인 — 거의 안 보이는 최소 존재감(0.02)으로만 유리 판을 잇는다.
    const hairline = byName(root, 'Rect').find(
      (r: any) => r.props.stroke === T1 && r.props.fill === 'none',
    )!;
    expect(Number(hairline.props.strokeOpacity)).toBeCloseTo(GLASS.edgeBase);
    expect(GLASS.edgeBase).toBeLessThanOrEqual(0.02);
  });

  test('cta is matte — no glow shadow of any colour', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(pressableStyle(root).shadowColor).toBeUndefined();
  });

  test('cta corners use the single RADIUS.btn token (surface + inset glass rects)', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    expect(pressableStyle(root).borderRadius).toBe(RADIUS.btn);
    // GlassEdge 스트로크들은 자기 굵기의 절반만큼 안쪽으로 들어가 스스로 둥글린다 —
    // rx 는 RADIUS.btn 이하(부모 모서리 밖으로 삐지지 않음), 0 초과여야 한다.
    layoutGlassEdges(root);
    const rects = byName(root, 'Rect');
    expect(rects.length).toBeGreaterThanOrEqual(2); // 블룸 + 코어 (4면 균일 라인 제거)
    rects.forEach((r: any) => {
      expect(r.props.rx).toBeGreaterThan(0);
      expect(r.props.rx).toBeLessThanOrEqual(RADIUS.btn);
    });
  });

  test('pressing a cta shrinks it (scale 0.97) — visible press feedback', () => {
    const {root} = render(<Button label="시작" variant="cta" />);
    const off = pressableStyleAt(root, false);
    const on = pressableStyleAt(root, true);
    expect(on).not.toEqual(off);
    expect(on.transform).toEqual([{scale: 0.97}]);
  });

  test('disabled cta drops the glass and falls to the CARD_HI flat surface with a dimmed label', () => {
    const {root} = render(<Button label="브랜드를 선택하세요" disabled />);
    // No glass layer when disabled.
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
