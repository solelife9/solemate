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
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BG, CARD_DIM, CARD_HI, HERO_BG, ACCENT, DANGER, WARN, GOOD, T1, T2, T3,
  FONT, DISPLAY, SPACE, RADIUS, withAlpha, Shoe, SHOES,
} from './theme';
import { Ring, TabBar, TierBadge, KeegoWordmark, Button, SectionTitle, Pill, conditionColor, InjuryBanner } from './primitives';
import { Unit, displayNum } from './lib/units';
import { assessShoeInjuryRisk } from './lib/injury';
import { RotationPick } from './lib/rotation';

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
      <Pressable
        onPress={onAddShoe}
        accessibilityRole="button"
        accessibilityLabel="신발 추가"
        hitSlop={8}
        style={({ pressed }) => [s.addBtn, pressed && s.pressed]}>
        <Text style={s.addBtnText}>신발 추가</Text>
      </Pressable>
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

function HeroShoe({ shoe, unit }: { shoe: Shoe; unit: Unit }) {
  // 비율(pct)은 km 절대값으로 계산(단위 불변), 표시 숫자만 표시 단위로 환산한다.
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const pct = shoe.max > 0 ? remainKm / shoe.max : 0;
  const remain = displayNum(remainKm, unit);
  const used = displayNum(shoe.used, unit);
  const max = displayNum(shoe.max, unit);
  const ring = ringColor(shoe.condition);
  const tier = conditionColor(shoe.condition);
  // 부상예방 경고(주의/위험)는 같은 마모 분모(used/max)로 판정해 히어로 하단에 띄운다.
  // 안전 등급은 InjuryBanner가 null을 돌려줘 경고를 노출하지 않는다(보관 신발도 제외).
  const injury = assessShoeInjuryRisk(shoe);
  return (
    <View style={s.hero}>
      <View style={s.heroTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.row}>
            <Text style={s.heroBrand}>{shoe.brand}</Text>
            {/* 교체/주의 tier 배지 — 홈 히어로에서 가장 먼저 보이게(양호는 미노출). */}
            <TierBadge condition={shoe.condition} />
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
          <Text style={s.heroRemainU}>{unit} 남음</Text>
        </View>
        <View style={s.row}>
          <View style={[s.dot, { backgroundColor: tier }]} />
          <Text style={[s.condText, { color: tier }]}>{shoe.condition}</Text>
          <Text style={s.condSub}>· {used}/{max}{unit}</Text>
        </View>
      </View>
      {!shoe.retired && injury.level !== 'safe' && (
        <View style={s.injuryWrap}>
          <InjuryBanner level={injury.level} message={injury.message} />
        </View>
      )}
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

// 신발 로테이션 추천(차별점). recommendRotation(App에서 신발+런으로 계산)이 활성
// 2켤레+ 일 때만 picks 를 채우므로, 비었으면(1켤레/추천 없음) 통째로 숨긴다. runType
// 미선택 기본은 '휴식·마모 분산' 추천 — 가장 오래 쉰 신발이 맨 위(rotation[0])에 온다.
// 토큰만(색/폰트), 새 상태 없음(props 표시 전용).
function RotationCard({ rotation, onPickShoe }: { rotation: RotationPick[]; onPickShoe?: (shoeId: string) => void }) {
  if (!rotation || rotation.length === 0) return null;
  return (
    <View testID="home-rotation" style={s.rotaWrap}>
      <SectionTitle style={s.sectionLabel}>오늘의 로테이션 추천</SectionTitle>
      <View style={s.rotaCard}>
        {rotation.map((p, i) => (
          <Pressable
            key={p.shoe.id ?? i}
            testID={`rotation-pick-${i}`}
            onPress={onPickShoe ? () => onPickShoe(p.shoe.id) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${p.shoe.brand} ${p.shoe.model} · ${p.reason}`}
            style={({ pressed }) => [s.rotaRow, i > 0 && s.rotaRowSep, pressed && s.pressed]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.row}>
                <Text style={s.rotaBrand} numberOfLines={1}>{p.shoe.brand}</Text>
                {i === 0 && <Pill tone="accent" label="오늘 추천" icon="sparkles" />}
              </View>
              <Text style={[s.rotaModel, { color: i === 0 ? T1 : T2 }]} numberOfLines={1}>{p.shoe.model}</Text>
              <Text style={s.rotaReason} numberOfLines={1}>{p.reason}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T3} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function EmptyHome({ onAddShoe }: { onAddShoe?: () => void }) {
  return (
    <View style={s.empty}>
      {/* 아이콘 없이 테두리 카드 안에 문구 + 버튼만 */}
      <View style={s.emptyCard}>
        <Text style={s.emptyTitle}>첫 러닝화를 등록해볼까요?</Text>
        <Text style={s.emptyText}>신발을 추가하면, 달릴 때마다{'\n'}수명을 함께 추적하며 계속 달릴 수 있어요</Text>
        <Pressable
          onPress={onAddShoe}
          accessibilityRole="button"
          accessibilityLabel="러닝화 등록하기"
          style={({ pressed }) => [s.emptyBtn, pressed && s.pressed]}>
          <Text style={s.emptyBtnText}>러닝화 등록하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function HomeScreen({
  shoes = SHOES, dateLabel = '', onStart, onAddShoe, onTab,
  activeIdx: activeIdxProp, onSelect, unit = 'km', goal, rotation, onPickShoe,
}: {
  shoes?: Shoe[];
  week?: WeekStats;
  dateLabel?: string;
  onStart?: (idx: number) => void;
  onAddShoe?: () => void;
  onTab?: (i: number) => void;
  // 신발 로테이션 추천(App이 신발+런으로 recommendRotation 계산해 내려준다). 활성
  // 2켤레+ 에서만 채워지고, 비면 카드가 숨는다(1켤레/추천 없음). 표시 전용.
  rotation?: RotationPick[];
  // 추천 신발을 누르면 그 신발을 홈 히어로로 선택한다(shoe.id 기준 — picker 순서와
  // 다른 추천 순서를 id로 매핑해 잘못된 신발 선택을 막는다).
  onPickShoe?: (shoeId: string) => void;
  // 선택 신발을 App이 소유(제어 모드): activeIdx+onSelect가 함께 오면 외부 상태를
  // 따른다. 둘 다 없으면 기존처럼 내부 상태로 동작(하위호환).
  activeIdx?: number;
  onSelect?: (i: number) => void;
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
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <TopBar onAddShoe={onAddShoe} />
      {/* 콘텐츠는 스크롤되고 TabBar는 화면 바닥에 고정된다(신발 많을 때 탭바가 밀려 사라지던 문제 해결) */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={s.greetWrap}>
        {!!dateLabel && <Text style={s.date}>{dateLabel}</Text>}
        <Text style={s.greet}>오늘은 어떤 신발로{'\n'}달려볼까요?</Text>
      </View>
      {goal && (
        <View style={{ paddingHorizontal: SPACE.xl, marginTop: SPACE.lg }}>
          <WeeklyGoal goal={goal} unit={unit} />
        </View>
      )}
      {active ? (
        <>
          {/* shoe-first 주인공: 선택 신발(idx 실값) 수명 링 히어로 카드 */}
          <View testID="home-hero" style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg }}>
            <HeroShoe shoe={active} unit={unit} />
          </View>
          {/* 강조는 CTA에 — 선택 신발 idx로 러닝 시작 연결 */}
          <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.sm }}>
            <Button label="러닝 시작" icon="play" onPress={() => onStart?.(idx)} />
          </View>
          {shoes.length > 1 && (
            <View style={{ marginTop: SPACE.lg }}>
              <SectionTitle style={s.sectionLabel}>내 러닝화</SectionTitle>
              <ShoePicker shoes={shoes} activeIdx={idx} onSelect={select} unit={unit} />
            </View>
          )}
          {/* 휴식·마모 분산 로테이션 추천(2켤레+에서만 채워짐, 비면 자동 숨김) */}
          <RotationCard rotation={rotation ?? []} onPickShoe={onPickShoe} />
        </>
      ) : (
        <EmptyHome onAddShoe={onAddShoe} />
      )}
      </ScrollView>
      <TabBar active={0} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SPACE.lg },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  baselineRow: { flexDirection: 'row', alignItems: 'flex-end' },

  topbar: { paddingTop: 12, paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtn: { height: 36, paddingHorizontal: 18, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(ACCENT, 0.35), backgroundColor: withAlpha(ACCENT, 0.12), alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '600' },

  greetWrap: { paddingHorizontal: SPACE.xl, paddingTop: 14 },
  date: { color: T3, fontFamily: FONT, fontSize: 13, letterSpacing: 0.2 },
  greet: { color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '400', letterSpacing: -0.4, marginTop: 6, lineHeight: 31 },


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
  heroBrand: { color: T3, fontFamily: DISPLAY, fontSize: 11, fontWeight: '500', letterSpacing: 1.4 },
  usingChip: { backgroundColor: withAlpha(ACCENT, 0.14), borderRadius: 6, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  usingChipText: { color: ACCENT, fontFamily: FONT, fontSize: 10, fontWeight: '500' },
  heroModel: { color: T1, fontFamily: DISPLAY, fontSize: 24, fontWeight: '600', letterSpacing: -0.2, marginTop: 7, lineHeight: 28 },
  heroBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 },
  heroRemain: { color: T1, fontFamily: DISPLAY, fontSize: 46, letterSpacing: -1 },
  heroRemainU: { color: T2, fontFamily: FONT, fontSize: 16, marginLeft: 5, marginBottom: 6 },
  injuryWrap: { marginTop: 16 },
  ringPct: { color: T1, fontFamily: DISPLAY, fontSize: 17 },
  ringPctU: { color: T3, fontFamily: FONT, fontSize: 9 },
  dot: { width: 6, height: 6, borderRadius: RADIUS.pill },
  condText: { fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  condSub: { color: T3, fontFamily: FONT, fontSize: 12.5 },

  sectionLabel: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.md },

  rotaWrap: { marginTop: SPACE.lg },
  rotaCard: { marginHorizontal: SPACE.xl, backgroundColor: CARD_DIM, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.06), paddingHorizontal: SPACE.lg },
  rotaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: 14 },
  rotaRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.07) },
  rotaBrand: { color: T3, fontFamily: DISPLAY, fontSize: 10.5, fontWeight: '500', letterSpacing: 1.2 },
  rotaModel: { fontFamily: DISPLAY, fontSize: 15, fontWeight: '600', letterSpacing: -0.1, marginTop: 4 },
  rotaReason: { color: T3, fontFamily: FONT, fontSize: 12, marginTop: 3 },

  pcard: { width: CARD_W, height: CARD_W, borderRadius: RADIUS.lg, padding: SPACE.lg, justifyContent: 'space-between' },
  pcardActive: { backgroundColor: HERO_BG, borderWidth: 1, borderColor: ACCENT },
  pcardIdle: { backgroundColor: CARD_DIM, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.06) },
  pcardBrand: { flex: 1, color: T3, fontFamily: DISPLAY, fontSize: 10, fontWeight: '500', letterSpacing: 1.2 },
  pcardRingPct: { color: T1, fontFamily: DISPLAY, fontSize: 11 },
  pcardModel: { fontFamily: DISPLAY, fontSize: 15, fontWeight: '500', letterSpacing: -0.1, lineHeight: 18 },
  pcardRemain: { fontFamily: DISPLAY, fontSize: 18, letterSpacing: -0.3 },
  pcardRemainU: { color: T3, fontFamily: FONT, fontSize: 10.5, marginLeft: 3, marginBottom: 1 },

  empty: { paddingHorizontal: SPACE.xl, paddingTop: 30 },
  emptyCard: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: CARD_DIM, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: withAlpha(T1, 0.12), paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '600' },
  emptyText: { color: T3, fontFamily: FONT, fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginTop: 10 },
  emptyBtn: { alignSelf: 'stretch', marginTop: 22, height: 50, borderRadius: RADIUS.pill, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600' },
});
