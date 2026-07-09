// ============================================================================
// lib/medalCrop.ts — 메달 카메라 크롭 좌표 계산 (순수 함수, 테스트 가능)
//
// 카메라 미리보기(CameraView)는 화면을 'cover'로 채운다 — 사진(센서 전체)을 화면 비율에
// 맞춰 꽉 채우고 넘치는 부분은 잘라 보여준다. 따라서 '화면상 원 가이드' 위치는 사진 픽셀
// 좌표와 1:1이 아니다. 원 가이드의 바운딩 박스를 cover 역변환으로 사진 픽셀에 매핑해
// '원 안'만 정확히 잘라낸다. (과거 버그: 사진 정중앙 정사각형을 잘라 엉뚱한 영역 저장.)
// 좌표 단위: 화면=pt, 사진=px. scale = px→pt 채움 배율.
// ============================================================================

export interface CropRect {
  originX: number;
  originY: number;
  size: number;
}

/**
 * 화면상 원 가이드(중심 cx,cy · 반지름 r, pt)를 사진(pw×ph, px) 위 정사각형 크롭으로 매핑.
 * 사진/화면이 같은 방향(둘 다 세로)이라고 가정한다. 결과는 사진 경계로 클램프.
 * 사진 크기가 유효하지 않으면 size 0 을 반환(호출부가 원본 사용).
 */
export function medalCropRect(
  pw: number,
  ph: number,
  screenW: number,
  screenH: number,
  cx: number,
  cy: number,
  r: number,
): CropRect {
  if (!(pw > 0 && ph > 0 && screenW > 0 && screenH > 0)) {
    return {originX: 0, originY: 0, size: 0};
  }
  // cover: 사진을 화면에 꽉 채우는 배율(더 큰 쪽). 넘치는 오버플로는 좌우/상하로 균등 크롭.
  const scale = Math.max(screenW / pw, screenH / ph);
  const offX = (pw * scale - screenW) / 2; // 화면 밖으로 잘린 좌우 오버플로(pt)
  const offY = (ph * scale - screenH) / 2; // 상하 오버플로(pt)
  const size = Math.max(1, Math.min(pw, ph, Math.round((2 * r) / scale)));
  let originX = Math.round((cx - r + offX) / scale);
  let originY = Math.round((cy - r + offY) / scale);
  originX = Math.max(0, Math.min(originX, pw - size));
  originY = Math.max(0, Math.min(originY, ph - size));
  return {originX, originY, size};
}
