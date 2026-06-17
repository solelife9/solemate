/**
 * primitives.segstat.test.tsx — behavioural tests for the design-system
 * consolidation primitives: SegmentedControl and StatGrid/Stat.
 *
 * These assert OBSERVABLE render output (real react-test-renderer trees), not
 * source strings:
 *   • SegmentedControl renders one Pressable per item, drives onChange with the
 *     pressed item's key, marks exactly the selected item, and its variant
 *     selects a distinct selection surface (the four tab-strips it replaced map
 *     1:1 onto the four variants). block toggles flex(hug) vs flex:1(equal).
 *   • Stat lays value/unit/label out as separate nodes (unit nested in the value
 *     Text, never a single concatenated string), uses DISPLAY + tabular-nums for
 *     the value, and StatGrid applies dividers (all but first) and column widths.
 * @format
 */
import React from 'react';
import {Text, View, StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {SegmentedControl, StatGrid, Stat} from '../primitives';
import {ACCENT, T1, DISPLAY, SEP, withAlpha} from '../theme';

function render(el: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

// Resolve a Pressable's (function) style under an unpressed state.
const flatStyle = (node: any) =>
  StyleSheet.flatten(
    typeof node.props.style === 'function'
      ? node.props.style({pressed: false})
      : node.props.style,
  );

const pressableByLabel = (
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) =>
  root.find(
    (n: any) =>
      n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );

const ITEMS = [
  {key: 'a', label: '하나'},
  {key: 'b', label: '둘'},
  {key: 'c', label: '셋'},
];

describe('SegmentedControl — selection behaviour', () => {
  test('renders one pressable per item with the item label as text', () => {
    const {root} = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} />,
    );
    const labels = ['하나', '둘', '셋'].map(l => pressableByLabel(root, l));
    expect(labels.every(Boolean)).toBe(true);
    // Each pressable renders exactly its label text.
    expect(
      root.findAllByType(Text).map(t => t.props.children),
    ).toEqual(expect.arrayContaining(['하나', '둘', '셋']));
  });

  test('pressing a non-selected item calls onChange with that item key', () => {
    const onChange = jest.fn();
    const {root} = render(
      <SegmentedControl items={ITEMS} value="a" onChange={onChange} />,
    );
    ReactTestRenderer.act(() => {
      pressableByLabel(root, '둘').props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  test('exactly the selected item carries accessibilityState.selected=true', () => {
    const {root} = render(
      <SegmentedControl items={ITEMS} value="b" onChange={() => {}} />,
    );
    expect(pressableByLabel(root, '하나').props.accessibilityState).toEqual({selected: false});
    expect(pressableByLabel(root, '둘').props.accessibilityState).toEqual({selected: true});
    expect(pressableByLabel(root, '셋').props.accessibilityState).toEqual({selected: false});
  });

  test('variant changes the selected surface: accentSolid fills ACCENT, neutral fills white-9%', () => {
    const solid = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} variant="accentSolid" />,
    ).root;
    expect(flatStyle(pressableByLabel(solid, '하나')).backgroundColor).toBe(ACCENT);

    const neutral = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} variant="neutral" />,
    ).root;
    expect(flatStyle(pressableByLabel(neutral, '하나')).backgroundColor).toBe(
      withAlpha(T1, 0.09),
    );
    // A non-selected neutral item has no selection fill.
    expect(flatStyle(pressableByLabel(neutral, '둘')).backgroundColor).toBeUndefined();
  });

  test('block=true items stretch (flex:1); block=false items hug (no flex)', () => {
    const blocked = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} block />,
    ).root;
    expect(flatStyle(pressableByLabel(blocked, '둘')).flex).toBe(1);

    const hug = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} block={false} />,
    ).root;
    expect(flatStyle(pressableByLabel(hug, '둘')).flex).toBeUndefined();
  });

  test('role, labelFor and testIDFor are wired through to each item', () => {
    const {root} = render(
      <SegmentedControl
        items={ITEMS}
        value="a"
        onChange={() => {}}
        role="tab"
        labelFor={it => `${it.label} 탭`}
        testIDFor={it => `seg-${it.key}`}
      />,
    );
    const tab = root.find(
      (n: any) => n && n.props && n.props.testID === 'seg-b' && typeof n.props.onPress === 'function',
    );
    expect(tab.props.accessibilityRole).toBe('tab');
    expect(tab.props.accessibilityLabel).toBe('둘 탭');
  });
});

