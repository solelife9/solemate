/**
 * RunGoalScreen × SwipeBack 충돌 회귀 가드 — 전폭 가로 컨트롤(눈금 룰러, 스피드 km 칩)은
 * 반드시 SwipeBackExclude 로 감싼다. 감싸지 않으면 왼쪽 엣지 존(24pt)에서 시작한
 * 오른쪽 드래그(km 줄이기)를 엣지 스와이프 백이 가로채 화면이 뒤로 튕긴다(2026-07-04 버그).
 * @format
 */
import React from 'react';
import {ScrollView} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunGoalScreen from '../RunGoalScreen.rn';
import {SwipeBackExclude} from '../primitives';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r.root;
}

test('거리 룰러(가로 ScrollView)는 SwipeBackExclude 안에 있다', () => {
  const root = render(<RunGoalScreen />);
  const excludes = root.findAllByType(SwipeBackExclude);
  expect(excludes.length).toBeGreaterThan(0);
  const wrapped = excludes.some(ex =>
    ex.findAll(n => n.type === ScrollView && n.props.horizontal === true).length > 0,
  );
  expect(wrapped).toBe(true);
});

test('SwipeBackExclude 는 터치 시작/종료를 컨텍스트 ref 에 반영한다(양보 계약)', () => {
  // SwipeBack 내부 blockRef 는 비공개 — Exclude 가 터치 수명주기 핸들러를 실제로
  // 노출하는지(존재+호출 가능)만 계약으로 고정한다. 핸들러가 사라지면 양보가 깨진다.
  const root = render(<RunGoalScreen />);
  const ex = root.findAllByType(SwipeBackExclude)[0];
  const view = ex.findAll(n => typeof n.props.onTouchStart === 'function')[0];
  expect(view).toBeTruthy();
  act(() => { view.props.onTouchStart(); });
  act(() => { view.props.onTouchEnd(); });
  act(() => { view.props.onTouchCancel(); });
});
