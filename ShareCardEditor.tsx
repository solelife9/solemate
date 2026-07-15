// ============================================================================
// ShareCardEditor.tsx — 사진 위에 카드를 원하는 위치·크기로 꾸미는 인앱 에디터
// ----------------------------------------------------------------------------
// 러너가 자기 사진을 배경으로, 그 위에 keego 러닝 카드를 손가락으로 옮기고(드래그)
// 두 손가락으로 키우고 줄여(핀치) 원하는 대로 배치한 뒤 완성 이미지로 저장/공유한다.
// 인스타 스토리 꾸미기의 그 재미 — 앱 안에서. (프리미엄앱 대비 밀리지 않게, 2026-07-15)
//
// 제스처 = react-native-gesture-handler + reanimated(UI 스레드 60fps). 캡처 = view-shot
// 없이, 미리보기와 동일한 합성을 오프스크린 SVG(사진 SvgImage + 카드 본문 G transform)로
// 재구성해 toDataURL(네이티브 캔버스 0 추가). 미리보기 좌표→캔버스 픽셀은 비율 R로 매핑.
// ============================================================================
import React, {useMemo, useRef, useState} from 'react';
import {View, Text, Pressable, Modal, StyleSheet, Alert, Linking, Image, type LayoutChangeEvent} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useSharedValue, useAnimatedStyle, runOnJS, withTiming} from 'react-native-reanimated';
import Svg, {Image as SvgImage, G} from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rs, rv, ri} from './lib/responsive';
import {BG, T1, T2, T3, SEP, FONT, RADIUS, TYPE, withAlpha} from './theme';
import {ShareCardBody} from './ShareCard';
import ShareCard from './ShareCard';
import {pickPhotoWithPermission} from './lib/photo';
import type {LatLon} from './lib/route';
import {
  saveCardToLibrary,
  shareRunCard,
  runCardDimensions,
  type ShareCardModel,
  type SvgCapturable,
  type RunCardTemplate,
  type RunCardFormat,
} from './lib/shareCard';
import type {RunShareInput} from './lib/share';

const CANVAS_W = 1080;            // 캡처 캔버스 폭(높이는 미리보기 비율로)
const CARD_BASE_FRAC = 0.66;      // 카드 초기 폭 = 미리보기 폭의 66%

export interface ShareCardEditorProps {
  visible: boolean;
  onClose: () => void;
  model: ShareCardModel;
  route?: LatLon[];
  shareInput: RunShareInput;
  /** 시작 사진(리캡 한 컷). 없으면 에디터에서 고른다. */
  initialPhotoUri?: string | null;
  /** 카드 스타일(선택기에서 고른 것). 에디터에선 항상 투명 스티커로 얹는다. */
  template?: RunCardTemplate;
  format?: RunCardFormat;
  textScale?: number;
  mapScale?: number;
}

