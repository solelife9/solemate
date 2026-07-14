// ============================================================================
// ShareCardPicker.tsx — 공유 카드 선택기(스트라바식) 시트
// ----------------------------------------------------------------------------
// 공유를 누르면 올라오는 시트. 여러 템플릿을 넘겨보며 고르고, 포맷(피드/세로형)·배경
// (투명/다크)·크기(글씨·지도)를 조절한 뒤 저장하거나 공유한다. 마지막 선택은 기억한다.
// 캡처는 오프스크린 고해상 ShareCard(ref.toDataURL) — lib/shareCard 재사용(네이티브 0).
// 선택기는 '공유할 때만' 뜬다(평소 화면은 건드리지 않는다 — 클러터 없음).
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable, ScrollView, Modal, StyleSheet, Alert, Linking} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {rs, rv, ri} from './lib/responsive';
import {BG, CARD_HI, ACCENT, T1, T2, T3, SEP, FONT, RADIUS, TYPE, withAlpha, GLASS} from './theme';
import ShareCard from './ShareCard';
import type {LatLon} from './lib/route';
import {
  saveCardToLibrary,
  shareRunCard,
  runCardElements,
  clampRunCardScale,
  RUN_CARD_TEMPLATES,
  RUN_CARD_TEMPLATE_LABEL,
  RUN_CARD_FORMAT_LABEL,
  RUN_CARD_BACKGROUND_LABEL,
  RUN_CARD_SCALE_MIN,
  RUN_CARD_SCALE_MAX,
  type ShareCardModel,
  type SvgCapturable,
  type RunCardTemplate,
  type RunCardFormat,
  type RunCardBackground,
} from './lib/shareCard';
import type {RunShareInput} from './lib/share';

const PREFS_KEY = 'sharecard_prefs_v1';
const SCALE_STEP = 0.1;

interface Prefs {
  template: RunCardTemplate;
  format: RunCardFormat;
  background: RunCardBackground;
  textScale: number;
  mapScale: number;
}
const DEFAULT_PREFS: Prefs = {
  template: 'classic',
  format: 'feed',
  background: 'transparent',
  textScale: 1,
  mapScale: 1,
};

export interface ShareCardPickerProps {
  visible: boolean;
  onClose: () => void;
  model: ShareCardModel;
  /** GPS 경로(지도 템플릿). */
  route?: LatLon[];
  /** 캡처 실패 시 텍스트 공유 폴백. */
  shareInput: RunShareInput;
  /** 오늘의 한 컷(있으면 배경 옵션에 '사진'을 더해 완성본으로 합성). */
  photoUri?: string | null;
}

