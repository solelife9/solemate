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
import {RunForm} from '../HistoryScreen.rn';
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
    // 편집 진입 버튼(연필)은 사용자 요청으로 제거됨 → 공용 RunForm 을 편집 모드(initial=RUN)로
    // 직접 렌더한다. 편집 런은 id 가 있어 칩 press 시 즉시 setRunSurface 로 영속된다.
    const root = render(
      <RunForm shoes={SHOES} unit="km" initial={RUN} onCancel={() => {}} onSubmit={() => {}} />,
    ).root;

    // 트레일 칩 press → 즉시 영속(편집 런은 id가 있으므로).
    await tap(root, '노면 트레일');
    expect(await AsyncStorage.getItem('surface_r1')).toBe('trail');

    // 다른 칩(트랙)으로 바꾸면 값이 갱신된다.
    await tap(root, '노면 트랙');
    expect(await AsyncStorage.getItem('surface_r1')).toBe('track');
  });

  // 수동 추가 UI 진입점({mode:'add'})은 제거되었고, 공용 RunForm(초기값 null=추가)이
  // 추가 폼의 동작을 그대로 보유한다. RunForm을 직접 렌더해 노면 선택이 onSubmit으로
  // 전달되는지 검증한다(추가 런은 id가 없어 즉시 영속 대신 제출 시 surface로 올라간다).
  test('추가 폼(RunForm initial=null): 노면 선택 후 제출 → onSubmit이 surface를 받는다', async () => {
    const onSubmit = jest.fn();
    const root = render(
      <RunForm shoes={SHOES} unit="km" initial={null} onCancel={() => {}} onSubmit={onSubmit} />,
    ).root;

    setInput(root, '거리', '8');
    await tap(root, '노면 트레일');
    await tapText(root, '추가하기');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const v = onSubmit.mock.calls[0][0];
    expect(v.shoeId).toBe('s1');    // shoeId
    expect(v.km).toBe(8);           // km
    expect(v.surface).toBe('trail'); // surface
  });
});
