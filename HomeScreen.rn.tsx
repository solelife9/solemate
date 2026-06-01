// ============================================================================
// HomeScreen.rn.tsx — Keego Home (hero shoe + center-snap picker)
// 색/폰트는 전부 theme 토큰(BG/CARD/ACCENT/T1~T3/SEP/SPACE/RADIUS/TYPE/FONT/
// DISPLAY)과 withAlpha 파생만 사용한다(raw hex/인라인 fontFamily 0). 워드마크는
// KeegoWordmark primitive. shoe-first: 선택 신발(activeIdx 실값) 수명 링 히어로가
// 주인공이고, 오렌지는 핵심 수치·CTA에만(라벨/보조텍스트는 T3 회색).
// ============================================================================
import React, { useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  BG, CARD_DIM, CARD_HI, HERO_BG, ACCENT, DANGER, WARN, GOOD, T1, T2, T3, SEP,
  FONT, DISPLAY, SPACE, RADIUS, withAlpha, Shoe, SHOES,
} from './theme';
import { Ring, TabBar, TierBadge, KeegoWordmark, Button, SectionTitle, conditionColor } from './primitives';
import { Unit, displayNum } from './lib/units';

export type WeekStats = { km: string; runs: number; pace: string };
// 주간 목표 + keep-going 동기 지표. 거리는 km 표준, pct는 이번 주 달성률 %(목표
// 설정 행이 구동), streak은 오늘까지 이어지는 연속 러닝 일수(lib/goals.currentStreak).
export type GoalInfo = { km: number; pct: number; streak: number };

const CARD_W = 138;
const GAP = 10;

// Proportional condition → ring color. 양호는 accent(주인공 톤), 주의/교체는 경고색.
// 도트/조건 텍스트의 상태색은 primitives.conditionColor(양호=GOOD 녹색)를 재사용한다.
const ringColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : ACCENT);

function TopBar({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.topbar}>
      <KeegoWordmark size={24} />
      <Pressable onPress={onAddShoe} style={({ pressed }) => [s.addBtn, pressed && s.pressed]}>
        <Text style={s.addBtnText}>신발 추가</Text>
      </Pressable>
    </View>
  );
}

function QuickStats({ week, unit }: { week: WeekStats; unit: Unit }) {
  const items = [
    { v: week.km, u: unit, l: '이번 주' },
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

// 주간 목표 진행 + 연속 러닝 스트릭(keep-going 동기). 달성률은 Ring(primitives 재사용)
// 으로, 스트릭은 불꽃 칩으로 실데이터를 표시한다. pct는 0~999%(목표 초과 가능), 링은
// 100%에서 가득 차고(달성 시 GOOD 색), 스트릭이 0이면 '오늘 시작' 유도 문구를 보여준다.
// 라벨/부가 텍스트는 T3 회색(오렌지 절제), 강조는 링 수치와 활성 스트릭에만.
function WeeklyGoal({ goal, unit }: { goal: GoalInfo; unit: Unit }) {
  const goalDisplay = displayNum(goal.km, unit, 0);
  const pct = Math.max(0, goal.pct);
  const reached = pct >= 100;
  const streak = Math.max(0, goal.streak);
  return (
    <View style={s.goalCard}>
      <View style={s.goalInfo}>
        <View style={s.row}>
          <Ionicons name="flag" size={13} color={T3} />
          <Text style={s.goalLabel}>주간 목표</Text>
        </View>
        <Text style={s.goalSub}>목표 {goalDisplay}{unit} / 주</Text>
        <View style={[s.streakChip, streak > 0 ? s.streakChipOn : s.streakChipOff]}>
          <Ionicons name="flame" size={12} color={streak > 0 ? ACCENT : T3} />
          <Text style={[s.streakText, { color: streak > 0 ? ACCENT : T3 }]}>
            {streak > 0 ? `${streak}일 연속` : '오늘 달리고 스트릭 시작'}
          </Text>
        </View>
      </View>
      <Ring size={76} stroke={8} progress={pct / 100} color={reached ? GOOD : ACCENT}>
        <Text style={[s.goalRingPct, reached && { color: GOOD }]}>
          {pct}<Text style={s.goalRingU}>%</Text>
        </Text>
      </Ring>
    </View>
  );
}

function HeroShoe({ shoe, recommended, unit }: { shoe: Shoe; recommended?: boolean; unit: Unit }) {
  // 비율(pct)은 km 절대값으로 계산(단위 불변), 표시 숫자만 표시 단위로 환산한다.
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remainKm / shoe.max : 0;
  const remain = displayNum(remainKm, unit);
  const used = displayNum(shoe.used, unit);
  const max = displayNum(shoe.max, unit);
  const ring = ringColor(shoe.condition);
  const tier = conditionColor(shoe.condition);
  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.row}>
            <Text style={s.heroBrand}>{shoe.brand}</Text>
            {/* 교체/주의 tier 배지 — 홈 히어로에서 가장 먼저 보이게(양호는 미노출). */}
            <TierBadge condition={shoe.condition} />
            <View style={s.usingChip}><Text style={s.usingChipText}>사용 중</Text></View>
            {recommended && (
              <View style={s.recommendChip}>
                <Ionicons name="sparkles" size={9} color={ACCENT} />
                <Text style={s.recommendChipText}>오늘은 이 신발</Text>
              </View>
            )}
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
          <Text style={s.heroRemainU}>{unit} 남음</Text>
        </View>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: tier }]} />
          <Text style={[s.condText, { color: tier }]}>{shoe.condition}</Text>
          <Text style={s.condSub}>· {used}/{max}{unit}</Text>
        </View>
      </View>
    </View>
  );
}

