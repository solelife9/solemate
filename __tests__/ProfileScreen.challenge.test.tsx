/**
 * ProfileScreen IA 정리 회귀 가드 — 마이 탭에서 홈으로 이관된 것들(2026-07-25 B안).
 *
 * 주간 목표 카드와 이번 주 스트릭 카드는 홈 '이번 주 러닝' 원카드로 합쳐졌다
 * (목표=히어로 탭 스테퍼 시트, 스트릭=히어로 점 7칸). 같은 정보가 두 번째 집을
 * 다시 차리지 않도록 '마이 탭에 없음'을 계약으로 고정한다 — 마이 탭은 정체성·진척·
 * 기록(PR)·리캡에 집중한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen.rn';

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

function render(props: any = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  return renderer.root;
}

function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id);
}

describe('ProfileScreen — 홈으로 이관된 카드는 마이 탭에 없다', () => {
  test('주간 목표 카드(구 스마트 챌린지)가 렌더되지 않는다', () => {
    const root = render({todayISO: '2026-06-12'});
    expect(byTestId(root, 'smart-challenge-section').length).toBe(0);
    expect(byTestId(root, 'smart-challenge').length).toBe(0);
    expect(byTestId(root, 'smart-challenge-edit').length).toBe(0);
  });

  test('이번 주 스트릭 카드가 렌더되지 않는다', () => {
    const root = render({todayISO: '2026-06-12'});
    expect(byTestId(root, 'streak-card').length).toBe(0);
    expect(byTestId(root, 'streak-day-0').length).toBe(0);
    expect(textOf(root)).not.toContain('이번 주 연속');
  });
});
