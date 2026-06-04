/**
 * HomeScreen.rn.tsx — NextShoeCard 노출 트리거가 Slice 6 교체 예측(forecast)에 연결됐는지
 * 검증하는 행동 테스트. 예측이 overdue/임박이면 '다음 러닝화' 추천 카드가 뜨고, 여유
 * 충분/no_recent면 숨는다. 신발 등급(condition)은 '양호'로 고정해, 카드 노출이 forecast
 * 트리거(condition 폴백이 아니라)에서 나온 것임을 분리 검증한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import {Shoe} from '../theme';
import type {ReplacementForecast} from '../lib/wearView';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);

// condition '양호' — condition 폴백으론 카드가 절대 안 뜨는 신발. 카드 노출은 오직
// forecast 트리거에서만 나온다(분리 검증).
const HEALTHY: Shoe = {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 300, max: 700, condition: '양호'};

const forecast = (over: Partial<ReplacementForecast>): ReplacementForecast => ({
  kmRemaining: 250, weeksRemaining: 6, etaISO: '2026-08-01T00:00:00.000Z',
  confidence: 'high', reason: 'ok', ...over,
});

describe('NextShoeCard 노출 트리거 — Slice 6 forecast 연결', () => {
  test('forecast overdue면 추천 카드가 뜬다(양호 등급이라도)', () => {
    const f = forecast({reason: 'overdue', kmRemaining: -20, weeksRemaining: 0});
    const root = render(<HomeScreen shoes={[HEALTHY]} forecast={f} />).root;
    expect(byTestID(root, 'home-next-shoe').length).toBeGreaterThanOrEqual(1);
  });

  test('forecast 교체 임박(weeks≤3)이면 추천 카드가 뜬다', () => {
    const f = forecast({reason: 'ok', weeksRemaining: 2});
    const root = render(<HomeScreen shoes={[HEALTHY]} forecast={f} />).root;
    expect(byTestID(root, 'home-next-shoe').length).toBeGreaterThanOrEqual(1);
  });

  test('forecast 여유 충분(weeks 큼)이면 추천 카드는 숨는다', () => {
    const f = forecast({reason: 'ok', weeksRemaining: 12});
    const root = render(<HomeScreen shoes={[HEALTHY]} forecast={f} />).root;
    expect(byTestID(root, 'home-next-shoe').length).toBe(0);
  });

  test('forecast no_recent면 추천 카드는 숨는다(잡음 0)', () => {
    const f = forecast({reason: 'no_recent', weeksRemaining: null, etaISO: null});
    const root = render(<HomeScreen shoes={[HEALTHY]} forecast={f} />).root;
    expect(byTestID(root, 'home-next-shoe').length).toBe(0);
  });

  test('forecast가 없으면 condition==="교체" 폴백을 보존한다(회귀 방지)', () => {
    const WORN: Shoe = {...HEALTHY, used: 690, condition: '교체'};
    const root = render(<HomeScreen shoes={[WORN]} activeIdx={0} onSelect={jest.fn()} />).root;
    expect(byTestID(root, 'home-next-shoe').length).toBeGreaterThanOrEqual(1);
  });
});
