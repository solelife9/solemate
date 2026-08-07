// ─── 신발 사진 선택 (expo-image-picker 래퍼, 순수 I/O 경계) ──────────────────────
// Expo 도입(SDK 56)에 맞춰 신발 등록 화면의 사진 첨부를 실제로 동작시킨다.
// 호출부(AddShoeScreen)는 이 한 함수만 알면 되고, 권한/취소/실패를 구분해 다룬다.
//
// 계약(관찰 가능한 결과):
//  - 사용자가 사진을 고르면 { uri } 반환.
//  - 권한 거부 또는 사용자가 선택을 취소하면 null(에러 아님 — 조용히 사진 없이 진행).
//  - 네이티브 모듈 부재·시스템 오류 등 진짜 실패는 throw — 호출부가 재시도/스킵을 결정.
//    (이렇게 분리해야 "실패 시 사진 없이 저장 비차단·재시도" 흐름을 화면에서 구현할 수 있다.)

import * as ImagePicker from 'expo-image-picker';
import {manipulateAsync, SaveFormat} from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

// ── 사진 영속화 (2026-08-07 감사) ───────────────────────────────────────────
//
// expo-image-picker 와 expo-image-manipulator 가 돌려주는 URI 는 **캐시 디렉터리**를
// 가리킨다(MediaHandler.swift → cachesDirectory/ImagePicker,
//  ImageManipulatorUtils.swift → cacheDirectory/ImageManipulator).
// 그리고 downscale() 이 항상 manipulateAsync 를 태우므로 **모든 사진이 캐시로 재배출된다.**
//
// 캐시는 OS 가 저장공간이 빠듯할 때 **예고 없이 비운다.** 즉 앱을 지우지도, 재설치하지도
// 않았는데 사진이 사라진다. 화면 고지는 "앱을 지우면 복구할 수 없어요"였는데 그보다
// 훨씬 약한 조건에서 사라지고 있었다.
//
// 메달은 더 나빴다: 레코드(대회명·기록·배번호)는 클라우드에서 복원되고 **경로 문자열도
// 같이 복원되는데 그 경로의 파일은 없다.** 화면이 `photoUri ? <Image> : <메달 아이콘>` 으로
// 분기하므로 문자열이 비어있지 않아 **폴백 아이콘이 건너뛰어지고 빈 회색 원반**이 떴다.
//
// 그래서 이 파일의 **모든 진입점**이 여기를 거친다. 한 곳으로 모으지 않으면 새 진입점이
// 또 빠진다(이 저장소의 반복 실패 형태다).
const PHOTO_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}keego-photos/`
  : null;

/** 이 URI 가 이미 우리 영구 폴더 안에 있는가(재복사 방지). */
function isPersisted(uri: string): boolean {
  return !!PHOTO_DIR && typeof uri === 'string' && uri.startsWith(PHOTO_DIR);
}

/**
 * 사진을 앱 **영구 폴더**로 복사하고 새 URI 를 돌려준다.
 *
 * 실패하면 **원본 URI 를 그대로 돌려준다** — 사진이 없는 것보다 취약한 사진이 낫고,
 * 복사 실패로 등록 자체가 막히면 그게 더 나쁘다(비차단 원칙).
 */
export async function persistPhoto(uri: string): Promise<string> {
  if (!uri || !PHOTO_DIR || isPersisted(uri)) return uri;
  try {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, {intermediates: true});
    // 확장자는 원본을 따르되, 없으면 jpg(모든 경로가 JPEG 로 굽는다).
    const ext = (uri.split('?')[0].match(/\.(\w{3,4})$/)?.[1] || 'jpg').toLowerCase();
    const dest = `${PHOTO_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({from: uri, to: dest});
    return dest;
  } catch {
    return uri;
  }
}

/**
 * 클라우드에서 내려받은 사진이 앉을 **결정적** 경로.
 *
 * 이름에 난수를 쓰지 않는 이유: 같은 사진을 두 번 받으면 파일이 두 개가 되고, 그러면
 * 재설치를 반복할수록 기기에 쓰레기가 쌓인다. `medalId-kind` 는 그 사진의 고유 키다.
 */
