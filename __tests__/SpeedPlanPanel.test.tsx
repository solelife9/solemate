/**
 * SpeedPlanPanel — 스피드(페이스 플랜) 입력 패널.
 * 재구성(2026-07-25) 계약: 평균 페이스 히어로(± 스테퍼) · 자동 요약(거리 × 평균 페이스) ·
 * 거리 칩 행(스테퍼 폐기) · km별 미세조정은 접힌 줄(goal-perkm-row) 안에 그대로.
 * onChange(km, plan) 데이터 계약은 표현 재구성 전과 동일.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import SpeedPlanPanel from '../SpeedPlanPanel';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
function press(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hit = root.findAll((n: any) => n?.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  act(() => { hit.props.onPress(); });
}
function pressTestID(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  const hit = root.findAll((n: any) => n?.props?.testID === testID && typeof n.props.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable testID "${testID}"`);
  act(() => { hit.props.onPress(); });
}
const findTestID = (root: ReactTestRenderer.ReactTestInstance, testID: string) =>
  root.findAll((n: any) => n?.props?.testID === testID);
const textAll = (root: ReactTestRenderer.ReactTestInstance): string =>
  (root.findAll((n: any) => typeof n.type === 'string' && n.type === 'Text') as any[])
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' ');
const lastChange = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1];

describe('SpeedPlanPanel — 페이스 플랜 입력(재구성)', () => {
  test('마운트 시 거리(기본 5km)와 5칸 플랜을 onChange 로 올린다', () => {
    const onChange = jest.fn();
    render(<SpeedPlanPanel onChange={onChange} />);
    expect(onChange).toHaveBeenCalled();
    const [km, plan] = lastChange(onChange);
    expect(km).toBe(5);
    expect(plan.length).toBe(5);
  });

  test('히어로: 평균 페이스 큰 숫자 + 요약("5km · 예상 30\'00\"" — 거리 × 평균 페이스)', () => {
    const root = render(<SpeedPlanPanel />).root;
    const txt = textAll(root);
    expect(txt).toContain("6'00\"");            // 기본 평균 페이스 히어로
    expect(txt).toContain('/km');
    expect(txt).toContain("5km · 예상 30'00\""); // 5km × 6'00" = 30'00"
  });

  test('히어로 − (goal-pace-minus) → 평균 페이스 5초 빨라지고 요약·플랜이 따라온다', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    pressTestID(root, 'goal-pace-minus'); // 360 → 355
    const txt = textAll(root);
    expect(txt).toContain("5'55\"");
    expect(txt).toContain("5km · 예상 29'35\""); // 5 × 355 = 1775초
    const [, plan] = lastChange(onChange);
    expect(Math.round(plan.reduce((a: number, b: number) => a + b, 0) / plan.length)).toBe(355);
  });

  test('히어로 + (goal-pace-plus) → 평균 페이스 5초 느려진다', () => {
    const root = render(<SpeedPlanPanel />).root;
    pressTestID(root, 'goal-pace-plus'); // 360 → 365
    expect(textAll(root)).toContain("6'05\"");
  });

  test('거리 칩(10km) → 플랜 칸 수가 따라 늘어난다(스테퍼 폐기 후 유일한 거리 입력)', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    press(root, '10km 목표 선택');
    const [km, plan] = lastChange(onChange);
    expect(km).toBe(10);
    expect(plan.length).toBe(10);
  });

  test('하프 칩 → 21.1km(부분 구간 포함 22칸) + 1시간 이상 요약은 H:MM:SS', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    press(root, '하프 목표 선택');
    const [km, plan] = lastChange(onChange);
    expect(km).toBe(21.1);
    expect(plan.length).toBe(22); // 21 + 마지막 0.1km 부분 구간
    expect(textAll(root)).toContain('21.1km · 예상 2:06:36'); // 21.1 × 360초
  });

  test('km별 목표 조정은 접혀 있다 — goal-perkm-row 탭으로 펼치고 다시 접는다', () => {
    const root = render(<SpeedPlanPanel />).root;
    expect(findTestID(root, 'plan-km-1')).toHaveLength(0); // 기본 접힘
    pressTestID(root, 'goal-perkm-row');
    expect(findTestID(root, 'plan-km-1').length).toBeGreaterThan(0); // 펼침 → km 칩
    pressTestID(root, 'goal-perkm-row');
    expect(findTestID(root, 'plan-km-1')).toHaveLength(0); // 다시 접힘
  });

  test('km칸 직접 미세조정(접힘 펼친 뒤) → 그 구간만 5초 느려진다(custom)', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    const before = lastChange(onChange)[1].slice();
    pressTestID(root, 'goal-perkm-row'); // 접힘 펼침
    // 3km 칸 선택(selIdx=2) 후 '느리게(+5초)'
    pressTestID(root, 'plan-km-3');
    press(root, '3킬로미터 목표 5초 느리게');
    const after = lastChange(onChange)[1];
    expect(after[2]).toBe(before[2] + 5);      // 3구간만 +5초
    expect(after[0]).toBe(before[0]);          // 다른 구간 불변
  });

  test('custom 중 히어로 ± → 조정한 모양을 보존한 채 전 구간이 함께 밀린다', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    pressTestID(root, 'goal-perkm-row');
    pressTestID(root, 'plan-km-3');
    press(root, '3킬로미터 목표 5초 느리게'); // custom 진입
    const custom = lastChange(onChange)[1].slice();
    pressTestID(root, 'goal-pace-minus'); // 전 구간 −5초
    const after = lastChange(onChange)[1];
    after.forEach((p: number, i: number) => expect(p).toBe(custom[i] - 5));
  });

  test('custom 중 거리 칩 → 자동 전략으로 복귀해 플랜 길이가 거리와 맞는다(근본수정 가드)', () => {
    const onChange = jest.fn();
    const root = render(<SpeedPlanPanel onChange={onChange} />).root;
    pressTestID(root, 'goal-perkm-row');
    pressTestID(root, 'plan-km-3');
    press(root, '3킬로미터 목표 5초 느리게'); // custom 진입
    press(root, '10km 목표 선택');
    const [km, plan] = lastChange(onChange);
    expect(km).toBe(10);
    expect(plan.length).toBe(10); // custom 잔재(5칸)가 아니라 새 거리로 재생성
  });
});
