// ============================================================================
// MedalCamera.tsx — 메달 원형 가이드 카메라
// 풀스크린 카메라 + 어두운 스크림에 뚫린 동그라미 가이드 + 셔터. 촬영하면 중앙 정사각형으로
// 크롭(원의 바운딩 박스)해 균일한 원형 메달로 저장한다("자르기" 시스템 단계 없음). 앨범
// 선택 폴백도 제공. 색은 theme 토큰만.
// ============================================================================
import React, {useRef, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {View, Text, Pressable, StyleSheet, useWindowDimensions, ActivityIndicator} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, {Defs, Mask, Rect, Circle} from 'react-native-svg';
import {CameraView, useCameraPermissions} from 'expo-camera';
import {manipulateAsync, SaveFormat} from 'expo-image-manipulator';
import {BG, HALL_GOLD, T1, T2, T3, withAlpha} from './theme';
import {pickShoePhoto} from './lib/photo';
import {medalCropRect} from './lib/medalCrop';

export default function MedalCamera({onCapture, onCancel}: {onCapture: (uri: string) => void; onCancel: () => void}) {
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  // 원형 가이드 — 화면 폭의 78% 지름, 세로 중앙보다 살짝 위.
  const r = Math.round(Math.min(width, height) * 0.39);
  const cx = width / 2;
  const cy = height * 0.44;

  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await camRef.current?.takePictureAsync({quality: 0.85});
      if (!photo?.uri) { setBusy(false); return; }
      // ① EXIF 방향 정규화 — iOS 세로 사진은 픽셀이 가로(w>h)로 저장되고 회전은 메타데이터로만
      //    걸리는 경우가 있다. 크롭 좌표는 '똑바로 선' 픽셀 기준이어야 하므로 빈 조작으로 방향을
      //    픽셀에 굽고, 그 결과 치수로 계산한다. (기기 버그 2026-07-10: takePictureAsync 의
      //    width/height 가 가로 기준으로 와서 cover 역변환이 어긋나 엉뚱한 영역이 저장됐다.)
      const upright = await manipulateAsync(photo.uri, [], {compress: 1, format: SaveFormat.JPEG});
      // ② 화면상 원 가이드(cx,cy,r, pt)를 cover 역변환으로 사진 픽셀에 매핑해 '원 안'만 잘라낸다.
      const {originX, originY, size} = medalCropRect(upright.width ?? 0, upright.height ?? 0, width, height, cx, cy, r);
      if (size > 0) {
        const out = await manipulateAsync(
          upright.uri,
          // 저장 해상도는 기기 무관 고정 640px(rs 스케일 대상 아님 — 화면 크기와 무관한 자산).
          [{crop: {originX, originY, width: size, height: size}}, {resize: {width: 640, height: 640}}],
          {compress: 0.85, format: SaveFormat.JPEG},
        );
        onCapture(out.uri);
      } else {
        onCapture(upright.uri);
      }
    } catch {
      // 촬영 실패 — 조용히 닫지 않고 상태만 해제(사용자 재시도).
      setBusy(false);
    }
  };

  const fromLibrary = async () => {
    // pickShoePhoto 계약: 취소/거부는 null, 네이티브 런처 예외는 throw(호출부가 비차단 처리).
    // shoot() 의 catch 와 동일 정책 — 실패해도 크래시 없이 조용히 무시(사용자 재시도).
    try {
      const p = await pickShoePhoto();
      if (p) onCapture(p.uri);
    } catch {
      // 앨범 열기 실패 — 무시.
    }
  };

  // 권한 처리 — 아직 미결정이면 요청, 거부면 안내 + 앨범 폴백.
  if (!perm) return <View style={[c.screen, {backgroundColor: BG}]} />;
  if (!perm.granted) {
    return (
      <View style={[c.screen, {paddingTop: insets.top}]}>
        <View style={c.permBox}>
          <Ionicons name="camera-outline" size={ri(40)} color={T3} />
          <Text style={c.permT}>카메라 권한이 필요해요</Text>
          <Text style={c.permD}>메달을 촬영하려면 카메라를 허용해주세요. 앨범에서 고를 수도 있어요.</Text>
          <Pressable onPress={() => void requestPerm()} style={c.permBtn}><Text style={c.permBtnT}>카메라 허용</Text></Pressable>
          <Pressable onPress={fromLibrary} style={c.permGhost}><Text style={c.permGhostT}>앨범에서 선택</Text></Pressable>
          <Pressable onPress={onCancel} style={c.permGhost}><Text style={c.permGhostT}>취소</Text></Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={c.screen}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
      {/* 어두운 스크림 + 동그라미 구멍 + 흰 링 */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id="medalHole">
            <Rect x="0" y="0" width={width} height={height} fill="white" />
            <Circle cx={cx} cy={cy} r={r} fill="black" />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="rgba(0,0,0,0.55)" mask="url(#medalHole)" />
        <Circle cx={cx} cy={cy} r={r} stroke={withAlpha(HALL_GOLD, 0.95)} strokeWidth={2.5} fill="none" />
      </Svg>

      <Text style={[c.hint, {top: cy - r - 52}]}>메달을 원 안에 맞춰주세요</Text>
      <Text style={[c.sub, {top: cy - r - 28}]}>가운데 정렬하면 자동으로 원형으로 담겨요</Text>

      {/* 상단 취소 */}
      <Pressable onPress={onCancel} hitSlop={10} style={[c.close, {top: insets.top + 8}]} accessibilityRole="button" accessibilityLabel="닫기">
        <Ionicons name="close" size={ri(26)} color={T1} />
      </Pressable>

      {/* 하단 컨트롤: 앨범 · 셔터 */}
      <View style={[c.controls, {bottom: insets.bottom + 30}]}>
        <Pressable onPress={fromLibrary} hitSlop={8} style={c.libBtn} accessibilityRole="button" accessibilityLabel="앨범에서 선택">
          <Ionicons name="images-outline" size={ri(24)} color={T1} />
        </Pressable>
        <Pressable onPress={shoot} disabled={busy} accessibilityRole="button" accessibilityLabel="촬영" style={c.shutterWrap}>
          <View style={c.shutter}>{busy ? <ActivityIndicator color={BG} /> : null}</View>
        </Pressable>
        <View style={{width: rs(48)}} />
      </View>
    </View>
  );
}

const c = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#000'},
  hint: {position: 'absolute', left: 0, right: 0, textAlign: 'center', color: T1, fontFamily: 'PretendardVariable', fontSize: rf(17), fontWeight: '600', letterSpacing: -0.2},
  sub: {position: 'absolute', left: 0, right: 0, textAlign: 'center', color: withAlpha(T1, 0.7), fontFamily: 'PretendardVariable', fontSize: rf(13)},
  close: {position: 'absolute', left: 18, width: rs(40), height: rs(40), borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center'},
  controls: {position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(40)},
  libBtn: {width: rs(48), height: rs(48), borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center'},
  shutterWrap: {width: rs(76), height: rs(76), borderRadius: 999, borderWidth: 4, borderColor: withAlpha(T1, 0.4), alignItems: 'center', justifyContent: 'center'},
  shutter: {width: rs(60), height: rs(60), borderRadius: 999, backgroundColor: T1, alignItems: 'center', justifyContent: 'center'},
  permBox: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(40), gap: rv(10)},
  permT: {color: T2, fontFamily: 'PretendardVariable', fontSize: rf(17), fontWeight: '600', marginTop: rv(8)},
  permD: {color: T3, fontFamily: 'PretendardVariable', fontSize: rf(14), textAlign: 'center', lineHeight: rf(19), marginBottom: rv(8)},
  permBtn: {marginTop: rv(6), paddingVertical: rv(12), paddingHorizontal: rs(24), borderRadius: rs(12), backgroundColor: withAlpha(HALL_GOLD, 0.16), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(HALL_GOLD, 0.4)},
  permBtnT: {color: HALL_GOLD, fontFamily: 'PretendardVariable', fontSize: rf(15), fontWeight: '700'},
  permGhost: {paddingVertical: rv(10)},
  permGhostT: {color: T3, fontFamily: 'PretendardVariable', fontSize: rf(14)},
});
