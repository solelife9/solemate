/**
 * RunGoalScreen 목표 직접 입력(2026-07-04, 탭 키패드만 — 세로 스와이프·햅틱은
 * 사용자 결정으로 제거) — 행동 계약.
 *   1) 큰 숫자 탭 → 키패드 시트가 열린다.
 *   2) 키패드 입력 → 확인 → 목표(큰 숫자)가 그 값으로 갱신된다.
 *   3) 범위 밖 입력은 cfg 로 클램프된다(km 최대 42).
 *   4) 시간 모드에선 소수점 키가 비활성이다(정수만).
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunGoalScreen from '../RunGoalScreen.rn';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  // 기본 탭이 자유런(심사 #4)이라 큰 숫자·키패드가 없다 — 거리 탭으로 전환 후 검증.
  const root = r.root;
  const seg = root.findAll(n => n.props?.accessibilityLabel === '거리 목표' && typeof n.props?.onPress === 'function')[0];
  act(() => { seg.props.onPress(); });
  return root;
}
const byId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n?.props?.testID === id && typeof n.type === 'string');
const pressable = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.find((n: any) => n?.props?.testID === id && typeof n.props?.onPress === 'function');
const textOf = (node: any): string =>
  (node.findAll((n: any) => typeof n.type === 'string' && n.type === 'Text') as any[])
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' ');

test('큰 숫자 탭 → 키패드 → 21.1 입력·확인 → 목표가 21.1로 갱신', () => {
  const root = render(<RunGoalScreen />);
  act(() => pressable(root, 'goal-bignum').props.onPress());
  for (const k of ['2', '1', 'dot', '1']) act(() => pressable(root, `kp-${k}`).props.onPress());
  expect(textOf(byId(root, 'kp-value')[0])).toContain('21.1');
  act(() => pressable(root, 'kp-ok').props.onPress());
  expect(textOf(pressable(root, 'goal-bignum'))).toContain('21.1');
});

test('범위 밖(99) 입력은 km 최대 42로 클램프', () => {
  const root = render(<RunGoalScreen />);
  act(() => pressable(root, 'goal-bignum').props.onPress());
  for (const k of ['9', '9']) act(() => pressable(root, `kp-${k}`).props.onPress());
  act(() => pressable(root, 'kp-ok').props.onPress());
  expect(textOf(pressable(root, 'goal-bignum'))).toContain('42.0');
});

test('지우기(⌫)가 마지막 자리를 지운다', () => {
  const root = render(<RunGoalScreen />);
  act(() => pressable(root, 'goal-bignum').props.onPress());
  for (const k of ['1', '5']) act(() => pressable(root, `kp-${k}`).props.onPress());
  act(() => pressable(root, 'kp-del').props.onPress());
  expect(textOf(byId(root, 'kp-value')[0])).toContain('1');
  expect(textOf(byId(root, 'kp-value')[0])).not.toContain('15');
});

test('시간 모드에선 소수점 키가 비활성(정수만)', () => {
  const root = render(<RunGoalScreen />);
  // 모드 탭: SegmentedControl '시간 목표' 항목.
  const seg = root.find(
    (n: any) => n?.props?.accessibilityLabel === '시간 목표' && typeof n.props?.onPress === 'function',
  );
  act(() => seg.props.onPress());
  act(() => pressable(root, 'goal-bignum').props.onPress());
  const dot = root.find((n: any) => n?.props?.testID === 'kp-dot' && 'disabled' in (n.props || {}));
  expect(dot.props.disabled).toBe(true);
});
