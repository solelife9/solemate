/**
 * WeeklyGoalStepper — 주간 목표 스테퍼(홈 '이번 주 러닝' 히어로 탭 시트의 본문).
 *
 * 마이 탭 '주간 목표 카드'는 홈 B안(2026-07-25 민우님 확정)으로 폐지됐고, 이 스테퍼만
 * 시트가 재사용한다. 값의 영속은 App(changeGoal) 소유 — 여기선 표시·위임 계약만 본다:
 *   1) 현재 목표를 큰 숫자로 보여준다.
 *   2) ＋/− 는 ±1km 로 위임한다(영속 금지).
 *   3) 0 = '목표 없음' 상태 — 1km 에서 −면 목표 없음, 목표 없음에서 ＋면 기본 목표부터.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {WeeklyGoalStepper} from '../ChallengesSection';
import {DEFAULT_SETTINGS} from '../lib/settings';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(props: any) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<WeeklyGoalStepper {...props} />);
  });
  return renderer.root;
}

function byId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id);
}

function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.find(
    (n: any) => n?.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
  );
}

describe('WeeklyGoalStepper 표시', () => {
  test('현재 목표를 숫자 + 단위로 보여준다', () => {
    const root = render({valueKm: 30, onChange: jest.fn()});
    expect(textOf(byId(root, 'weekly-goal-value')[0])).toContain('30');
    expect(textOf(byId(root, 'weekly-goal-value')[0])).toContain('km');
    expect(byId(root, 'weekly-goal-none').length).toBe(0);
  });

  test('mi 단위면 단위 표기가 따라간다', () => {
    const root = render({valueKm: 30, unit: 'mi', onChange: jest.fn()});
    expect(textOf(byId(root, 'weekly-goal-value')[0])).toContain('mi');
  });

  test('0 이면 숫자 자리에 조용한 "목표 없음"', () => {
    const root = render({valueKm: 0, onChange: jest.fn()});
    expect(byId(root, 'weekly-goal-value').length).toBe(0);
    expect(textOf(byId(root, 'weekly-goal-none')[0])).toContain('목표 없음');
  });
});

describe('WeeklyGoalStepper 위임', () => {
  test('＋/− 는 ±1km 로 onChange 를 부른다(영속은 App 소유)', () => {
    const onChange = jest.fn();
    const root = render({valueKm: 30, onChange});
    act(() => pressByLabel(root, '목표 거리 늘리기').props.onPress());
    expect(onChange).toHaveBeenCalledWith(31);
    act(() => pressByLabel(root, '목표 거리 줄이기').props.onPress());
    expect(onChange).toHaveBeenCalledWith(29);
  });

  test('1km 에서 − 면 목표 없음(0) — 음수로는 못 내려간다', () => {
    const onChange = jest.fn();
    const root = render({valueKm: 1, onChange});
    act(() => pressByLabel(root, '목표 거리 줄이기').props.onPress());
    expect(onChange).toHaveBeenCalledWith(0);

    onChange.mockClear();
    const zero = render({valueKm: 0, onChange});
    act(() => pressByLabel(zero, '목표 거리 줄이기').props.onPress());
    expect(onChange).toHaveBeenCalledWith(0);
  });

  test('목표 없음에서 ＋ 면 기본 목표부터 시작한다(0→1 반복 탭 강요 금지)', () => {
    const onChange = jest.fn();
    const root = render({valueKm: 0, onChange});
    act(() => pressByLabel(root, '목표 거리 늘리기').props.onPress());
    expect(onChange).toHaveBeenCalledWith(DEFAULT_SETTINGS.goalWeeklyKm);
  });
});
