/**
 * SpeedPlanPanel — 스피드(페이스 플랜) 입력 패널.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import SpeedPlanPanel from '../SpeedPlanPanel';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
function press(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hit = root.findAll((n: any) => n?.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  act(() => { hit.props.onPress(); });
}
function pressTestID(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  const hit = root.findAll((n: any) => n?.props?.testID === testID && typeof n.props.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable testID "${testID}"`);
  act(() => { hit.props.onPress(); });
}

describe('SpeedPlanPanel — 페이스 플랜 입력', () => {
  test('마운트 시 거리(기본 5km)와 5칸 플랜을 onChange 로 올린다', () => {
    const onChange = jest.fn();
    render(<SpeedPlanPanel onChange={onChange} />);
    expect(onChange).toHaveBeenCalled();
    const [km, plan] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(km).toBe(5);
    expect(plan.length).toBe(5);
  });

  test('거리를 늘리면 플랜 칸 수가 따라 늘어난다', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    press(root, '거리 1킬로미터 늘리기'); // 5 → 6km
    const [km, plan] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(km).toBe(6);
    expect(plan.length).toBe(6);
  });

  test('km칸 직접 미세조정 → 그 구간만 5초 느려진다(custom)', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    const before = onChange.mock.calls[onChange.mock.calls.length - 1][1].slice();
    // 3km 칸 선택(selIdx=2) 후 '느리게(+5초)'
    pressTestID(root, 'plan-km-3');
    press(root, '3킬로미터 목표 5초 느리게');
    const after = onChange.mock.calls[onChange.mock.calls.length - 1][1];
    expect(after[2]).toBe(before[2] + 5);      // 3구간만 +5초
    expect(after[0]).toBe(before[0]);          // 다른 구간 불변
  });
});
