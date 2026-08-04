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
  return asset ? {ok: true, uri: await downscale(asset.uri)} : {ok: false, reason: 'cancelled'};
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
  return {ok: true, uri: opts?.shrink === false ? a.uri : await downscale(a.uri)};
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
  return a ? {uri: a.uri} : null;
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
    return a ? {uri: await downscale(a.uri)} : null;
  }
  return pickShoePhoto();
}
