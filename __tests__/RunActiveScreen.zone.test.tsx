/**
 * 심박존 가이드(#7) 표시 계약 — 러닝 중 심박 셀:
 *  1) 가이드 켜짐(targetZone>=2) + 이탈 down → "↓ 존 N로" 힌트.
 *  2) 이탈 up → "↑ 존 N로".
 *  3) 가이드 꺼짐(0)이면 기존 존 라벨(Z{n}) 그대로 — 힌트 없음.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunActiveScreen from '../RunActiveScreen.rn';

function render(el: React.ReactElement) {
  let r: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r!.root;
}
const allText = (root: any) =>
  root.findAll((n: any) => n.type === 'Text')
    .map((n: any) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join('|');

test('가이드 Z2 + down 이탈 → "↓ 존 2로" 힌트', () => {
  const root = render(<RunActiveScreen bpm={175} age={30} targetZone={2} zoneDeviation="down" />);
  expect(allText(root)).toContain('↓ 존 2로');
});

test('가이드 Z3 + up 이탈 → "↑ 존 3로"', () => {
  const root = render(<RunActiveScreen bpm={110} age={30} targetZone={3} zoneDeviation="up" />);
  expect(allText(root)).toContain('↑ 존 3로');
});

test('가이드 꺼짐이면 힌트 없이 존 라벨만', () => {
  const root = render(<RunActiveScreen bpm={140} age={30} targetZone={0} zoneDeviation={null} />);
  const t = allText(root);
  expect(t).not.toContain('존 2로');
  expect(t).not.toContain('존 3로');
});
