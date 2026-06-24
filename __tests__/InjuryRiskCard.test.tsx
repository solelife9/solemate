// InjuryRiskCard.test.tsx — 통합 부상위험 신호등 카드의 OBSERVABLE 렌더 단언.
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import InjuryRiskCard from '../InjuryRiskCard';

const TODAY = '2026-06-23';
const DAY_MS = 86400000;
function ago(n: number): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  const dt = new Date(new Date(y, m - 1, d).getTime() - n * DAY_MS);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function steadyRuns() {
  const runs = [] as {run_date: string; km: number}[];
  for (let w = 0; w < 4; w++) {
    runs.push({run_date: ago(w * 7 + 1), km: 5});
    runs.push({run_date: ago(w * 7 + 4), km: 5});
  }
  return runs;
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
function hasTestID(root: any, id: string) {
  return root.findAll((n: any) => n?.props?.testID === id).length > 0;
}

describe('InjuryRiskCard', () => {
  it('양호: safe 신호등 + 마모% 칩 노출', () => {
    const root = render(
      <InjuryRiskCard runs={steadyRuns()} shoe={{used: 100, max: 600}} todayISO={TODAY} />,
    );
    expect(hasTestID(root, 'injury-risk-card-safe')).toBe(true);
    expect(textOf(root)).toContain('오늘은 좋은 흐름'); // 비의료성 프레이밍
    expect(textOf(root)).toContain('17% 닳음'); // 100/600 — 평어 노출
    // 'ACWR' 같은 약자는 화면에 절대 노출하지 않는다(사용자가 모르는 용어).
    expect(textOf(root)).not.toContain('ACWR');
    expect(textOf(root)).toContain('이번 주 운동량');
    // 건강 정보 고지를 항상 노출한다.
    expect(textOf(root)).toContain('의학적 조언은 아니에요');
    // '부상위험' 같은 단정적 의료 표현은 쓰지 않는다.
    expect(textOf(root)).not.toContain('부상위험');
  });

  it('신발 닳음 + 부하 급증: high 신호등 + 융합 카피', () => {
    const spike = [
      {run_date: ago(20), km: 2},
      {run_date: ago(13), km: 2},
      {run_date: ago(2), km: 15},
      {run_date: ago(1), km: 15},
    ];
    const root = render(
      <InjuryRiskCard runs={spike} shoe={{used: 580, max: 600}} todayISO={TODAY} />,
    );
    expect(hasTestID(root, 'injury-risk-card-high')).toBe(true);
    expect(textOf(root)).toContain('신발도 닳았고');
    expect(textOf(root)).toContain('오늘은 쉬어갈 때'); // high 라벨도 비의료성
  });

  it('런 없음·신발 없음도 graceful(safe 렌더)', () => {
    const root = render(<InjuryRiskCard runs={[]} todayISO={TODAY} />);
    expect(hasTestID(root, 'injury-risk-card-safe')).toBe(true);
  });

  it('onPress 지정 시 "자세히" 노출 + 탭하면 콜백 호출', () => {
    const onPress = jest.fn();
    const root = render(
      <InjuryRiskCard runs={[]} todayISO={TODAY} onPress={onPress} />,
    );
    expect(textOf(root)).toContain('자세히');
    const card = root.findAll(
      (n: any) => n?.props?.testID === 'injury-risk-card-safe',
    )[0];
    act(() => card.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
