/**
 * 회귀 가드: 각 메인 화면이 하단 독에서 "자기" 탭을 활성(selected)으로 표시하는지 검증한다.
 * 탭 순서는 홈·신발·기록·마이(index 0·1·2·3). 화면을 리스킨/덮어쓸 때 TabBar 의 active
 * 인덱스가 어긋나면(예: 신발 화면인데 기록 탭이 하이라이트되는 버그) 여기서 잡는다.
 * (행동 테스트는 콘텐츠·네비게이션만 보므로 이 하이라이트 정합은 별도로 가드해야 한다.)
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import ShoesScreen from '../ShoesScreen.rn';
import HistoryScreen from '../HistoryScreen.rn';
import ProfileScreen from '../ProfileScreen.rn';

function render(el: React.ReactElement): ReactTestRenderer.ReactTestInstance {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r.root;
}

function selectedTab(root: ReactTestRenderer.ReactTestInstance): string | undefined {
  const sel = root.findAll(
    (n: any) => n?.props?.accessibilityRole === 'tab' && n.props.accessibilityState?.selected === true,
  );
  return sel.length ? sel[0].props.accessibilityLabel : undefined;
}

test('홈 화면은 홈 탭을 활성으로 표시한다', () => {
  expect(selectedTab(render(<HomeScreen shoes={[]} onSelect={() => {}} />))).toBe('홈');
});

test('신발 화면은 신발 탭을 활성으로 표시한다', () => {
  expect(selectedTab(render(<ShoesScreen shoes={[]} runs={[]} />))).toBe('신발');
});

test('기록 화면은 기록 탭을 활성으로 표시한다', () => {
  expect(selectedTab(render(<HistoryScreen runs={[]} unit="km" />))).toBe('기록');
});

test('마이(프로필) 화면은 마이 탭을 활성으로 표시한다', () => {
  expect(selectedTab(render(<ProfileScreen />))).toBe('마이');
});
