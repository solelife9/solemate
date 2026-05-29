// ============================================================================
// ProfileScreen.rn.tsx — 프로필: identity, lifetime stats, achievements, settings
// (sample data removed — real profile/badges injected via props)
// ============================================================================
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { BG, CARD, CARD_HI, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY } from './theme';
import { TabBar } from './primitives';

export type Profile = { name: string; since: string; totalKm: number; totalRuns: number; totalTime: string; level: string };
export type Badge = { icon: string; label: string; on: boolean };

const DEFAULT_PROFILE: Profile = { name: '러너', since: '', totalKm: 0, totalRuns: 0, totalTime: '0', level: '러닝 레벨 1' };

const SETTINGS: { icon: string; label: string; detail: string }[] = [
  { icon: 'flag-outline', label: '목표 설정', detail: '주 5회' },
  { icon: 'notifications-outline', label: '알림', detail: '켜짐' },
  { icon: 'speedometer-outline', label: '단위', detail: '킬로미터' },
  { icon: 'settings-outline', label: '계정 설정', detail: '' },
];

export default function ProfileScreen({
  profile = DEFAULT_PROFILE, badges = [], onTab,
}: { profile?: Profile; badges?: Badge[]; onTab?: (i: number) => void }) {
  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: 60, paddingHorizontal: 18, paddingBottom: 8, gap: 16 }}>
        {/* header */}
        <View style={s.headerRow}>
          <Text style={s.title}>프로필</Text>
          <Pressable style={s.iconBtn}><Ionicons name="settings-outline" size={19} color={T2} /></Pressable>
        </View>

        {/* identity */}
        <View style={s.identity}>
          <View style={s.avatarRing}>
            <View style={s.avatarInner}>
              <Ionicons name="person" size={30} color={T3} />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name}>{profile.name}</Text>
            <View style={[s.row, { marginTop: 6 }]}>
              <View style={s.levelChip}><Text style={s.levelChipText}>{profile.level}</Text></View>
              {!!profile.since && <Text style={s.since}>{profile.since}</Text>}
            </View>
          </View>
        </View>

        {/* lifetime stats */}
        <View style={[s.card, { padding: 22 }]}>
          <Text style={s.cardTitle}>누적 기록</Text>
          <View style={s.statRow}>
            {[
              { v: profile.totalKm.toLocaleString(), u: 'km', l: '총 거리' },
              { v: String(profile.totalRuns), u: '회', l: '총 러닝' },
              { v: profile.totalTime, u: 'h', l: '총 시간' },
            ].map((x, i) => (
              <View key={i} style={[s.statCell, i > 0 && s.statDivider]}>
                <Text style={s.statValue}>{x.v}<Text style={s.statUnit}>{x.u}</Text></Text>
                <Text style={s.statLabel}>{x.l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* achievements */}
        {badges.length > 0 && (
          <View>
            <Text style={[s.sectionLabel, { paddingBottom: 12 }]}>업적</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {badges.map((b, i) => (
                <View key={i} style={[s.badge, { opacity: b.on ? 1 : 0.4 }]}>
                  <View style={[s.badgeIcon, { backgroundColor: b.on ? 'rgba(255,101,0,0.12)' : CARD_HI }]}>
                    <Ionicons name={b.icon} size={22} color={b.on ? ACCENT : T3} />
                  </View>
                  <Text style={[s.badgeLabel, { color: b.on ? T2 : T3 }]}>{b.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* settings */}
        <View>
          <Text style={[s.sectionLabel, { paddingBottom: 12 }]}>설정</Text>
          <View style={[s.card, { overflow: 'hidden' }]}>
            {SETTINGS.map((item, i) => (
              <Pressable key={i} style={({ pressed }) => [s.settingRow, i < SETTINGS.length - 1 && s.settingBorder, pressed && { backgroundColor: CARD_HI }]}>
                <Ionicons name={item.icon} size={20} color={T2} />
                <Text style={s.settingLabel}>{item.label}</Text>
                {!!item.detail && <Text style={s.settingDetail}>{item.detail}</Text>}
                <Ionicons name="chevron-forward" size={16} color={T3} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <TabBar active={3} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  card: { backgroundColor: CARD, borderRadius: 22 },
  cardTitle: { color: T2, fontFamily: FONT, fontSize: 13.5, fontWeight: '500', marginBottom: 16 },
  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 4 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { color: T1, fontFamily: FONT, fontSize: 32, fontWeight: '500', letterSpacing: -0.8 },
  iconBtn: { width: 38, height: 38, borderRadius: 999, backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4, paddingTop: 4 },
  avatarRing: { padding: 3, borderRadius: 999, backgroundColor: ACCENT },
  avatarInner: { padding: 2.5, borderRadius: 999, backgroundColor: BG },
  name: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '500', letterSpacing: -0.5 },
  levelChip: { backgroundColor: 'rgba(255,101,0,0.14)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 },
  levelChipText: { color: ACCENT, fontFamily: FONT, fontSize: 11.5, fontWeight: '500' },
  since: { color: T3, fontFamily: FONT, fontSize: 12.5, fontWeight: '600' },

  statRow: { flexDirection: 'row' },
  statCell: { flex: 1, alignItems: 'center' },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP },
  statValue: { color: T1, fontFamily: DISPLAY, fontSize: 26, letterSpacing: 0.3 },
  statUnit: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600' },
  statLabel: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '600', marginTop: 4 },

  badge: { flex: 1, backgroundColor: CARD, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 8 },
  badgeIcon: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { fontFamily: FONT, fontSize: 10.5, fontWeight: '500', textAlign: 'center' },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 18 },
  settingBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  settingLabel: { flex: 1, color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '600' },
  settingDetail: { color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '600' },
});
