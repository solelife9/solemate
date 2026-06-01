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

/** 선택된 신발 사진(로컬 URI). */
export interface PickedPhoto {
  uri: string;
}

/**
 * 사진 라이브러리에서 신발 사진 한 장을 고른다.
 *
 * @returns 선택된 사진({uri}) / 권한 거부·취소 시 null.
 * @throws  권한·런처 호출이 예외를 던지면 그대로 전파(호출부가 비차단 처리).
 */
export async function pickShoePhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const res = await ImagePicker.launchImageLibraryAsync({
    // MediaTypeOptions는 deprecated — 신형 배열 형태로 이미지만 허용.
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.7,
  });

  if (res.canceled) return null;
  const asset = res.assets && res.assets[0];
  return asset ? {uri: asset.uri} : null;
}
