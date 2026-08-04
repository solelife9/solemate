/**
 * ProfileScreen Slice-3 시각 마감 행동 테스트.
 *
 * 관찰 가능한 결과를 검증한다:
 *   1) 이번 주 스트릭 — 달림 날 수만큼 체크 점이 렌더되고, streakDays>0이면 스트릭 칩 노출.
 *   2) 설정 행 구동 보존 — 단위 행 탭→onChangeUnit 호출.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen.rn';

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
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  return renderer.root;
}

function pressableWith(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  return hits[0];
}

// (이번 주 스트릭 계약은 홈 '이번 주 러닝' 원카드로 이관 — 2026-07-25 B안.
//  점 7칸·오늘 표시는 HomeScreen.week.test.tsx 가, '마이 탭에 없음' 회귀 가드는
//  ProfileScreen.challenge.test.tsx 가 담당한다.)

describe('ProfileScreen 설정 행 구동 보존', () => {
  test('단위 행을 누르면 onChangeUnit이 반대 단위로 호출된다', () => {
    const onChangeUnit = jest.fn();
    const root = render({unit: 'km', onChangeUnit});
    act(() => { root.findAll((n: any) => n.props?.accessibilityLabel === '설정 열기')[0]?.props?.onPress?.(); });
    act(() => {
      pressableWith(root, '단위').props.onPress();
    });
    expect(onChangeUnit).toHaveBeenCalledWith('mi');
  });
});
