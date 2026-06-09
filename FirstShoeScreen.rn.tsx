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
import Svg, {Circle, Defs, LinearGradient, Stop, Rect} from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  BG, CARD, ACCENT, GOOD, WARN, DANGER, T1, T2, T3, SEP,
  FONT, withAlpha, Shoe,
} from './theme';
import {Pill, TabBar} from './primitives';
import {MockupButton} from './MockupButton.rn';

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

// ── 빈 게이지(점선 링 + 운동화) ───────────────────────────────────────────────
function EmptyGauge({size = 176}: {size?: number}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={size} height={size} style={{position: 'absolute'}}>
        {/* 옅은 베이스 링 */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={withAlpha(T1, 0.06)} strokeWidth={stroke} fill="none" />
        {/* 주황 점선 — "비어 있음"을 암시 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={withAlpha(ACCENT, 0.55)}
          strokeWidth={9}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="2.5 14"
        />
      </Svg>
      <MaterialCommunityIcons name="shoe-sneaker" size={46} color={withAlpha(T1, 0.34)} />
    </View>
  );
}

// ── 혜택 한 줄 ────────────────────────────────────────────────────────────────
function Benefit({icon, title, sub, first}: {icon: string; title: string; sub: string; first?: boolean}) {
  return (
    <View style={[s.benefit, !first && s.benefitDivider]}>
      <View style={s.benefitIcon}>
        <Ionicons name={icon} size={19} color={ACCENT} />
      </View>
      <View style={{flex: 1}}>
        <Text style={s.benefitTitle}>{title}</Text>
        <Text style={s.benefitSub}>{sub}</Text>
      </View>
    </View>
  );
}

// ── 빈 상태 ───────────────────────────────────────────────────────────────────
function EmptyState({onRegister, onSearch, onTab}: FirstShoeProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      <Header onSearch={onSearch} />
      <View style={s.emptyBody}>
        <View style={s.hero}>
          <EmptyGauge />
          <Text style={s.emptyTitle}>
            아직 등록한{'\n'}
            <Text style={{color: ACCENT}}>러닝화</Text>가 없어요
          </Text>
          <Text style={s.emptyDesc}>
            첫 러닝화를 등록하면 Keego가 수명을 추적해 부상 없이 끝까지 달릴 수 있도록 도와드려요.
          </Text>
        </View>
        <View style={s.benefits}>
          <Benefit first icon="speedometer-outline" title="수명 자동 추적" sub="달릴 때마다 누적 거리가 쌓여요" />
          <Benefit icon="notifications-outline" title="교체 시기 알림" sub="마모 50km 전 미리 알려드려요" />
          <Benefit icon="stats-chart-outline" title="마모 분석" sub="체중·노면·페이스로 실효 마모 계산" />
        </View>
      </View>
      <View style={s.ctaWrap}>
        <MockupButton
          label="첫 러닝화 등록하기"
          iconNode={<MaterialCommunityIcons name="shoe-sneaker" size={18} color={T1} />}
          onPress={onRegister}
        />
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
        <MockupButton label="완료" onPress={onDone} />
      </View>
      <TabBar active={1} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

// ── 진입점 ────────────────────────────────────────────────────────────────────
export type FirstShoeProps = {
  shoe?: Shoe;                       // 등록된 첫 신발(없으면 빈 상태)
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

  // header
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 4},
  h1: {color: T1, fontFamily: FONT, fontSize: 27, fontWeight: '700', letterSpacing: -0.6},
  iconBtn: {width: 38, height: 38, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.08), alignItems: 'center', justifyContent: 'center'},

  // empty
  emptyBody: {flex: 1, paddingHorizontal: 30},
  hero: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  emptyTitle: {marginTop: 30, color: T1, fontFamily: FONT, fontSize: 29, fontWeight: '700', letterSpacing: -0.6, lineHeight: 34, textAlign: 'center'},
  emptyDesc: {marginTop: 13, color: T3, fontFamily: FONT, fontSize: 13.5, lineHeight: 21, textAlign: 'center', maxWidth: 270},

  benefits: {marginBottom: 8},
  benefit: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14},
  benefitDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(T1, 0.045)},
  benefitIcon: {width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.10), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.22)},
  benefitTitle: {color: T1, fontFamily: FONT, fontSize: 14, fontWeight: '600', letterSpacing: -0.2},
  benefitSub: {marginTop: 2, color: T3, fontFamily: FONT, fontSize: 11.5, lineHeight: 16},

  ctaWrap: {paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6},

  // success
  checkBadge: {alignSelf: 'center', width: 64, height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 18, backgroundColor: withAlpha(GOOD, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(GOOD, 0.4)},
  successTitle: {color: T1, fontFamily: FONT, fontSize: 26, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center'},
  successSub: {marginTop: 11, color: T3, fontFamily: FONT, fontSize: 13.5, lineHeight: 21, textAlign: 'center', alignSelf: 'center', maxWidth: 264},

  shoeCard: {marginTop: 26, backgroundColor: CARD, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, padding: 20},
  shoeRow: {flexDirection: 'row', alignItems: 'center', gap: 18},
  shoeBrand: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '600', letterSpacing: 1.4},
  shoeModel: {marginTop: 4, color: T1, fontFamily: FONT, fontSize: 22, fontWeight: '700', letterSpacing: -0.6},

  track: {height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.04)},
  trackFill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: ACCENT},
  scaleRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 9},
  scaleText: {color: T3, fontFamily: FONT, fontSize: 10.5, fontWeight: '500'},

  nextCard: {flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15, backgroundColor: withAlpha(ACCENT, 0.07), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.22)},
  nextIcon: {width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.14)},
  nextTitle: {color: T1, fontFamily: FONT, fontSize: 14, fontWeight: '600', letterSpacing: -0.2},
  nextSub: {marginTop: 2, color: T3, fontFamily: FONT, fontSize: 11.5},
});
