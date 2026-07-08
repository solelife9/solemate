// ============================================================================
// AddShoeScreen.rn.tsx — register a new shoe.
// 2026-07-07: 등록 UX 를 온보딩과 통일 — 브랜드 칩 + 모델 검색 모달을 하나의
// '내 러닝화' 선택 필드 + 공용 2열 분할 피커(ShoePicker)로 대체한다(사용자 지시).
// 나머지(사진·교체 권장 거리·현재 누적 거리)는 그대로 유지한다.
// ============================================================================
import React, { useState } from 'react';
import { rf, rs, ri } from './lib/responsive';
import { View, Text, TextInput, ScrollView, Pressable, Image, StyleSheet, KeyboardAvoidingView, Platform, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD_DIM, CARD_HI, ACCENT, DANGER, T1, T2, T3, T4, FONT, DISPLAY, withAlpha, Shoe,
} from './theme';
import { Pill, Button } from './primitives';
// 러닝화 모델 카탈로그·권장수명은 data/shoeModels(단일 소스)에서 가져온다.
import { getRecommendedLifespanKm } from './data/shoeModels';
// 러닝화 선택은 온보딩과 공유하는 2열 분할 피커(단일 소스).
import { ShoePicker, type PickedShoe } from './ShoePicker';
// maxKm 0 같은 비정상값을 제출 시 인라인으로 차단(빨강 헬퍼텍스트).
import { validateMaxKm } from './lib/inputMask';
// 사진 첨부는 expo-image-picker 래퍼(lib/photo)를 통해 실제로 동작한다.
import { pickPhotoWithPermission } from './lib/photo';

