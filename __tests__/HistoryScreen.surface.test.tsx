/**
 * HistoryScreen.rn.tsx — 런 노면(surface) 태그 선택/영속 행동 테스트.
 *
 * props-driven(백엔드 0, 기존 jest.setup AsyncStorage 인메모리 목). 관찰 가능한 효과만
 * 단언한다:
 *   1) 편집 폼에서 노면 칩(트레일) press → AsyncStorage surface_<runId>='trail' 로 즉시
 *      영속(setRunSurface 올바른 인자). 다른 칩(트랙) press → 값이 갱신된다.
 *   2) 수동 추가 폼에서 노면 선택 후 추가 → onAddRun이 surface 인자를 함께 받는다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryScreen from '../HistoryScreen.rn';
import {Shoe, Run} from '../theme';

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
  return r;
}
async function flush() {
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
}
function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  return hits[0];
}
async function tap(root: ReactTestRenderer.ReactTestInstance, label: string) {
  await act(async () => { pressByLabel(root, label).props.onPress(); });
  await flush();
}
// 라벨 없는 버튼(예: '추가하기')은 텍스트로 — 가장 짧은(가장 구체적인) 매칭을 고른다.
async function tapText(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle));
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
function setInput(root: ReactTestRenderer.ReactTestInstance, label: string, value: string) {
  const input = root.findAll((n: any) => n && n.props && n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function');
  if (!input.length) throw new Error(`no TextInput labeled "${label}"`);
  act(() => { input[0].props.onChangeText(value); });
}

const SHOES: Shoe[] = [{id: 's1', brand: 'Nike', model: 'Pegasus', used: 100, max: 700, condition: '양호'}];
const RUN: Run = {
  id: 'r1', date: '6월 1일', day: '월', dateNum: '1', dist: 10, pace: "5'00\"", time: '50:00',
  shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0, durationS: 3000, runDate: '2026-06-01',
};

beforeEach(async () => { await AsyncStorage.clear(); });

describe('HistoryScreen — 런 노면 태그', () => {
  test('편집 폼 노면 칩 press → surface_<runId>가 올바른 값으로 영속된다', async () => {
    const root = render(
      <HistoryScreen shoes={SHOES} runs={[RUN]} onEditRun={() => {}} onAddRun={() => {}} onDeleteRun={() => {}} />,
    ).root;

    // 런 행 → 상세 → 편집 폼.
    await tap(root, '6월 1일 Nike Pegasus 기록');
    await tap(root, '편집');

    // 트레일 칩 press → 즉시 영속(편집 런은 id가 있으므로).
    await tap(root, '노면 트레일');
    expect(await AsyncStorage.getItem('surface_r1')).toBe('trail');

    // 다른 칩(트랙)으로 바꾸면 값이 갱신된다.
    await tap(root, '노면 트랙');
    expect(await AsyncStorage.getItem('surface_r1')).toBe('track');
  });

  test('수동 추가 폼: 노면 선택 후 추가 → onAddRun이 surface 인자를 받는다', async () => {
    const onAddRun = jest.fn();
    const root = render(
      <HistoryScreen shoes={SHOES} runs={[]} onAddRun={onAddRun} onEditRun={() => {}} onDeleteRun={() => {}} />,
    ).root;

    await tap(root, '수동 기록 추가');
    setInput(root, '거리', '8');
    await tap(root, '노면 트레일');
    await tapText(root, '추가하기');

    expect(onAddRun).toHaveBeenCalledTimes(1);
    const args = onAddRun.mock.calls[0];
    expect(args[0]).toBe('s1');   // shoeId
    expect(args[1]).toBe(8);      // km
    expect(args[4]).toBe('trail'); // surface (5번째 인자)
  });
});
