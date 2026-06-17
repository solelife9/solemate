/**
 * HistoryScreen.rn.tsx — 편집 폼 소요시간 프리필 라운드트립(중복제거 회귀).
 *
 * d2-dedup: fmtDurationInput 이 lib/format.fmtTime 으로 단일화됐다(MM:SS / 1시간↑
 * H:MM:SS). 관찰 가능한 불변식은 "기존 런을 편집 폼에서 열어 시간을 건드리지 않고
 * 저장하면 duration(초)이 그대로 보존된다"는 것 — 즉 초→프리필 문자열→초 라운드트립.
 * parseDurationInput 이 H:MM:SS 3분절도 되돌려 읽도록 함께 일반화돼 1시간 이상 런도
 * 안전하다(이 보장이 깨지면 1시간 런 저장 시 duration 이 손상된다).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryScreen from '../HistoryScreen.rn';
import {fmtTime} from '../lib/format';
import {Shoe, Run} from '../theme';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
async function flush() {
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
}
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
async function tap(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
async function tapText(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle));
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
function inputValue(root: ReactTestRenderer.ReactTestInstance, label: string): string {
  const hits = root.findAll((n: any) => n && n.props && n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function');
  if (!hits.length) throw new Error(`no TextInput labeled "${label}"`);
  return hits[0].props.value;
}

const SHOES: Shoe[] = [{id: 's1', brand: 'Nike', model: 'Pegasus', used: 100, max: 700, condition: '양호'}];
function runWith(durationS: number): Run {
  return {
    id: 'r1', date: '6월 1일', day: '월', dateNum: '1', dist: 10, pace: "5'00\"", time: '50:00',
    shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0, durationS, runDate: '2026-06-01',
  };
}

beforeEach(async () => { await AsyncStorage.clear(); });

describe('HistoryScreen 편집 폼 — 소요시간 프리필/저장 라운드트립', () => {
  test.each([
    ['sub-hour', 3000, '50:00'],
    ['hour-plus', 3900, '1:05:00'],
  ])('%s 런: 프리필=fmtTime, 시간 미수정 저장 시 duration 보존', async (_label, durationS, expectedPrefill) => {
    const onEditRun = jest.fn();
    const root = render(
      <HistoryScreen shoes={SHOES} runs={[runWith(durationS)]} onEditRun={onEditRun} onAddRun={() => {}} onDeleteRun={() => {}} />,
    ).root;

    await tap(root, '6월 1일 Nike Pegasus 기록'); // 행 → 상세
    await tap(root, '편집');                       // 상세 → 편집 폼

    // 프리필 문자열이 앱 전역 fmtTime 과 동일(MM:SS / H:MM:SS).
    expect(inputValue(root, '시간')).toBe(expectedPrefill);
    expect(inputValue(root, '시간')).toBe(fmtTime(durationS));

    // 시간을 건드리지 않고 저장 → duration(초)이 그대로 보존(라운드트립).
    await tapText(root, '저장하기');
    expect(onEditRun).toHaveBeenCalledTimes(1);
    expect(onEditRun.mock.calls[0][0]).toBe('r1');
    expect(onEditRun.mock.calls[0][1].duration).toBe(durationS);
  });

  test('빈 duration(0초)은 프리필 빈칸 — 가짜 00:00 을 넣지 않는다', async () => {
    const root = render(
      <HistoryScreen shoes={SHOES} runs={[runWith(0)]} onEditRun={() => {}} onAddRun={() => {}} onDeleteRun={() => {}} />,
    ).root;
    await tap(root, '6월 1일 Nike Pegasus 기록');
    await tap(root, '편집');
    expect(inputValue(root, '시간')).toBe('');
  });
});
