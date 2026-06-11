/**
 * ShoesScreen.rn.tsx — 신발별 평균 페이스 비교 행동 테스트.
 *
 * 신발끼리 페이스를 비교할 수 있도록 (1) 목록 카드에 평균 페이스가 보이고,
 * (2) 신발 상세 통계에 '평균 페이스' 칸이 추가됐는지 검증한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoesScreen, {ShoeTotals} from '../ShoesScreen.rn';
import {Shoe} from '../theme';

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
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  return hits[0];
}

const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 200, max: 700, condition: '양호'},
];
const TOTALS: Record<number, ShoeTotals> = {
  0: {totalRuns: 5, totalTime: '4h 10m', avgPace: "5'30\"", lastWorn: '5월 28일'},
  1: {totalRuns: 3, totalTime: '2h 05m', avgPace: "6'10\"", lastWorn: '5월 20일'},
};

describe('ShoesScreen — 신발별 평균 페이스 비교', () => {
  test('목록 카드에 각 신발의 평균 페이스가 보인다(비교 가능)', () => {
    const root = render(<ShoesScreen shoes={SHOES} totals={TOTALS} />).root;
    const screen = textOf(root);
    expect(screen).toContain("5'30\""); // Nike 평균 페이스
    expect(screen).toContain("6'10\""); // Hoka 평균 페이스
    expect(screen).toContain('평균');
  });

  test('신발 상세 통계에 평균 페이스 칸이 있다', () => {
    const root = render(<ShoesScreen shoes={SHOES} totals={TOTALS} />).root;
    act(() => { pressByLabel(root, 'Nike Pegasus 41 상세').props.onPress(); });
    const detail = textOf(root);
    expect(detail).toContain('평균 페이스');
    expect(detail).toContain("5'30\"");
    // 통계 라벨(목업 정합: '총' 접두 제거)
    expect(detail).toContain('누적 거리');
    expect(detail).toContain('러닝 횟수');
    expect(detail).toContain('러닝 시간');
  });

  test('기록 없는 신발(avgPace "--")은 목록에 페이스 줄을 숨긴다', () => {
    const noRun: Shoe[] = [{id: 'c', brand: 'On', model: 'Cloudflow 5', used: 0, max: 700, condition: '양호'}];
    const totals: Record<number, ShoeTotals> = {0: {totalRuns: 0, totalTime: '--', avgPace: '--'}};
    const root = render(<ShoesScreen shoes={noRun} totals={totals} />).root;
    // 페이스 줄은 '평균 ... /km' 형태 — '--'면 노출하지 않으므로 '/km'가 없어야 한다.
    expect(textOf(root)).not.toContain('/km');
  });
});
