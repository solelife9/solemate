/**
 * primitives.segstat.test.tsx — behavioural tests for the design-system
 * consolidation primitives: SegmentedControl and StatGrid/Stat.
 *
 * These assert OBSERVABLE render output (real react-test-renderer trees), not
 * source strings:
 *   • SegmentedControl renders one Pressable per item, drives onChange with the
 *     pressed item's key, marks exactly the selected item, and renders the single
 *     pill grammar (2026-07-25 필 수렴 — variant 4종 폐지): selected chip =
 *     white-12% glass + white-22% hairline, sizes md/sm keep an effective 44pt
 *     touch target via vertical hitSlop. block toggles flex(hug) vs flex:1(equal).
 *   • Stat lays value/unit/label out as separate nodes (unit nested in the value
 *     Text, never a single concatenated string), uses DISPLAY + tabular-nums +
 *     the NUMERIC ramp for the value, and StatGrid applies dividers (all but
 *     first) and column widths.
 * @format
 */
import React from 'react';
import {Text, View, StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {SegmentedControl, StatGrid, Stat} from '../primitives';
import {T1, T3, DISPLAY, SEP, withAlpha, NUMERIC, TYPE, CARD, CARD_BORDER, RADIUS} from '../theme';

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

  test('pill grammar: selected chip = white-12% glass + white-22% hairline, container = CARD pill + CARD_BORDER', () => {
    const {root} = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} />,
    );
    // 선택 칩 — 필 단일 문법(2026-07-25 수렴, variant 4종 폐지).
    const on = flatStyle(pressableByLabel(root, '하나'));
    expect(on.backgroundColor).toBe(withAlpha(T1, 0.12));
    expect(on.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(on.borderColor).toBe(withAlpha(T1, 0.22));
    expect(on.borderRadius).toBe(RADIUS.pill);
    // 비선택 항목은 채움/보더 없음.
    const off = flatStyle(pressableByLabel(root, '둘'));
    expect(off.backgroundColor).toBeUndefined();
    expect(off.borderWidth).toBeUndefined();
    // 컨테이너 = CARD 필 + CARD_BORDER 헤어라인(1px).
    const container = root.findAll((n: any) => {
      const f = StyleSheet.flatten(n.props?.style) as any;
      return !!f && f.flexDirection === 'row' && f.backgroundColor === CARD;
    })[0];
    const cf = StyleSheet.flatten(container.props.style) as any;
    expect(cf.borderColor).toBe(CARD_BORDER);
    expect(cf.borderWidth).toBe(1);
    expect(cf.borderRadius).toBe(RADIUS.pill);
  });

  test('sizes keep an effective 44pt touch target: md 38 + 3·2 hitSlop, sm 32 + 6·2 hitSlop', () => {
    const md = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} />,
    ).root;
    const mdItem = pressableByLabel(md, '하나');
    expect(flatStyle(mdItem).height).toBe(38);
    expect(flatStyle(mdItem).fontSize).toBeUndefined();
    expect(mdItem.props.hitSlop).toEqual({top: 3, bottom: 3});
    expect(38 + 3 * 2).toBeGreaterThanOrEqual(44);

    const sm = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} size="sm" />,
    ).root;
    const smItem = pressableByLabel(sm, '하나');
    expect(flatStyle(smItem).height).toBe(32);
    expect(smItem.props.hitSlop).toEqual({top: 6, bottom: 6});
    expect(32 + 6 * 2).toBeGreaterThanOrEqual(44);
  });

  test('label type ramps with size (md 15 / sm 14); off = T3·500, on = T1·700', () => {
    const textStyleOf = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
      StyleSheet.flatten(
        root.findAllByType(Text).find(t => t.props.children === label)!.props.style,
      ) as any;
    const md = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} />,
    ).root;
    const mdOn = textStyleOf(md, '하나');
    const mdOff = textStyleOf(md, '둘');
    expect(mdOn.fontSize).toBe(15);
    expect(mdOn.color).toBe(T1);
    expect(mdOn.fontWeight).toBe('700');
    expect(mdOff.color).toBe(T3);
    expect(mdOff.fontWeight).toBe('500');

    const sm = render(
      <SegmentedControl items={ITEMS} value="a" onChange={() => {}} size="sm" />,
    ).root;
    expect(textStyleOf(sm, '하나').fontSize).toBe(14);
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

  test("the value uses the DISPLAY face + tabular-nums at the NUMERIC ramp step", () => {
    const {root} = render(<Stat value="12" unit="km" label="거리" size="md" />);
    const valueNode = root
      .findAllByType(Text)
      .find(t => {
        const st = StyleSheet.flatten(t.props.style) as any;
        return st && st.fontFamily === DISPLAY;
      })!;
    const st = StyleSheet.flatten(valueNode.props.style) as any;
    expect(st.fontVariant).toEqual(['tabular-nums']);
    expect(st.fontSize).toBe(NUMERIC.md.fontSize);
    expect(st.fontWeight).toBe('700');
    expect(st.letterSpacing).toBe(NUMERIC.md.letterSpacing);
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

// ── NUMERIC 단일 램프 계약 (2026-07-25 수렴 — 탈출구 prop 회수 회귀 가드) ────────
// 과거 valueSize/valueWeight/valueLS/unitSize/… prop 10개가 사이트별 픽셀 복원을
// 허용해 표기 3벌이 사실상 유지되던 것을 회수했다. 이제 값 = NUMERIC[size](700 고정·
// 음수 자간), 단위 = 13/600 T3 고정, 라벨 = TYPE.caption T3 mt4 고정을 단언한다.
describe('Stat / StatGrid — NUMERIC ramp contract', () => {
  // unit Text 는 value Text 안에 중첩되며 children 이 단일 문자열(단위 텍스트).
  // label Text 는 셀 최상위에서 children 이 라벨 문자열.
  const textByString = (root: ReactTestRenderer.ReactTestInstance, s: string) =>
    StyleSheet.flatten(
      root.findAllByType(Text).find(t => t.props.children === s)!.props.style,
    ) as any;

  // FONT===DISPLAY(단일 패밀리)라 값 노드는 tabular-nums(값 전용)로 식별한다.
  const valueStyle = (root: ReactTestRenderer.ReactTestInstance) => {
    const node = root.findAllByType(Text).find(t => {
      const st = StyleSheet.flatten(t.props.style) as any;
      return st && Array.isArray(st.fontVariant) && st.fontVariant.includes('tabular-nums');
    })!;
    return StyleSheet.flatten(node.props.style) as any;
  };

  test('value follows the NUMERIC ramp: sm 20/-0.4, md 24/-0.5, lg 30/-0.5 — weight 700 everywhere', () => {
    (['sm', 'md', 'lg'] as const).forEach(size => {
      const {root} = render(<Stat value="42" unit="km" label="총 거리" size={size} />);
      const st = valueStyle(root);
      expect(st.fontSize).toBe(NUMERIC[size].fontSize);
      expect(st.fontWeight).toBe('700');
      expect(st.letterSpacing).toBe(NUMERIC[size].letterSpacing);
      expect(st.fontVariant).toEqual(['tabular-nums']);
    });
    expect(NUMERIC.sm.fontSize).toBe(20);
    expect(NUMERIC.md.fontSize).toBe(24);
    expect(NUMERIC.lg.fontSize).toBe(30);
  });

  test('unit is fixed at 13/600 T3 regardless of size (no per-site escape hatch)', () => {
    (['sm', 'lg'] as const).forEach(size => {
      const {root} = render(<Stat value="42" unit="km" label="총 거리" size={size} />);
      const unit = textByString(root, 'km');
      expect(unit.fontSize).toBe(13);
      expect(unit.fontWeight).toBe('600');
      expect(unit.color).toBe(T3);
    });
  });

  test('label is fixed at TYPE.caption T3 with mt4', () => {
    const {root} = render(
      <StatGrid size="md" items={[{value: '120', unit: 'km', label: '총 거리', testID: 'pr0'}]} />,
    );
    const label = textByString(root, '총 거리');
    expect(label.fontSize).toBe(TYPE.caption.fontSize);
    expect(label.fontWeight).toBe(TYPE.caption.fontWeight);
    expect(label.color).toBe(T3);
    expect(label.marginTop).toBe(4);
  });

  test('StatGrid passes its size down to every cell', () => {
    const {root} = render(
      <StatGrid
        size="sm"
        items={[
          {value: '1', label: 'a', testID: 's0'},
          {value: '2', label: 'b', testID: 's1'},
        ]}
      />,
    );
    // FONT===DISPLAY(단일 패밀리)라 폰트로는 값/라벨 구분 불가 — 값 전용 tabular-nums 로 거른다.
    const values = root.findAllByType(Text).filter(t => {
      const st = StyleSheet.flatten(t.props.style) as any;
      return st && Array.isArray(st.fontVariant) && st.fontVariant.includes('tabular-nums');
    });
    // lib/text 래퍼 때문에 composite+host 노드가 함께 잡힌다(셀 2개 ≥ 노드 2개).
    expect(values.length).toBeGreaterThanOrEqual(2);
    values.forEach(v => {
      expect((StyleSheet.flatten(v.props.style) as any).fontSize).toBe(NUMERIC.sm.fontSize);
    });
  });
});
