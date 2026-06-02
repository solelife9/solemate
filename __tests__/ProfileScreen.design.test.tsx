/**
 * ProfileScreen Slice-3 시각 마감 행동 테스트.
 *
 * 토큰화만이 아니라 새로 추가/교체한 인터랙티브·시각 요소의 "관찰 가능한 결과"를
 * 검증한다(test_critic 요건):
 *   1) 주간 목표 링 — weeklyPercent/달성거리/목표거리를 화면에 노출하고, 미달이면
 *      'N km만 더 — 계속 달려요!' keep-going 카피, 100% 이상이면 '목표 달성' 축하 카피.
 *   2) 이번 주 스트릭 — 달림 날 수만큼 체크 점이 렌더되고, streakDays>0이면 스트릭 칩 노출.
 *   3) 설정 행 구동 보존 — 단위 행 탭→onChangeUnit, 목표 스테퍼 +→onChangeGoal 호출.
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

// 텍스트 needle을 품은 가장 작은(가장 구체적인) onPress 가능 노드.
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

describe('ProfileScreen 주간 목표 링 + keep-going 카피', () => {
  test('달성률·달성거리·목표거리를 노출하고 미달이면 남은 거리 격려 카피를 보여준다', () => {
    const root = render({goalWeeklyKm: 30, weeklyPercent: 82, weeklyDoneKm: 24.6, unit: 'km'});
    const card = root.find((n: any) => n.props?.testID === 'goal-ring-card');
    const t = textOf(card);
    expect(t).toContain('82%');
    expect(t).toContain('24.6');
    expect(t).toContain('30 km');

    const keep = textOf(root.find((n: any) => n.props?.testID === 'keep-going'));
    // 30 - 24.6 = 5.4km 남음
    expect(keep).toBe('5.4km만 더 — 계속 달려요!');
  });

  test('100% 이상이면 목표 달성 축하 카피로 바뀐다', () => {
    const root = render({goalWeeklyKm: 30, weeklyPercent: 120, weeklyDoneKm: 36, unit: 'km'});
    const keep = textOf(root.find((n: any) => n.props?.testID === 'keep-going'));
    expect(keep).toContain('목표 달성');
    expect(keep).not.toContain('계속 달려요');
  });
});

describe('ProfileScreen 이번 주 스트릭', () => {
  test('달림 날 수만큼 체크 점이 찍히고, 오늘 칸은 체크 없이 표시된다', () => {
    const week = [true, true, false, true, false, true, false]; // 4일 달림
    const root = render({weekDays: week, weekTodayIdx: 2, streakDays: 12});
    const card = root.find((n: any) => n.props?.testID === 'streak-card');
    // 체크 아이콘 = 달린 날 수와 일치
    const checks = card.findAll((n: any) => n && n.props && n.props.name === 'checkmark');
    expect(checks.length).toBe(4);
    // 오늘(idx 2, 미달림) 칸엔 체크가 없다
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
    act(() => {
      pressableWith(root, '단위').props.onPress();
    });
    expect(onChangeUnit).toHaveBeenCalledWith('mi');
  });

  test('목표 패널의 + 스테퍼를 누르면 onChangeGoal이 증가된 거리로 호출된다', () => {
    const onChangeGoal = jest.fn();
    const root = render({goalWeeklyKm: 30, weeklyPercent: 50, unit: 'km', onChangeGoal});
    // 목표 설정 행을 눌러 패널(스테퍼) 펼침
    act(() => {
      pressableWith(root, '목표 설정').props.onPress();
    });
    // 패널 안의 '+'(add 아이콘만 품고 remove는 없는) Pressable
    const plus = root
      .findAll(
        (n: any) =>
          n &&
          n.props &&
          typeof n.props.onPress === 'function' &&
          iconNames(n).includes('add') &&
          !iconNames(n).includes('remove'),
      )
      .sort((a, b) => textOf(a).length - textOf(b).length)[0];
    act(() => {
      plus.props.onPress();
    });
    expect(onChangeGoal).toHaveBeenCalledTimes(1);
    expect(onChangeGoal.mock.calls[0][0]).toBeGreaterThan(30);
  });
});
