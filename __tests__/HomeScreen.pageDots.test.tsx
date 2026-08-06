/**
 * HomeScreen — 히어로 캐러셀 페이지 도트가 **손가락을 따라간다**.
 *
 * 배경(2026-08-07 민우님 지적): "카드가 다 넘어가고 밑에 점이 마지막에 따라오는 느낌".
 * 원인은 도트가 `onMomentumScrollEnd`(관성이 완전히 멎는 시점)에서만 갱신되던 것이었다.
 *
 * 이 스위트가 고정하는 계약은 둘이다.
 *  ① 스크롤 중(onScroll)에 카드 절반을 넘기면 **그 즉시** 활성 도트가 옮겨간다.
 *  ② 그렇다고 `onSelect`(앱 상태 = 활성 신발)를 스크롤 중에 부르지는 **않는다**.
 *     부르면 부모가 activeIdx 를 바꾸고, 그 변화가 scrollTo 를 걸어 **사용자의 손가락과 싸운다**.
 *     앱 상태는 관성이 멎은 뒤(onMomentumScrollEnd)에만 바뀐다.
 *
 * ②가 이 수정의 진짜 위험 지점이라 테스트로 못 박는다.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import {Shoe} from '../theme';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}

const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 300, max: 700},
  {id: 'c', brand: 'ASICS', model: 'Novablast 5', used: 50, max: 700},
];

/** 가로 캐러셀의 ScrollView(= onScroll + onMomentumScrollEnd 를 둘 다 가진 노드). */
function carousel(root: ReactTestRenderer.ReactTestInstance) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onScroll === 'function' && typeof n.props.onMomentumScrollEnd === 'function',
  );
  if (!hits.length) throw new Error('캐러셀 ScrollView 를 찾지 못했다');
  return hits[0];
}

/** 한 칸 폭(스냅 간격) — 컴포넌트가 쓰는 값과 같아야 한다. */
function stride(root: ReactTestRenderer.ReactTestInstance): number {
  const snap = carousel(root).props.snapToInterval;
  expect(typeof snap).toBe('number');
  expect(snap).toBeGreaterThan(0);
  return snap;
}

/**
 * 활성 도트의 인덱스. 도트는 [pageDot, 활성이면 pageDotOn] 이고 활성 스타일이 width 를 넓힌다
 * → **가장 넓은 도트가 활성**이다(토큰 값이 바뀌어도 따라간다). 활성이 하나가 아니면 -1.
 */
function activeDotIndex(root: ReactTestRenderer.ReactTestInstance, count: number): number {
  const widths: number[] = [];
  for (let i = 0; i < count; i++) {
    const dot = root.findByProps({testID: `home-page-dot-${i}`});
    const flat = ([] as any[]).concat(dot.props.style).flat(3).filter(Boolean);
    widths.push(flat.reduce((w: number, x: any) => (typeof x?.width === 'number' ? x.width : w), 0));
  }
  const onW = Math.max(...widths);
  const hits = widths.map((w, i) => (w === onW ? i : -1)).filter(i => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

describe('홈 캐러셀 페이지 도트 — 스크롤을 따라간다', () => {
  test('스크롤이 카드 절반을 넘으면 관성 종료를 기다리지 않고 도트가 옮겨간다', () => {
    const root = render(<HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} />).root;
    const sv = carousel(root);
    const S = stride(root);

    expect(activeDotIndex(root, SHOES.length)).toBe(0);

    // 카드 절반을 조금 넘긴 지점 — 아직 관성 종료(onMomentumScrollEnd) 전이다.
    act(() => { sv.props.onScroll({nativeEvent: {contentOffset: {x: S * 0.6}}}); });
    expect(activeDotIndex(root, SHOES.length)).toBe(1);

    // 절반을 안 넘겼으면 그대로 — 손가락을 조금 움직였다고 깜빡이지 않는다.
    act(() => { sv.props.onScroll({nativeEvent: {contentOffset: {x: S * 1.3}}}); });
    expect(activeDotIndex(root, SHOES.length)).toBe(1);
    act(() => { sv.props.onScroll({nativeEvent: {contentOffset: {x: S * 1.7}}}); });
    expect(activeDotIndex(root, SHOES.length)).toBe(2);
  });

  test('스크롤 중에는 onSelect 를 부르지 않는다 — 부르면 scrollTo 가 손가락과 싸운다', () => {
    const onSelect = jest.fn();
    const root = render(<HomeScreen shoes={SHOES} activeIdx={0} onSelect={onSelect} />).root;
    const sv = carousel(root);
    const S = stride(root);

    act(() => { sv.props.onScroll({nativeEvent: {contentOffset: {x: S * 0.6}}}); });
    act(() => { sv.props.onScroll({nativeEvent: {contentOffset: {x: S * 1.4}}}); });
    expect(onSelect).not.toHaveBeenCalled();

    // 관성이 멎으면 그때 앱 상태가 바뀐다.
    act(() => { sv.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {x: S * 1}}}); });
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  test('범위를 벗어난 스크롤 좌표(바운스)에도 도트 인덱스가 밖으로 나가지 않는다', () => {
    const root = render(<HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} />).root;
    const sv = carousel(root);
    const S = stride(root);
    // 양 끝 바운스: 음수 오프셋 · 마지막 칸을 넘어선 오프셋
    expect(() => {
      act(() => { sv.props.onScroll({nativeEvent: {contentOffset: {x: -S}}}); });
      act(() => { sv.props.onScroll({nativeEvent: {contentOffset: {x: S * 99}}}); });
    }).not.toThrow();
    // 활성은 항상 정확히 하나(=-1 이 아니다)이고, 마지막 칸에 머문다.
    expect(activeDotIndex(root, SHOES.length)).toBe(SHOES.length - 1);
  });
});
