// ============================================================================
// ShareCardPicker.tsx — 공유 카드 선택기(애플처럼 깔끔) 시트
// ----------------------------------------------------------------------------
// 공유를 누르면 올라오는 시트. 레이아웃(세로/가로/6지표)과 배경(투명/다크/사진)만 고르고
// 저장하거나 공유한다. 크기·위치·회전은 인스타 스토리에서 사용자가 직접(스티커라 인스타가
// 다 해줌). 마지막 선택 기억. 캡처는 오프스크린 고해상 ShareCard(ref.toDataURL) — 네이티브 0.
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Pressable, Modal, StyleSheet, Alert, Linking} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rs, rv, ri} from './lib/responsive';
import {BG, T1, T3, SEP, FONT, RADIUS, TYPE, SCRIM, MOTION, withAlpha} from './theme';
import {showToast} from './lib/toast';
import {SegmentedControl} from './primitives';
import ShareCard from './ShareCard';
import type {LatLon} from './lib/route';
import {
  saveCardToLibrary,
  shareRunCard,
  layoutShareCard,
  RUN_CARD_LAYOUTS,
  RUN_CARD_LAYOUT_LABEL,
  RUN_CARD_BACKGROUND_LABEL,
  type ShareCardModel,
  type SvgCapturable,
  type RunCardLayout,
  type RunCardBackground,
} from './lib/shareCard';
import type {RunShareInput} from './lib/share';

const PREFS_KEY = 'sharecard_prefs_v3';
const PREVIEW_W = 250;

interface Prefs {layout: RunCardLayout; background: RunCardBackground}
const DEFAULT_PREFS: Prefs = {layout: 'vertical', background: 'transparent'};

export interface ShareCardPickerProps {
  visible: boolean;
  onClose: () => void;
  model: ShareCardModel;
  route?: LatLon[];
  shareInput: RunShareInput;
  /** 오늘의 한 컷(있으면 배경에 '사진' 추가). */
  photoUri?: string | null;
}

