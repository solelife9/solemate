// ============================================================================
// RunScreen.rn.tsx — RunStart (goal keypad + presets)
// The live run screen is rendered by the engine in App.tsx (it owns GPS/TTS/
// sensors/pause/stop), so only the goal-entry screen lives here.
//
// Slice 3 디자인 토큰화: 하드코딩 색/인라인 fontFamily 0 — 색은 theme 토큰(+withAlpha
// 파생), 폰트는 FONT/DISPLAY 토큰만. 인지부하 최소화 위계 = 거리 1개 히어로 지표
// (Metric primitive, DISPLAY+tabular-nums) + 글랜서블 보조(프리셋), 오렌지 절제(강조는
// 선택 프리셋/CTA에만). 심박(bpm/heart_rate)은 이 화면에 UI가 없으며 Run.bpm 데이터
// 필드/타입은 보존한다(iron law #17 — 표시만 숨김, 파괴 금지).
// ============================================================================
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD_HI, ACCENT, T1, T2, T3, FONT, Shoe, SHOES, withAlpha,
} from './theme';
import { Metric, Button } from './primitives';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
const PRESETS = ['3', '5', '10', '21.1'];

export function RunStart({
  shoe = SHOES[0], onClose, onStart,
}: { shoe?: Shoe; onClose?: () => void; onStart?: (goalKm: number) => void }) {
  const [val, setVal] = useState('5');

  const press = (k: string) => {
    setVal((v) => {
      if (k === '⌫') return v.length <= 1 ? '0' : v.slice(0, -1);
      if (k === '.') return v.includes('.') || v.length >= 5 ? v : v + '.';
      if (v.length >= 5) return v;
      if (v === '0') return k;
      return v + k;
    });
  };

  const goal = Number(val);
  const start = () => { if (goal > 0) onStart?.(Math.round(goal * 10) / 10); };

  return (
    <View style={s.screen}>
      <View style={s.startHeader}>
        <Text style={s.startTitle}>목표 거리</Text>
        <Pressable onPress={onClose} style={s.closeBtn}><Ionicons name="close" size={16} color={T2} /></Pressable>
      </View>

      <View style={s.startBody}>
        {/* 거리 1개 히어로 지표 — Metric primitive(DISPLAY + tabular-nums, km 단위 baseline 정렬) */}
        <Metric value={val} unit="km" size={120} align="center" />
        {!!shoe && <Text style={s.startShoe}>{shoe.brand} {shoe.model}로 달리기</Text>}
      </View>

      {/* presets */}
      <View style={s.presets}>
        {PRESETS.map((p) => {
          const on = val === p;
          return (
            <Pressable key={p} onPress={() => setVal(p)} style={[s.preset, on ? s.presetOn : s.presetOff]}>
              <Text style={[s.presetText, { color: on ? ACCENT : T2 }]}>{p}km</Text>
            </Pressable>
          );
        })}
      </View>

      {/* keypad */}
      <View style={s.keypad}>
        {KEYS.map((k) => (
          <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => [s.key, pressed && s.keyPressed]}>
            {k === '⌫'
              ? <Ionicons name="backspace-outline" size={24} color={T1} />
              : <Text style={s.keyText}>{k}</Text>}
          </Pressable>
        ))}
      </View>

      <View style={s.ctaWrap}>
        <Button label={`${val}km 러닝 시작`} icon="play" onPress={start} disabled={goal <= 0} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  startHeader: { paddingTop: 60, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  startTitle: { color: T1, fontFamily: FONT, fontSize: 20, fontWeight: '500', letterSpacing: -0.4 },
  closeBtn: { width: 34, height: 34, borderRadius: 999, backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center' },
  startBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startShoe: { color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '600', marginTop: 14 },

  presets: { flexDirection: 'row', gap: 9, justifyContent: 'center', paddingHorizontal: 22, paddingBottom: 14 },
  preset: { height: 38, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  presetOn: { borderWidth: 1, borderColor: ACCENT, backgroundColor: withAlpha(ACCENT, 0.14) },
  presetOff: { borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.12), backgroundColor: CARD_HI },
  presetText: { fontFamily: FONT, fontSize: 14, fontWeight: '600' },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 28 },
  key: { width: '33.33%', height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  keyPressed: { backgroundColor: withAlpha(T1, 0.07) },
  keyText: { color: T1, fontFamily: FONT, fontSize: 28, fontWeight: '400' },

  ctaWrap: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 40 },
});
