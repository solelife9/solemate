// ============================================================================
// primitives.tsx — shared SoleMate UI primitives (Ring, TabBar)
// Deps: react-native-svg, react-native-vector-icons
// ============================================================================
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { ACCENT, ACCENT_2, T1, T3, FONT } from './theme';

// ── Ring (arc progress, gradient sweep) ───────────────────────────────────────
export function Ring({
  size, stroke, progress, children, color = ACCENT, color2 = ACCENT_2,
}: {
  size: number; stroke: number; progress: number; children?: React.ReactNode;
  color?: string; color2?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = useMemo(() => `g${Math.round(progress * 1e6)}_${size}_${stroke}`, [progress, size, stroke]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color2} />
            <Stop offset="1" stopColor={color} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
        />
      </Svg>
      {children}
    </View>
  );
}

// ── Bottom tab bar (floating dock, Apple-Fitness capsule highlight) ───────────
const TABS = [
  { icon: 'home', label: '홈' },
  { icon: 'time', label: '기록' },
  { icon: 'footsteps', label: '신발' },
  { icon: 'person', label: '프로필' },
];

export function TabBar({ active, onTab }: { active: number; onTab: (i: number) => void }) {
  return (
    <View style={t.wrap}>
      <View style={t.dock}>
        {TABS.map((tab, i) => {
          const on = i === active;
          return (
            <Pressable key={i} onPress={() => onTab(i)} style={[t.item, on && t.itemActive]}>
              <Ionicons name={on ? tab.icon : `${tab.icon}-outline`} size={24} color={on ? ACCENT : T3} />
              <Text style={[t.label, { color: on ? ACCENT : T3, fontWeight: on ? '600' : '500' }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const t = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24 },
  dock: {
    flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-around', gap: 4,
    padding: 6, borderRadius: 28, backgroundColor: 'rgba(28,28,32,0.92)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 20 },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.10)' },
  label: { fontFamily: FONT, fontSize: 10, letterSpacing: 0.1 },
});
