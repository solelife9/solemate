/**
 * AddShoeScreen integration tests.
 *
 * 2026-07-07: 등록 UX 가 온보딩과 통일됐다 — 브랜드 칩 + 전용 모델 모달 대신 하나의
 * '러닝화' 선택 필드가 공용 2열 분할 피커(ShoePicker)를 연다. 피커는 상단 검색 +
 * 좌 브랜드 레일(알파벳순) + 우 모델 목록(알파벳순, 카테고리·권장 km) + 직접 입력.
 *
 * 관찰 가능한 결과만 단언한다 — 무엇이 렌더되고 onSave 가 실제로 무엇을 받는지.
 *   1) 모델을 검색해 고르면 권장 수명(km)이 자동으로 채워지고 '권장' 배지가 뜬다.
 *   2) 권장값을 직접 바꾸면 '권장' 배지가 사라지고, 저장 시 바뀐 값이 전달된다.
 *   3) '기타' 브랜드 레일에서 브랜드+모델을 직접 입력해 저장할 수 있다.
 *   4) 사진 선택이 실패해도 저장이 막히지 않는다(비차단).
 *   5) 사진 선택에 성공하면 미리보기가 뜨고 photoUri가 onSave에 실린다.
 *   6) 피커를 열면 브랜드(Nike) 전체 모델이 알파벳순으로 뜬다.
 *   7) 검색어를 입력하면 부분일치로 좁혀진다.
 *   8) DB에 없는 모델명은 검색 결과의 '직접 추가'로 등록할 수 있다.
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

// 메인 화면의 '러닝화' 선택 트리거 — 누르면 공용 2열 분할 피커가 열린다.
function selector(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.props && n.props.testID === 'add-shoe-select')[0];
}
function modelDisplay(root: ReactTestRenderer.ReactTestInstance): string {
  return textOf(selector(root));
}
async function openPicker(root: ReactTestRenderer.ReactTestInstance) {
  await tap(selector(root));
}
// 피커 상단 검색 입력.
function searchInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n.type === TextInput && n.props.testID === 'picker-search')[0];
}
async function search(root: ReactTestRenderer.ReactTestInstance, text: string) {
  if (!searchInput(root)) await openPicker(root);
  await act(async () => { searchInput(root).props.onChangeText(text); });
  await flush();
}

// The 교체 권장 거리 field is the only number-pad input on the main screen.
function maxInput(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(n => n.type === TextInput && n.props.keyboardType === 'number-pad')[0];
}

// Exact-match '권장' badge only (the hint string also contains the substring).
function badgeShown(root: ReactTestRenderer.ReactTestInstance): boolean {
  return root.findAll((n: any) => n && n.props && n.props.children === '권장').length > 0;
}

// 피커의 모델 행들 — role=button + 라벨에 '권장'(sub 문구) 포함. 브랜드 레일(role=tab)과
// 직접-추가 행(라벨에 '권장' 없음)은 제외된다. 라벨 = "브랜드 모델, 카테고리 · 권장 NNN km".
function modelRows(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll(
      (n: any) =>
        n &&
        n.props &&
        typeof n.props.onPress === 'function' &&
        n.props.accessibilityRole === 'button' &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.includes('권장'),
    )
    .map((n: any) => (n.props.accessibilityLabel as string).split(', ')[0]); // "브랜드 모델"
}

// ── 1) model pick → recommended km auto-fills + '권장' badge ────────────────────
test('모델을 검색해 카본화를 고르면 권장 450km가 자동 입력되고 권장 배지가 뜬다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await search(root, 'Vaporfly');
  await tap(pressBy(root, 'Vaporfly 4')); // 검색 결과 선택 → 피커 닫힘

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

  await search(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  expect(maxInput(root).props.value).toBe('650');
  expect(badgeShown(root)).toBe(true);

  await act(async () => { maxInput(root).props.onChangeText('600'); });
  await flush();
  expect(maxInput(root).props.value).toBe('600');
  expect(badgeShown(root)).toBe(false);

  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave.mock.calls[0][0]).toMatchObject({model: 'Pegasus 41', max: 600});
});

// ── 3) '기타' 브랜드 레일에서 브랜드+모델 직접 입력 저장 ─────────────────────────────
test('기타 브랜드를 골라 직접 입력하면 그 브랜드 + 커스텀 모델로 저장된다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await openPicker(root);
  // 브랜드 레일에서 '기타' 선택 → 브랜드명 + 모델명 직접 입력 폼 등장
  await tap(root.findAll((n: any) => n && n.props && n.props.accessibilityLabel === '브랜드 기타')[0]);

  const brandInput = root.findAll((n: any) => n.type === TextInput && n.props.accessibilityLabel === '브랜드명 입력')[0];
  const modelInput = root.findAll((n: any) => n.type === TextInput && n.props.accessibilityLabel === '모델명 입력')[0];
  await act(async () => { brandInput.props.onChangeText('Salomon'); });
  await act(async () => { modelInput.props.onChangeText('Speedcross 6'); });
  await flush();

  await tap(pressBy(root, '추가'));

  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave.mock.calls[0][0]).toMatchObject({brand: 'Salomon', model: 'Speedcross 6'});
});

// ── 4) photo pick failure must NOT block saving ────────────────────────────────
test('사진 선택이 실패해도 저장은 비차단 — 에러/재시도 표시 후 사진 없이 저장된다', async () => {
  permMock.mockResolvedValueOnce({granted: true, status: 'granted'});
  launchMock.mockRejectedValueOnce(new Error('picker exploded'));

  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await tap(pressBy(root, '신발 사진'));
  expect(textOf(root)).toContain('다시 시도');
  expect(textOf(root)).toContain('사진을 불러오지 못했어요');

  await search(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  await tap(pressBy(root, '러닝화 등록'));

  expect(onSave).toHaveBeenCalledTimes(1);
  const saved = onSave.mock.calls[0][0];
  expect(saved).toMatchObject({brand: 'Nike', model: 'Pegasus 41'});
  expect(saved.photoUri).toBeUndefined();
});

// ── 5) photo pick success → preview + photoUri in onSave ───────────────────────
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

  await search(root, 'Pegasus');
  await tap(pressBy(root, 'Pegasus 41'));
  await tap(pressBy(root, '러닝화 등록'));

  expect(onSave.mock.calls[0][0].photoUri).toBe('file:///shoe.jpg');
});

// ── 6) 피커를 열면 브랜드(Nike) 전체 모델이 알파벳순으로 뜬다 ─────────────────────────
test('피커를 열면 브랜드(Nike) 전체 모델이 알파벳순으로 뜬다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await openPicker(root);

  // 브랜드 레일 기본 선택 = Nike → Nike 모델들이 뜬다(라벨 "Nike {model}").
  const models = modelRows(root).map(bm => bm.replace(/^Nike /, ''));
  expect(models.length).toBeGreaterThan(15);
  const sorted = [...models].sort((a, b) => a.localeCompare(b));
  expect(models).toEqual(sorted); // 알파벳순
  expect(models).toEqual(expect.arrayContaining(['Pegasus 41', 'Vaporfly 4', 'Zoom Fly 6']));
});

// ── 7) 검색어를 입력하면 전체 목록이 부분일치로 좁혀진다 ───────────────────────────
test('모델명을 검색하면 전체 목록이 부분일치로 필터된다', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await openPicker(root);
  const full = modelRows(root).length;
  expect(full).toBeGreaterThan(15);

  await search(root, 'Pegasus');
  const filtered = modelRows(root);
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.length).toBeLessThan(full);
  expect(filtered.every(bm => bm.toLowerCase().includes('pegasus'))).toBe(true);
});

// ── 8) DB에 없는 모델명은 검색 결과의 '직접 추가'로 등록할 수 있다 ─────────────────────
test('DB에 없는 모델명을 검색하면 직접 추가로 등록된다(카테고리 기본 권장수명)', async () => {
  const onSave = jest.fn();
  const root = await mountScreen(onSave);

  await search(root, 'My Custom Shoe');
  // 정확 일치가 없으므로 검색 결과 아래 '직접 추가' 행이 뜬다.
  await tap(pressBy(root, '직접 추가'));

  expect(modelDisplay(root)).toContain('My Custom Shoe');
  await tap(pressBy(root, '러닝화 등록'));
  expect(onSave.mock.calls[0][0]).toMatchObject({model: 'My Custom Shoe'});
});
