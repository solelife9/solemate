/**
 * HomeScreen.rn.tsx — 홈 신발 카드(링 게이지 디자인) + 교체 예측 연동 행동 테스트.
 *
 * 새 디자인(핸드오프): '오늘의 신발' 카드는 수명 링(소진율·남은거리)로 마모 상태를 보이고,
 * 예전의 ETA 한 줄("약 N주 후 교체 권장 · 예상 …")은 카드에서 뺐다(사진 정합, 상세로 이관).
 * 대신 forecast 가 overdue 면 '다음 러닝화' 추천이 뜨는 흐름은 유지된다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import {Shoe} from '../theme';
import {type ReplacementForecast} from '../lib/wearView';

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

describe('HomeScreen 신발 카드(링 게이지)', () => {
  test('수명 링: 소진율(%)과 남은 거리를 보여준다', () => {
    const txt = textOf(render(<HomeScreen shoes={[SHOE]} />).root);
    expect(txt).toContain('수명 소진율');
    expect(txt).toContain('43');        // 300/700 ≈ 43%
    expect(txt).toContain('400km 남음'); // remaining
    expect(txt).toContain('러닝 시작');
  });

  test('새 디자인: 카드에 옛 ETA 예측 줄("교체 권장 · 예상 …")은 노출하지 않는다', () => {
    const okForecast: ReplacementForecast = {
      kmRemaining: 250, weeksRemaining: 3.4, etaISO: '2026-07-15T00:00:00.000Z', confidence: 'high', reason: 'ok',
    };
    const txt = textOf(render(<HomeScreen shoes={[SHOE]} forecast={okForecast} />).root);
    expect(txt).not.toContain('교체 권장');
    expect(txt).not.toContain('예상 7월');
  });

  test('overdue 예측이면 다음 러닝화 추천 흐름이 뜬다', () => {
    const overdue: ReplacementForecast = {
      kmRemaining: -20, weeksRemaining: 0, etaISO: '2026-06-04T00:00:00.000Z', confidence: 'low', reason: 'overdue',
    };
    const txt = textOf(render(<HomeScreen shoes={[SHOE]} forecast={overdue} />).root);
    expect(txt).toContain('다음 러닝화');
  });
});
