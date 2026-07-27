/**
 * 실내/야외 전환 계약 — 2026-07-27 민우님 B안 확정.
 *
 * 왜 탭이 아니라 별도 줄인가: 네 탭(거리·시간·스피드·트랙)은 전부 "무엇을 목표로 하나"를
 * 묻는데, 실내/야외는 "어디서 달리나"다. 축이 다르다. 같은 줄에 놓으면 '실내에서 5km' 를
 * 표현할 방법이 사라진다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunGoalScreen from '../RunGoalScreen.rn';

function render(onStart: (g: any) => void) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<RunGoalScreen onStart={onStart} onBack={() => {}} />);
  });
  return r;
}
const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n: any) => n.props?.testID === id);
const press = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  act(() => {
    byId(r, id)[0].props.onPress();
  });
const allText = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(() => true)
    .flatMap((n: any) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
    .filter((c: any) => typeof c === 'string' || typeof c === 'number')
    .map(String)
    .join(' ');

test('기본은 야외 — 지금까지 쓰던 사람에겐 아무것도 달라지지 않는다', () => {
  const onStart = jest.fn();
  const r = render(onStart);
  expect(byId(r, 'goal-env-outdoor').length).toBeGreaterThan(0);
  expect(byId(r, 'goal-indoor-hint')).toHaveLength(0);
});

test('실내를 고르면 목표에 indoor 가 실린다', () => {
  const onStart = jest.fn();
  const r = render(onStart);
  press(r, 'goal-env-indoor');
  const cta = r.root.findAll((n: any) => n.props?.accessibilityLabel === '러닝 시작');
  act(() => {
    cta[0].props.onPress();
  });
  expect(onStart).toHaveBeenCalled();
  expect(onStart.mock.calls[0][0].indoor).toBe(true);
});

test('실내를 고르면 무엇이 달라지는지 한 줄로 알린다', () => {
  const r = render(jest.fn());
  press(r, 'goal-env-indoor');
  expect(byId(r, 'goal-indoor-hint').length).toBeGreaterThan(0);
  expect(allText(r)).toContain('걸음으로 거리를 세요');
});

test('야외로 되돌리면 안내가 사라지고 indoor 가 false 다', () => {
  const onStart = jest.fn();
  const r = render(onStart);
  press(r, 'goal-env-indoor');
  press(r, 'goal-env-outdoor');
  expect(byId(r, 'goal-indoor-hint')).toHaveLength(0);
  const cta = r.root.findAll((n: any) => n.props?.accessibilityLabel === '러닝 시작');
  act(() => {
    cta[0].props.onPress();
  });
  expect(onStart.mock.calls[0][0].indoor).toBe(false);
});
