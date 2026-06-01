// ============================================================================
// primitives.tsx — shared SoleMate UI primitives (Ring, TabBar)
// Deps: react-native-svg, react-native-vector-icons
// ============================================================================
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { ACCENT, ACCENT_2, WARN, DANGER, T3, FONT } from './theme';
import { tierBadge, ShoeCondition } from './lib/shoe';

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

// ── Tier badge (앱내 교체 배지: 홈/신발 목록/상세 공용) ───────────────────────
// shoeHealth 주의/교체 tier만 노출한다(양호는 null → 평상시 잡음 제거). 색은 tone에
// 따르고, 경고 아이콘 + 한국어 라벨('주의'|'교체')로 교체 동선을 끌어올린다. size로
// 히어로(큰 배지)와 목록 칩(작은 배지)을 공용한다.
export function TierBadge({ condition, size = 'sm' }: { condition: ShoeCondition; size?: 'sm' | 'md' }) {
  const badge = tierBadge(condition);
  if (!badge) return null;
  const color = badge.tone === 'danger' ? DANGER : WARN;
  const md = size === 'md';
  return (
    <View
      testID={`tier-badge-${badge.label}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: md ? 5 : 4, alignSelf: 'flex-start',
        borderRadius: 999, paddingHorizontal: md ? 11 : 8, paddingVertical: md ? 5 : 3,
        backgroundColor: badge.tone === 'danger' ? 'rgba(255,69,58,0.15)' : 'rgba(255,159,10,0.15)',
        borderWidth: StyleSheet.hairlineWidth, borderColor: color,
      }}
    >
      <Ionicons name="warning" size={md ? 13 : 11} color={color} />
      <Text style={{ color, fontFamily: FONT, fontSize: md ? 12 : 10.5, fontWeight: '700', letterSpacing: 0.2 }}>
        {badge.label}
      </Text>
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
