/**
 * Sparkline — 미니 추세선 렌더/숨김.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Sparkline} from '../Sparkline';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
const hasByTestId = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n?.props?.testID === id).length > 0;

describe('Sparkline', () => {
  test('2점 미만이면 렌더하지 않는다(null)', () => {
    expect(render(<Sparkline data={[]} color="#fff" />).toJSON()).toBeNull();
    expect(render(<Sparkline data={[5]} color="#fff" />).toJSON()).toBeNull();
  });

  test('2점 이상이면 추세선을 그린다', () => {
    const root = render(<Sparkline data={[1, 3, 2, 5, 4]} color="#0f0" testID="spark" />).root;
    expect(hasByTestId(root, 'spark')).toBe(true);
  });

  test('모든 값이 같아도(평탄) 0나눗셈 없이 렌더된다', () => {
    const root = render(<Sparkline data={[7, 7, 7]} color="#0f0" testID="spark" />).root;
    expect(hasByTestId(root, 'spark')).toBe(true);
  });

  test('비유효(NaN)는 걸러내고 남은 유효점으로 판단', () => {
    // 유효점 1개(5)만 → null
    expect(render(<Sparkline data={[NaN, 5, NaN]} color="#fff" />).toJSON()).toBeNull();
  });
});
