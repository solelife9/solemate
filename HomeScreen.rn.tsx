// ============================================================================
// HomeScreen.rn.tsx — SoleMate Home (hero shoe + center-snap picker)
// ============================================================================
import React, { useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD_DIM, HERO_BG, ACCENT, DANGER, WARN, GOOD, T1, T2, T3, SEP, FONT, DISPLAY, Shoe, SHOES,
} from './theme';
import { Ring, TabBar } from './primitives';

export type WeekStats = { km: string; runs: number; pace: string };

const CARD_W = 138;
const GAP = 10;

// Proportional condition → color (shoeHealth tiers: 양호 / 주의 / 교체).
const ringColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : ACCENT);
const tierColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : GOOD);

function TopBar({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.topbar}>
      <Text style={s.wordmark}>SOLEMATE</Text>
      <Pressable onPress={onAddShoe} style={({ pressed }) => [s.addBtn, pressed && s.pressed]}>
        <Text style={s.addBtnText}>신발 추가</Text>
      </Pressable>
    </View>
  );
}

function QuickStats({ week }: { week: WeekStats }) {
  const items = [
    { v: week.km, u: 'km', l: '이번 주' },
    { v: String(week.runs), u: '회', l: '러닝' },
    { v: week.pace, u: '', l: '평균 페이스' },
  ];
  return (
    <View style={s.quick}>
      {items.map((q, i) => (
        <View key={i} style={[s.quickCell, i > 0 && s.quickDivider]}>
          <Text style={s.quickV}>{q.v}<Text style={s.quickU}>{q.u}</Text></Text>
          <Text style={s.quickL}>{q.l}</Text>
        </View>
      ))}
    </View>
  );
}

function HeroShoe({ shoe }: { shoe: Shoe }) {
  const remain = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remain / shoe.max : 0;
  const ring = ringColor(shoe.condition);
  const tier = tierColor(shoe.condition);
  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.row}>
            <Text style={s.heroBrand}>{shoe.brand}</Text>
            <View style={s.usingChip}><Text style={s.usingChipText}>사용 중</Text></View>
          </View>
          <Text style={s.heroModel} numberOfLines={2}>{shoe.model}</Text>
        </View>
        <Ring size={68} stroke={7} progress={pct} color={ring}>
          <Text style={s.ringPct}>{Math.round(pct * 100)}<Text style={s.ringPctU}>%</Text></Text>
        </Ring>
      </View>
      <View style={s.heroBottom}>
        <View style={s.baselineRow}>
          <Text style={s.heroRemain}>{remain}</Text>
          <Text style={s.heroRemainU}>km 남음</Text>
        </View>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: tier }]} />
          <Text style={[s.condText, { color: tier }]}>{shoe.condition}</Text>
          <Text style={s.condSub}>· {shoe.used}/{shoe.max}km</Text>
        </View>
      </View>
    </View>
  );
}

function StartButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.cta, pressed && s.pressed]}>
      <Ionicons name="play" size={20} color="#fff" />
      <Text style={s.ctaText}>러닝 시작</Text>
    </Pressable>
  );
}

function PickerCard({ shoe, active, onPress }: { shoe: Shoe; active: boolean; onPress: () => void }) {
  const remain = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remain / shoe.max : 0;
  const ring = ringColor(shoe.condition);
  return (
    <Pressable
      onPress={onPress}
      style={[s.pcard, active ? s.pcardActive : s.pcardIdle, { opacity: active ? 1 : 0.7, transform: [{ scale: active ? 1 : 0.94 }] }]}
    >
      <View style={s.row}>
        <Text style={s.pcardBrand} numberOfLines={1}>{shoe.brand}</Text>
        <Ring size={30} stroke={3.5} progress={pct} color={ring}>
          <Text style={s.pcardRingPct}>{Math.round(pct * 100)}</Text>
        </Ring>
      </View>
      <View>
        <Text style={[s.pcardModel, { color: active ? T1 : T2 }]} numberOfLines={2}>{shoe.model}</Text>
        <View style={[s.baselineRow, { marginTop: 6 }]}>
          <Text style={[s.pcardRemain, { color: active ? T1 : T2 }]}>{remain}</Text>
          <Text style={s.pcardRemainU}>km 남음</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ShoePicker({ shoes, activeIdx, onSelect }: { shoes: Shoe[]; activeIdx: number; onSelect: (i: number) => void }) {
  const ref = useRef<ScrollView>(null);
  const [pad, setPad] = useState(150);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + GAP));
    const clamped = Math.max(0, Math.min(shoes.length - 1, idx));
    if (clamped !== activeIdx) onSelect(clamped);
  };
  const scrollTo = (i: number) => ref.current?.scrollTo({ x: i * (CARD_W + GAP), animated: true });

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => setPad(Math.max(20, e.nativeEvent.layout.width / 2 - CARD_W / 2))}
      snapToInterval={CARD_W + GAP}
      decelerationRate="fast"
      onMomentumScrollEnd={onMomentumEnd}
      contentContainerStyle={{ paddingHorizontal: pad, gap: GAP }}
    >
      {shoes.map((shoe, i) => (
        <PickerCard key={i} shoe={shoe} active={i === activeIdx} onPress={() => { onSelect(i); scrollTo(i); }} />
      ))}
    </ScrollView>
  );
}

