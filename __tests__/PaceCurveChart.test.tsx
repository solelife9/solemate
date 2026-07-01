/**
 * PaceCurveChart — 거리축 페이스 곡선(P0-4) 렌더/숨김.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {PaceCurveChart} from '../PaceCurveChart';
import {Split} from '../RunSplits';

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
function has(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  return root.findAll((n: any) => typeof n.type === 'string' && n?.props?.testID === testID).length > 0;
}

const splits = (paces: number[]): Split[] => paces.map((p, i) => ({km: i + 1, paceSec: p, elevM: 0}));

describe('PaceCurveChart — 거리축 페이스 곡선', () => {
  test('2구간 미만이면 렌더하지 않는다(null)', () => {
    const r1 = render(<PaceCurveChart splits={[]} />);
    expect(r1.toJSON()).toBeNull();
    const r2 = render(<PaceCurveChart splits={splits([360])} />);
    expect(r2.toJSON()).toBeNull();
  });

  test('2구간 이상이면 곡선을 그린다', () => {
    const root = render(<PaceCurveChart splits={splits([360, 330, 345, 300])} />).root;
    expect(has(root, 'pace-curve')).toBe(true);
  });

  test('최고(가장 빠른) 페이스를 라벨로 보여준다', () => {
    // 300초 = 5분 00초가 최소(최고 페이스)
    const root = render(<PaceCurveChart splits={splits([360, 330, 300, 345])} />).root;
    expect(textOf(root)).toContain("5'00\"");
  });

  test('모든 구간 페이스가 같아도(평탄) 깨지지 않고 렌더된다', () => {
    const root = render(<PaceCurveChart splits={splits([330, 330, 330])} />).root;
    expect(has(root, 'pace-curve')).toBe(true);
  });

  // GAP 오버레이는 svg Path(목킹됨) — type 무관하게 props.testID 로 조회한다.
  const hasByTestId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
    root.findAll((n: any) => n?.props?.testID === id).length > 0;

  test('gap 시계열을 주면 GAP 오버레이(점선)와 범례를 그린다', () => {
    const gap = [{km: 1, paceSec: 280}, {km: 2, paceSec: 275}, {km: 3, paceSec: 270}];
    const root = render(<PaceCurveChart splits={splits([360, 330, 300])} gap={gap} />).root;
    expect(hasByTestId(root, 'gap-overlay')).toBe(true);
    expect(textOf(root)).toContain('경사보정'); // 범례(일반인용 — 'GAP' 약어 대신)
  });

  test('gap 이 없으면 오버레이/범례를 그리지 않는다', () => {
    const root = render(<PaceCurveChart splits={splits([360, 330, 300])} />).root;
    expect(hasByTestId(root, 'gap-overlay')).toBe(false);
    expect(textOf(root)).not.toContain('경사보정');
  });
});
