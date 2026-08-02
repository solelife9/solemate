/**
 * WearRing — **배터리 방향**과 4단계 컨디션색.
 *
 * 이 링은 조용히 뒤집히기 쉬운 자리다. 실제로 2026-08-02 에 SocialProfileCard 안에서
 * '쓸수록 차는' 오렌지 링으로 만들어졌다가 primitives 로 그대로 승격되어, 새 신발이
 * 빈 링으로 보였다(민우님: "안 쓴 거면 100프로 차서 파랑색으로 돼 있어야 되는 거 아냐").
 * 앱 정본은 FuelGauge 주석에 박혀 있다 — 새 신발 = 가득, 닳을수록 비워진다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Circle} from 'react-native-svg';
import {WearRing} from '../primitives';
import {BEST, GOOD, WARN, DANGER} from '../theme';

/** 링의 진행 원(두 번째 Circle)에서 dashoffset 과 색을 읽는다. */
function arc(pct: number) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<WearRing pct={pct} />); });
  const circles = r.root.findAllByType(Circle);
  const progress = circles[circles.length - 1];
  const c = 2 * Math.PI * 16;
  // props 는 **언마운트 전에** 다 읽는다(뒤에서 읽으면 노드가 사라져 있다).
  const off = Number(progress.props.strokeDashoffset);
  const color = String(progress.props.stroke);
  act(() => { r.unmount(); });
  /** filled: 0=텅 빔, 1=가득 참 */
  return {filled: Number((1 - off / c).toFixed(3)), color};
}

describe('WearRing — 배터리 방향', () => {
  test('안 쓴 신발은 가득 찬다', () => {
    expect(arc(0).filled).toBe(1);
  });

  test('절반 썼으면 절반 남는다', () => {
    expect(arc(50).filled).toBe(0.5);
  });

  test('다 썼으면 비워진다', () => {
    expect(arc(100).filled).toBe(0);
  });

  test('수명을 넘겨도 음수로 돌지 않는다 — 초과도 정상 상태다', () => {
    expect(arc(140).filled).toBe(0);
  });

  test('사용률이 오를수록 링은 단조 감소한다', () => {
    const seq = [0, 20, 40, 60, 80, 100].map(p => arc(p).filled);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThan(seq[i - 1]);
  });
});

describe('WearRing — 4단계 컨디션색', () => {
  test('새 신발은 최상(파랑)', () => {
    expect(arc(0).color).toBe(BEST);
  });

  test('닳을수록 파랑 → 초록 → 노랑 → 빨강 으로만 간다', () => {
    const ramp = [BEST, GOOD, WARN, DANGER];
    let last = -1;
    for (const p of [0, 25, 50, 65, 80, 95, 110]) {
      const i = ramp.indexOf(arc(p).color);
      expect(i).toBeGreaterThanOrEqual(0);   // 램프 밖 색이 나오면 안 된다
      expect(i).toBeGreaterThanOrEqual(last); // 되돌아가지 않는다
      last = i;
    }
  });

  test('수명 초과는 교체권장(빨강)', () => {
    expect(arc(120).color).toBe(DANGER);
  });

  test('망가진 입력은 새 신발처럼 다룬다 — 링이 사라지지 않는다', () => {
    for (const bad of [NaN, Infinity, -10]) {
      expect(arc(bad as number).filled).toBe(1);
    }
  });
});
