/**
 * primitives.ring.test.tsx — Ring v2(링 단일 진실원) 행동 테스트.
 *
 * 2026-07-16 링 통일 2단계: 러닝 플로우 3화면(카운트다운·러닝중·세리머니)이 각자
 * 재구현하던 링을 primitives.Ring 하나로 흡수했다. 관찰 가능한 렌더 출력을 단언한다:
 *   · 정적(기본): 기존 2스톱(color2→color) 그라데이션 + 진행률만큼 dashoffset — 홈
 *     컨디션 게이지·챌린지 미니링의 기존 동작(픽셀 동등)이 깨지지 않는지.
 *   · stops: 러닝 플로우의 3스톱 파파야(RUN_RING_STOPS)가 0/0.55/1 오프셋으로 실린다.
 *   · animated: progress 변경이 슬라이드로 이어지고, 완료 시 onSweepEnd 가 불린다
 *     (세리머니 완성 햅틱 타이밍의 계약).
 *   · from: 마운트 시작 진행률(카운트다운→러닝 핸드오프 드레인의 시작점).
 *
 * @format
 */

import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Ring} from '../primitives';
import {ACCENT, ACCENT_2, SEP, RUN_RING_STOPS} from '../theme';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

const byName = (root: ReactTestRenderer.ReactTestInstance, name: string) =>
  root.findAll((n: any) => n && n.type && n.type.displayName === name);

// 진행 호(arc) = strokeLinecap round 인 Circle. 트랙(배경) 원과 구분한다.
const arcOf = (root: ReactTestRenderer.ReactTestInstance) => {
  const arcs = byName(root, 'Circle').filter(
    (n: any) => n.props.strokeLinecap === 'round',
  );
  expect(arcs.length).toBe(1);
  return arcs[0];
};

describe('Ring v2 — 정적(기본, 기존 동작 보존)', () => {
  test('진행률만큼 dashoffset, 트랙은 SEP, 2스톱 그라데이션(color2→color)', () => {
    const r = render(
      <Ring size={100} stroke={10} progress={0.5}>
        <Text>중앙</Text>
      </Ring>,
    );
    const c = 2 * Math.PI * ((100 - 10) / 2);
    const arc = arcOf(r.root);
    expect(arc.props.strokeDashoffset).toBeCloseTo(c * 0.5);
    expect(arc.props.strokeDasharray).toBeCloseTo(c);
    // 트랙(배경) 원은 SEP 헤어라인
    const track = byName(r.root, 'Circle').find(
      (n: any) => n.props.stroke === SEP,
    );
    expect(track).toBeTruthy();
    // 기본 그라데이션 = 무채 2스톱(ACCENT_2 → ACCENT)
    const stops = byName(r.root, 'Stop').map((n: any) => n.props.stopColor);
    expect(stops).toEqual([ACCENT_2, ACCENT]);
    // children 은 링 중앙 슬롯에 그대로 렌더
    expect(r.root.findAllByType(Text).some(t => t.props.children === '중앙')).toBe(true);
  });

  test('progress 는 0~1 로 클램프된다(음수·초과 안전)', () => {
    const c = 2 * Math.PI * ((100 - 10) / 2);
    const over = render(<Ring size={100} stroke={10} progress={1.7} />);
    expect(arcOf(over.root).props.strokeDashoffset).toBeCloseTo(0);
    const under = render(<Ring size={100} stroke={10} progress={-0.3} />);
    expect(arcOf(under.root).props.strokeDashoffset).toBeCloseTo(c);
  });
});

describe('Ring v2 — 러닝 플로우 문법(stops·animated·from·onSweepEnd)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('stops 를 주면 3스톱 파파야 그라데이션이 0/0.55/1 오프셋으로 실린다', () => {
    const r = render(
      <Ring size={280} stroke={16} progress={0.4} stops={RUN_RING_STOPS} animated />,
    );
    const stopNodes = byName(r.root, 'Stop');
    expect(stopNodes.map((n: any) => n.props.stopColor)).toEqual([...RUN_RING_STOPS]);
    expect(stopNodes.map((n: any) => String(n.props.offset))).toEqual(['0', '0.55', '1']);
  });

  test('animated: 슬라이드 완료 시 onSweepEnd 가 정확히 한 번 불린다(세리머니 완성 햅틱 계약)', () => {
    // RN jest 프리셋은 Animated 를 즉시 완료시키므로 '완료 후 1회' 계약만 단언한다
    // (지연·중단 타이밍은 실기기/시뮬 몫). 이후 타이머를 더 돌려도 재호출이 없어야 한다.
    const done = jest.fn();
    render(
      <Ring
        size={280} stroke={16} progress={1}
        animated from={0} duration={300} delay={150} onSweepEnd={done}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(done).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(done).toHaveBeenCalledTimes(1);
  });

  test('from: 마운트 시작 진행률(핸드오프 드레인 1→0)이 걸려도 렌더가 안전하다', () => {
    const r = render(
      <Ring size={280} stroke={16} progress={0} animated from={1} stops={RUN_RING_STOPS} />,
    );
    expect(arcOf(r.root)).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1000); // 드레인 완료까지 타이머 소진(누수 없음)
    });
  });
});
