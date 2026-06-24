// InjuryRiskDetail.test.tsx — 상세(신호 분해 + 코칭) OBSERVABLE 렌더 단언.
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import InjuryRiskDetail from '../InjuryRiskDetail';

const TODAY = '2026-06-23';
const DAY_MS = 86400000;
function ago(n: number): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  const dt = new Date(new Date(y, m - 1, d).getTime() - n * DAY_MS);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (n && n.children) n.children.forEach(walk);
  };
  walk(node);
  return out;
}
function render(el: React.ReactElement) {
  let r: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r!.root;
}
const hasTestID = (root: any, id: string) =>
  root.findAll((n: any) => n?.props?.testID === id).length > 0;

describe('InjuryRiskDetail', () => {
  it('신발 닳음 + 부하 급증: high 상세 + 코칭 두 개 + 약자 없음', () => {
    const spike = [
      { run_date: ago(20), km: 2 },
      { run_date: ago(13), km: 2 },
      { run_date: ago(2), km: 15 },
      { run_date: ago(1), km: 15 },
    ];
    const root = render(
      <InjuryRiskDetail runs={spike} shoe={{ used: 580, max: 600 }} todayISO={TODAY} />,
    );
    expect(hasTestID(root, 'injury-risk-detail-high')).toBe(true);
    const t = textOf(root);
    expect(t).toContain('신발 교체가 필요해요');
    expect(t).toContain('오늘은 회복이 우선');
    expect(t).toContain('이렇게 하면 부상 없이 킵고잉');
    expect(t).not.toContain('ACWR');
    expect(t).toContain('의학적 조언은 아니에요'); // 고지 노출
    expect(t).not.toContain('부상위험'); // 비의료성 프레이밍
  });

  it('모두 양호: safe 상세 + 격려 코칭', () => {
    const runs = [] as { run_date: string; km: number }[];
    for (let w = 0; w < 4; w++) {
      runs.push({ run_date: ago(w * 7 + 1), km: 5 });
      runs.push({ run_date: ago(w * 7 + 4), km: 5 });
    }
    const root = render(
      <InjuryRiskDetail runs={runs} shoe={{ used: 100, max: 600 }} todayISO={TODAY} />,
    );
    expect(hasTestID(root, 'injury-risk-detail-safe')).toBe(true);
    expect(textOf(root)).toContain('지금 페이스 그대로');
  });
});
