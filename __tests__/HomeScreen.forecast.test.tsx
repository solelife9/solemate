/**
 * HomeScreen.rn.tsx — 홈 히어로 교체 예측 ETA 한 줄 행동 테스트.
 *
 * props-driven. 선택(히어로) 신발의 forecast가 ok/overdue일 때 히어로에 keep-going
 * ETA 한 줄이 렌더되고, no_recent면 숨는지(잡음 0)를 관찰 텍스트로 단언한다. 카피는
 * lib/wearView.forecastLineKo 단일 출처와 동일해야 한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import {Shoe} from '../theme';
import {forecastLineKo, formatEtaKo, type ReplacementForecast} from '../lib/wearView';

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}

const SHOE: Shoe = {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 300, max: 700, condition: '양호'};

const okForecast: ReplacementForecast = {
  kmRemaining: 250,
  weeksRemaining: 3.4,
  etaISO: '2026-07-15T00:00:00.000Z',
  confidence: 'high',
  reason: 'ok',
};

describe('HomeScreen 히어로 — 교체 예측 ETA', () => {
  test('ok 예측: "약 N주 후 교체 권장 · 예상 M월 D일" ETA 한 줄을 렌더', () => {
    const root = render(<HomeScreen shoes={[SHOE]} forecast={okForecast} />).root;
    const txt = textOf(root);
    expect(txt).toContain('예상');
    expect(txt).toContain(formatEtaKo(okForecast.etaISO)); // '7월 15일'
    expect(txt).toContain(forecastLineKo(okForecast));
    expect(txt).toContain('약');
  });

  test('overdue 예측: "지금 교체하면 부상 없이 계속" 한 줄을 렌더', () => {
    const overdue: ReplacementForecast = {
      kmRemaining: -20, weeksRemaining: 0, etaISO: '2026-06-04T00:00:00.000Z', confidence: 'low', reason: 'overdue',
    };
    const root = render(<HomeScreen shoes={[SHOE]} forecast={overdue} />).root;
    expect(textOf(root)).toContain('지금 교체하면 부상 없이 계속 달릴 수 있어요');
  });

  test('no_recent 예측: 히어로에 예측 줄을 노출하지 않는다(ok/overdue만)', () => {
    const noRecent: ReplacementForecast = {
      kmRemaining: 400, weeksRemaining: null, etaISO: null, confidence: 'low', reason: 'no_recent',
    };
    const root = render(<HomeScreen shoes={[SHOE]} forecast={noRecent} />).root;
    const txt = textOf(root);
    expect(txt).not.toContain('교체 권장');
    expect(txt).not.toContain('최근 기록이 없어'); // no_recent는 홈에선 숨김
  });
});