function EmptyHome({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.empty}>
      <Ionicons name="footsteps-outline" size={56} color={T3} />
      <Text style={s.emptyTitle}>러닝화를 추가해보세요</Text>
      <Text style={s.emptyText}>러닝화를 등록하고{'\n'}달린 거리를 추적해보세요</Text>
      <Pressable onPress={onAddShoe} style={({ pressed }) => [s.emptyBtn, pressed && s.pressed]}>
        <Text style={s.emptyBtnText}>러닝화 등록하기</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen({
  shoes = SHOES, week = { km: '0', runs: 0, pace: '--' }, dateLabel = '', onStart, onAddShoe, onTab,
}: {
  shoes?: Shoe[];
  week?: WeekStats;
  dateLabel?: string;
  onStart?: (idx: number) => void;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const idx = Math.min(activeIdx, Math.max(0, shoes.length - 1));
  const active = shoes[idx];

  return (
    <View style={s.screen}>
      <TopBar onAddShoe={onAddShoe} />
      <View style={s.greetWrap}>
        {!!dateLabel && <Text style={s.date}>{dateLabel}</Text>}
        <Text style={s.greet}>오늘은 어떤 신발로{'\n'}달려볼까요?</Text>
      </View>
      <QuickStats week={week} />
      {active ? (
        <>
          <View style={{ paddingHorizontal: 20, paddingTop: 30 }}>
            <HeroShoe shoe={active} />
          </View>
          <View style={{ paddingHorizontal: 20, paddingTop: 7 }}>
            <StartButton onPress={() => onStart?.(idx)} />
          </View>
          {shoes.length > 1 && (
            <View style={{ marginTop: 32 }}>
              <Text style={s.sectionLabel}>내 러닝화</Text>
              <ShoePicker shoes={shoes} activeIdx={idx} onSelect={setActiveIdx} />
            </View>
          )}
          <View style={{ flex: 1 }} />
        </>
      ) : (
        <EmptyHome onAddShoe={onAddShoe} />
      )}
      <TabBar active={0} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },

  topbar: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: T1, fontFamily: DISPLAY, fontSize: 22, letterSpacing: 1 },
  addBtn: { height: 36, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,101,0,0.35)', backgroundColor: 'rgba(255,101,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '600' },

  greetWrap: { paddingHorizontal: 20, paddingTop: 14 },
  date: { color: T3, fontFamily: FONT, fontSize: 13, letterSpacing: 0.2 },
  greet: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '400', letterSpacing: -0.4, marginTop: 6, lineHeight: 31 },

  quick: { flexDirection: 'row', marginHorizontal: 20, marginTop: 18 },
  quickCell: { flex: 1 },
  quickDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP, paddingLeft: 14, alignItems: 'center' },
  quickV: { color: T1, fontFamily: DISPLAY, fontSize: 24, letterSpacing: 0.3 },
  quickU: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '400' },
  quickL: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 4, letterSpacing: 0.2 },

  hero: { backgroundColor: HERO_BG, borderRadius: 24, borderWidth: 1, borderColor: ACCENT, padding: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  heroBrand: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', letterSpacing: 1.4 },
  usingChip: { backgroundColor: 'rgba(255,101,0,0.14)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  usingChipText: { color: ACCENT, fontFamily: FONT, fontSize: 10, fontWeight: '500' },
  heroModel: { color: T1, fontFamily: FONT, fontSize: 23, fontWeight: '600', letterSpacing: -0.5, marginTop: 7, lineHeight: 28 },
  heroBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 },
  heroRemain: { color: T1, fontFamily: DISPLAY, fontSize: 46, letterSpacing: -1 },
  heroRemainU: { color: T2, fontFamily: FONT, fontSize: 16, marginLeft: 5, marginBottom: 6 },
  ringPct: { color: T1, fontFamily: DISPLAY, fontSize: 17 },
  ringPctU: { color: T3, fontFamily: FONT, fontSize: 9 },
  dot: { width: 6, height: 6, borderRadius: 999 },
  condText: { fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  condSub: { color: T3, fontFamily: FONT, fontSize: 12.5 },

  cta: { height: 62, borderRadius: 20, backgroundColor: ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { color: '#fff', fontFamily: FONT, fontSize: 18, fontWeight: '600', letterSpacing: 0.2 },

  sectionLabel: { color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: 0.2, paddingHorizontal: 20, paddingBottom: 12 },

  pcard: { width: CARD_W, height: CARD_W, borderRadius: 20, padding: 16, justifyContent: 'space-between' },
  pcardActive: { backgroundColor: HERO_BG, borderWidth: 1, borderColor: ACCENT },
  pcardIdle: { backgroundColor: CARD_DIM, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)' },
  pcardBrand: { flex: 1, color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500', letterSpacing: 1.2 },
  pcardRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 11 },
  pcardModel: { fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: -0.3, lineHeight: 18 },
  pcardRemain: { fontFamily: DISPLAY, fontSize: 18, letterSpacing: -0.3 },
  pcardRemainU: { color: T3, fontFamily: FONT, fontSize: 10.5, marginLeft: 3, marginBottom: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 6 },
  emptyTitle: { color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '600', marginTop: 14 },
  emptyText: { color: T3, fontFamily: FONT, fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginTop: 2 },
  emptyBtn: { marginTop: 18, height: 48, paddingHorizontal: 28, borderRadius: 999, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: '#fff', fontFamily: FONT, fontSize: 15, fontWeight: '600' },
});
