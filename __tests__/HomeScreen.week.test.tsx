/**
 * HomeScreen.rn.tsx — '이번 주 러닝' 요약 카드(현재 상태 대체) 행동 테스트.
 *
 * App 이 이번 주(월~일) 런에서 파생한 WeekStats(km/runs/pace)를 week prop 으로 주입하면
 * 홈 히어로 아래 카드가 거리·횟수·평균 페이스를 그대로 렌더한다. 런이 없으면 0/0/— 폴백.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import type {Shoe} from '../theme';

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

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r.root;
}

const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);

const SHOE: Shoe = {id: 's1', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 500, condition: '양호'};

describe('HomeScreen 이번 주 러닝 카드', () => {
  test('주입한 week(거리/횟수/평균 페이스)를 카드에 그대로 렌더한다', () => {
    const root = render(
      <HomeScreen
        shoes={[SHOE]}
        activeIdx={0}
        onSelect={jest.fn()}
        week={{km: '23.5', runs: 4, pace: "5'42\""}}
      />,
    );
    expect(byTestID(root, 'home-week').length).toBeGreaterThanOrEqual(1);
    expect(textOf(byTestID(root, 'home-week-km')[0])).toBe('23.5');
    expect(textOf(byTestID(root, 'home-week-runs')[0])).toBe('4');
    expect(textOf(byTestID(root, 'home-week-pace')[0])).toBe("5'42\"");
  });

  test('주간 목표 + 스트릭이 주어지면 목표 진행(%)·연속 칩을 보여준다(P1 #7)', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '15.0', runs: 3, pace: "5'40\""}} weeklyGoalKm={30} streakDays={5} />,
    );
    expect(byTestID(root, 'home-week-streak').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'home-week-goal').length).toBeGreaterThanOrEqual(1);
    const t = textOf(root);
    expect(t).toContain('5일 연속');
    expect(t).toContain('주간 목표 30km');
    expect(t).toContain('50%'); // 15/30
  });

  test('주간 목표·스트릭이 0이면 숨긴다(하위호환)', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()} week={{km: '5.0', runs: 1, pace: '--'}} />,
    );
    expect(byTestID(root, 'home-week-goal').length).toBe(0);
    expect(byTestID(root, 'home-week-streak').length).toBe(0);
  });

  test('런이 없으면 0/0/— 로 폴백한다(빈 주 graceful)', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()} week={{km: '0.0', runs: 0, pace: '--'}} />,
    );
    expect(textOf(byTestID(root, 'home-week-km')[0])).toBe('0.0');
    expect(textOf(byTestID(root, 'home-week-runs')[0])).toBe('0');
    // 페이스 빈값은 앱 전역 '데이터 없음' 표기(--)로 통일한다(RunDetail/History 와 동일).
    expect(textOf(byTestID(root, 'home-week-pace')[0])).toBe('--');
  });
});
