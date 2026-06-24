/**
 * HomeScreen.rn.tsx — behavioural tests for the Slice-4 신발 로테이션 추천 card.
 *
 * Drives the REAL HomeScreen with rotation picks produced by the REAL
 * recommendRotation(lib/rotation) and asserts OBSERVABLE output — what the home
 * screen actually renders and which shoe id a press reports:
 *
 *   1) 2켤레+ → 로테이션 카드가 렌더되고, 더 오래 쉰 신발이 맨 위(pick-0)에 정렬된다.
 *   2) 보관(retired) 신발은 추천 카드에 나타나지 않는다.
 *   3) 1켤레면 추천이 비어(=recommendRotation []) 카드가 숨는다(home-rotation 없음).
 *   4) 추천 항목을 누르면 onPickShoe 가 그 신발 id로 호출된다(선택 동선).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import {Shoe} from '../theme';
import {recommendRotation, RotationShoe, RotationRun} from '../lib/rotation';

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
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
  return r;
}

const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);

// UI 신발(히어로/피커용). 로테이션 카드는 rotation prop 으로 따로 구동된다.
const uiShoe = (brand: string, model: string, id: string): Shoe => ({
  id,
  brand,
  model,
  used: 100,
  max: 500,
  condition: '양호',
});

describe('@slice-4 홈 신발 로테이션 추천 카드', () => {
  // ── 2켤레+ → 렌더 + 더 오래 쉰 신발이 맨 위로 정렬 ─────────────────────────────
  test('활성 2켤레면 추천 카드가 렌더되고 더 오래 쉰 신발이 pick-0', () => {
    const shoes: RotationShoe[] = [
      {id: 'a', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'c', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    // a는 어제(최근), c는 8일 전(더 오래 쉼) → c가 pick-0.
    const runs: RotationRun[] = [
      {shoeId: 'a', date: '2026-06-02'},
      {shoeId: 'c', date: '2026-05-26'},
    ];
    const rotation = recommendRotation({shoes, runs, today: '2026-06-03'});
    expect(rotation.length).toBe(2);

    const root = render(
      <HomeScreen
        shoes={[uiShoe('Nike', 'Pegasus 41', 'a'), uiShoe('Adidas', 'Adizero SL2', 'c')]}
        activeIdx={0}
        onSelect={jest.fn()}
        rotation={rotation}
      />,
    ).root;

    // 카드가 보인다.
    expect(byTestID(root, 'home-rotation').length).toBeGreaterThan(0);
    // 정렬: pick-0 = 더 오래 쉰 c(Adizero SL2), pick-1 = a(Pegasus 41).
    expect(textOf(byTestID(root, 'rotation-pick-0')[0])).toContain('Adizero SL2');
    expect(textOf(byTestID(root, 'rotation-pick-1')[0])).toContain('Pegasus 41');
    // pick-0(가장 오래 쉰 신발)에는 휴식 일수 배지 + 설명이 붙는다(추천 언어 '오늘 추천'은
    // 데이터 기반 UI 로 리팩터되며 제거됨 — insightBadge: '8일 미사용' + 설명).
    expect(textOf(byTestID(root, 'rotation-pick-0')[0])).toContain('8일 미사용');
    expect(textOf(byTestID(root, 'rotation-pick-0')[0])).toContain('최근 가장 오래 쉬고 있는 신발입니다');
  });

  // ── 보관(retired) 신발 제외 ──────────────────────────────────────────────────
  test('보관 신발은 추천 카드에 나타나지 않는다', () => {
    const shoes: RotationShoe[] = [
      {id: 'a', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'b', brand: 'Hoka', model: 'Bondi 9', retired: true},
      {id: 'c', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    const rotation = recommendRotation({shoes, runs: [], today: '2026-06-03'});

    const root = render(
      <HomeScreen
        shoes={[uiShoe('Nike', 'Pegasus 41', 'a'), uiShoe('Adidas', 'Adizero SL2', 'c')]}
        activeIdx={0}
        onSelect={jest.fn()}
        rotation={rotation}
      />,
    ).root;

    const cardText = textOf(byTestID(root, 'home-rotation')[0]);
    expect(cardText).not.toContain('Bondi 9');
    expect(cardText).toContain('Pegasus 41');
    expect(cardText).toContain('Adizero SL2');
  });

  // ── 1켤레면 추천 없음 → 카드 숨김 ────────────────────────────────────────────
  test('활성 1켤레면 추천이 비어 카드가 숨는다', () => {
    const rotation = recommendRotation({
      shoes: [{id: 'a', brand: 'Nike', model: 'Pegasus 41'}],
      runs: [],
    });
    expect(rotation).toEqual([]);

    const root = render(
      <HomeScreen
        shoes={[uiShoe('Nike', 'Pegasus 41', 'a')]}
        activeIdx={0}
        onSelect={jest.fn()}
        rotation={rotation}
      />,
    ).root;

    expect(byTestID(root, 'home-rotation').length).toBe(0);
  });

  // ── 추천 항목 누르면 onPickShoe(id) 호출 ──────────────────────────────────────
  test('추천 항목을 누르면 그 신발 id로 onPickShoe 가 호출된다', () => {
    const shoes: RotationShoe[] = [
      {id: 'a', brand: 'Nike', model: 'Pegasus 41'},
      {id: 'c', brand: 'Adidas', model: 'Adizero SL2'},
    ];
    const runs: RotationRun[] = [
      {shoeId: 'a', date: '2026-06-02'},
      {shoeId: 'c', date: '2026-05-26'},
    ];
    const rotation = recommendRotation({shoes, runs, today: '2026-06-03'});
    const onPickShoe = jest.fn();

    const root = render(
      <HomeScreen
        shoes={[uiShoe('Nike', 'Pegasus 41', 'a'), uiShoe('Adidas', 'Adizero SL2', 'c')]}
        activeIdx={0}
        onSelect={jest.fn()}
        rotation={rotation}
        onPickShoe={onPickShoe}
      />,
    ).root;

    act(() => {
      byTestID(root, 'rotation-pick-0')[0].props.onPress();
    });
    // pick-0 = c → onPickShoe('c')
    expect(onPickShoe).toHaveBeenCalledWith('c');
  });
});
