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
import {View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Defs, LinearGradient, Stop, Rect} from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  BG, CARD, ACCENT, GOOD, WARN, DANGER, T1, T2, T3, SEP,
  FONT, withAlpha, Shoe,
} from './theme';
import {Pill, TabBar, Button, ShoeGlyph} from './primitives';
import {GhostShoeCard} from './screens/KeegoHome';

// ShoeGlyph 는 primitives 로 승격(고스트 카드가 화면 간 공유) — 기존 import 경로 호환 re-export.
export {ShoeGlyph};

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

// 오늘 날짜 — "6월 10일 수요일"
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
function todayKo(): string {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS_KO[d.getDay()]}요일`;
}

// ── 빈 상태(첫 러닝화 등록) ──────────────────────────────────────────────────
// 빈 화면 = 채워진 락커의 유령. 인사말 + 고스트 카드(홈 히어로와 동일 유리 문법) +
// 철학 한 줄. 구 대시 슬롯·발광 플러스 배지는 폐기(유리 시스템 정합, 2026-07-03).
function EmptyState({onRegister, onTab, userName}: FirstShoeProps) {
  const insets = useSafeAreaInsets();
  const {width: winW} = useWindowDimensions();
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
        <GhostShoeCard width={Math.min(Math.round(winW * 0.82), 380)} onPress={onRegister} />
        <Text style={s.philosophy}>
          신발이 얼마나 닳았는지 기록해서,{'\n'}부상 없이 더 오래 달리게 해드려요.
        </Text>
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
      <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingBottom: 12}} showsVerticalScrollIndicator={false}>
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
  greeting: {marginTop: 6, color: T1, fontFamily: FONT, fontSize: 23, fontWeight: '700', letterSpacing: -0.4, lineHeight: 31},
  // 스테이지 — 고스트 카드 + 철학 한 줄. 절대 탭 독에 가리지 않게 하단 여백 확보.
  stage: {flex: 1, justifyContent: 'center', gap: 26, paddingHorizontal: 20, paddingBottom: 96},
  philosophy: {textAlign: 'center', color: T3, fontFamily: FONT, fontSize: 15, lineHeight: 24},

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

  shoeCard: {marginTop: 26, backgroundColor: CARD, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: SEP, padding: 20},
  shoeRow: {flexDirection: 'row', alignItems: 'center', gap: 18},
  shoeBrand: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '600', letterSpacing: 1.4},
  shoeModel: {marginTop: 4, color: T1, fontFamily: FONT, fontSize: 22, fontWeight: '700', letterSpacing: -0.6},

  track: {height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.04)},
  trackFill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: ACCENT},
  scaleRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 9},
  scaleText: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '500'},

  nextCard: {flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14, borderRadius: 18, borderCurve: 'continuous', paddingHorizontal: 16, paddingVertical: 15, backgroundColor: withAlpha(ACCENT, 0.07), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.22)},
  nextIcon: {width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.14)},
  nextTitle: {color: T1, fontFamily: FONT, fontSize: 14, fontWeight: '600', letterSpacing: -0.2},
  nextSub: {marginTop: 2, color: T3, fontFamily: FONT, fontSize: 12},
});
