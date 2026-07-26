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

const WORN: Shoe = {brand: 'Nike', model: 'Pegasus 41', used: 690, max: 700};
const HEALTHY: Shoe = {brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700};

;(globalThis as any).__KEEGO_TEST_NEXTSHOP__ = true; // 제휴 섹션(프로덕션 숨김)을 테스트에서만 노출해 추천 로직 검증

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

// ── 제휴 대가관계 표기(2026-07-26 출시 심사 TOP30 #26) ────────────────────────
// 표시·광고 규제(추천·보증 심사지침)는 대가를 받는 추천에 그 사실을 명확히 밝히도록 요구한다.
// 지금 이 섹션은 프로덕션에서 숨겨져 있지만(민우님 2026-07-20 보류), **다시 켜는 순간**
// 고지 없이 노출되는 사고를 막기 위해 카드와 고지를 한 계약으로 묶는다.
test('추천 카드가 뜨면 제휴 고지도 함께 뜬다(고지 없는 추천 금지)', () => {
  const root = render(<HomeScreen shoes={[WORN]} activeIdx={0} onSelect={jest.fn()} />).root;
  const card = byTestID(root, 'home-next-shoe');
  expect(card.length).toBeGreaterThanOrEqual(1);
  const txt = textOf(card[0]);
  // 대가관계와 '판정 독립'을 둘 다 밝힌다 — 추천이 커미션으로 왜곡되지 않음을 말해야
  // 고지가 제 역할을 한다(BRAND.md §2).
  expect(txt).toContain('제휴 링크가 포함될 수 있어요');
  expect(txt).toContain('커미션과 무관하게');
});
