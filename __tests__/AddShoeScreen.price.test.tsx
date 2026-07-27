/**
 * 러닝화 등록 — 구매가(선택) 입력.
 *
 * 원/km(1km당 비용)의 분자다. 정가를 추측해 채우지 않고 사용자가 실제로 낸 값만 받는다.
 * 그래서 이 화면의 계약은 둘뿐이다:
 *   · 입력하면 숫자로 onSave 에 실린다.
 *   · 비우면 필드를 아예 싣지 않는다('모름'과 '0원'은 다르다).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TextInput} from 'react-native';
import AddShoeScreen, {formatPriceInput} from '../AddShoeScreen.rn';
import {Shoe} from '../theme';

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

async function mountScreen(onSave: (s: Shoe) => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<AddShoeScreen onSave={onSave} />);
  });
  await flush();
  return renderer.root;
}

function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

async function tap(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => { node.props.onPress(); });
  await flush();
}

function searchInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n.type === TextInput && n.props.testID === 'picker-search')[0];
}

async function search(root: ReactTestRenderer.ReactTestInstance, text: string) {
  if (!searchInput(root)) {
    await tap(root.findAll((n: any) => n && n.props && n.props.testID === 'add-shoe-select')[0]);
  }
  await act(async () => { searchInput(root).props.onChangeText(text); });
  await flush();
}

function priceInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n.type === TextInput && n.props.testID === 'add-shoe-price')[0];
}

/** 피커에서 모델을 골라 저장 가능한 상태로 만든다. */
async function pickPegasus(root: ReactTestRenderer.ReactTestInstance) {
  await search(root, 'Pegasus 41');
  await tap(pressBy(root, 'Pegasus 41'));
}

describe('구매가 입력 — 선택이고, 비우면 싣지 않는다', () => {
  test('구매가를 비우고 저장하면 priceKrw 가 실리지 않는다', async () => {
    const onSave = jest.fn();
    const root = await mountScreen(onSave);
    await pickPegasus(root);

    await tap(pressBy(root, '러닝화 등록'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.model).toBe('Pegasus 41');
    expect('priceKrw' in saved).toBe(false);
  });

  test('구매가를 입력하면 숫자로 실린다(콤마는 벗겨진다)', async () => {
    const onSave = jest.fn();
    const root = await mountScreen(onSave);
    await pickPegasus(root);

    await act(async () => { priceInput(root).props.onChangeText('169000'); });
    await flush();
    expect(priceInput(root).props.value).toBe('169,000');

    await tap(pressBy(root, '러닝화 등록'));
    expect(onSave.mock.calls[0][0].priceKrw).toBe(169000);
  });

  test('0을 넣어도 싣지 않는다(0원에 샀다고 오해하지 않게)', async () => {
    const onSave = jest.fn();
    const root = await mountScreen(onSave);
    await pickPegasus(root);

    await act(async () => { priceInput(root).props.onChangeText('0'); });
    await flush();

    await tap(pressBy(root, '러닝화 등록'));
    expect('priceKrw' in onSave.mock.calls[0][0]).toBe(false);
  });

  test('구매가가 없어도 등록은 막히지 않는다(선택 필드)', async () => {
    const onSave = jest.fn();
    const root = await mountScreen(onSave);
    await pickPegasus(root);
    await tap(pressBy(root, '러닝화 등록'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('formatPriceInput — 입력 정규화', () => {
  test('숫자만 남기고 천단위 콤마를 붙인다', () => {
    expect(formatPriceInput('169000')).toBe('169,000');
    expect(formatPriceInput('169,000')).toBe('169,000');
    expect(formatPriceInput('16만9천원')).toBe('169');
  });

  test('빈 값·0·문자만 있으면 빈 문자열', () => {
    expect(formatPriceInput('')).toBe('');
    expect(formatPriceInput('원')).toBe('');
    expect(formatPriceInput('0')).toBe('');
    expect(formatPriceInput('000')).toBe('');
  });

  test('7자리에서 끊어 0 하나 더 누른 오타를 막는다', () => {
    expect(formatPriceInput('123456789')).toBe('1,234,567');
  });
});
