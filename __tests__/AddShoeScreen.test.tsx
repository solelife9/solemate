/**
 * AddShoeScreen integration tests.
 *
 * Drives the real screen (with the expo-image-picker mock) and asserts observable
 * outcomes — what renders and what the onSave callback actually receives — not
 * internal state:
 *
 *   1) 모델 자동완성에서 모델을 고르면 권장 수명(km)이 자동으로 채워지고 '권장' 배지가
 *      뜬다. data/shoeModels의 getRecommendedLifespanKm이 단일 소스(카본=320, 데일리=700).
 *   2) 권장값을 사용자가 직접 바꾸면 '권장' 배지가 사라지고, 저장 시 바뀐 값이 전달된다.
 *   3) 사진 선택이 실패해도 저장이 막히지 않는다(비차단) — 에러/재시도가 표시되고
 *      사진 없이 onSave가 호출된다.
 *   4) 사진 선택에 성공하면 미리보기가 뜨고 onSave에 photoUri가 실려 나간다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TextInput, Image} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AddShoeScreen from '../AddShoeScreen.rn';
import {Shoe} from '../theme';

const launchMock = ImagePicker.launchImageLibraryAsync as unknown as jest.Mock;
const permMock = ImagePicker.requestMediaLibraryPermissionsAsync as unknown as jest.Mock;

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountScreen(onSave: (s: Shoe) => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<AddShoeScreen onSave={onSave} />);
  });
  await flush();
  return renderer.root;
}

// Most-specific Pressable whose rendered text contains `needle`.
function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

async function tap(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
  });
  await flush();
}

function modelInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(n => n.type === TextInput && n.props.placeholder === '예: Pegasus 41')[0];
}

// The 최대 수명 field is the number-pad input; current 누적 거리 is decimal-pad.
function maxInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(n => n.type === TextInput && n.props.keyboardType === 'number-pad')[0];
}

// Exact-match '권장' Text only the badge renders (the hint string also contains
// the substring, so we match children equality, not textOf).
function badgeShown(root: ReactTestRenderer.ReactTestInstance): boolean {
  return root.findAll((n: any) => n && n.props && n.props.children === '권장').length > 0;
}

async function typeModel(root: ReactTestRenderer.ReactTestInstance, text: string) {
  const input = modelInput(root);
  await act(async () => {
    input.props.onFocus();
    input.props.onChangeText(text);
  });
  await flush();
}

// ── 1) model pick → recommended km auto-fills + '권장' badge ────────────────────
test('모델 자동완성에서 카본화를 고르면 권장 320km가 자동 입력되고 권장 배지가 뜬다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  // 기본 브랜드(Nike)에서 카본 레이싱 모델을 검색 → 드롭다운 제안 등장.
  await typeModel(root, 'Vaporfly');
  // 제안(Nike · Vaporfly 4 · 320km)을 선택.
  await tap(pressBy(root, 'Vaporfly 4'));

  // 관찰: 최대 수명 입력칸이 320으로 자동 채워지고 '권장' 배지가 보인다.
  expect(maxInput(root).props.value).toBe('320');
  expect(badgeShown(root)).toBe(true);

  // 저장 시 자동값 320이 그대로 전달된다.
  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toMatchObject({
    brand: 'Nike',
    model: 'Vaporfly 4',
    max: 320,
  });
});

// ── 2) editing the recommended value drops the badge and is what gets saved ─────
test('권장값을 직접 수정하면 권장 배지가 사라지고 수정한 값이 저장된다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await typeModel(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  expect(maxInput(root).props.value).toBe('700'); // 데일리 트레이너 권장
  expect(badgeShown(root)).toBe(true);

  // 사용자가 600으로 바꾼다 → 권장 배지가 사라진다.
  await act(async () => {
    maxInput(root).props.onChangeText('600');
  });
  await flush();
  expect(maxInput(root).props.value).toBe('600');
  expect(badgeShown(root)).toBe(false);

  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave.mock.calls[0][0]).toMatchObject({model: 'Pegasus 41', max: 600});
});

// ── 3) photo pick failure must NOT block saving ────────────────────────────────
test('사진 선택이 실패해도 저장은 비차단 — 에러/재시도 표시 후 사진 없이 저장된다', async () => {
  permMock.mockResolvedValueOnce({granted: true, status: 'granted'});
  launchMock.mockRejectedValueOnce(new Error('picker exploded'));

  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  // 사진 영역을 눌러 선택 시도 → 실패.
  await tap(pressBy(root, '신발 사진'));

  // 관찰: 실패가 표시되고 재시도가 안내된다(앱이 죽지 않는다).
  expect(textOf(root)).toContain('다시 시도');
  expect(textOf(root)).toContain('사진을 불러오지 못했어요');

  // 그래도 저장은 진행된다 — 모델만 채우면 사진 없이 등록 가능.
  await typeModel(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  await tap(pressBy(root, '러닝화 등록'));

  expect(onSave).toHaveBeenCalledTimes(1);
  const saved = onSave.mock.calls[0][0];
  expect(saved).toMatchObject({brand: 'Nike', model: 'Pegasus 41'});
  expect(saved.photoUri).toBeUndefined(); // 사진 실패 → 사진 없이 저장
});

// ── 4) photo pick success → preview + photoUri in onSave ───────────────────────
test('사진 선택에 성공하면 미리보기가 뜨고 photoUri가 저장에 실린다', async () => {
  permMock.mockResolvedValueOnce({granted: true, status: 'granted'});
  launchMock.mockResolvedValueOnce({
    canceled: false,
    assets: [{uri: 'file:///shoe.jpg', width: 100, height: 100}],
  });

  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await tap(pressBy(root, '신발 사진'));

  // 관찰: 선택한 사진이 미리보기로 렌더된다.
  const imgs = root.findAll(n => n.type === Image && n.props.source && n.props.source.uri === 'file:///shoe.jpg');
  expect(imgs.length).toBe(1);

  await typeModel(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  await tap(pressBy(root, '러닝화 등록'));

  expect(onSave.mock.calls[0][0].photoUri).toBe('file:///shoe.jpg');
});
