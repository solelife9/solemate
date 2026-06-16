/**
 * AddShoeScreen integration tests.
 *
 * Drives the real screen (with the expo-image-picker mock) and asserts observable
 * outcomes — what renders and what the onSave callback actually receives — not
 * internal state. 모델 선택은 전용 검색 모달(탭→검색창+알파벳 목록)로 동작한다:
 *
 *   1) 모델을 검색해 고르면 권장 수명(km)이 자동으로 채워지고 '권장' 배지가 뜬다.
 *   2) 권장값을 직접 바꾸면 '권장' 배지가 사라지고, 저장 시 바뀐 값이 전달된다.
 *   3) 사진 선택이 실패해도 저장이 막히지 않는다(비차단).
 *   4) 사진 선택에 성공하면 미리보기가 뜨고 photoUri가 onSave에 실린다.
 *   5) 모달을 열면 브랜드 전체 모델이 알파벳순으로 뜬다.
 *   6) 검색어를 입력하면 부분일치로 좁혀진다.
 *   7) 전체 목록에서 항목을 고르면 model/권장 max가 세팅된다.
 *   8) DB에 없는 모델명은 '직접 추가'로 등록할 수 있다.
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
    if (typeof n === 'string') { out += n; return; }
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
  await act(async () => { node.props.onPress(); });
  await flush();
}

// The 모델 선택 트리거(메인 화면). 누르면 검색 모달이 열린다.
function selector(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === '모델 선택',
  )[0];
}
// 모달 내부 검색 입력(없으면 모달이 닫혀 있는 것).
function searchInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(n => n.type === TextInput && n.props.placeholder === '모델 검색 또는 직접 입력')[0];
}
// 선택된(커밋된) 모델을 보여주는 트리거의 텍스트.
function modelDisplay(root: ReactTestRenderer.ReactTestInstance): string {
  return textOf(selector(root));
}
async function openPicker(root: ReactTestRenderer.ReactTestInstance) {
  await tap(selector(root));
}
async function typeModel(root: ReactTestRenderer.ReactTestInstance, text: string) {
  if (!searchInput(root)) await openPicker(root);
  await act(async () => { searchInput(root).props.onChangeText(text); });
  await flush();
}

// The 최대 수명 field is the number-pad input; current 누적 거리 is decimal-pad.
function maxInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(n => n.type === TextInput && n.props.keyboardType === 'number-pad')[0];
}

// Exact-match '권장' badge only (the hint string also contains the substring).
function badgeShown(root: ReactTestRenderer.ReactTestInstance): boolean {
  return root.findAll((n: any) => n && n.props && n.props.children === '권장').length > 0;
}

// 모달의 DB 추천 행들(모델명) — '직접 추가' 커스텀 행은 제외한다.
function suggestedModels(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll(
      (n: any) =>
        n &&
        n.props &&
        typeof n.props.onPress === 'function' &&
        n.props.accessibilityRole === 'button' &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.length > 0 &&
        !n.props.accessibilityLabel.startsWith('직접 추가') &&
        /\dkm$/.test(textOf(n)),
    )
    .map((n: any) => n.props.accessibilityLabel as string);
}

// ── 1) model pick → recommended km auto-fills + '권장' badge ────────────────────
test('모델을 검색해 카본화를 고르면 권장 450km가 자동 입력되고 권장 배지가 뜬다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await typeModel(root, 'Vaporfly');
  await tap(pressBy(root, 'Vaporfly 4')); // 모달 추천 선택 → 모달 닫힘

  expect(maxInput(root).props.value).toBe('450');
  expect(badgeShown(root)).toBe(true);

  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toMatchObject({brand: 'Nike', model: 'Vaporfly 4', max: 450});
});

// ── 2) editing the recommended value drops the badge and is what gets saved ─────
test('권장값을 직접 수정하면 권장 배지가 사라지고 수정한 값이 저장된다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await typeModel(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  expect(maxInput(root).props.value).toBe('700');
  expect(badgeShown(root)).toBe(true);

  await act(async () => { maxInput(root).props.onChangeText('600'); });
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

  await tap(pressBy(root, '신발 사진'));
  expect(textOf(root)).toContain('다시 시도');
  expect(textOf(root)).toContain('사진을 불러오지 못했어요');

  await typeModel(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  await tap(pressBy(root, '러닝화 등록'));

  expect(onSave).toHaveBeenCalledTimes(1);
  const saved = onSave.mock.calls[0][0];
  expect(saved).toMatchObject({brand: 'Nike', model: 'Pegasus 41'});
  expect(saved.photoUri).toBeUndefined();
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
  const imgs = root.findAll(n => n.type === Image && n.props.source && n.props.source.uri === 'file:///shoe.jpg');
  expect(imgs.length).toBe(1);

  await typeModel(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  await tap(pressBy(root, '러닝화 등록'));

  expect(onSave.mock.calls[0][0].photoUri).toBe('file:///shoe.jpg');
});

// ── 5) 모달을 열면(빈 검색) 브랜드 전체 모델이 알파벳순으로 뜬다 ─────────────────────
test('모델 모달을 열면 브랜드(Nike) 전체 모델이 알파벳순으로 뜬다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await openPicker(root);

  const shown = suggestedModels(root);
  expect(shown).toHaveLength(17);
  expect(shown[0]).toBe('Alphafly 3');
  const sorted = [...shown].sort((a, b) => a.localeCompare(b));
  expect(shown).toEqual(sorted);
  expect(shown).toEqual(expect.arrayContaining(['Pegasus 41', 'Vaporfly 4', 'Zoom Fly 6']));
});

// ── 6) 검색어를 입력하면 전체 목록이 부분일치로 좁혀진다 ───────────────────────────
test('모델명을 검색하면 전체 목록이 부분일치로 필터된다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await openPicker(root);
  expect(suggestedModels(root)).toHaveLength(17);

  await typeModel(root, 'Pegasus');
  const filtered = suggestedModels(root);
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.length).toBeLessThan(17);
  expect(filtered.every(m => m.toLowerCase().includes('pegasus'))).toBe(true);
});

// ── 7) 전체 목록에서 항목 탭 → model/max(권장수명) 자동 세팅 ──────────────────────────
test('전체 목록에서 항목을 선택하면 model과 권장 수명(max)이 세팅된다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await openPicker(root);
  await tap(pressBy(root, 'Alphafly 3')); // 카본 카테고리 기본 450km

  expect(modelDisplay(root)).toContain('Alphafly 3'); // 트리거에 선택 모델 표시
  expect(maxInput(root).props.value).toBe('450');
  expect(badgeShown(root)).toBe(true);

  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave.mock.calls[0][0]).toMatchObject({brand: 'Nike', model: 'Alphafly 3', max: 450});
});

// ── 8) DB에 없는 모델명은 '직접 추가'로 등록할 수 있다 ────────────────────────────────
test('DB에 없는 모델명을 검색하면 직접 추가로 등록된다(카테고리 기본 권장수명)', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await typeModel(root, 'My Custom Shoe');
  // 정확 일치가 없으므로 '직접 추가' 행이 뜬다.
  await tap(pressBy(root, '직접 추가'));

  expect(modelDisplay(root)).toContain('My Custom Shoe');
  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave.mock.calls[0][0]).toMatchObject({brand: 'Nike', model: 'My Custom Shoe'});
});
