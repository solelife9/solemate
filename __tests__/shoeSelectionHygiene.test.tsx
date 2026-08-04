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

test('수동 추가에서는 보관한 신발이 후보에 아예 없다 — 보관 = 선택 목록에서 숨김', () => {
  // 보관 신발이 **먼저** 등록돼 있다(= 예전엔 이게 shoes[0] 이라 기본 선택이었다).
  const shoes = [mk('s1', 'Vomero', {retired: true}), mk('s2', 'Pegasus')];
  const renderer = render(shoes);
  const labels = chipLabels(renderer.root);

  expect(labels).toHaveLength(1);
  expect(labels[0]).toContain('Pegasus');
  expect(labels.join()).not.toContain('Vomero'); // 은퇴시킨 신발엔 새 거리를 못 붙인다

  // 기본 선택도 당연히 활성 신발.
  const selected = renderer.root
    .findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityState?.selected === true)
    .map(n => String(n.props.accessibilityLabel ?? ''))
    .filter(l => l.includes('NIKE'));
  expect(selected).toHaveLength(1);
  expect(selected[0]).toContain('Pegasus');

  act(() => renderer.unmount());
});

test('편집만은 예외 — 그 러닝의 신발이 보관됐어도 남기고 「보관됨」을 붙인다', () => {
  const shoes = [mk('s1', 'Vomero', {retired: true}), mk('s2', 'Pegasus')];
  // initial.shoe = shoes 배열 인덱스(0 = 보관된 Vomero).
  const renderer = render(shoes, {id: 'r1', shoe: 0, dist: 5, durationS: 1800, runDate: '2026-08-01'});
  const labels = chipLabels(renderer.root);

  // 그 신발이 없으면 어느 신발의 기록인지 화면이 말해주지 못하고, 선택된 칩도 없어 고장처럼 보인다.
  expect(labels.join()).toContain('Vomero');
  expect(labels.find(l => l.includes('Vomero'))).toContain('보관됨');
  const selected = renderer.root
    .findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityState?.selected === true)
    .map(n => String(n.props.accessibilityLabel ?? ''))
    .filter(l => l.includes('NIKE'));
  expect(selected[0]).toContain('Vomero');

  act(() => renderer.unmount());
});

test('편집이어도 **다른** 보관 신발까지 열어주지는 않는다', () => {
  const shoes = [
    mk('s1', 'Vomero', {retired: true}),
    mk('s2', 'Pegasus'),
    mk('s3', 'Invincible', {retired: true}),
  ];
  const renderer = render(shoes, {id: 'r1', shoe: 0, dist: 5, durationS: 1800, runDate: '2026-08-01'});
  const labels = chipLabels(renderer.root).join();
  expect(labels).toContain('Vomero'); // 이 러닝의 신발
  expect(labels).toContain('Pegasus'); // 활성
  expect(labels).not.toContain('Invincible'); // 상관없는 보관 신발

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
