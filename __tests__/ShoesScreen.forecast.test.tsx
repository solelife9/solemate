/**
 * ShoesScreen — 락커 교체 예측 전면화(P1 #2): 교체예상 줄 + 임박 상단 정렬 + 요약 헤더.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoesScreen from '../ShoesScreen.rn';
import type {Shoe} from '../theme';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r.root;
}
function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => { if (typeof n === 'string') return void (out += n); if (!n || !n.children) return; n.children.forEach(walk); };
  walk(node);
  return out;
}
const has = (root: any, id: string) => root.findAll((n: any) => typeof n.type === 'string' && n?.props?.testID === id).length > 0;

const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 300, max: 600, condition: '양호'},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 590, max: 600, condition: '교체'},
];
const fc = (reason: 'ok' | 'overdue' | 'no_recent', weeks: number | null) => ({
  kmRemaining: 0, weeksRemaining: weeks,
  etaISO: reason === 'ok' && weeks != null ? '2026-09-01' : null, // ok 줄은 etaISO 필요
  confidence: 'high' as const, reason,
});

describe('ShoesScreen 교체 예측 전면화(#2)', () => {
  test('교체 임박이 1켤레면 요약 헤더에 1켤레로 표시한다', () => {
    const forecasts = {a: fc('ok', 12), b: fc('overdue', 0)};
    const root = render(<ShoesScreen shoes={SHOES} forecasts={forecasts} />);
    expect(has(root, 'shoes-soon-header')).toBe(true);
    expect(textOf(root.findAll((n: any) => n?.props?.testID === 'shoes-soon-header')[0])).toContain('1켤레');
  });

  test('교체 임박(overdue) 신발이 목록 상단으로 정렬된다', () => {
    const forecasts = {a: fc('ok', 12), b: fc('overdue', 0)};
    const root = render(<ShoesScreen shoes={SHOES} forecasts={forecasts} />);
    // 신발 카드(상세 Pressable) 순서 — 'Hoka Clifton 10'(overdue)가 'Nike Pegasus 41'보다 앞.
    const cards = root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string' && / 상세$/.test(n.props.accessibilityLabel));
    const order = cards.map((c: any) => c.props.accessibilityLabel);
    expect(order[0]).toContain('Hoka');
    expect(order.findIndex((l: string) => l.includes('Hoka'))).toBeLessThan(order.findIndex((l: string) => l.includes('Nike')));
  });

  test('각 신발 카드에 교체 예상 줄(forecast)이 뜬다', () => {
    const forecasts = {a: fc('ok', 12), b: fc('overdue', 0)};
    const root = render(<ShoesScreen shoes={SHOES} forecasts={forecasts} />);
    expect(has(root, 'shoe-forecast-a')).toBe(true);
    expect(has(root, 'shoe-forecast-b')).toBe(true);
  });

  test('임박 신발이 없으면 요약 헤더를 숨긴다', () => {
    const forecasts = {a: fc('ok', 12), b: fc('ok', 20)};
    const root = render(<ShoesScreen shoes={SHOES} forecasts={forecasts} />);
    expect(has(root, 'shoes-soon-header')).toBe(false);
  });
});
