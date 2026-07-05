/**
 * HomeScreen — 홈 인터랙션(히어로 신발 탭 → 상세 이동).
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
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
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && (n.props.accessibilityLabel ?? '').startsWith(String(label).replace(/ 상세.*$/, '')),
  );
  if (!hits.length) throw new Error(`no pressable labelled "${label}"`);
  return hits[0];
}

const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 300, max: 700, condition: '주의'},
];

describe('홈 히어로 신발 인터랙션', () => {
  test('히어로 신발을 탭하면 onOpenShoe가 선택 신발 id로 호출된다', () => {
    const onOpenShoe = jest.fn();
    const root = render(<HomeScreen shoes={SHOES} activeIdx={1} onSelect={jest.fn()} onOpenShoe={onOpenShoe} />).root;
    act(() => { pressByLabel(root, 'Hoka Clifton 10 상세 보기').props.onPress(); });
    expect(onOpenShoe).toHaveBeenCalledWith('b');
  });
});

describe('홈 부상위험 시그널 제거(2026-07-05 애널리틱스 다이어트)', () => {
  const TODAY = '2026-06-23';
  const WORN_SHOES: Shoe[] = [
    {id: 'w', brand: 'Nike', model: 'Pegasus 41', used: 650, max: 700, condition: '교체'},
  ];
  test('마모가 위험 수준이어도 홈은 부상위험 카드를 더 이상 렌더하지 않는다(처방 계층 제거)', () => {
    const root = render(
      <HomeScreen shoes={WORN_SHOES} activeIdx={0} onSelect={jest.fn()} runs={[]} todayISO={TODAY} />,
    ).root;
    const cards = root.findAll((n: any) => n?.props?.testID && String(n.props.testID).startsWith('injury-risk-card-'));
    expect(cards.length).toBe(0);
    // 신발 마모 경고(구체·측정가능)는 신발 카드/상세가 계속 담당 — 여긴 코칭 계층만 제거.
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
    expect(textOf(root)).toContain('이 신발로 달린 기록');
    expect(textOf(root)).toContain('Clifton 10');
    expect(onConsume).toHaveBeenCalledTimes(1);
  });
});
