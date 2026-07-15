// ============================================================================
// ShareCardPicker.tsx — 공유 카드 선택기(스트라바식) 시트
// ----------------------------------------------------------------------------
// 공유를 누르면 올라오는 시트. 레이아웃(가로/세로/히어로)을 고르고 지도·지표를 on/off,
// 배경(투명/다크/사진)·크기(글씨·지도)를 조절한 뒤 저장하거나 공유한다. 마지막 선택 기억.
// 투명 카드는 인스타에 사진 올린 뒤 그 위에 얹어(위치·크기는 인스타가 처리) 쓰는 스티커.
// 캡처는 오프스크린 고해상 ShareCard(ref.toDataURL) — 네이티브 0. 선택기는 공유할 때만 뜬다.
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable, Modal, StyleSheet, Alert, Linking} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rs, rv, ri} from './lib/responsive';
import {BG, CARD_HI, ACCENT, GOOD, T1, T2, T3, SEP, FONT, RADIUS, TYPE, withAlpha, GLASS} from './theme';
import ShareCard from './ShareCard';
import type {LatLon} from './lib/route';
import {
  saveCardToLibrary,
  shareRunCard,
  clampRunCardScale,
  RUN_CARD_LAYOUTS,
  RUN_CARD_LAYOUT_LABEL,
  RUN_CARD_BACKGROUND_LABEL,
  RUN_CARD_SCALE_MIN,
  RUN_CARD_SCALE_MAX,
  type ShareCardModel,
  type SvgCapturable,
  type RunCardLayout,
  type RunCardBackground,
} from './lib/shareCard';
import type {RunShareInput} from './lib/share';

const PREFS_KEY = 'sharecard_prefs_v2';
const SCALE_STEP = 0.1;
const PREVIEW_W = 268;

interface Prefs {
  layout: RunCardLayout;
  showMap: boolean;
  showStats: boolean;
  background: RunCardBackground;
  textScale: number;
  mapScale: number;
}
const DEFAULT_PREFS: Prefs = {
  layout: 'classic', showMap: true, showStats: true, background: 'transparent', textScale: 1, mapScale: 1,
};

export interface ShareCardPickerProps {
  visible: boolean;
  onClose: () => void;
  model: ShareCardModel;
  route?: LatLon[];
  shareInput: RunShareInput;
  /** 오늘의 한 컷(있으면 배경 옵션에 '사진'을 더해 완성본으로 합성). */
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
          layout: RUN_CARD_LAYOUTS.includes(p.layout as RunCardLayout) ? (p.layout as RunCardLayout) : 'classic',
          showMap: p.showMap !== false,
          showStats: p.showStats !== false,
          background: p.background === 'dark' ? 'dark' : p.background === 'photo' ? 'photo' : 'transparent',
          textScale: clampRunCardScale(Number(p.textScale)),
          mapScale: clampRunCardScale(Number(p.mapScale)),
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

  const stepText = (d: number) => update({textScale: clampRunCardScale(Math.round((prefs.textScale + d) * 100) / 100)});
  const stepMap = (d: number) => update({mapScale: clampRunCardScale(Math.round((prefs.mapScale + d) * 100) / 100)});

  const previewW = useMemo(() => rs(PREVIEW_W), []);

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await saveCardToLibrary(cardRef);
      if (r.ok) Alert.alert('사진앱에 저장됐어요', effBg === 'transparent' ? '인스타 스토리에서 내 사진 위에 올리거나, 그대로 공유하세요.' : '완성된 이미지가 사진앱에 저장됐어요.');
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

  const cardProps = {
    model, route, photoUri: cardPhoto, layout: prefs.layout, showMap: prefs.showMap, showStats: prefs.showStats,
    background: effBg, textScale: prefs.textScale, mapScale: prefs.mapScale,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropTap} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <View style={[s.sheet, {paddingBottom: insets.bottom + rv(14)}]}>
          <View style={s.grab} />
          <Text style={s.title}>공유 카드</Text>
          <Text style={s.sub}>스타일을 고르고 지도·지표를 켜고 끄세요</Text>

          <View style={s.previewWrap}>
            <ShareCard {...cardProps} displayWidth={previewW} />
          </View>

