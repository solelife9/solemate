// ============================================================================
// FirstShoeScreen.rn.tsx — "첫 러닝화 등록" (내 신발 탭)
//
// 두 상태를 한 화면 컴포넌트로 구현(HTML 목업과 1:1):
//   • shoe 없음  → 빈 상태: 점선 게이지 + 등록 유도 + 혜택 3줄 + CTA
//   • shoe 있음  → 등록 완료: 체크 배지 + 신발 카드(수명 연료게이지) + 다음 동선
//
// 재사용: theme 토큰 · primitives(Pill, TabBar) · MockupButton(목업 주황 버튼).
// 운동화 글리프는 TabBar 와 동일하게 MaterialCommunityIcons 'shoe-sneaker'.
//
// App 연결 예:
//   <FirstShoeScreen
//      shoe={firstShoe ?? undefined}      // 등록 전이면 undefined
//      onRegister={() => nav('AddShoe')}
//      onStartRun={() => nav('Run')}
//      onDone={() => nav('Home')}
//      onTab={(i) => setTab(i)} />
// ============================================================================
import React from 'react';
import {View, Text, Pressable, ScrollView, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, Defs, LinearGradient, Stop, Rect, Path} from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  BG, CARD, ACCENT, GOOD, WARN, DANGER, T1, T2, T3, SEP,
  FONT, withAlpha, Shoe,
} from './theme';
import {Pill, TabBar, Button} from './primitives';

// ── 공용 헤더 ("내 신발" + 검색) ───────────────────────────────────────────────
function Header({onSearch}: {onSearch?: () => void}) {
  return (
    <View style={s.header}>
      <Text style={s.h1}>내 신발</Text>
      <Pressable
        onPress={onSearch}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="검색"
        style={({pressed}) => [s.iconBtn, pressed && s.pressed]}>
        <Ionicons name="search" size={18} color={T2} />
      </Pressable>
    </View>
  );
}

// ── 운동화 글리프(SVG, design-reference 정합) ─────────────────────────────────
export function ShoeGlyph({size = 46, color = withAlpha(T1, 0.32)}: {size?: number; color?: string}) {
  const sw = 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path d="M6 40c0-2.4 1.5-4.3 3.9-4.8l11.4-2.4c2.3-.5 4.4-1.8 5.8-3.8l3.1-4.4c.8-1.1 2.4-1.3 3.4-.4l2.6 2.3c2.5 2.2 5.6 3.7 8.9 4.3l5.2 1c2.3.4 3.7 2.4 3.7 4.6V44c0 1.5-1.2 2.7-2.7 2.7H8.7C7.2 46.7 6 45.5 6 44v-4Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M34 30l3 2.6M38 27.6l3 2.6" stroke={color} strokeWidth={sw * 0.82} strokeLinecap="round" />
    </Svg>
  );
}