export default function ShareCardPicker({visible, onClose, model, route = [], shareInput, photoUri = null}: ShareCardPickerProps) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // busy = 진행 중인 액션(저장/공유). 라벨·딤으로 진행 상태를 보여준다(무반응 금지).
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);
  const cardRef = useRef<SvgCapturable | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PREFS_KEY).then(raw => {
      if (!alive || !raw) return;
      try {
        const p = JSON.parse(raw) as Partial<Prefs>;
        setPrefs({
          layout: RUN_CARD_LAYOUTS.includes(p.layout as RunCardLayout) ? (p.layout as RunCardLayout) : 'vertical',
          background: p.background === 'dark' ? 'dark' : p.background === 'photo' ? 'photo' : 'transparent',
        });
      } catch {/* 손상 → 기본 */}
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const update = (patch: Partial<Prefs>) => {
    setPrefs(prev => {
      const next = {...prev, ...patch};
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const bgKeys: RunCardBackground[] = photoUri ? ['transparent', 'dark', 'photo'] : ['transparent', 'dark'];
  const effBg: RunCardBackground = bgKeys.includes(prefs.background) ? prefs.background : 'transparent';
  const cardPhoto = effBg === 'photo' ? photoUri : null;
  // '기록' 레이아웃은 성취(moment)가 있을 때만 맨 앞에 노출.
  const layoutKeys: RunCardLayout[] = model.moment ? ['moment', ...RUN_CARD_LAYOUTS] : RUN_CARD_LAYOUTS;
  const effLayout: RunCardLayout = layoutKeys.includes(prefs.layout) ? prefs.layout : 'vertical';
  const previewW = useMemo(() => rs(PREVIEW_W), []);
  // 프리뷰 영역 높이 고정 — 카드 캔버스는 내용 높이라 레이아웃(세로/가로/6지표)마다 다르다.
  // 그대로 두면 탭을 바꿀 때마다 시트 전체가 점프하므로, 선택 가능한 레이아웃 중 가장 큰
  // 높이로 컨테이너를 고정하고 카드를 중앙 정렬한다(사용자 지적 2026-07-16).
  const previewH = useMemo(() => {
    const maxRatio = Math.max(
      ...layoutKeys.map(l => {
        const L = layoutShareCard(model, {layout: l, showMap: true, showStats: true});
        return L.h / L.w;
      }),
    );
    return Math.round(previewW * maxRatio);
    // layoutKeys 는 model.moment 파생이라 model 의존성으로 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, previewW]);

  const onSave = async () => {
    if (busy) return;
    setBusy('save');
    try {
      const r = await saveCardToLibrary(cardRef);
      // 성공은 비차단 토스트(확인 탭 강요 금지) — 실패/권한만 결정이 필요해 Alert 유지.
      if (r.ok) showToast({message: '앨범에 저장했어요'});
      else if (r.reason === 'denied') {
        Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 추가 권한을 허용해 주세요.', [
          {text: '설정 열기', onPress: () => { Promise.resolve(Linking.openSettings()).catch(() => {}); }},
          {text: '나중에', style: 'cancel'},
        ]);
      } else Alert.alert('저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally { setBusy(null); }
  };
  const onShare = async () => {
    if (busy) return;
    setBusy('share');
    try { await shareRunCard(cardRef, shareInput); }
    finally { setBusy(null); }
  };

  const cardProps = {model, route, photoUri: cardPhoto, layout: effLayout, background: effBg};

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropTap} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <View style={[s.sheet, {paddingBottom: insets.bottom + rv(14)}]}>
          {/* grab 핸들 제거(HIG): 드래그 미구현 시트에 핸들은 거짓 어포던스. 닫기=배경 탭/스와이프 백. */}
          <View style={[s.previewWrap, {height: previewH}]}>
            <ShareCard {...cardProps} displayWidth={previewW} />
          </View>

          <Seg label="스타일" options={layoutKeys.map(l => ({key: l, label: RUN_CARD_LAYOUT_LABEL[l]}))}
            value={effLayout} onChange={l => update({layout: l as RunCardLayout})} />
          <Seg label="배경" options={bgKeys.map(b => ({key: b, label: RUN_CARD_BACKGROUND_LABEL[b]}))}
            value={effBg} onChange={b => update({background: b as RunCardBackground})} />

          <View style={s.actions}>
            <Pressable onPress={onSave} disabled={!!busy} accessibilityRole="button" accessibilityLabel="사진앱에 저장" testID="sharecard-save"
              style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed, busy && s.btnBusy]}>
              <Ionicons name="download-outline" size={ri(16)} color={T1} style={s.btnIcon} />
              <Text style={s.btnTxt}>{busy === 'save' ? '저장 중…' : '저장'}</Text>
            </Pressable>
            <Pressable onPress={onShare} disabled={!!busy} accessibilityRole="button" accessibilityLabel="공유" testID="sharecard-share"
              style={({pressed}) => [s.btn, s.btnPrimary, pressed && s.pressed, busy && s.btnBusy]}>
              <Ionicons name="share-outline" size={ri(16)} color={T1} style={s.btnIcon} />
              <Text style={s.btnTxt}>{busy === 'share' ? '공유 중…' : '공유'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ShareCard ref={cardRef as never} {...cardProps} />
      </View>
    </Modal>
  );
}

// 로컬 세그 재구현 폐지(검수 MED, 2026-07-16) — 전역 SegmentedControl(neutral) 수렴.
// 선택 강조도 캔온(흰 9% 유리)으로: 구 withAlpha(ACCENT,0.18) 사설 강조 회수.
function Seg<T extends string>({label, options, value, onChange}: {label: string; options: {key: T; label: string}[]; value: T; onChange: (v: T) => void}) {
  return (
    <View style={s.segRow}>
      <Text style={s.segLabel}>{label}</Text>
      <SegmentedControl
        items={options.map(o => ({key: o.key, label: o.label}))}
        value={value}
        onChange={k => onChange(k as T)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  // 사설 rgba(0,0,0,0.55) → 전역 SCRIM 토큰(모달 배면 단일 진실원, 검수 MED 2026-07-16).
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: SCRIM},
  backdropTap: {flex: 1},
  sheet: {backgroundColor: BG, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderCurve: 'continuous', paddingHorizontal: rs(18), paddingTop: rv(20), borderTopWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  previewWrap: {alignItems: 'center', justifyContent: 'center', marginBottom: rv(18)},
  segRow: {marginTop: rv(12)},
  segLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', marginBottom: rv(7), marginLeft: rs(2)},
  actions: {flexDirection: 'row', gap: rv(10), marginTop: rv(20)},
  btn: {flex: 1, height: rs(52), borderRadius: RADIUS.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  btnGhost: {backgroundColor: withAlpha(T1, 0.06)},
  btnPrimary: {flex: 1.4, backgroundColor: withAlpha(T1, 0.1)},
  btnIcon: {marginRight: rs(6)},
  btnTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  offscreen: {position: 'absolute', left: -10000, top: 0, opacity: 0},
  // 누름 표준(MOTION.press) — 사설 0.85 딤 회수.
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  // busy 진행 중 딤 — disabled 시각 상태(라벨 '저장 중…'과 함께 진행을 알린다).
  btnBusy: {opacity: 0.5},
});