function PickerCard({ shoe, active, onPress, unit }: { shoe: Shoe; active: boolean; onPress: () => void; unit: Unit }) {
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remainKm / shoe.max : 0;
  const remain = displayNum(remainKm, unit);
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
          <Text style={s.pcardRemainU}>{unit} 남음</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ShoePicker({ shoes, activeIdx, onSelect, unit }: { shoes: Shoe[]; activeIdx: number; onSelect: (i: number) => void; unit: Unit }) {
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
        <PickerCard key={i} shoe={shoe} active={i === activeIdx} unit={unit} onPress={() => { onSelect(i); scrollTo(i); }} />
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
  activeIdx: activeIdxProp, onSelect, recommendedIdx, unit = 'km', goal,
}: {
  shoes?: Shoe[];
  week?: WeekStats;
  dateLabel?: string;
  onStart?: (idx: number) => void;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
  // 선택 신발을 App이 소유(제어 모드): activeIdx+onSelect가 함께 오면 외부 상태를
  // 따른다. 둘 다 없으면 기존처럼 내부 상태로 동작(하위호환).
  activeIdx?: number;
  onSelect?: (i: number) => void;
  // 휴식 로테이션 추천 신발의 인덱스. 히어로가 이 신발이면 '오늘은 이 신발' 칩 표시.
  recommendedIdx?: number;
  // 표시 단위(km|mi)와 주간 목표 진행(설정 화면에서 구동). 둘 다 표시 전용.
  unit?: Unit;
  goal?: GoalInfo;
}) {
  const [internalIdx, setInternalIdx] = useState(0);
  const controlled = activeIdxProp != null && typeof onSelect === 'function';
  const rawIdx = controlled ? (activeIdxProp as number) : internalIdx;
  const idx = Math.min(Math.max(0, rawIdx), Math.max(0, shoes.length - 1));
  const select = (i: number) => { if (controlled) onSelect?.(i); else setInternalIdx(i); };
  const active = shoes[idx];
  const isRecommended = recommendedIdx != null && recommendedIdx === idx;

  return (
    <View style={s.screen}>
      <TopBar onAddShoe={onAddShoe} />
      <View style={s.greetWrap}>
        {!!dateLabel && <Text style={s.date}>{dateLabel}</Text>}
        <Text style={s.greet}>오늘은 어떤 신발로{'\n'}달려볼까요?</Text>
      </View>
      <QuickStats week={week} unit={unit} />
      {goal && (
        <View style={{ paddingHorizontal: SPACE.xl, marginTop: SPACE.lg }}>
          <WeeklyGoal goal={goal} unit={unit} />
        </View>
      )}
      {active ? (
        <>
          {/* shoe-first 주인공: 선택 신발(idx 실값) 수명 링 히어로 카드 */}
          <View testID="home-hero" style={{ paddingHorizontal: SPACE.xl, paddingTop: 30 }}>
            <HeroShoe shoe={active} recommended={isRecommended} unit={unit} />
          </View>
          {/* 강조는 CTA에 — 선택 신발 idx로 러닝 시작 연결 */}
          <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm }}>
            <Button label="러닝 시작" icon="play" onPress={() => onStart?.(idx)} />
          </View>
          {shoes.length > 1 && (
            <View style={{ marginTop: SPACE.xxl }}>
              <SectionTitle style={s.sectionLabel}>내 러닝화</SectionTitle>
              <ShoePicker shoes={shoes} activeIdx={idx} onSelect={select} unit={unit} />
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

  topbar: { paddingTop: 60, paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { height: 36, paddingHorizontal: 18, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(ACCENT, 0.35), backgroundColor: withAlpha(ACCENT, 0.12), alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '600' },

  greetWrap: { paddingHorizontal: SPACE.xl, paddingTop: 14 },
  date: { color: T3, fontFamily: FONT, fontSize: 13, letterSpacing: 0.2 },
  greet: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '400', letterSpacing: -0.4, marginTop: 6, lineHeight: 31 },

  quick: { flexDirection: 'row', marginHorizontal: SPACE.xl, marginTop: 18 },
  quickCell: { flex: 1 },
  quickDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP, paddingLeft: 14, alignItems: 'center' },
  quickV: { color: T1, fontFamily: DISPLAY, fontSize: 24, letterSpacing: 0.3 },
  quickU: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '400' },
  quickL: { color: T3, fontFamily: FONT, fontSize: 11, marginTop: 4, letterSpacing: 0.2 },

  goalCard: { backgroundColor: CARD_DIM, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.06), padding: SPACE.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalInfo: { flex: 1, gap: 9, minWidth: 0 },
  goalLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  goalSub: { color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '500' },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 },
  streakChipOn: { backgroundColor: withAlpha(ACCENT, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4) },
  streakChipOff: { backgroundColor: CARD_HI },
  streakText: { fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },
  goalRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 19, letterSpacing: 0.2 },
  goalRingU: { color: T3, fontFamily: FONT, fontSize: 10 },

  hero: { backgroundColor: HERO_BG, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: ACCENT, padding: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  heroBrand: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500', letterSpacing: 1.4 },
  usingChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: 6, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  usingChipText: { color: ACCENT, fontFamily: FONT, fontSize: 10, fontWeight: '500' },
  recommendChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: 6, paddingHorizontal: SPACE.sm, paddingVertical: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.45) },
  recommendChipText: { color: ACCENT, fontFamily: FONT, fontSize: 10, fontWeight: '600' },
  heroModel: { color: T1, fontFamily: FONT, fontSize: 23, fontWeight: '600', letterSpacing: -0.5, marginTop: 7, lineHeight: 28 },
  heroBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 },
  heroRemain: { color: T1, fontFamily: DISPLAY, fontSize: 46, letterSpacing: -1 },
  heroRemainU: { color: T2, fontFamily: FONT, fontSize: 16, marginLeft: 5, marginBottom: 6 },
  ringPct: { color: T1, fontFamily: DISPLAY, fontSize: 17 },
  ringPctU: { color: T3, fontFamily: FONT, fontSize: 9 },
  dot: { width: 6, height: 6, borderRadius: RADIUS.pill },
  condText: { fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  condSub: { color: T3, fontFamily: FONT, fontSize: 12.5 },

  sectionLabel: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.md },

  pcard: { width: CARD_W, height: CARD_W, borderRadius: RADIUS.lg, padding: SPACE.lg, justifyContent: 'space-between' },
  pcardActive: { backgroundColor: HERO_BG, borderWidth: 1, borderColor: ACCENT },
  pcardIdle: { backgroundColor: CARD_DIM, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.06) },
  pcardBrand: { flex: 1, color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '500', letterSpacing: 1.2 },
  pcardRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 11 },
  pcardModel: { fontFamily: FONT, fontSize: 14, fontWeight: '500', letterSpacing: -0.3, lineHeight: 18 },
  pcardRemain: { fontFamily: DISPLAY, fontSize: 18, letterSpacing: -0.3 },
  pcardRemainU: { color: T3, fontFamily: FONT, fontSize: 10.5, marginLeft: 3, marginBottom: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 6 },
  emptyTitle: { color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '600', marginTop: 14 },
  emptyText: { color: T3, fontFamily: FONT, fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginTop: 2 },
  emptyBtn: { marginTop: 18, height: 48, paddingHorizontal: 28, borderRadius: RADIUS.pill, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600' },
});