describe('Stat / StatGrid — stat cell composition', () => {
  test('Stat renders value, unit and label as distinct nodes (unit never concatenated)', () => {
    const {root} = render(<Stat value="12" unit="km" label="거리" />);
    const texts = root.findAllByType(Text).map(t => t.props.children);
    // value Text holds ['12', <unit Text>]; unit Text holds 'km'; label Text holds '거리'.
    expect(texts).toContainEqual(expect.arrayContaining(['12']));
    expect(texts).toContain('km');
    expect(texts).toContain('거리');
    expect(texts).not.toContain('12km');
  });

  test("the value uses the DISPLAY face + tabular-nums at the requested size", () => {
    const {root} = render(<Stat value="12" unit="km" label="거리" valueSize={26} />);
    const valueNode = root
      .findAllByType(Text)
      .find(t => {
        const st = StyleSheet.flatten(t.props.style) as any;
        return st && st.fontFamily === DISPLAY;
      })!;
    const st = StyleSheet.flatten(valueNode.props.style) as any;
    expect(st.fontVariant).toEqual(['tabular-nums']);
    expect(st.fontSize).toBe(26);
  });

  test('label is omitted entirely when not provided', () => {
    const {root} = render(<Stat value="9" />);
    const texts = root.findAllByType(Text);
    // Only the value node (no label/unit node).
    expect(texts).toHaveLength(1);
  });

  test('StatGrid divider draws a left hairline on every cell but the first', () => {
    const {root} = render(
      <StatGrid
        divider
        items={[
          {value: '1', label: 'a', testID: 'cell-0'},
          {value: '2', label: 'b', testID: 'cell-1'},
          {value: '3', label: 'c', testID: 'cell-2'},
        ]}
      />,
    );
    // RN's View yields both a composite and a host node per testID in this jest
    // preset; select the host (string type) node, which carries the resolved style.
    const cell = (id: string) => {
      const hosts = root.findAll(
        (n: any) => n.props?.testID === id && typeof n.type === 'string',
      );
      return StyleSheet.flatten(hosts[hosts.length - 1].props.style) as any;
    };
    expect(cell('cell-0').borderLeftWidth).toBeFalsy();
    expect(cell('cell-1').borderLeftWidth).toBe(StyleSheet.hairlineWidth);
    expect(cell('cell-1').borderLeftColor).toBe(SEP);
    expect(cell('cell-2').borderLeftWidth).toBe(StyleSheet.hairlineWidth);
  });

  test('StatGrid columns lays cells out at 100/columns% width (2×3 wrap grid)', () => {
    const {root} = render(
      <StatGrid
        columns={3}
        align="left"
        items={[
          {value: '1', label: 'a', testID: 'g0'},
          {value: '2', label: 'b', testID: 'g1'},
        ]}
      />,
    );
    const w = (id: string) => {
      const hosts = root.findAll(
        (n: any) => n.props?.testID === id && typeof n.type === 'string',
      );
      return (StyleSheet.flatten(hosts[hosts.length - 1].props.style) as any).width;
    };
    expect(w('g0')).toBe(`${100 / 3}%`);
    expect(w('g1')).toBe(`${100 / 3}%`);
  });

  test('StatGrid renders an optional top node above the value (e.g. PR icon)', () => {
    const {root} = render(
      <StatGrid
        items={[
          {value: '5', label: '최장', top: <View testID="stat-top" />, testID: 'gt'},
        ]}
      />,
    );
    expect(root.findAll((n: any) => n.props?.testID === 'stat-top').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Per-site unit/label typography fidelity (시각 동등 회귀 가드) ───────────────
// StatGrid 초기 통합은 value 타입만 파라미터화하고 unit/label 을 Profile 값(12/600,
// 11.5/600)으로 하드코딩해 다른 두 사이트(러닝 상세·진척)에서 픽셀이 어긋났다.
// 아래 테스트는 각 사이트가 호출부에 넘기는 unit/label fontSize·fontWeight·marginTop·
// 셀 paddingVertical 이 마이그레이션 전 원본 StyleSheet 값과 정확히 일치함을 단언한다.
describe('Stat / StatGrid — per-site unit & label typography', () => {
  // unit Text 는 value Text 안에 중첩되며 children 이 단일 문자열(단위 텍스트).
  // label Text 는 셀 최상위에서 children 이 라벨 문자열.
  const textByString = (root: ReactTestRenderer.ReactTestInstance, s: string) =>
    StyleSheet.flatten(
      root.findAllByType(Text).find(t => t.props.children === s)!.props.style,
    ) as any;

  const cellHostStyle = (root: ReactTestRenderer.ReactTestInstance, id: string) => {
    const hosts = root.findAll(
      (n: any) => n.props?.testID === id && typeof n.type === 'string',
    );
    return StyleSheet.flatten(hosts[hosts.length - 1].props.style) as any;
  };

  test('Profile (defaults): unit 12/600, label 11.5/600 mt4, no extra cell padding', () => {
    const {root} = render(
      <Stat value="42" unit="km" label="총 거리" valueSize={26} testID="p" />,
    );
    const unit = textByString(root, 'km');
    expect(unit.fontSize).toBe(12);
    expect(unit.fontWeight).toBe('600');
    const label = textByString(root, '총 거리');
    expect(label.fontSize).toBe(11.5);
    expect(label.fontWeight).toBe('600');
    expect(label.marginTop).toBe(4);
    expect(cellHostStyle(root, 'p').paddingVertical).toBeFalsy();
  });

  test('History RunDetail 2×3: unit 11.5/500, label 11.5/normal mt4, cell paddingVertical 6', () => {
    const {root} = render(
      <StatGrid
        columns={3}
        align="left"
        unitSize={11.5}
        unitWeight="500"
        labelSize={11.5}
        labelWeight="normal"
        labelMarginTop={4}
        verticalPadding={6}
        items={[{value: '8', unit: ' km', label: '거리', testID: 'h0'}]}
      />,
    );
    const unit = textByString(root, ' km');
    expect(unit.fontSize).toBe(11.5);
    expect(unit.fontWeight).toBe('500');
    const label = textByString(root, '거리');
    expect(label.fontSize).toBe(11.5);
    expect(label.fontWeight).toBe('normal');
    expect(label.marginTop).toBe(4);
    expect(cellHostStyle(root, 'h0').paddingVertical).toBe(6);
  });

  test('Progression stat-row: unit 11/700, label 11/600 mt5', () => {
    const {root} = render(
      <StatGrid
        valueSize={19}
        valueWeight="800"
        valueLS={-0.4}
        unitSize={11}
        unitWeight="700"
        labelSize={11}
        labelWeight="600"
        labelMarginTop={5}
        items={[{value: '120', unit: 'km', label: '총 거리', testID: 'pr0'}]}
      />,
    );
    const unit = textByString(root, 'km');
    expect(unit.fontSize).toBe(11);
    expect(unit.fontWeight).toBe('700');
    const label = textByString(root, '총 거리');
    expect(label.fontSize).toBe(11);
    expect(label.fontWeight).toBe('600');
    expect(label.marginTop).toBe(5);
  });
});
