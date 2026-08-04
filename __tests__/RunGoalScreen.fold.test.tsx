/**
 * RunGoalScreen 재구성(2026-07-25 민우님 목업 확정) — "같은 값, 입력은 하나".
 *
 * 계약:
 *   1) 심박 가이드는 접힌 한 줄 — 요약이 현재 설정값을 말하고, 탭해야 4칩이 펼쳐진다.
 *   2) 접혀 있어도 설정값은 유지·적용된다(startRun 의 targetZone 에 실린다).
 *   3) 자유(목표 0) 캡션이 정밀 입력 진입점(히어로 탭)을 안내한다 — 룰러가 빠진 자리.
 *   4) 프리셋 칩·히어로 키패드는 그대로 — 지운 건 룰러(세 번째 중복 입력)뿐이다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunGoalScreen from '../RunGoalScreen.rn';

function textOf(node: any): string {
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
  return r.root;
}

const pressTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) => {
  const hit = root.findAll((n: any) => n?.props?.testID === id && typeof n.props?.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable testID "${id}"`);
  act(() => { hit.props.onPress(); });
};
const pressLabel = (root: ReactTestRenderer.ReactTestInstance, label: string) => {
  const hit = root.findAll((n: any) => n?.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
  if (!hit) throw new Error(`no pressable "${label}"`);
  act(() => { hit.props.onPress(); });
};
// 존 칩은 라벨로 센다 — findAll 은 composite/host 를 함께 반환하므로 라벨 집합이 정확.
const zoneChips = (root: ReactTestRenderer.ReactTestInstance) =>
  new Set(root.findAll((n: any) => typeof n?.props?.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith('심박 가이드 ')).map((n: any) => n.props.accessibilityLabel));

describe('심박 가이드 접힘 한 줄', () => {
  test('기본은 접힘 — 요약만 보이고 존 칩·힌트는 없다', () => {
    const root = render(<RunGoalScreen />);
    const row = root.findAll((n: any) => n?.props?.testID === 'goal-hr-row')[0];
    expect(textOf(row)).toContain('심박 가이드');
    expect(textOf(row)).toContain('끄기'); // 현재 설정값 요약(기본 = 끄기)
    expect(zoneChips(root).size).toBe(0);
  });

  test('탭 → 4칩 펼침, 선택하면 요약이 그 값으로 갱신된다', () => {
    const root = render(<RunGoalScreen />);
    pressTestID(root, 'goal-hr-row');
    expect(zoneChips(root).size).toBe(4); // 끄기·Z2·Z3·Z4
    pressLabel(root, '심박 가이드 Z3 템포');
    const row = root.findAll((n: any) => n?.props?.testID === 'goal-hr-row')[0];
    expect(textOf(row)).toContain('Z3 템포');
    // 다시 탭하면 접힌다 — 값은 요약에 남는다.
    pressTestID(root, 'goal-hr-row');
    expect(zoneChips(root).size).toBe(0);
    expect(textOf(root.findAll((n: any) => n?.props?.testID === 'goal-hr-row')[0])).toContain('Z3 템포');
  });

  test('접혀 있어도 설정값은 러닝에 실린다(표시만 접힘 — 기능 손실 0)', () => {
    const onStart = jest.fn();
    const root = render(<RunGoalScreen onStart={onStart} />);
    pressTestID(root, 'goal-hr-row');
    pressLabel(root, '심박 가이드 Z2 이지');
    pressTestID(root, 'goal-hr-row'); // 접고 시작
    pressLabel(root, '러닝 시작');
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({targetZone: 2}));
  });
});

describe('룰러 폐기 후의 거리 입력 경로', () => {
  test('자유(0) 캡션이 정밀 입력 진입점(히어로 탭)을 안내한다', () => {
    const root = render(<RunGoalScreen />);
    pressLabel(root, '거리 목표');
    expect(textOf(root)).toContain('숫자를 탭하면 직접 입력');
  });

  test('빠른 선택은 프리셋 칩 — 칩을 누르면 그 거리로 시작한다', () => {
    const onStart = jest.fn();
    const root = render(<RunGoalScreen onStart={onStart} />);
    pressLabel(root, '거리 목표');
    pressLabel(root, '10km 목표 선택');
    pressLabel(root, '러닝 시작');
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({km: 10}));
  });

  test('정밀 입력은 히어로 탭 키패드 — 하프(21.1) 같은 값을 그대로 받는다', () => {
    const onStart = jest.fn();
    const root = render(<RunGoalScreen onStart={onStart} />);
    pressLabel(root, '거리 목표');
    pressTestID(root, 'goal-bignum');
    ['2', '1', 'dot', '1'].forEach(k => pressTestID(root, `kp-${k}`));
    pressTestID(root, 'kp-ok');
    pressLabel(root, '러닝 시작');
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({km: 21.1}));
  });
});
