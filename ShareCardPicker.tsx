// ============================================================================
// ShareCardPicker.tsx — 공유 카드 선택기(애플처럼 깔끔) 시트
// ----------------------------------------------------------------------------
// 공유를 누르면 올라오는 시트. 레이아웃(세로/가로/6지표)과 배경(투명/다크/사진)만 고르고
// 저장하거나 공유한다. 크기·위치·회전은 인스타 스토리에서 사용자가 직접(스티커라 인스타가
// 다 해줌). 마지막 선택 기억. 캡처는 오프스크린 고해상 ShareCard(ref.toDataURL) — 네이티브 0.
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable, Modal, StyleSheet, Alert, Linking} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rs, rv, ri} from './lib/responsive';
import {BG, CARD_HI, ACCENT, T1, T3, SEP, FONT, RADIUS, TYPE, withAlpha} from './theme';
import ShareCard from './ShareCard';
import type {LatLon} from './lib/route';
import {
  saveCardToLibrary,
  shareRunCard,
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
  const [busy, setBusy] = useState(false);
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
  const previewW = useMemo(() => rs(PREVIEW_W), []);

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await saveCardToLibrary(cardRef);
      if (r.ok) Alert.alert('사진앱에 저장됐어요', effBg === 'transparent' ? '인스타 스토리에서 내 사진 위에 올린 뒤 크기·위치를 조절하세요.' : '완성된 이미지가 사진앱에 저장됐어요.');
      else if (r.reason === 'denied') {
        Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 추가 권한을 허용해 주세요.', [
          {text: '설정 열기', onPress: () => { Promise.resolve(Linking.openSettings()).catch(() => {}); }},
          {text: '나중에', style: 'cancel'},
        ]);
      } else Alert.alert('저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally { setBusy(false); }
  };
  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try { await shareRunCard(cardRef, shareInput); }
    finally { setBusy(false); }
  };

  const cardProps = {model, route, photoUri: cardPhoto, layout: prefs.layout, background: effBg};

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropTap} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <View style={[s.sheet, {paddingBottom: insets.bottom + rv(14)}]}>
          <View style={s.grab} />

          <View style={s.previewWrap}>
            <ShareCard {...cardProps} displayWidth={previewW} />
          </View>

          <Seg label="스타일" options={RUN_CARD_LAYOUTS.map(l => ({key: l, label: RUN_CARD_LAYOUT_LABEL[l]}))}
            value={prefs.layout} onChange={l => update({layout: l as RunCardLayout})} />
          <Seg label="배경" options={bgKeys.map(b => ({key: b, label: RUN_CARD_BACKGROUND_LABEL[b]}))}
            value={effBg} onChange={b => update({background: b as RunCardBackground})} />

          <View style={s.actions}>
            <Pressable onPress={onSave} disabled={busy} accessibilityRole="button" accessibilityLabel="사진앱에 저장" testID="sharecard-save"
              style={({pressed}) => [s.btn, s.btnGhost, pressed && s.pressed]}>
              <Ionicons name="download-outline" size={ri(16)} color={T1} style={s.btnIcon} />
              <Text style={s.btnTxt}>저장</Text>
            </Pressable>
            <Pressable onPress={onShare} disabled={busy} accessibilityRole="button" accessibilityLabel="공유" testID="sharecard-share"
              style={({pressed}) => [s.btn, s.btnPrimary, pressed && s.pressed]}>
              <Ionicons name="share-outline" size={ri(16)} color={T1} style={s.btnIcon} />
              <Text style={s.btnTxt}>공유</Text>
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

function Seg<T extends string>({label, options, value, onChange}: {label: string; options: {key: T; label: string}[]; value: T; onChange: (v: T) => void}) {
  return (
    <View style={s.segRow}>
      <Text style={s.segLabel}>{label}</Text>
      <View style={s.seg}>
        {options.map(o => {
          const on = value === o.key;
          return (
            <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="button" accessibilityState={{selected: on}} style={[s.segItem, on && s.segItemOn]}>
              <Text style={[s.segTxt, on && s.segTxtOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)'},
  backdropTap: {flex: 1},
  sheet: {backgroundColor: BG, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), borderCurve: 'continuous', paddingHorizontal: rs(18), paddingTop: rv(10), borderTopWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  grab: {width: rs(38), height: rs(5), borderRadius: rs(3), backgroundColor: withAlpha(T1, 0.18), alignSelf: 'center', marginBottom: rv(16)},
  previewWrap: {alignItems: 'center', justifyContent: 'center', marginBottom: rv(18)},
  segRow: {marginTop: rv(12)},
  segLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', marginBottom: rv(7), marginLeft: rs(2)},
  seg: {flexDirection: 'row', backgroundColor: CARD_HI, borderRadius: RADIUS.md, borderCurve: 'continuous', padding: rs(3), gap: rs(3)},
  segItem: {flex: 1, height: rs(38), borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center'},
  segItemOn: {backgroundColor: withAlpha(ACCENT, 0.18)},
  segTxt: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  segTxtOn: {color: T1, fontWeight: '700'},
  actions: {flexDirection: 'row', gap: rv(10), marginTop: rv(20)},
  btn: {flex: 1, height: rs(52), borderRadius: RADIUS.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  btnGhost: {backgroundColor: withAlpha(T1, 0.06)},
  btnPrimary: {flex: 1.4, backgroundColor: withAlpha(T1, 0.1)},
  btnIcon: {marginRight: rs(6)},
  btnTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  offscreen: {position: 'absolute', left: -10000, top: 0, opacity: 0},
  pressed: {opacity: 0.85},
});