export function cloudPhotoDest(key: string): string | null {
  if (!PHOTO_DIR || !key) return null;
  return `${PHOTO_DIR}cloud-${key.replace(/[^\w.-]/g, '_')}.jpg`;
}

/** 이 URI 가 가리키는 파일이 실제로 있는가. 없는 파일을 <Image> 에 물리면 빈 회색 판이 된다. */
export async function photoExists(uri: string | null | undefined): Promise<boolean> {
  if (!uri || typeof uri !== 'string') return false;
  // 원격 URL 은 파일 시스템 질문의 대상이 아니다 — 있다고 본다.
  if (/^https?:/i.test(uri)) return true;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info?.exists;
  } catch {
    return false;
  }
}

/** 영속 폴더를 준비한다(다운로드 전에 필요 — 폴더가 없으면 파일을 쓸 수 없다). */
export async function ensurePhotoDir(): Promise<boolean> {
  if (!PHOTO_DIR) return false;
  try {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, {intermediates: true});
    return true;
  } catch {
    return false;
  }
}

/**
 * 영속화된 사진 파일을 지운다(레코드에서 사진을 뗄 때). 우리 폴더 밖 URI 는 건드리지
 * 않는다 — 사용자의 사진앱 원본을 지우면 안 된다. 실패는 삼킨다(고아 파일 1개 < 크래시).
 */
export async function deletePersistedPhoto(uri: string | null | undefined): Promise<void> {
  if (!uri || !isPersisted(uri)) return;
  try {
    await FileSystem.deleteAsync(uri, {idempotent: true});
  } catch {
    /* 고아 파일이 남는 것은 감수한다 */
  }
}

/** 선택된 신발 사진(로컬 URI). */
export interface PickedPhoto {
  uri: string;
}

/** 사진 선택 결과 — 권한 거부(denied)와 사용자 취소(cancelled)를 구분한다(2026-07-05).
 *  거부는 "설정에서 허용" 안내가 필요하고, 취소는 조용히 넘어가야 하기 때문. */
export type PhotoPick =
  | {ok: true; uri: string}
  | {ok: false; reason: 'cancelled' | 'denied'};


// ── 저장 전 축소(2026-07-26 감사 F-09) ───────────────────────────────────────
// quality 옵션은 JPEG 압축률일 뿐 **해상도를 줄이지 않는다** — 최근 아이폰 사진은 12MP
// (4032×3024)라 RN <Image> 가 디코딩하면 픽셀만 약 48MB 를 메모리에 올린다. 메달
// 아카이브처럼 여러 장이 한 화면에 있으면 위험하고, 원본 해상도는 앱 어디서도 쓰지 않는다
// (가장 큰 소비처가 화면 폭짜리 이미지다).
// 긴 변을 MAX_EDGE 로 맞춰 저장한다. 이미 작은 사진은 건드리지 않는다(업스케일 금지).
const MAX_EDGE = 1600;

async function downscale(uri: string): Promise<string> {
  try {
    // 빈 조작으로 방향을 픽셀에 굽고 실제 치수를 얻는다(EXIF 회전 보정 — MedalCamera 와 동일 규약).
    const upright = await manipulateAsync(uri, [], {compress: 1, format: SaveFormat.JPEG});
    const w = upright.width ?? 0;
    const h = upright.height ?? 0;
    const longEdge = Math.max(w, h);
    if (!longEdge || longEdge <= MAX_EDGE) return upright.uri || uri;
    const out = await manipulateAsync(
      upright.uri,
      [w >= h ? {resize: {width: MAX_EDGE}} : {resize: {height: MAX_EDGE}}],
      {compress: 0.85, format: SaveFormat.JPEG},
    );
    return out.uri || uri;
  } catch {
    // 축소 실패는 치명적이지 않다 — 원본으로 진행한다(사진이 없는 것보다 큰 사진이 낫다).
    return uri;
  }
}

/**
 * 사진 라이브러리에서 한 장을 고른다. 권한 거부/취소를 구분해 돌려준다.
 * @throws 네이티브 런처 예외는 전파(호출부가 비차단 처리).
 */
