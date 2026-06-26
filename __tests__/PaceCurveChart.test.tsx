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
});