export default function ShareCardPicker({visible, onClose, model, route = [], shareInput, photoUri = null}: ShareCardPickerProps) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<SvgCapturable | null>(null);

  // 마지막 선택 복원(비차단). 잘못된 값은 기본값으로 안전 보정.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PREFS_KEY).then(raw => {
      if (!alive || !raw) return;
      try {
        const p = JSON.parse(raw) as Partial<Prefs>;
        // 배경은 원문대로 복원 — 'photo'인데 사진이 없는 경우는 렌더에서 투명으로 폴백(effBg).
        const bg: RunCardBackground = p.background === 'dark' ? 'dark' : p.background === 'photo' ? 'photo' : 'transparent';
        setPrefs({
          template: RUN_CARD_TEMPLATES.includes(p.template as RunCardTemplate) ? (p.template as RunCardTemplate) : 'classic',
          format: p.format === 'story' ? 'story' : 'feed',
          background: bg,
          textScale: clampRunCardScale(Number(p.textScale)),
          mapScale: clampRunCardScale(Number(p.mapScale)),
        });
      } catch {/* 손상된 값 → 기본 */}
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // 선택이 바뀔 때마다 기억(비차단).
  const update = (patch: Partial<Prefs>) => {
    setPrefs(prev => {
      const next = {...prev, ...patch};
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const el = runCardElements(prefs.template);
  const mapEditable = el.map; // 지도 없는 템플릿은 '지도 크기' 비활성
  // 배경 옵션 — 사진이 있으면 '사진'(완성본) 추가. 'photo' 선택 시에만 카드에 사진을 넣는다.
  const bgKeys: RunCardBackground[] = photoUri ? ['transparent', 'dark', 'photo'] : ['transparent', 'dark'];
  // 유효 배경 — 복원된 'photo'인데 사진이 없으면 투명으로 폴백. 렌더·토글·캡처가 모두 이 값을 쓴다.
  const effBg: RunCardBackground = bgKeys.includes(prefs.background) ? prefs.background : 'transparent';
  const cardPhoto = effBg === 'photo' ? photoUri : null;

  // 미리보기 폭 — 세로형(9:16)은 더 길어 폭을 줄여 높이를 맞춘다.
  const previewW = useMemo(() => (prefs.format === 'story' ? rs(206) : rs(268)), [prefs.format]);

  const stepText = (d: number) => update({textScale: clampRunCardScale(Math.round((prefs.textScale + d) * 100) / 100)});
  const stepMap = (d: number) => update({mapScale: clampRunCardScale(Math.round((prefs.mapScale + d) * 100) / 100)});

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await saveCardToLibrary(cardRef);
      if (r.ok) Alert.alert('사진앱에 저장됐어요', '인스타 스토리에서 내 사진 위에 올리거나, 그대로 공유하세요.');
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropTap} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <View style={[s.sheet, {paddingBottom: insets.bottom + rv(14)}]}>
          <View style={s.grab} />
          <Text style={s.title}>공유 카드</Text>
          <Text style={s.sub}>넘겨서 스타일 · 포맷·배경·크기 조절</Text>

          {/* 미리보기 */}
          <View style={s.previewWrap}>
            <ShareCard
              model={model}
              route={route}
              photoUri={cardPhoto}
              template={prefs.template}
              format={prefs.format}
              background={effBg}
              textScale={prefs.textScale}
              mapScale={prefs.mapScale}
              displayWidth={previewW}
            />
          </View>

          {/* 템플릿 스트립(클래식이 맨 앞·기본) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
            {RUN_CARD_TEMPLATES.map(t => {
              const on = prefs.template === t;
              return (
                <Pressable key={t} onPress={() => update({template: t})} accessibilityRole="button"
                  accessibilityLabel={`${RUN_CARD_TEMPLATE_LABEL[t]} 스타일`} accessibilityState={{selected: on}}
                  style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipTxt, on && s.chipTxtOn]}>{RUN_CARD_TEMPLATE_LABEL[t]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 포맷 · 배경 토글 */}
          <View style={s.toggleRow}>
            <Toggle label="포맷" options={(['feed', 'story'] as RunCardFormat[]).map(f => ({key: f, label: RUN_CARD_FORMAT_LABEL[f]}))}
              value={prefs.format} onChange={f => update({format: f as RunCardFormat})} />
            <Toggle label="배경" options={bgKeys.map(b => ({key: b, label: RUN_CARD_BACKGROUND_LABEL[b]}))}
              value={effBg} onChange={b => update({background: b as RunCardBackground})} />
          </View>

          {/* 크기 조절 — 글씨 / 지도(지도 없는 템플릿은 비활성) */}
          <View style={s.sizeRow}>
            <Stepper label="글씨" value={prefs.textScale} onDec={() => stepText(-SCALE_STEP)} onInc={() => stepText(SCALE_STEP)} />
            <Stepper label="지도" value={prefs.mapScale} disabled={!mapEditable} onDec={() => stepMap(-SCALE_STEP)} onInc={() => stepMap(SCALE_STEP)} />
          </View>

          {/* 액션 */}
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

      {/* 오프스크린 고해상 캡처 카드(선택 반영) */}
      <View style={s.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ShareCard
          ref={cardRef as never}
          model={model}
          route={route}
          photoUri={cardPhoto}
          template={prefs.template}
          format={prefs.format}
          background={effBg}
          textScale={prefs.textScale}
          mapScale={prefs.mapScale}
        />
      </View>
    </Modal>
  );
}

function Toggle<T extends string>({label, options, value, onChange}: {
  label: string; options: {key: T; label: string}[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={s.toggle}>
      <Text style={s.toggleLabel}>{label}</Text>
      <View style={s.seg}>
        {options.map(o => {
          const on = value === o.key;
          return (
            <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="button"
              accessibilityState={{selected: on}} style={[s.segItem, on && s.segItemOn]}>
              <Text style={[s.segTxt, on && s.segTxtOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Stepper({label, value, disabled, onDec, onInc}: {
  label: string; value: number; disabled?: boolean; onDec: () => void; onInc: () => void;
}) {
  const pct = Math.round(value * 100);
  const atMin = value <= RUN_CARD_SCALE_MIN + 0.001;
  const atMax = value >= RUN_CARD_SCALE_MAX - 0.001;
  return (
    <View style={[s.stepper, disabled && s.dim]}>
      <Text style={s.stepLabel}>{label}</Text>
      <Pressable onPress={onDec} disabled={disabled || atMin} accessibilityRole="button" accessibilityLabel={`${label} 작게`}
        hitSlop={6} style={[s.stepBtn, (disabled || atMin) && s.dim]}>
        <Ionicons name="remove" size={ri(15)} color={T1} />
      </Pressable>
      <Text style={s.stepVal}>{pct}%</Text>
      <Pressable onPress={onInc} disabled={disabled || atMax} accessibilityRole="button" accessibilityLabel={`${label} 크게`}
        hitSlop={6} style={[s.stepBtn, (disabled || atMax) && s.dim]}>
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
  strip: {gap: rv(8), paddingHorizontal: rs(2), paddingBottom: rv(2)},
  chip: {paddingHorizontal: rs(16), height: rs(38), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD_HI, borderWidth: 1, borderColor: SEP},
  chipOn: {backgroundColor: withAlpha(ACCENT, 0.16), borderColor: withAlpha(ACCENT, 0.5)},
  chipTxt: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  chipTxtOn: {color: T1, fontWeight: '700'},
  toggleRow: {flexDirection: 'row', gap: rv(10), marginTop: rv(14)},
  toggle: {flex: 1},
  toggleLabel: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', marginBottom: rv(6), marginLeft: rs(2)},
  seg: {flexDirection: 'row', backgroundColor: CARD_HI, borderRadius: RADIUS.md, borderCurve: 'continuous', padding: rs(3), gap: rs(3)},
  segItem: {flex: 1, height: rs(34), borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center'},
  segItemOn: {backgroundColor: withAlpha(ACCENT, 0.18)},
  segTxt: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  segTxtOn: {color: T1, fontWeight: '700'},
  sizeRow: {flexDirection: 'row', gap: rv(10), marginTop: rv(14)},
  stepper: {flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: GLASS.fill, borderRadius: RADIUS.md, borderCurve: 'continuous', paddingHorizontal: rs(12), height: rs(46), gap: rv(8)},
  stepLabel: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', flex: 1},
  stepBtn: {width: rs(28), height: rs(28), borderRadius: rs(9), backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  stepVal: {color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', minWidth: rs(40), textAlign: 'center', fontVariant: ['tabular-nums']},
  actions: {flexDirection: 'row', gap: rv(10), marginTop: rv(16)},
  btn: {flex: 1, height: rs(52), borderRadius: RADIUS.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  btnGhost: {backgroundColor: withAlpha(T1, 0.06)},
  btnPrimary: {flex: 1.4, backgroundColor: withAlpha(T1, 0.1)},
  btnTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  offscreen: {position: 'absolute', left: -10000, top: 0, opacity: 0},
  dim: {opacity: 0.4},
  pressed: {opacity: 0.85},
  btnIcon: {marginRight: rs(6)},
});