export async function pickPhotoWithPermission(): Promise<PhotoPick> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return {ok: false, reason: 'denied'};

  const res = await ImagePicker.launchImageLibraryAsync({
    // MediaTypeOptions는 deprecated — 신형 배열 형태로 이미지만 허용.
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.7,
  });

  if (res.canceled) return {ok: false, reason: 'cancelled'};
  const asset = res.assets && res.assets[0];
  return asset ? {ok: true, uri: await persistPhoto(await downscale(asset.uri))} : {ok: false, reason: 'cancelled'};
}

/**
 * 사진 라이브러리에서 신발 사진 한 장을 고른다(하위호환 래퍼 — 거부·취소를 null 로).
 *
 * @returns 선택된 사진({uri}) / 권한 거부·취소 시 null.
 * @throws  권한·런처 호출이 예외를 던지면 그대로 전파(호출부가 비차단 처리).
 */
export async function pickShoePhoto(): Promise<PickedPhoto | null> {
  const r = await pickPhotoWithPermission();
  return r.ok ? {uri: r.uri} : null;
}

/**
 * 카메라 촬영 — **거부와 취소를 구분해** 돌려준다(2026-08-04 QA 감사 Q-7).
 *
 * 아래 `captureCertPhoto`/`pickPhotoFrom('camera')` 는 둘 다 null 로 뭉뚱그렸다. 그래서
 * 호출부가 "권한이 없어서 못 했다"와 "사용자가 그만뒀다"를 구별할 수 없었고, 결국 둘 다
 * 조용히 넘어가 **권한을 거부한 사람에겐 눌러도 아무 일 없는 버튼**이 됐다.
 * 취소는 조용히, 거부는 설정 안내 — 그 판단을 하려면 이 정보가 필요하다.
 *
 * @param opts.editing  촬영 후 편집(크롭) 단계를 띄울지.
 * @param opts.shrink   저장 전 축소 여부. OCR 입력(기록증)은 false — 글자가 뭉개진다.
 */
export async function capturePhotoWithPermission(
  opts?: {editing?: boolean; shrink?: boolean},
): Promise<PhotoPick> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return {ok: false, reason: 'denied'};
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: opts?.editing !== false,
    quality: opts?.shrink === false ? 0.8 : 0.7,
  });
  if (res.canceled) return {ok: false, reason: 'cancelled'};
  const a = res.assets && res.assets[0];
  if (!a) return {ok: false, reason: 'cancelled'};
  return {ok: true, uri: await persistPhoto(opts?.shrink === false ? a.uri : await downscale(a.uri))};
}

/**
 * 기록증 촬영 — 카메라로 바로 찍어 반환(편집/크롭 단계 없이 즉시). OCR 원본이라 자르면 안
 * 되고, '자르기 눌러야 저장' 혼란도 없앤다. 권한 거부·취소 → null(조용히).
 *
 * ⚠️ **여기만 downscale 을 걸지 않는다**(2026-07-26 F-09): 이 사진은 화면에 크게 띄우기
 * 위한 게 아니라 기록증의 작은 숫자를 읽기 위한 OCR 입력이다. 긴 변을 1600 으로 줄이면
 * 완주 시간·페이스 글자가 뭉개져 인식률이 떨어진다 — 메모리보다 정확도가 우선인 유일한 경로.
 */
export async function captureCertPhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({mediaTypes: ['images'], allowsEditing: false, quality: 0.8});
  if (res.canceled) return null;
  const a = res.assets && res.assets[0];
  return a ? {uri: await persistPhoto(a.uri)} : null;
}

/**
 * 공유 카드 배경용 사진을 카메라 촬영 또는 앨범 선택으로 받는다(러닝 직후 '바로 찍어
 * 자랑' 플로우). 권한 거부·취소 → null(조용히 사진 없이 진행). 9:16~4:5 카드라 편집 허용.
 *
 * @throws 네이티브 런처 예외는 전파(호출부가 비차단 처리).
 */
export async function pickPhotoFrom(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchCameraAsync({mediaTypes: ['images'], allowsEditing: true, quality: 0.7});
    if (res.canceled) return null;
    const a = res.assets && res.assets[0];
    return a ? {uri: await persistPhoto(await downscale(a.uri))} : null;
  }
  return pickShoePhoto();
}
