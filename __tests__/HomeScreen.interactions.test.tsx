/**
 * HomeScreen — 홈 카드 인터랙션(주간목표 탭 → 수정, 히어로 신발 탭 → 상세 이동).
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen, {GoalInfo} from '../HomeScreen.rn';
import ShoesScreen, {ShoeTotals} from '../ShoesScreen.rn';
import {Shoe} from '../theme';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (!hits.length) throw new Error(`no pressable labelled "${label}"`);
  return hits[0];
}

const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 300, max: 700, condition: '주의'},
];
const GOAL: GoalInfo = {km: 30, pct: 40, streak: 3};

describe('홈 주간목표 카드 인터랙션', () => {
  test('주간목표 카드를 탭하면 onEditGoal이 호출된다', () => {
    const onEditGoal = jest.fn();
    const root = render(<HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} goal={GOAL} onEditGoal={onEditGoal} />).root;
    act(() => { pressByLabel(root, '주간 목표 수정').props.onPress(); });
    expect(onEditGoal).toHaveBeenCalledTimes(1);
  });
});

describe('홈 히어로 신발 인터랙션', () => {
  test('히어로 신발을 탭하면 onOpenShoe가 선택 신발 id로 호출된다', () => {
    const onOpenShoe = jest.fn();
    const root = render(<HomeScreen shoes={SHOES} activeIdx={1} onSelect={jest.fn()} onOpenShoe={onOpenShoe} />).root;
    act(() => { pressByLabel(root, 'Hoka Clifton 10 상세 보기').props.onPress(); });
    expect(onOpenShoe).toHaveBeenCalledWith('b');
  });
});

describe('ShoesScreen 외부 진입(detailShoeId)', () => {
  const TOTALS: Record<number, ShoeTotals> = {
    0: {totalRuns: 2, totalTime: '1h', avgPace: "5'30\"", lastWorn: '5월 1일'},
    1: {totalRuns: 1, totalTime: '30m', avgPace: "6'00\"", lastWorn: '5월 2일'},
  };
  test('detailShoeId가 주어지면 그 신발 상세가 바로 열린다', () => {
    const onConsume = jest.fn();
    const root = render(
      <ShoesScreen shoes={SHOES} totals={TOTALS} detailShoeId="b" onConsumeDetail={onConsume} />,
    ).root;
    // 상세 화면 진입 표식: '이 신발로 달린 기록' 섹션 + 선택 신발 모델명.
    expect(textOf(root)).toContain('이 신발로 달린 기록');
    expect(textOf(root)).toContain('Clifton 10');
    expect(onConsume).toHaveBeenCalledTimes(1);
  });
});
