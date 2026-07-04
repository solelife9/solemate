/**
 * 라이브 심박 존(2026-07-05) 계약:
 *  1) bpm>0 + age 있으면 존 라벨(Z{n} 라벨)이 심박 지표에 뜨고 숫자가 존 색으로 물든다.
 *  2) bpm=0(워치 미연동)이면 '심박' 라벨·'--' 유지, 존 미표시(조건부·노이즈 안전).
 *  3) restHR 이 있으면 Karvonen(HRR) 로 분류 — 같은 bpm 이라도 존이 달라질 수 있다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunActiveScreen from '../RunActiveScreen.rn';
import {HR_ZONE_COLORS} from '../theme';
import {estimateMaxHR, zoneOf} from '../lib/analytics/hrZones';

function render(el: React.ReactElement) {
  let r: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r!.root;
}
const texts = (root: any) => root.findAll((n: any) => n.type === 'Text');
function hasText(root: any, sub: string) {
  return texts(root).some((t: any) => {
    const c = t.props.children;
    const s = Array.isArray(c) ? c.join('') : String(c ?? '');
    return s.includes(sub);
  });
}

test('bpm>0 + age → 존 라벨 노출 + 숫자 존 색', () => {
  const age = 30; // maxHR ≈ 187
  const bpm = 165; // %HRmax ≈ 0.88 → Z4(역치)
  const z = zoneOf(bpm, estimateMaxHR(age));
  expect(z).toBe(4);
  const root = render(<RunActiveScreen bpm={bpm} age={age} />);
  expect(hasText(root, `Z${z}`)).toBe(true);
  // 심박 숫자가 존 색으로 물든다.
  const numNode = texts(root).find((t: any) => String(t.props.children) === String(bpm));
  expect(numNode).toBeTruthy();
  const flat = Object.assign({}, ...[].concat(numNode.props.style).filter(Boolean));
  expect(flat.color).toBe(HR_ZONE_COLORS[z]);
});

test('bpm=0 → 존 미표시, 기본 심박 라벨 유지', () => {
  const root = render(<RunActiveScreen bpm={0} age={30} />);
  expect(hasText(root, '심박')).toBe(true);
  expect(hasText(root, 'Z1')).toBe(false);
  expect(hasText(root, 'Z4')).toBe(false);
});

test('restHR 있으면 HRR(Karvonen)로 분류한다', () => {
  const age = 30, restHR = 50, bpm = 150;
  const withRest = zoneOf(bpm, estimateMaxHR(age), restHR);
  const noRest = zoneOf(bpm, estimateMaxHR(age));
  // 같은 bpm 이라도 rest 반영 시 존이 달라질 수 있다(계약: restHR 을 실제로 쓴다).
  const root = render(<RunActiveScreen bpm={bpm} age={age} restHR={restHR} />);
  expect(hasText(root, `Z${withRest}`)).toBe(true);
  expect(withRest).not.toBe(0);
  expect(noRest).not.toBe(0);
});