          {/* 레이아웃 + 지도/지표 토글 */}
          <View style={s.row}>
            <View style={s.half}>
              <Text style={s.rowLabel}>지표 배치</Text>
              <View style={s.seg}>
                {RUN_CARD_LAYOUTS.map(l => {
                  const on = prefs.layout === l;
                  return (
                    <Pressable key={l} onPress={() => update({layout: l})} accessibilityRole="button" accessibilityState={{selected: on}} style={[s.segItem, on && s.segItemOn]}>
                      <Text style={[s.segTxt, on && s.segTxtOn]}>{RUN_CARD_LAYOUT_LABEL[l]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={s.row}>
            <ToggleChip label="지도" on={prefs.showMap} onPress={() => update({showMap: !prefs.showMap})} />
            <ToggleChip label="지표" on={prefs.showStats} onPress={() => update({showStats: !prefs.showStats})} />
          </View>

          {/* 배경 + 크기 */}
          <View style={s.row}>
            <View style={s.half}>
              <Text style={s.rowLabel}>배경</Text>
              <View style={s.seg}>
                {bgKeys.map(b => {
                  const on = effBg === b;
                  return (
                    <Pressable key={b} onPress={() => update({background: b})} accessibilityRole="button" accessibilityState={{selected: on}} style={[s.segItem, on && s.segItemOn]}>
                      <Text style={[s.segTxt, on && s.segTxtOn]}>{RUN_CARD_BACKGROUND_LABEL[b]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={s.row}>
            <Stepper label="글씨" value={prefs.textScale} onDec={() => stepText(-SCALE_STEP)} onInc={() => stepText(SCALE_STEP)} />
            <Stepper label="지도" value={prefs.mapScale} disabled={!prefs.showMap} onDec={() => stepMap(-SCALE_STEP)} onInc={() => stepMap(SCALE_STEP)} />
          </View>

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

function ToggleChip({label, on, onPress}: {label: string; on: boolean; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{checked: on}} accessibilityLabel={`${label} ${on ? '켬' : '끔'}`}
      style={[s.chip, on && s.chipOn]}>
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={ri(16)} color={on ? GOOD : T3} style={s.chipIcon} />
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({label, value, disabled, onDec, onInc}: {label: string; value: number; disabled?: boolean; onDec: () => void; onInc: () => void}) {
  const pct = Math.round(value * 100);
  const atMin = value <= RUN_CARD_SCALE_MIN + 0.001;
  const atMax = value >= RUN_CARD_SCALE_MAX - 0.001;
  return (
    <View style={[s.stepper, disabled && s.dim]}>
      <Text style={s.stepLabel}>{label}</Text>
      <Pressable onPress={onDec} disabled={disabled || atMin} accessibilityRole="button" accessibilityLabel={`${label} 작게`} hitSlop={6} style={[s.stepBtn, (disabled || atMin) && s.dim]}>
        <Ionicons name="remove" size={ri(15)} color={T1} />
      </Pressable>
      <Text style={s.stepVal}>{pct}%</Text>
      <Pressable onPress={onInc} disabled={disabled || atMax} accessibilityRole="button" accessibilityLabel={`${label} 크게`} hitSlop={6} style={[s.stepBtn, (disabled || atMax) && s.dim]}>
        <Ionicons name="add" size={ri(15)} color={T1} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)'},
  backdropTap: {flex: 1},
  sheet: {backgroundColor: BG, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), borderCurve: 'continuous', paddingHorizontal: rs(18), paddingTop: rv(10), borderTopWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  grab: {width: rs(38), height: rs(5), borderRadius: rs(3), backgroundColor: withAlpha(T1, 0.18), alignSelf: 'center', marginBottom: rv(12)},
  title: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', textAlign: 'center'},
  sub: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, textAlign: 'center', marginTop: rv(2), marginBottom: rv(12)},
  previewWrap: {alignItems: 'center', justifyContent: 'center', marginBottom: rv(12)},
  row: {flexDirection: 'row', gap: rv(10), marginTop: rv(12)},
  half: {flex: 1},
  rowLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', marginBottom: rv(6), marginLeft: rs(2)},
  seg: {flexDirection: 'row', backgroundColor: CARD_HI, borderRadius: RADIUS.md, borderCurve: 'continuous', padding: rs(3), gap: rs(3)},
  segItem: {flex: 1, height: rs(36), borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center'},
  segItemOn: {backgroundColor: withAlpha(ACCENT, 0.18)},
  segTxt: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  segTxtOn: {color: T1, fontWeight: '700'},
  chip: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(6), height: rs(44), borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: CARD_HI, borderWidth: 1, borderColor: SEP},
  chipOn: {backgroundColor: withAlpha(GOOD, 0.12), borderColor: withAlpha(GOOD, 0.4)},
  chipIcon: {},
  chipTxt: {color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  chipTxtOn: {color: T1},
  stepper: {flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: GLASS.fill, borderRadius: RADIUS.md, borderCurve: 'continuous', paddingHorizontal: rs(12), height: rs(46), gap: rv(8)},
  stepLabel: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', flex: 1},
  stepBtn: {width: rs(28), height: rs(28), borderRadius: rs(9), backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  stepVal: {color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', minWidth: rs(40), textAlign: 'center', fontVariant: ['tabular-nums']},
  actions: {flexDirection: 'row', gap: rv(10), marginTop: rv(16)},
  btn: {flex: 1, height: rs(52), borderRadius: RADIUS.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  btnGhost: {backgroundColor: withAlpha(T1, 0.06)},
  btnPrimary: {flex: 1.4, backgroundColor: withAlpha(T1, 0.1)},
  btnIcon: {marginRight: rs(6)},
  btnTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  offscreen: {position: 'absolute', left: -10000, top: 0, opacity: 0},
  dim: {opacity: 0.4},
  pressed: {opacity: 0.85},
});
