// ============================================================================
// AddShoeScreen.rn.tsx — register a new shoe (brand chips, model autocomplete,
// auto-filled recommended life with a '권장' badge, real photo attach)
// ============================================================================
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD, CARD_HI, ACCENT, T1, T2, T3, FONT, DISPLAY, withAlpha, Shoe,
} from './theme';
import { Pill } from './primitives';
// 신발 모델 카탈로그·권장수명은 data/shoeModels(단일 소스)에서 가져온다.
import { BRANDS, modelsForBrand, getRecommendedLifespanKm } from './data/shoeModels';
// 사진 첨부는 expo-image-picker 래퍼(lib/photo)를 통해 실제로 동작한다.
import { pickShoePhoto } from './lib/photo';

export default function AddShoeScreen({
  onClose, onSave,
}: { onClose?: () => void; onSave?: (shoe: Shoe) => void }) {
  const [brand, setBrand] = useState(BRANDS[0]);
  const [model, setModel] = useState('');
  const [focused, setFocused] = useState(false);
  // 권장 수명(km) — 모델 선택 시 자동 채워지며 사용자가 직접 수정 가능.
  const [max, setMax] = useState(getRecommendedLifespanKm({ brand: BRANDS[0] }));
  const [used, setUsed] = useState('0');
  // 사진: 선택 성공 시 uri, 실패 시 에러 플래그(저장은 비차단 — 사진 없이 진행 가능).
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [picking, setPicking] = useState(false);

  const q = model.trim().toLowerCase();
  // 모델 목록은 data/shoeModels(modelsForBrand)를 단일 소스로 쓰고 알파벳순(localeCompare)으로 정렬.
  const sortedModels = modelsForBrand(brand).slice().sort((a, b) => a.localeCompare(b));
  // 두 방식 병행:
  //  - 입력이 비어 있으면 해당 브랜드의 전체 모델을 알파벳순으로(스크롤) 노출
  //  - 글자를 입력하면 기존 필터(부분일치, 상위 5개) 동작 유지
  const matches = q
    ? sortedModels.filter((m) => m.toLowerCase().includes(q) && m.toLowerCase() !== q).slice(0, 5)
    : sortedModels;
  const suggestions = matches.map(
    (m) => [m, getRecommendedLifespanKm({ brand, model: m })] as [string, number],
  );
  const valid = model.trim().length > 0;

  // 현재 brand+model 기준 권장 수명. max가 이 값과 같으면 '권장'(자동값), 다르면 사용자 수정값.
  const recommendedKm = getRecommendedLifespanKm({ brand, model });
  const isRecommended = max === recommendedKm;

  const pickModel = (name: string, km: number) => { setModel(name); setMax(km); setFocused(false); };
  // 브랜드를 바꾸면 모델을 비우고 권장 수명도 새 브랜드 기준으로 되돌린다.
  const pickBrand = (b: string) => { setBrand(b); setModel(''); setMax(getRecommendedLifespanKm({ brand: b })); };

  const onPickPhoto = async () => {
    if (picking) return;
    setPicking(true);
    setPhotoError(false);
    try {
      const picked = await pickShoePhoto();
      if (picked) setPhotoUri(picked.uri);
    } catch {
      // 실패해도 저장을 막지 않는다 — 에러를 표시하고 재시도를 제안.
      setPhotoError(true);
    } finally {
      setPicking(false);
    }
  };

  const save = () => {
    if (!valid) return;
    onSave?.({
      brand,
      model: model.trim(),
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
          <Ionicons name="close" size={18} color={T2} />
        </Pressable>
        <Text style={s.navTitle}>러닝화 등록</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        {/* photo — tap to pick from library; non-blocking on failure */}
        <Pressable onPress={onPickPhoto} disabled={picking} style={({ pressed }) => [s.photo, pressed && s.pressed]}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={s.photoImg} resizeMode="cover" />
          ) : (
            <>
              <Ionicons name={photoError ? 'refresh-outline' : 'camera-outline'} size={26} color={photoError ? ACCENT : T3} />
              <Text style={[s.photoText, photoError && { color: ACCENT }]}>
                {picking ? '불러오는 중…' : photoError ? '다시 시도' : '신발 사진'}
              </Text>
            </>
          )}
        </Pressable>
        {photoError && (
          <Text style={s.photoErr}>사진을 불러오지 못했어요. 사진 없이 등록하거나 다시 시도하세요.</Text>
        )}

        {/* brand */}
        <Text style={s.label}>브랜드</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {BRANDS.map((b) => {
            const on = b === brand;
            return (
              <Pressable key={b} onPress={() => pickBrand(b)} accessibilityRole="button" accessibilityLabel={b} accessibilityState={{ selected: on }} hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => [s.chip, on ? s.chipOn : s.chipOff, pressed && s.pressed]}>
                <Text style={[s.chipText, { color: on ? ACCENT : T2 }]}>{b}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* model + autocomplete */}
        <Text style={[s.label, { marginTop: 22 }]}>모델명</Text>
        <View>
          <TextInput
            value={model}
            onChangeText={setModel}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="예: Pegasus 41"
            placeholderTextColor={T3}
            style={s.input}
          />
          {focused && suggestions.length > 0 && (
            <View style={s.dropdown}>
              {/* 리스트가 길면(브랜드 전체 노출 시) 최대 높이 내에서 스크롤 */}
              <ScrollView
                style={s.dropdownScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {suggestions.map(([m, km]) => (
                  <Pressable key={m} onPress={() => pickModel(m, km)} accessibilityRole="button" accessibilityLabel={m} style={({ pressed }) => [s.suggestion, pressed && { backgroundColor: CARD_HI }]}>
                    <Text style={s.sugBrand}>{brand}</Text>
                    <Text style={s.sugModel}>{m}</Text>
                    <Text style={s.sugKm}>{km}km</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* max life — auto-filled recommendation, editable; '권장' badge when unchanged */}
        <View style={s.maxHead}>
          <Text style={[s.label, { paddingBottom: 0 }]}>최대 수명</Text>
          {isRecommended && <Pill tone="accent" label="권장" icon="sparkles-outline" />}
        </View>
        <View style={s.usedRow}>
          <TextInput
            value={max ? String(max) : ''}
            onChangeText={(v) => setMax(Number(v.replace(/[^0-9]/g, '')) || 0)}
            keyboardType="number-pad"
            style={s.usedInput}
          />
          <Text style={s.usedUnit}>km</Text>
        </View>
        <Text style={s.hint}>모델을 선택하면 권장 수명이 자동으로 채워져요. 직접 바꿀 수도 있어요.</Text>

        {/* current mileage */}
        <Text style={[s.label, { marginTop: 22 }]}>현재 누적 거리</Text>
        <View style={s.usedRow}>
          <TextInput
            value={used}
            onChangeText={(v) => setUsed(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            style={s.usedInput}
          />
          <Text style={s.usedUnit}>km</Text>
        </View>
        <Text style={s.hint}>새 신발이면 0으로 두세요.</Text>
      </ScrollView>

      {/* CTA */}
      <View style={s.ctaWrap}>
        <Pressable onPress={save} disabled={!valid} accessibilityRole="button" accessibilityLabel="러닝화 등록" accessibilityState={{ disabled: !valid }} style={({ pressed }) => [s.cta, !valid && s.ctaDisabled, pressed && valid && s.pressed]}>
          <Text style={[s.ctaText, !valid && { color: T3 }]}>러닝화 등록</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  nav: { paddingTop: 12, paddingHorizontal: 18, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '500', letterSpacing: -0.2 },

  photo: { alignSelf: 'center', width: 128, height: 128, borderRadius: 26, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoText: { color: T3, fontFamily: FONT, fontSize: 12 },
  photoErr: { color: T3, fontFamily: FONT, fontSize: 11.5, textAlign: 'center', marginBottom: 16, paddingHorizontal: 12 },

  label: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4, paddingBottom: 10 },

  chip: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderWidth: 1, borderColor: ACCENT, backgroundColor: withAlpha(ACCENT, 0.14) },
  chipOff: { borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), backgroundColor: CARD_HI },
  chipText: { fontFamily: FONT, fontSize: 12.5, fontWeight: '600', letterSpacing: 0.6 },

  input: { backgroundColor: CARD, borderRadius: 18, color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '500', paddingHorizontal: 18, paddingVertical: 16, letterSpacing: -0.2 },
  dropdown: { position: 'absolute', top: 62, left: 0, right: 0, zIndex: 30, backgroundColor: CARD, borderRadius: 18, padding: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12) },
  dropdownScroll: { maxHeight: 264 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 11 },
  sugBrand: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },
  sugModel: { flex: 1, color: T1, fontFamily: FONT, fontSize: 14.5, fontWeight: '500', letterSpacing: -0.2 },
  sugKm: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500' },

  maxHead: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingBottom: 10 },

  hint: { color: T3, fontFamily: FONT, fontSize: 11.5, paddingHorizontal: 4, paddingTop: 9 },

  usedRow: { backgroundColor: CARD, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  usedInput: { flex: 1, color: T1, fontFamily: DISPLAY, fontSize: 24, paddingVertical: 12 },
  usedUnit: { color: T3, fontFamily: FONT, fontSize: 15 },

  ctaWrap: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 34, backgroundColor: BG },
  cta: { height: 58, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { backgroundColor: CARD_HI },
  ctaText: { color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },
});
