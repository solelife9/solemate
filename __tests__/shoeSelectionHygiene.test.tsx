/**
 * 신발 선택지 위생 — 보관 신발·중복 등록 (QA 감사 Q-11 · Q-8).
 *
 * Q-11: 보관(은퇴)한 신발이 수동 기록 폼에 그대로 떴다. 목록에 있어야 하는 건 맞다 —
 * 은퇴 전에 달린 옛 러닝을 편집하려면 필요하다. 문제는 **앞에 있고 기본값이 될 수 있다**는
 * 것이었다(`shoes[0]`). 은퇴 시점 누적 거리는 명예의 전당에 박제되므로, 그 뒤로 거리가
 * 붙으면 박제된 숫자와 실제가 어긋난다.
 *
 * Q-8: 같은 신발을 몇 번이든 등록할 수 있었고, 등록 뒤엔 이름만 보여 구분이 불가능했다.
 * 차단은 답이 아니다(같은 모델 두 켤레는 로테이션에서 정상이다) — 확인 한 겹 + 구분 표시.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {RunForm} from '../HistoryScreen.rn';
import type {Shoe} from '../theme';

const mk = (id: string, model: string, extra: Partial<Shoe> = {}): Shoe =>
  ({
    id,
    brand: 'NIKE',
    model,
    used: 100,
    max: 600,
    maxBase: 600,
    retired: false,
    ...extra,
  } as Shoe);

/** 신발 칩들의 라벨을 화면 순서대로. */
function chipLabels(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll(n => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string')
    .map(n => String(n.props.accessibilityLabel))
    .filter(l => l.includes('NIKE'));
}

function render(shoes: Shoe[], initial: any = null) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <RunForm shoes={shoes} unit="km" initial={initial} onCancel={() => {}} onSubmit={() => {}} />,
    );
  });
  return renderer;
}

test('보관한 신발은 뒤로 밀리고 「보관됨」 표식이 붙는다 — 목록에서 지우지는 않는다', () => {
  // 보관 신발이 **먼저** 등록돼 있다(= 예전엔 이게 shoes[0] 이라 기본 선택이었다).
  const shoes = [mk('s1', 'Vomero', {retired: true}), mk('s2', 'Pegasus')];
  const renderer = render(shoes);
  const labels = chipLabels(renderer.root);

  // 활성이 앞, 보관이 뒤.
  expect(labels[0]).toContain('Pegasus');
  expect(labels[1]).toContain('Vomero');
  // 보관 신발은 그렇다고 사라지지 않는다 — 옛 러닝 편집에 필요하다.
  expect(labels[1]).toContain('보관됨');
  expect(labels[0]).not.toContain('보관됨');

  act(() => renderer.unmount());
});

test('기본 선택은 활성 신발이다 — 보관 신발이 목록 맨 앞이어도', () => {
  const shoes = [mk('s1', 'Vomero', {retired: true}), mk('s2', 'Pegasus')];
  const renderer = render(shoes);
  // 선택된 칩 = accessibilityState.selected 가 참인 것.
  const selected = renderer.root
    .findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityState?.selected === true)
    .map(n => String(n.props.accessibilityLabel ?? ''))
    .filter(l => l.includes('NIKE'));
  expect(selected).toHaveLength(1);
  expect(selected[0]).toContain('Pegasus'); // 은퇴한 Vomero 가 아니다

  act(() => renderer.unmount());
});

test('편집 중인 러닝의 신발이 보관 상태여도 그대로 프리필된다(원래 신발을 바꾸지 않는다)', () => {
  const shoes = [mk('s1', 'Vomero', {retired: true}), mk('s2', 'Pegasus')];
  // initial.shoe = shoes 배열 인덱스(0 = 보관된 Vomero).
  const renderer = render(shoes, {id: 'r1', shoe: 0, dist: 5, durationS: 1800, runDate: '2026-08-01'});
  const selected = renderer.root
    .findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityState?.selected === true)
    .map(n => String(n.props.accessibilityLabel ?? ''))
    .filter(l => l.includes('NIKE'));
  expect(selected[0]).toContain('Vomero');

  act(() => renderer.unmount());
});

test('이름이 같은 신발이 둘 이상일 때만 누적 거리로 구분한다 — 아니면 잡음이다', () => {
  const dup = render([mk('s1', 'Pegasus', {used: 120}), mk('s2', 'Pegasus', {used: 40})]);
  const dupLabels = chipLabels(dup.root);
  expect(dupLabels[0]).toContain('120km');
  expect(dupLabels[1]).toContain('40km');
  act(() => dup.unmount());

  const uniq = render([mk('s1', 'Pegasus', {used: 120}), mk('s2', 'Vomero', {used: 40})]);
  const uniqLabels = chipLabels(uniq.root);
  expect(uniqLabels.some(l => l.includes('km'))).toBe(false);
  act(() => uniq.unmount());
});
