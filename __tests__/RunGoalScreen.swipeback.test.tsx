/**
 * RunGoalScreen × SwipeBack 계약 — 재구성(2026-07-25) 이후:
 *   1) 거리/시간 탭의 눈금 룰러는 폐기됐다(중복 입력 제거) — 가로 ScrollView 부재 회귀 가드.
 *      빠른 선택=프리셋 칩, 정밀=히어로 탭 키패드가 담당한다.
 *   2) 남은 전폭 가로 컨트롤(스피드 탭 km별 칩 스크롤 — 접힘 펼침 안)은 여전히
 *      SwipeBackExclude 로 감싼다. 감싸지 않으면 왼쪽 엣지 존(24pt)에서 시작한
 *      오른쪽 드래그를 엣지 스와이프 백이 가로채 화면이 뒤로 튕긴다(2026-07-04 버그).
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
const pressLabel = (root: ReactTestRenderer.ReactTestInstance, label: string) => {
  const hit = root.findAll(n => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  act(() => { hit.props.onPress(); });
};
const pressTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) => {
  const hit = root.findAll((n: any) => n?.props?.testID === id && typeof n.props?.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable testID "${id}"`);
  act(() => { hit.props.onPress(); });
};

test('거리/시간 탭에 가로 ScrollView(눈금 룰러)가 없다 — 룰러 폐기 회귀 가드', () => {
  const root = render(<RunGoalScreen />);
  pressLabel(root, '거리 목표');
  expect(root.findAll(n => n.type === ScrollView && n.props.horizontal === true)).toHaveLength(0);
  pressLabel(root, '시간 목표');
  expect(root.findAll(n => n.type === ScrollView && n.props.horizontal === true)).toHaveLength(0);
});

test('스피드 탭 km별 칩 스크롤(접힘 펼침)은 SwipeBackExclude 안에 있다', () => {
  const root = render(<RunGoalScreen />);
  pressLabel(root, '스피드 목표');
  pressTestID(root, 'goal-perkm-row'); // 접힘 펼침 → km별 칩 가로 스크롤 등장
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
  pressLabel(root, '스피드 목표');
  pressTestID(root, 'goal-perkm-row');
  const ex = root.findAllByType(SwipeBackExclude)[0];
  const view = ex.findAll(n => typeof n.props.onTouchStart === 'function')[0];
  expect(view).toBeTruthy();
  act(() => { view.props.onTouchStart(); });
  act(() => { view.props.onTouchEnd(); });
  act(() => { view.props.onTouchCancel(); });
});