// 오늘 날짜 — "6월 10일 수요일"
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
function todayKo(): string {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS_KO[d.getDay()]}요일`;
}

// ── 빈 상태(첫 러닝화 등록) — design-reference/first-shoe ───────────────────────
// 빈 화면이 "첫 러닝화를 놓는 자리". 인사말 + 큰 대시 슬롯 카드(탭=등록) + 철학 한 줄.
function EmptyState({onRegister, onTab, userName}: FirstShoeProps) {
  const insets = useSafeAreaInsets();
  const greetName = (userName ?? '').trim();
  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      <View style={s.greetWrap}>
        <Text style={s.date}>{todayKo()}</Text>
        <Text style={s.greeting}>
          {greetName ? `${greetName}님,\n` : ''}첫 러닝화를 등록해볼까요?
        </Text>
      </View>

      <View style={s.stage}>
        <Pressable
          onPress={onRegister}
          accessibilityRole="button"
          accessibilityLabel="첫 러닝화 등록"
          style={({pressed}) => [s.slot, pressed && s.slotPressed]}>
          <View style={s.glyphWrap}>
            <ShoeGlyph size={46} />
            <View style={s.plus}>
              <Ionicons name="add" size={18} color={BG} />
            </View>
          </View>
          <Text style={s.slotTitle}>첫 러닝화 등록</Text>
          <Text style={s.slotSub}>탭해서 시작하기</Text>
        </Pressable>
        <Text style={s.philosophy}>
          신발이 얼마나 닳았는지 관리해서,{'\n'}부상 없이 더 오래 달리게 해드려요.
        </Text>
      </View>

      <View style={s.valueline}>
        <Text style={s.valTxt}>누적 거리</Text>
        <View style={s.valDot} />
        <Text style={s.valTxt}>교체 시기</Text>
        <View style={s.valDot} />
        <Text style={s.valTxt}>오늘의 추천</Text>
      </View>
      <TabBar active={1} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

// ── 수명 연료게이지(녹→황→적 트랙 + 주황 채움) ──────────────────────────────────
function FuelTrack({used, max}: {used: number; max: number}) {
  const pct = Math.max(2, Math.min(100, (used / Math.max(1, max)) * 100));
  return (
    <View>
      <View style={s.track}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="fuel" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={withAlpha(GOOD, 0.16)} />
              <Stop offset="0.6" stopColor={withAlpha(GOOD, 0.16)} />
              <Stop offset="0.78" stopColor={withAlpha(WARN, 0.18)} />
              <Stop offset="1" stopColor={withAlpha(DANGER, 0.22)} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#fuel)" />
        </Svg>
        <View style={[s.trackFill, {width: `${pct}%`}]} />
      </View>
      <View style={s.scaleRow}>
        <Text style={s.scaleText}>{used} / {max} km</Text>
        <Text style={s.scaleText}>남은 수명 {Math.max(0, max - used)}km</Text>
      </View>
    </View>
  );
}

// ── 등록 완료 ─────────────────────────────────────────────────────────────────
function SuccessState({shoe, onStartRun, onDone, onSearch, onTab}: FirstShoeProps) {
  const insets = useSafeAreaInsets();
  const s0: Shoe = shoe ?? {brand: 'NIKE', model: 'Alphafly 3', used: 0, max: 500, condition: '양호'};
  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      <Header onSearch={onSearch} />
      <ScrollView contentContainerStyle={{paddingHorizontal: 22, paddingBottom: 12}} showsVerticalScrollIndicator={false}>
        <View style={s.checkBadge}>
          <Ionicons name="checkmark" size={30} color={GOOD} />
        </View>
        <Text style={s.successTitle}>첫 러닝화 등록 완료</Text>
        <Text style={s.successSub}>
          이제 Keego가 {s0.used}km부터 수명을 추적해드려요. 달리기를 시작해 거리를 쌓아보세요.
        </Text>

        {/* 등록된 신발 카드 */}
        <View style={s.shoeCard}>
          <View style={s.shoeRow}>
            <View style={{flex: 1}}>
              <Text style={s.shoeBrand}>{s0.brand.toUpperCase()}</Text>
              <Text style={s.shoeModel}>{s0.model}</Text>
              <View style={{marginTop: 9}}>
                <Pill tone="good" label="최상의 컨디션" />
              </View>
            </View>
            <MaterialCommunityIcons name="shoe-sneaker" size={40} color={withAlpha(T1, 0.34)} />
          </View>
          <View style={{marginTop: 18}}>
            <FuelTrack used={s0.used} max={s0.max} />
          </View>
        </View>

        {/* 다음 동선 */}
        <Pressable
          onPress={onStartRun}
          accessibilityRole="button"
          accessibilityLabel="첫 러닝 시작하기"
          style={({pressed}) => [s.nextCard, pressed && s.pressed]}>
          <View style={s.nextIcon}>
            <Ionicons name="play" size={18} color={ACCENT} />
          </View>
          <View style={{flex: 1}}>
            <Text style={s.nextTitle}>첫 러닝 시작하기</Text>
            <Text style={s.nextSub}>달린 거리가 이 신발에 자동으로 기록돼요</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={T3} />
        </Pressable>
      </ScrollView>

      <View style={s.ctaWrap}>
        <Button label="완료" onPress={onDone} />
      </View>
      <TabBar active={1} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
export type FirstShoeProps = {
  shoe?: Shoe;                       // 등록된 첫 신발(없으면 빈 상태)
  userName?: string;                 // 인사말 이름("OO님,") — 없으면 이름 생략
  onRegister?: () => void;           // 빈 상태 CTA → 등록 폼
  onStartRun?: () => void;           // 완료: 첫 러닝 시작
  onDone?: () => void;               // 완료: 완료 버튼
  onSearch?: () => void;             // 헤더 검색
  onTab?: (i: number) => void;       // 하단 탭
};

export default function FirstShoeScreen(props: FirstShoeProps) {
  return props.shoe ? <SuccessState {...props} /> : <EmptyState {...props} />;
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  pressed: {opacity: 0.85, transform: [{scale: 0.98}]},

  // ── 빈 상태(첫 러닝화 — design-reference/first-shoe) ──
  greetWrap: {paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20},
  date: {color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500'},
  greeting: {marginTop: 6, color: T1, fontFamily: FONT, fontSize: 23, fontWeight: '800', letterSpacing: -0.4, lineHeight: 31},
  stage: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30, paddingHorizontal: 20},
  slot: {width: '100%', maxWidth: 300, aspectRatio: 5 / 4, borderRadius: 26, borderWidth: 1.5, borderColor: withAlpha(T1, 0.16), borderStyle: 'dashed', backgroundColor: withAlpha(ACCENT, 0.035), alignItems: 'center', justifyContent: 'center', gap: 4},
  slotPressed: {transform: [{scale: 0.975}], borderColor: withAlpha(ACCENT, 0.55)},
  glyphWrap: {position: 'relative', marginBottom: 14},
  plus: {position: 'absolute', top: -6, right: -12, width: 30, height: 30, borderRadius: 15, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: {width: 0, height: 4}, elevation: 4},
  slotTitle: {color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '700', letterSpacing: -0.2},
  slotSub: {color: T3, fontFamily: FONT, fontSize: 13},
  philosophy: {textAlign: 'center', color: T3, fontFamily: FONT, fontSize: 15, lineHeight: 24},
  valueline: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 10},
  valTxt: {color: withAlpha(T1, 0.36), fontFamily: FONT, fontSize: 12, fontWeight: '500'},
  valDot: {width: 3, height: 3, borderRadius: 2, backgroundColor: withAlpha(T1, 0.22)},

  // header
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 4},
  h1: {color: T1, fontFamily: FONT, fontSize: 27, fontWeight: '700', letterSpacing: -0.6},
  iconBtn: {width: 38, height: 38, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.08), alignItems: 'center', justifyContent: 'center'},

  // empty
  emptyBody: {flex: 1, paddingHorizontal: 30},
  hero: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  emptyTitle: {marginTop: 30, color: T1, fontFamily: FONT, fontSize: 29, fontWeight: '700', letterSpacing: -0.6, lineHeight: 34, textAlign: 'center'},
  emptyDesc: {marginTop: 13, color: T3, fontFamily: FONT, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 270},

  benefits: {marginBottom: 8},
  benefit: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14},
  benefitDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.045)},
  benefitIcon: {width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.10), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.22)},
  benefitTitle: {color: T1, fontFamily: FONT, fontSize: 14, fontWeight: '600', letterSpacing: -0.2},
  benefitSub: {marginTop: 2, color: T3, fontFamily: FONT, fontSize: 12, lineHeight: 16},

  ctaWrap: {paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6},

  // success
  checkBadge: {alignSelf: 'center', width: 64, height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 18, backgroundColor: withAlpha(GOOD, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(GOOD, 0.4)},
  successTitle: {color: T1, fontFamily: FONT, fontSize: 26, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center'},
  successSub: {marginTop: 11, color: T3, fontFamily: FONT, fontSize: 14, lineHeight: 21, textAlign: 'center', alignSelf: 'center', maxWidth: 264},

  shoeCard: {marginTop: 26, backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: SEP, padding: 20},
  shoeRow: {flexDirection: 'row', alignItems: 'center', gap: 18},
  shoeBrand: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '600', letterSpacing: 1.4},
  shoeModel: {marginTop: 4, color: T1, fontFamily: FONT, fontSize: 22, fontWeight: '700', letterSpacing: -0.6},

  track: {height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.04)},
  trackFill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: ACCENT},
  scaleRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 9},
  scaleText: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500'},

  nextCard: {flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15, backgroundColor: withAlpha(ACCENT, 0.07), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.22)},
  nextIcon: {width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.14)},
  nextTitle: {color: T1, fontFamily: FONT, fontSize: 14, fontWeight: '600', letterSpacing: -0.2},
  nextSub: {marginTop: 2, color: T3, fontFamily: FONT, fontSize: 12},
});
