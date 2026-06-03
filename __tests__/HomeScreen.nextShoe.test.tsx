/**
 * HomeScreen.rn.tsx — 수익화 v1 'NextShoeCard' 행동 테스트.
 *
 * 선택 신발이 '교체' 등급일 때만 다음 러닝화 추천 카드가 뜨고, 같은 카테고리의
 * 실제 추천 모델 + 쇼핑몰 검색 버튼(쿠팡/네이버쇼핑)을 렌더하며, 버튼을 누르면
 * Linking.openURL 로 검색 URL 을 연다는 관찰 가능한 동작을 검증한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Linking} from 'react-native';
import HomeScreen from '../HomeScreen.rn';
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
const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);

const WORN: Shoe = {brand: 'Nike', model: 'Pegasus 41', used: 690, max: 700, condition: '교체'};
const HEALTHY: Shoe = {brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'};

describe('NextShoeCard — 교체 시점 다음 러닝화 추천', () => {
  test('선택 신발이 교체 등급이면 추천 카드가 뜨고 쇼핑몰 버튼을 렌더한다', () => {
    const root = render(<HomeScreen shoes={[WORN]} activeIdx={0} onSelect={jest.fn()} />).root;
    const card = byTestID(root, 'home-next-shoe');
    expect(card.length).toBeGreaterThanOrEqual(1);
    const txt = textOf(card[0]);
    // 같은 카테고리(데일리 트레이너) 추천 + 투명성 안내 + 쇼핑몰 버튼
    expect(txt).toContain('데일리 트레이너');
    expect(txt).toContain('쿠팡');
    expect(txt).toContain('네이버쇼핑');
    expect(txt).toContain('러너'); // disclosure: 러너 우선
  });

  test('양호 등급이면 추천 카드는 뜨지 않는다', () => {
    const root = render(<HomeScreen shoes={[HEALTHY]} activeIdx={0} onSelect={jest.fn()} />).root;
    expect(byTestID(root, 'home-next-shoe').length).toBe(0);
  });

  test('쇼핑몰 버튼을 누르면 Linking.openURL 로 검색 URL 을 연다', () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
    const root = render(<HomeScreen shoes={[WORN]} activeIdx={0} onSelect={jest.fn()} />).root;
    // '쿠팡' 텍스트를 가진 가장 구체적인 Pressable
    const hits = root.findAll(
      (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n) === '쿠팡',
    );
    expect(hits.length).toBeGreaterThan(0);
    act(() => { hits[0].props.onPress(); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('coupang.com');
    spy.mockRestore();
  });
});