export default function ShareCardEditor({
  visible, onClose, model, route = [], shareInput,
  initialPhotoUri = null, template = 'classic', format = 'feed', textScale = 1, mapScale = 1,
}: ShareCardEditorProps) {
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<string | null>(initialPhotoUri);
  const [busy, setBusy] = useState(false);
  const [layout, setLayout] = useState({w: 0, h: 0});
  // 커밋된 변환(캡처용) — 제스처 종료 시 shared value 를 여기로 복사한다.
  const [xf, setXf] = useState({tx: 0, ty: 0, scale: 1});
  const cardRef = useRef<SvgCapturable | null>(null);

  const {w: Wc, h: Hc} = runCardDimensions(format);
  const cardBaseW = layout.w > 0 ? Math.round(layout.w * CARD_BASE_FRAC) : 0;

  // reanimated shared values(UI 스레드).
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const sScale = useSharedValue(1);

  const commit = (nx: number, ny: number, ns: number) => setXf({tx: nx, ty: ny, scale: clampRunCardScale2(ns)});

  const pan = Gesture.Pan()
    .onStart(() => { sx.value = tx.value; sy.value = ty.value; })
    .onUpdate(e => { tx.value = sx.value + e.translationX; ty.value = sy.value + e.translationY; })
    .onEnd(() => { runOnJS(commit)(tx.value, ty.value, scale.value); });

  const pinch = Gesture.Pinch()
    .onStart(() => { sScale.value = scale.value; })
    .onUpdate(e => { scale.value = Math.max(0.4, Math.min(3, sScale.value * e.scale)); })
    .onEnd(() => { runOnJS(commit)(tx.value, ty.value, scale.value); });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{translateX: tx.value}, {translateY: ty.value}, {scale: scale.value}],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    setLayout({w: Math.round(width), h: Math.round(height)});
  };

  const reset = () => {
    tx.value = withTiming(0); ty.value = withTiming(0); scale.value = withTiming(1);
    setXf({tx: 0, ty: 0, scale: 1});
  };

  const pick = async () => {
    try {
      const p = await pickPhotoWithPermission();
      if (p.ok) setPhoto(p.uri);
      else if (p.reason === 'denied') {
        Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 권한을 허용하면 사진 위에 카드를 얹을 수 있어요.', [
          {text: '설정 열기', onPress: () => { Promise.resolve(Linking.openSettings()).catch(() => {}); }},
          {text: '나중에', style: 'cancel'},
        ]);
      }
    } catch { Alert.alert('사진을 불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); }
  };

  // 캡처 캔버스 — 미리보기와 같은 비율. 카드 G transform 은 커밋된 변환을 픽셀로 매핑.
  const canvasH = layout.w > 0 ? Math.round((CANVAS_W * layout.h) / layout.w) : Math.round(CANVAS_W * 16 / 9);
  const cardTransform = useMemo(() => {
    if (layout.w <= 0) return '';
    const R = CANVAS_W / layout.w;                       // 미리보기 pt → 캔버스 px
    const cardPxW = cardBaseW * R * xf.scale;            // 캡처에서 카드 폭(px)
    const Sc = cardPxW / Wc;                             // 카드 좌표→캡처 px 배율
    const cx = CANVAS_W / 2 + xf.tx * R;                 // 카드 중심(px)
    const cy = canvasH / 2 + xf.ty * R;
    const tlx = cx - (Wc / 2) * Sc;                      // 좌상단(scale 후 translate)
    const tly = cy - (Hc / 2) * Sc;
    return `translate(${round2(tlx)}, ${round2(tly)}) scale(${round4(Sc)})`;
  }, [layout.w, cardBaseW, xf, Wc, Hc, canvasH]);

  const doSave = async () => {
    if (busy || !photo) return;
    setBusy(true);
    try {
      const r = await saveCardToLibrary(cardRef);
      if (r.ok) Alert.alert('사진앱에 저장됐어요', '완성된 이미지가 사진앱에 저장됐어요.');
      else if (r.reason === 'denied') Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 추가 권한을 허용해 주세요.');
      else Alert.alert('저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally { setBusy(false); }
  };
  const doShare = async () => {
    if (busy || !photo) return;
    setBusy(true);
    try { await shareRunCard(cardRef, shareInput); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.screen, {paddingTop: insets.top}]}>
        <View style={s.topbar}>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기" style={s.iconBtn}>
            <Ionicons name="close" size={ri(22)} color={T1} />
          </Pressable>
          <Text style={s.title}>사진에 올리기</Text>
          <Pressable onPress={reset} hitSlop={8} accessibilityRole="button" accessibilityLabel="위치·크기 초기화" style={s.iconBtn}>
            <Ionicons name="refresh" size={ri(19)} color={T2} />
          </Pressable>
        </View>

        {/* 편집 캔버스(미리보기) */}
        <View style={s.stage} onLayout={onLayout}>
          {photo ? (
            <>
              <Image source={{uri: photo}} style={s.photo} resizeMode="cover" />
              {cardBaseW > 0 && (
                <GestureDetector gesture={gesture}>
                  <Animated.View style={[s.cardWrap, cardStyle]}>
                    <ShareCard model={model} route={route} template={template} format={format}
                      background="transparent" textScale={textScale} mapScale={mapScale} displayWidth={cardBaseW} />
                  </Animated.View>
                </GestureDetector>
              )}
              <View style={s.hintWrap} pointerEvents="none">
                <Text style={s.hint}>손가락으로 옮기고 · 두 손가락으로 크기 조절</Text>
              </View>
            </>
          ) : (
            <Pressable onPress={pick} style={s.empty} accessibilityRole="button" accessibilityLabel="사진 고르기">
              <Ionicons name="image-outline" size={ri(30)} color={T3} />
              <Text style={s.emptyTxt}>사진을 골라 카드를 얹어보세요</Text>
            </Pressable>
          )}
        </View>

        {/* 하단 액션 */}
        <View style={[s.footer, {paddingBottom: insets.bottom + rv(12)}]}>
          <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="사진 바꾸기" style={({pressed}) => [s.footBtn, s.footGhost, pressed && s.pressed]}>
            <Ionicons name="image-outline" size={ri(16)} color={T1} style={s.footIcon} />
            <Text style={s.footTxt}>{photo ? '사진 바꾸기' : '사진 고르기'}</Text>
          </Pressable>
          <Pressable onPress={doSave} disabled={busy || !photo} accessibilityRole="button" accessibilityLabel="저장"
            style={({pressed}) => [s.footBtn, s.footGhost, (busy || !photo) && s.dim, pressed && s.pressed]}>
            <Ionicons name="download-outline" size={ri(16)} color={T1} style={s.footIcon} />
            <Text style={s.footTxt}>저장</Text>
          </Pressable>
          <Pressable onPress={doShare} disabled={busy || !photo} accessibilityRole="button" accessibilityLabel="공유"
            style={({pressed}) => [s.footBtn, s.footPrimary, (busy || !photo) && s.dim, pressed && s.pressed]}>
            <Ionicons name="share-outline" size={ri(16)} color={T1} style={s.footIcon} />
            <Text style={s.footTxt}>공유</Text>
          </Pressable>
        </View>
      </View>

      {/* 오프스크린 고해상 합성 캡처 — 사진 + 카드(커밋된 변환). */}
      {!!photo && layout.w > 0 && (
        <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg ref={cardRef as never} width={CANVAS_W} height={canvasH} viewBox={`0 0 ${CANVAS_W} ${canvasH}`}>
            <SvgImage href={{uri: photo}} x={0} y={0} width={CANVAS_W} height={canvasH} preserveAspectRatio="xMidYMid slice" />
            <G transform={cardTransform}>
              <ShareCardBody model={model} route={route} template={template} format={format}
                background="transparent" textScale={textScale} mapScale={mapScale} />
            </G>
          </Svg>
        </View>
      )}
    </Modal>
  );
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round4(n: number) { return Math.round(n * 10000) / 10000; }
// 캡처 배율은 핀치 범위(0.4~3)를 그대로 반영 — 카드 registry 의 텍스트 배율 clamp 와 별개.
function clampRunCardScale2(n: number) { return Number.isFinite(n) ? Math.max(0.4, Math.min(3, n)) : 1; }

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  topbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(14), height: rs(48)},
  title: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  iconBtn: {width: rs(38), height: rs(38), alignItems: 'center', justifyContent: 'center'},
  stage: {flex: 1, margin: rs(12), borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center'},
  photo: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%'},
  cardWrap: {position: 'absolute', alignItems: 'center', justifyContent: 'center'},
  hintWrap: {position: 'absolute', bottom: rv(12), alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.pill, paddingHorizontal: rs(14), paddingVertical: rv(6)},
  hint: {color: withAlpha(T1, 0.9), fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600'},
  empty: {alignItems: 'center', justifyContent: 'center', gap: rv(10), padding: rs(24)},
  emptyTxt: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  footer: {flexDirection: 'row', gap: rv(9), paddingHorizontal: rs(14), paddingTop: rv(10), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  footBtn: {flex: 1, height: rs(50), borderRadius: RADIUS.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  footGhost: {backgroundColor: withAlpha(T1, 0.06)},
  footPrimary: {flex: 1.3, backgroundColor: withAlpha(T1, 0.1)},
  footIcon: {marginRight: rs(6)},
  footTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  dim: {opacity: 0.4},
  pressed: {opacity: 0.85},
  offscreen: {position: 'absolute', left: -10000, top: 0, opacity: 0},
});
