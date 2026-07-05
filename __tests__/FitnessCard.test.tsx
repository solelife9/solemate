/**
 * FitnessCard — 심폐 체력(VO2max) 컴포넌트. 애널리틱스 다이어트(2026-07-05)로
 * 오늘 컨디션(TSB)·체력 추이(CTL) 제거, VO2max 하나만.
 *
 * 홈 화면에 놓이는 개인 체력 대시보드. runs 에서 fitnessSummary 를 자체 계산하고,
 * 타임 있는 노력 런이 없으면(vo2max 0) 숨긴다(날조 금지). 산식은 lib/analytics 단위
 * 테스트가 담당 — 여기선 '뜨는가/숨는가 + 일반인용 문구'만 본다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {FitnessCard} from '../FitnessCard';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
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

const TODAY = '2026-06-30';

describe('FitnessCard', () => {
  test('타임 있는 노력 런 → 심폐 체력 + VO2max 등급 (오늘 컨디션·체력 추이는 제거됨)', () => {
    // 5km 20:00 → VDOT ≈ 49.8 → 등급 '우수'.
    const runs = [{id: 'a', km: 5, duration: 20 * 60, run_date: TODAY}];
    const txt = textOf(render(<FitnessCard runs={runs} todayISO={TODAY} />).root);
    expect(txt).toContain('심폐 체력');
    expect(txt).toContain('VO');       // VO₂max 라벨
    expect(txt).toContain('우수');     // vdotLabel(49.8)
    // 코칭 계층(오늘 컨디션 TSB·체력 추이 CTL)은 다이어트로 제거 — 성취 지표만 남긴다.
    expect(txt).not.toContain('오늘 컨디션');
    expect(txt).not.toContain('체력 추이');
  });

  test('타임 없는 런만 있으면 숨김(VDOT 산출 불가 → null)', () => {
    const runs = [{id: 'a', km: 5, duration: 0, run_date: TODAY}];
    expect(render(<FitnessCard runs={runs} todayISO={TODAY} />).toJSON()).toBeNull();
  });

  test('런이 없으면 숨김', () => {
    expect(render(<FitnessCard runs={[]} todayISO={TODAY} />).toJSON()).toBeNull();
  });

  test('UI Run 형태(dist/durationS/runDate)도 매핑한다', () => {
    const runs = [{id: 'a', dist: 5, durationS: 20 * 60, runDate: TODAY}];
    const txt = textOf(render(<FitnessCard runs={runs} todayISO={TODAY} />).root);
    expect(txt).toContain('심폐 체력');
  });
});
