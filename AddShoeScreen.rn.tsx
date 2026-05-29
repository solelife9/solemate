// ============================================================================
// AddShoeScreen.rn.tsx — register a new shoe (brand chips, autocomplete, recommended life)
// ============================================================================
import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD, CARD_HI, ACCENT, T1, T2, T3, FONT, DISPLAY, Shoe,
} from './theme';

// model catalogue with recommended max life (km): racer≈400 · tempo≈600 · daily≈800
const MODELS: Record<string, [string, number][]> = {
  NIKE: [['Pegasus 41', 800], ['Vaporfly 3', 400], ['Alphafly 3', 400], ['Invincible 3', 800], ['Structure 25', 800], ['Zoom Fly 6', 600]],
  ADIDAS: [['Adizero Adios Pro 3', 400], ['Adizero Boston 12', 600], ['Ultraboost Light', 800], ['Supernova Rise', 800], ['Takumi Sen 10', 400]],
  HOKA: [['Mach 6', 600], ['Clifton 9', 800], ['Bondi 8', 800], ['Rocket X 2', 400], ['Speedgoat 5', 800]],
  ASICS: [['Gel-Nimbus 26', 800], ['Novablast 4', 600], ['Superblast 2', 800], ['Metaspeed Sky+', 400], ['Gel-Kayano 31', 800], ['Magic Speed 4', 400]],
  'NEW BALANCE': [['FuelCell Rebel v4', 600], ['SC Elite v4', 400], ['Fresh Foam 1080 v13', 800], ['More v4', 800]],
  SAUCONY: [['Endorphin Speed 4', 600], ['Endorphin Pro 4', 400], ['Kinvara 15', 600], ['Ride 17', 800]],
  BROOKS: [['Ghost 16', 800], ['Glycerin 21', 800], ['Hyperion Max 2', 600], ['Adrenaline GTS 23', 800]],
  PUMA: [['Deviate Nitro 3', 600], ['Velocity Nitro 3', 800], ['Fast-R Nitro Elite 3', 400]],
};
const BRANDS = Object.keys(MODELS);
const MAX_PRESETS = [400, 500, 600, 700, 800];

export default function AddShoeScreen({
  onClose, onSave,
}: { onClose?: () => void; onSave?: (shoe: Shoe) => void }) {
  const [brand, setBrand] = useState('NIKE');
  const [model, setModel] = useState('');
  const [focused, setFocused] = useState(false);
  const [max, setMax] = useState(500);
  const [used, setUsed] = useState('0');

  const q = model.trim().toLowerCase();
  const suggestions = (MODELS[brand] || []).filter(([m]) => q && m.toLowerCase().includes(q) && m.toLowerCase() !== q).slice(0, 5);
  const valid = model.trim().length > 0;

  const pickModel = (name: string, km: number) => { setModel(name); setMax(km); setFocused(false); };
  const save = () => {
    if (!valid) return;
    onSave?.({ brand, model: model.trim(), max, used: Number(used) || 0, condition: '양호' });
  };

  return (
    <View style={s.screen}>
      {/* nav */}
      <View style={s.nav}>
        <Pressable onPress={onClose} style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}>
          <Ionicons name="close" size={18} color={T2} />
        </Pressable>
        <Text style={s.navTitle}>러닝화 등록</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        {/* photo placeholder (wire to your image picker) */}
        <View style={s.photo}>
          <Ionicons name="camera-outline" size={26} color={T3} />
          <Text style={s.photoText}>신발 사진</Text>
        </View>

        {/* brand */}
        <Text style={s.label}>브랜드</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {BRANDS.map((b) => {
            const on = b === brand;
            return (
              <Pressable key={b} onPress={() => { setBrand(b); setModel(''); }} style={[s.chip, on ? s.chipOn : s.chipOff]}>
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
              {suggestions.map(([m, km]) => (
                <Pressable key={m} onPress={() => pickModel(m, km)} style={({ pressed }) => [s.suggestion, pressed && { backgroundColor: CARD_HI }]}>
                  <Text style={s.sugBrand}>{brand}</Text>
                  <Text style={s.sugModel}>{m}</Text>
                  <Text style={s.sugKm}>{km}km</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* max life */}
        <Text style={[s.label, { marginTop: 22 }]}>최대 수명</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MAX_PRESETS.map((m) => {
            const on = max === m;
            return (
              <Pressable key={m} onPress={() => setMax(m)} style={[s.maxBtn, on ? s.chipOn : s.chipOff]}>
                <Text style={[s.maxV, { color: on ? ACCENT : T2 }]}>{m}</Text>
                <Text style={[s.maxU, { color: on ? ACCENT : T3 }]}>km</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.hint}>모델을 선택하면 권장 수명이 자동으로 맞춰져요. 직접 바꿀 수도 있어요.</Text>

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
        <Pressable onPress={save} disabled={!valid} style={[s.cta, !valid && s.ctaDisabled]}>
          <Text style={[s.ctaText, !valid && { color: T3 }]}>러닝화 등록</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  nav: { paddingTop: 60, paddingHorizontal: 18, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '500', letterSpacing: -0.2 },

  photo: { alignSelf: 'center', width: 128, height: 128, borderRadius: 26, backgroundColor: '#1f1f22', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 22 },
  photoText: { color: T3, fontFamily: FONT, fontSize: 12 },

  label: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4, paddingBottom: 10 },

  chip: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderWidth: 1, borderColor: ACCENT, backgroundColor: 'rgba(255,101,0,0.14)' },
  chipOff: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: CARD_HI },
  chipText: { fontFamily: FONT, fontSize: 12.5, fontWeight: '600', letterSpacing: 0.6 },

  input: { backgroundColor: CARD, borderRadius: 18, color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '500', paddingHorizontal: 18, paddingVertical: 16, letterSpacing: -0.2 },
  dropdown: { position: 'absolute', top: 62, left: 0, right: 0, zIndex: 30, backgroundColor: CARD, borderRadius: 18, padding: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 11 },
  sugBrand: { color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '600', letterSpacing: 0.8 },
  sugModel: { flex: 1, color: T1, fontFamily: FONT, fontSize: 14.5, fontWeight: '500', letterSpacing: -0.2 },
  sugKm: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500' },

  maxBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 1 },
  maxV: { fontFamily: DISPLAY, fontSize: 18 },
  maxU: { fontFamily: FONT, fontSize: 9, fontWeight: '500' },

  hint: { color: T3, fontFamily: FONT, fontSize: 11.5, paddingHorizontal: 4, paddingTop: 9 },

  usedRow: { backgroundColor: CARD, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  usedInput: { flex: 1, color: T1, fontFamily: DISPLAY, fontSize: 24, paddingVertical: 12 },
  usedUnit: { color: T3, fontFamily: FONT, fontSize: 15 },

  ctaWrap: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 34, backgroundColor: BG },
  cta: { height: 58, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  ctaDisabled: { backgroundColor: CARD_HI },
  ctaText: { color: '#fff', fontFamily: FONT, fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },
});
