/**
 * HistoryScreen.rn.tsx — 편집 폼 소요시간 프리필/편집 라운드트립(중복제거 회귀).
 *
 * d2-dedup 후속 수정: 편집 폼 시간 프리필은 MM:SS-total('65:00' 식, 분 무패딩·60 초과)
 * 이어야 한다. 입력 마스크(maskDuration)는 MM:SS(콜론 1개)만 다루므로, 프리필을
 * fmtTime(H:MM:SS '1:05:00')으로 바꾸면 편집 첫 타건에 마스크가 '1:05:00'→'10:50'(650s)
 * 으로 collapse 시켜 duration 을 손상시킨다. 관찰 가능한 불변식 두 가지를 못박는다:
 *   (1) 무편집 저장: 프리필을 그대로 저장하면 duration(초)이 보존된다.
 *   (2) 편집 저장: 시간 필드를 onChangeText(=maskDuration 경유)로 한 번 거친 뒤 저장해도
 *       duration 이 보존된다(1시간↑ 런에서 수정 전이면 실패한다).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {RunForm} from '../HistoryScreen.rn';

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
async function tapText(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll((n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle));
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  await act(async () => { hits[0].props.onPress(); });
  await flush();
}
function inputNode(root: ReactTestRenderer.ReactTestInstance, label: string): any {
  const hits = root.findAll((n: any) => n && n.props && n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function');
  if (!hits.length) throw new Error(`no TextInput labeled "${label}"`);
  return hits[0];
}
function inputValue(root: ReactTestRenderer.ReactTestInstance, label: string): string {
  return inputNode(root, label).props.value;
}
async function changeInput(root: ReactTestRenderer.ReactTestInstance, label: string, text: string) {
  const node = inputNode(root, label);
  await act(async () => { node.props.onChangeText(text); });
  await flush();
}

const SHOES: Shoe[] = [{id: 's1', brand: 'Nike', model: 'Pegasus', used: 100, max: 700, condition: '양호'}];
function runWith(durationS: number): Run {
  return {
    id: 'r1', date: '6월 1일', day: '월', dateNum: '1', dist: 10, pace: "5'00\"", time: '50:00',
    shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0, durationS, runDate: '2026-06-01',
  };
}

beforeEach(async () => { await AsyncStorage.clear(); });

// 편집 진입 버튼(연필)은 사용자 요청으로 제거됨 → 공용 RunForm 을 편집 모드(initial=run)로
// 직접 렌더해 같은 불변식(프리필=MM:SS-total, 마스크 왕복 안정, duration 보존)을 검증한다.
// 편집 onSubmit 페이로드의 durationSec 가 원본 초를 보존하는지로 라운드트립을 못박는다.
describe('RunForm 편집 모드 — 소요시간 프리필/저장 라운드트립', () => {
  test.each([
    ['sub-hour', 3000, '50:00'],
    ['hour-plus', 3900, '65:00'],
  ])('%s 런: 프리필=MM:SS-total, 시간 미수정 저장 시 duration 보존', async (_label, durationS, expectedPrefill) => {
    const onSubmit = jest.fn();
    const root = render(
      <RunForm shoes={SHOES} unit="km" initial={runWith(durationS)} onCancel={() => {}} onSubmit={onSubmit} />,
    ).root;

    // 프리필 문자열은 MM:SS-total(분 무패딩, 1시간↑는 분이 60 초과) — 마스크 호환.
    expect(inputValue(root, '시간')).toBe(expectedPrefill);

    // 시간을 건드리지 않고 저장 → durationSec 가 그대로 보존(라운드트립).
    await tapText(root, '저장하기');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].durationSec).toBe(durationS);
  });

  test.each([
    ['sub-hour', 3000],
    ['hour-plus', 3900],
  ])('%s 런: 시간 필드 onChangeText(마스크 경유) 후 저장해도 duration 보존', async (_label, durationS) => {
    const onSubmit = jest.fn();
    const root = render(
      <RunForm shoes={SHOES} unit="km" initial={runWith(durationS)} onCancel={() => {}} onSubmit={onSubmit} />,
    ).root;

    // 편집 경로 재현: 현재 프리필 값을 시간 필드 onChangeText(=maskDuration)에 다시 통과.
    // 프리필이 H:MM:SS('1:05:00')였다면 마스크가 '10:50'으로 collapse → 저장 시 duration 손상.
    // MM:SS-total('65:00')이면 마스크 왕복이 안정적이라 값이 그대로 유지된다.
    const prefilled = inputValue(root, '시간');
    await changeInput(root, '시간', prefilled);
    expect(inputValue(root, '시간')).toBe(prefilled); // 마스크 왕복 안정

    await tapText(root, '저장하기');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].durationSec).toBe(durationS);
  });

  test('빈 duration(0초)은 프리필 빈칸 — 가짜 00:00 을 넣지 않는다', async () => {
    const root = render(
      <RunForm shoes={SHOES} unit="km" initial={runWith(0)} onCancel={() => {}} onSubmit={() => {}} />,
    ).root;
    expect(inputValue(root, '시간')).toBe('');
  });
});
