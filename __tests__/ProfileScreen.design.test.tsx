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
    if (typeof n === 'string') return void (out += n);
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

function iconNames(node: ReactTestRenderer.ReactTestInstance): string[] {
  return node.findAll((n: any) => n && n.props && typeof n.props.name === 'string').map((n: any) => n.props.name);
}

describe('ProfileScreen 이번 주 스트릭', () => {
  test('달림 날 수만큼 체크 점이 찍히고, 오늘 칸은 체크 없이 표시된다', () => {
    const week = [true, true, false, true, false, true, false]; // 4일 달림
    const root = render({weekDays: week, weekTodayIdx: 2, streakDays: 12});
    const card = root.find((n: any) => n.props?.testID === 'streak-card');
    const checks = card.findAll((n: any) => n && n.props && n.props.name === 'checkmark');
    expect(checks.length).toBe(4);
    const today = root.find((n: any) => n.props?.testID === 'streak-day-2');
    expect(iconNames(today)).not.toContain('checkmark');
  });

  test('streakDays>0이면 스트릭 칩과 카운트를 노출한다', () => {
    const root = render({streakDays: 12, weekDays: [true]});
    expect(textOf(root.find((n: any) => n.props?.testID === 'streak-pill'))).toContain('12일 연속');
    expect(textOf(root.find((n: any) => n.props?.testID === 'streak-card'))).toContain('🔥 12일');
  });

  test('streakDays=0이면 스트릭 칩을 숨긴다', () => {
    const root = render({streakDays: 0});
    expect(root.findAll((n: any) => n.props?.testID === 'streak-pill').length).toBe(0);
  });
});

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