export default function AddShoeScreen({
  onClose, onSave,
}: { onClose?: () => void; onSave?: (shoe: Shoe) => void }) {
  // 러닝화(브랜드+모델)는 공용 피커로 한 번에 고른다. 브랜드는 선택 결과에 따라온다.
  const [picked, setPicked] = useState<PickedShoe | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 권장 수명(km) — 모델 선택 시 자동 채워지며 사용자가 직접 수정 가능.
  const [max, setMax] = useState(0);
  const [used, setUsed] = useState('0');
  // maxKm 0/비정상값 인라인 차단 — 제출 시 검증해 필드 아래 빨강 헬퍼텍스트로 표시한다.
  const [maxErr, setMaxErr] = useState<string | undefined>(undefined);
  // 사진: 선택 성공 시 uri, 실패 시 에러 플래그(저장은 비차단 — 사진 없이 진행 가능).
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [picking, setPicking] = useState(false);

  // 모델만 있으면 등록 가능 — 검색창 직접 추가는 브랜드가 비어 있을 수 있다(온보딩과 동일).
  // '기타' 레일 직접 입력은 브랜드명을 받으므로 그 경로는 브랜드가 채워진다.
  const valid = !!picked && picked.model.trim().length > 0;

  // 현재 brand+model 기준 권장 수명. max가 이 값과 같으면 '권장'(자동값), 다르면 사용자 수정값.
  const recommendedKm = picked ? getRecommendedLifespanKm({ brand: picked.brand, model: picked.model }) : 0;
  const isRecommended = !!picked && max === recommendedKm;

  // 피커에서 러닝화를 고르면 권장 수명을 자동 채운다(사용자가 아래에서 수정 가능).
  const onPick = (p: PickedShoe) => {
    setPicked(p);
    setMax(getRecommendedLifespanKm({ brand: p.brand, model: p.model }));
    setMaxErr(undefined);
  };

  const onPickPhoto = async () => {
    if (picking) return;
    setPicking(true);
    setPhotoError(false);
    try {
      const pickedPhoto = await pickPhotoWithPermission();
      if (pickedPhoto.ok) setPhotoUri(pickedPhoto.uri);
      else if (pickedPhoto.reason === 'denied') {
        // 권한 거부 시 무반응이던 것 개선(2026-07-05) — 설정 안내(비차단).
        Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 권한을 허용하면 신발 사진을 등록할 수 있어요.', [
          {text: '설정 열기', onPress: () => { Promise.resolve(Linking.openSettings()).catch(() => {}); }},
          {text: '나중에', style: 'cancel'},
        ]);
      }
    } catch {
      // 실패해도 저장을 막지 않는다 — 에러를 표시하고 재시도를 제안.
      setPhotoError(true);
    } finally {
      setPicking(false);
    }
  };

  const save = () => {
    if (!valid || !picked) return;
    // maxKm 0 같은 비정상값을 인라인으로 차단한다(Alert 없이 필드 아래 빨강 헬퍼텍스트).
    const me = validateMaxKm(max);
    setMaxErr(me);
    if (me) return;
    onSave?.({
      brand: picked.brand.trim(),
      model: picked.model.trim(),
      max,
      used: Number(used) || 0,
      condition: '양호',
      ...(photoUri ? { photoUri } : {}),
    });
  };

  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* nav */}
      <View style={s.nav}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기" style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
          <Ionicons name="close" size={ri(18)} color={T2} />
        </Pressable>
        <Text style={s.navTitle}>러닝화 등록</Text>
        <View style={{ width: rs(38) }} />
      </View>

      {/* 키보드가 입력칸·등록 버튼을 가리지 않게 폼+CTA를 KeyboardAvoidingView로 감싼다
          (iOS=padding, Android는 adjustResize에 맡겨 undefined). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 8}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: rs(18), paddingBottom: rs(20) }} keyboardShouldPersistTaps="handled">
        {/* photo — tap to pick from library; non-blocking on failure */}
        <Pressable onPress={onPickPhoto} disabled={picking} style={({ pressed }) => [s.photo, pressed && s.pressed]}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={s.photoImg} resizeMode="cover" />
          ) : (
            <>
              <Ionicons name={photoError ? 'refresh-outline' : 'camera-outline'} size={ri(26)} color={photoError ? ACCENT : T3} />
              <Text style={[s.photoText, photoError && { color: ACCENT }]}>
                {picking ? '불러오는 중…' : photoError ? '다시 시도' : '신발 사진'}
              </Text>
            </>
          )}
        </Pressable>
        {photoError && (
          <Text style={s.photoErr}>사진을 불러오지 못했어요. 사진 없이 등록하거나 다시 시도하세요.</Text>
        )}
        {!photoError && <Text style={s.photoOpt}>선택 — 사진 없이도 등록할 수 있어요</Text>}

        {/* 러닝화(브랜드+모델) — 탭하면 온보딩과 동일한 2열 분할 피커가 열린다 */}
        <Text style={s.label}>러닝화</Text>
        <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel={picked ? `러닝화 ${picked.brand} ${picked.model}, 눌러서 변경` : '러닝화 선택'} testID="add-shoe-select" style={({ pressed }) => [s.selector, pressed && s.pressed]}>
          <Ionicons name="search" size={ri(18)} color={T3} />
          <Text style={[s.selectorText, !picked && { color: T3 }]} numberOfLines={1}>
            {picked ? `${picked.brand ? `${picked.brand} · ` : ''}${picked.model}` : '브랜드·모델 선택'}
          </Text>
          <Ionicons name="chevron-down" size={ri(18)} color={T3} />
        </Pressable>

        {/* 권장 교체 거리 — 쿠셔닝(성능) 기준 가이드. 자동 입력·수정 가능, 미수정 시 '권장' 배지 */}
        <View style={s.maxHead}>
          <Text style={[s.label, { paddingBottom: rs(0) }]}>교체 권장 거리</Text>
          {isRecommended && <Pill tone="accent" label="권장" icon="sparkles-outline" />}
        </View>
        <View style={[s.usedRow, !!maxErr && s.usedRowErr]}>
          <TextInput
            value={max ? String(max) : ''}
            onChangeText={(v) => { setMax(Number(v.replace(/[^0-9]/g, '')) || 0); setMaxErr(undefined); }}
            keyboardType="number-pad"
            style={s.usedInput}
            accessibilityLabel="교체 권장 거리"
          />
          <Text style={s.usedUnit}>km</Text>
        </View>
        {!!maxErr && <Text style={s.errText} accessibilityLabel="권장 거리 오류">{maxErr}</Text>}
        <Text style={s.hint}>
          쿠셔닝(성능)이 좋게 유지되는 교체 권장 거리예요. 더 신어도 되지만 충격 흡수는 점점 줄어요.
          모델 선택 시 자동 입력되며 직접 바꿀 수 있어요.
        </Text>

        {/* current mileage */}
        <Text style={[s.label, { marginTop: rs(22) }]}>현재 누적 거리</Text>
        <View style={s.usedRow}>
          <TextInput
            value={used}
            onChangeText={(v) => setUsed(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            accessibilityLabel="현재 누적 거리"
            style={s.usedInput}
          />
          <Text style={s.usedUnit}>km</Text>
        </View>
        <Text style={s.hint}>새 신발이면 0으로 두세요.</Text>
      </ScrollView>

      {/* CTA — 미선택 시 ghost 비활성. */}
      <View style={s.ctaWrap}>
        <Button label="러닝화 등록" onPress={save} disabled={!valid} />
      </View>
      </KeyboardAvoidingView>

      {/* 러닝화 선택 — 온보딩과 공유하는 2열 분할 피커(브랜드 레일 + 모델 알파벳순 + 검색). */}
      <ShoePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPick}
        insetTop={insets.top}
        insetBottom={insets.bottom}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  nav: { paddingTop: rs(12), paddingHorizontal: rs(18), paddingBottom: rs(6), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: rs(38), height: rs(38), borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: T1, fontFamily: FONT, fontSize: rf(17), fontWeight: '500', letterSpacing: -0.2 },

  photo: { alignSelf: 'center', width: rs(120), height: rs(120), borderRadius: rs(26), borderCurve: 'continuous', borderWidth: 1, borderStyle: 'dashed', borderColor: withAlpha(T1, 0.14), backgroundColor: withAlpha(T1, 0.02), alignItems: 'center', justifyContent: 'center', gap: rs(7), marginBottom: rs(10), overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoText: { color: T3, fontFamily: FONT, fontSize: rf(13) },
  photoErr: { color: T3, fontFamily: FONT, fontSize: rf(13), textAlign: 'center', marginBottom: rs(16), paddingHorizontal: rs(12) },
  photoOpt: { color: T4, fontFamily: FONT, fontSize: rf(12), textAlign: 'center', marginBottom: rs(18) },

  label: { color: T2, fontFamily: FONT, fontSize: rf(14), fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: rs(4), paddingBottom: rs(10) },

  // 러닝화 선택 트리거(탭하면 2열 분할 피커). 입력칸처럼 보이되 누르면 모달이 열린다.
  selector: { backgroundColor: CARD_DIM, borderRadius: rs(16), borderCurve: 'continuous', borderWidth: 1, borderColor: withAlpha(T1, 0.07), flexDirection: 'row', alignItems: 'center', gap: rs(10), paddingHorizontal: rs(18), paddingVertical: rs(16) },
  selectorText: { flex: 1, color: T1, fontFamily: FONT, fontSize: rf(17), fontWeight: '500', letterSpacing: -0.2 },

  maxHead: { marginTop: rs(22), flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingHorizontal: rs(4), paddingBottom: rs(10) },

  hint: { color: T3, fontFamily: FONT, fontSize: rf(13), paddingHorizontal: rs(4), paddingTop: rs(9) },

  usedRow: { backgroundColor: CARD_DIM, borderRadius: rs(16), borderCurve: 'continuous', borderWidth: 1, borderColor: withAlpha(T1, 0.07), flexDirection: 'row', alignItems: 'center', paddingHorizontal: rs(18) },
  // 검증 실패 시 입력칸 테두리를 빨강으로 강조하고 아래 인라인 헬퍼텍스트를 띄운다.
  usedRowErr: { borderColor: DANGER },
  errText: { color: DANGER, fontFamily: FONT, fontSize: rf(13), fontWeight: '500', paddingHorizontal: rs(4), paddingTop: rs(8) },
  usedInput: { flex: 1, color: T1, fontFamily: DISPLAY, fontSize: rf(25), paddingVertical: rs(12) },
  usedUnit: { color: T3, fontFamily: FONT, fontSize: rf(16) },

  ctaWrap: { paddingHorizontal: rs(18), paddingTop: rs(6), paddingBottom: rs(34), backgroundColor: BG },
});
