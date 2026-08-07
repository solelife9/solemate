/**
 * lib/photo — 저장 전 축소 계약(2026-07-26 감사 F-09).
 *
 * ImagePicker 의 quality 는 JPEG 압축률일 뿐 **해상도를 줄이지 않는다.** 최근 아이폰
 * 사진(12MP, 4032×3024)을 그대로 들고 있으면 RN <Image> 디코딩만으로 픽셀 약 48MB 가
 * 메모리에 올라간다 — 메달 아카이브처럼 여러 장이 한 화면에 있으면 위험하다.
 * 그래서 사용자 사진은 고르는 시점에 긴 변 1600 으로 줄여 저장한다.
 *
 * 단 기록증(captureCertPhoto)만은 예외다: 화면에 크게 띄우려는 게 아니라 작은 숫자를
 * 읽는 OCR 입력이라, 줄이면 인식률이 떨어진다. '메모리보다 정확도' 가 이기는 유일한 경로다.
 *
 * @format
 */
import * as ImagePicker from 'expo-image-picker';
import {manipulateAsync} from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import {pickPhotoWithPermission, captureCertPhoto} from '../../lib/photo';

const asMock = (fn: unknown) => fn as jest.Mock;

// 축소를 마친 사진은 곧바로 **영구 폴더로 복사**된다(2026-08-07 1단계 — 캐시는 OS 가
// 예고 없이 비운다). 그래서 반환 URI 는 더 이상 manipulator 의 캐시 경로가 아니다.
// 이 테스트가 지키는 건 '축소 규칙'이므로, **무엇을 복사했는지**로 그 규칙을 확인한다
// (파일명에는 타임스탬프·난수가 들어가 그 자체를 단언할 수 없다).
const copiedFrom = () => asMock(FileSystem.copyAsync).mock.calls[0]?.[0]?.from;
const isPersisted = (uri?: string) => !!uri && uri.startsWith('file:///documents/keego-photos/');

beforeEach(() => {
  jest.clearAllMocks();
  asMock(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({granted: true});
  asMock(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({granted: true});
  asMock(FileSystem.copyAsync).mockResolvedValue(undefined);
  asMock(FileSystem.makeDirectoryAsync).mockResolvedValue(undefined);
});

test('큰 사진은 긴 변 1600 으로 줄여 저장한다', async () => {
  asMock(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{uri: 'file:///huge.jpg'}],
  });
  // 1) 방향 보정(빈 조작)에서 12MP 원본 치수가 나오고 → 2) 리사이즈가 걸린다.
  asMock(manipulateAsync)
    .mockResolvedValueOnce({uri: 'file:///upright.jpg', width: 4032, height: 3024})
    .mockResolvedValueOnce({uri: 'file:///small.jpg', width: 1600, height: 1200});

  const res = await pickPhotoWithPermission();

  expect(res.ok).toBe(true);
  expect(isPersisted(res.ok ? res.uri : undefined)).toBe(true);
  expect(copiedFrom()).toBe('file:///small.jpg'); // 줄인 사진을 영속화했다
  const resizeCall = asMock(manipulateAsync).mock.calls[1];
  // 가로가 긴 사진이므로 width 를 1600 으로 맞춘다(세로면 height 기준 — 업스케일 금지).
  expect(resizeCall[1]).toEqual([{resize: {width: 1600}}]);
});

test('이미 작은 사진은 리사이즈하지 않는다(업스케일 금지)', async () => {
  asMock(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{uri: 'file:///small.jpg'}],
  });
  asMock(manipulateAsync).mockResolvedValueOnce({uri: 'file:///upright.jpg', width: 800, height: 600});

  const res = await pickPhotoWithPermission();

  expect(res.ok).toBe(true);
  expect(copiedFrom()).toBe('file:///upright.jpg');
  expect(asMock(manipulateAsync)).toHaveBeenCalledTimes(1); // 방향 보정만, 리사이즈 없음
});

test('축소가 실패해도 사진을 잃지 않는다(원본으로 진행)', async () => {
  asMock(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{uri: 'file:///orig.jpg'}],
  });
  asMock(manipulateAsync).mockRejectedValue(new Error('manipulator unavailable'));

  const res = await pickPhotoWithPermission();

  expect(res.ok).toBe(true);
  expect(copiedFrom()).toBe('file:///orig.jpg'); // 원본 그대로, 다만 영구 폴더로
});

test('기록증은 축소하지 않는다 — OCR 정확도가 메모리보다 우선', async () => {
  asMock(ImagePicker.launchCameraAsync).mockResolvedValue({
    canceled: false,
    assets: [{uri: 'file:///cert.jpg'}],
  });

  const res = await captureCertPhoto();

  expect(isPersisted(res?.uri)).toBe(true);
  expect(copiedFrom()).toBe('file:///cert.jpg');
  expect(asMock(manipulateAsync)).not.toHaveBeenCalled();
});
