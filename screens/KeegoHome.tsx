// ─── KeegoHome.tsx ───────────────────────────────────────────────
// 홈 = 런처 + 가디언. 신발 카드 캐러셀(좌우 스와이프)에서 신은 신발을 고르고 한 탭으로
// 러닝을 시작한다. 가디언은 고른 신발이 닳아 위험할 때(주의/교체)만 끼어든다.
//
// 프리미엄 표면은 '블러'가 아니라 '구조'로 낸다(중요):
//   · 카드 = SVG 세로 그라데이션 표면(위가 밝은 상승감) + 컨디션 색 상단 글로우
//   · 테두리 = 전체 라인이 아니라 좌상·우하 '모서리만' 빛나는 하이라이트(애플 유리 엣지)
//   · 링 트랙 = 컨디션 색 옅은 tint → 0%(새 신발)도 죽은 회색이 아니라 컨디션 halo
// backdrop-blur 는 검은 배경 위에선 번질 색이 없어 밋밋해지므로 쓰지 않는다.
// (진짜 유리를 원하면 하단 GlassEdge 아래 주석의 BlurView 옵션 참고.)
//
// 의존성: react-native-svg 만 필요. 색·타이포·간격은 theme 토큰, 링 연속색은 lib/ringColor.

import React, {useRef, useState, useCallback} from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, useWindowDimensions,
  type NativeSyntheticEvent, type NativeScrollEvent, type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Circle, Rect, Defs, Stop,
  LinearGradient as SvgLinear, RadialGradient as SvgRadial,
} from 'react-native-svg';
import {
  BG, CARD, HERO_BG, T1, T3, WARN, DANGER, FONT, DISPLAY, TYPE, RADIUS, GUTTER, withAlpha,
  type Shoe,
} from '../theme';
import {shoeHealth, wearTier, conditionForPercent, type RunLike, KEEP_GOING_REPLACE} from '../lib/shoe';
import {ringColor} from '../lib/ringColor';
import {displayNum, type Unit} from '../lib/units';

type Props = {
  shoes: Shoe[];
  runs?: RunLike[];
  onStartRun?: (shoe: Shoe) => void;
  onOpenShoe?: (shoe: Shoe) => void;
  onOpenProfile?: () => void;
};

const CARD_GAP = 14;
const CARD_RADIUS = 34;
const RING = 172;
const RING_R = 76;
const RING_C = 2 * Math.PI * RING_R;

export default function KeegoHome({shoes, runs = [], onStartRun, onOpenShoe, onOpenProfile}: Props) {
  const {width} = useWindowDimensions();
  const CARD_W = Math.min(width - 72, 340);
  const SIDE = (width - CARD_W) / 2;
  const STRIDE = CARD_W + CARD_GAP;

  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const onScroll = Animated.event(
    [{nativeEvent: {contentOffset: {x: scrollX}}}],
    {useNativeDriver: true},
  );
  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / STRIDE));
  }, [STRIDE]);

  const selected = shoes[index];
  const selHealth = selected ? shoeHealth(selected as any, runs) : null;
  const selCond = selHealth ? conditionForPercent(selHealth.percentUsed) : '양호';

  return (
    <View style={styles.root}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.wordmark}>Keego</Text>
        </View>
        <Pressable style={styles.avatar} onPress={onOpenProfile} hitSlop={8}>
          <Text style={styles.avatarGlyph}>􀉪</Text>
        </Pressable>
      </View>

      {/* TITLE */}
      <View style={styles.titleWrap}>
        <Text style={styles.eyebrow}>오늘의 러닝화</Text>
        <Text style={styles.title}>어떤 신발로 달릴까요?</Text>
      </View>

      {/* CAROUSEL */}
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STRIDE}
        decelerationRate="fast"
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        contentContainerStyle={{paddingHorizontal: SIDE - CARD_GAP / 2, gap: CARD_GAP, paddingVertical: 8}}
      >
        {shoes.map((shoe, i) => (
          <ShoeCard
            key={shoe.id ?? `${shoe.brand}-${shoe.model}-${i}`}
            shoe={shoe} runs={runs} width={CARD_W}
            scrollX={scrollX} stride={STRIDE} i={i}
            onStartRun={onStartRun} onOpenShoe={onOpenShoe}
          />
        ))}
      </Animated.ScrollView>

      {/* DOTS */}
      <View style={styles.dots}>
        {shoes.map((_, i) => (
          <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotIdle]} />
        ))}
      </View>

      {/* GUARDIAN — 주의/교체일 때만 */}
      {selHealth && selCond !== '양호' ? (
        <Guardian danger={selCond === '교체'} pct={selHealth.percentUsed} />
      ) : null}
    </View>
  );
}

// ─── 신발 카드 ────────────────────────────────────────────────────
// export: 기존 홈(HomeScreen)이 이 카드만 '오늘의 러닝화' 섹션에 재사용한다(나머지 카드 유지).
export function ShoeCard({
  shoe, runs, width, scrollX, stride, i, unit = 'km', onStartRun, onOpenShoe,
}: {
  shoe: Shoe; runs: RunLike[]; width: number;
  scrollX: Animated.Value; stride: number; i: number;
  unit?: Unit;
  onStartRun?: (s: Shoe) => void; onOpenShoe?: (s: Shoe) => void;
}) {
  const h = shoeHealth(shoe as any, runs);
  const pct = Math.round(h.percentUsed);
  const rc = ringColor(h.percentUsed);
  const tier = wearTier(h.percentUsed);
  // 거리는 사용자 단위(km/mi)로 표시한다 — 저장은 km, 표기만 환산(displayNum).
  const usedText = `${displayNum(h.usedKm, unit)}/${displayNum(shoe.max, unit)}${unit}`;
  const remainText = h.remainingKm > 0 ? `${displayNum(h.remainingKm, unit)}${unit} 남음` : '수명 초과';

  // 중앙 카드 강조: 이웃은 살짝 축소 + 흐리게.
  const inputRange = [(i - 1) * stride, i * stride, (i + 1) * stride];
  const scale = scrollX.interpolate({inputRange, outputRange: [0.93, 1, 0.93], extrapolate: 'clamp'});
  const opacity = scrollX.interpolate({inputRange, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp'});

  const dash = RING_C * (1 - Math.min(pct, 100) / 100);

  return (
    <Animated.View style={{width, transform: [{scale}], opacity}}>
      <View style={styles.card}>
        {/* 상승감 표면 + 컨디션 상단 글로우 (blur 없이 SVG 로) */}
        <SurfaceBackground id={`surf-${i}`} glow={rc.solid} />
        {/* 모서리 하이라이트 보더(애플 엣지) */}
        <GlassEdge id={`edge-card-${i}`} radius={CARD_RADIUS} />

        <View style={styles.cardInner}>
          {/* 정보영역(탭 → 상세). 러닝 시작 버튼은 이 Pressable '밖'의 형제라, 텍스트 기반
              테스트가 '러닝 시작'을 눌러도 상세로 새지 않는다(시각은 동일 — 이벤트 중첩만 분리). */}
          <Pressable onPress={() => onOpenShoe?.(shoe)} accessibilityRole="button" accessibilityLabel={`${shoe.brand} ${shoe.model} 상세 보기`}>
          {/* 상단: 브랜드/모델(좌) · 컨디션(우) */}
          <View style={styles.cardTop}>
            <View style={{flexShrink: 1}}>
              <Text style={styles.cardBrand}>{shoe.brand} · {catOf(shoe)}</Text>
              <Text style={styles.cardModel} numberOfLines={1}>{shoe.model}</Text>
            </View>
            <View style={[styles.condChip, {borderColor: withAlpha(rc.solid, 0.45)}]} testID={`home-cond-${tier.key}`}>
              <View style={[styles.condDot, {backgroundColor: rc.to}]} />
              <Text style={styles.condLabel}>{tier.label}</Text>
            </View>
          </View>

          {/* 링 게이지 */}
          <View style={styles.ringWrap}>
            <Svg width={RING} height={RING}>
              <Defs>
                <SvgLinear id={`ring-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={rc.from} />
                  <Stop offset="1" stopColor={rc.to} />
                </SvgLinear>
              </Defs>
              {/* 트랙: 컨디션 색 옅은 tint → 0% 도 죽은 회색이 아님 */}
              <Circle
                cx={RING / 2} cy={RING / 2} r={RING_R}
                stroke={withAlpha(rc.solid, 0.16)} strokeWidth={14} fill="none"
              />
              {/* 진행 아크: 비비드 그라데이션 */}
              <Circle
                cx={RING / 2} cy={RING / 2} r={RING_R}
                stroke={`url(#ring-${i})`} strokeWidth={14} fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={dash}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={styles.ringPctSub}>수명 소진율</Text>
              <View style={styles.ringPctRow}>
                <Text style={styles.ringPct}>{pct}</Text>
                <Text style={styles.ringPctUnit}>%</Text>
              </View>
            </View>
          </View>

          {/* 사용 / 남은 거리 */}
          <View style={styles.kmRow}>
            <Text style={styles.kmLabel}>사용 <Text style={styles.kmStrong}>{usedText}</Text></Text>
            <View style={styles.kmSep} />
            <Text style={styles.kmLabel}>
              <Text style={{color: h.remainingKm > 0 ? T1 : rc.solid}}>{remainText}</Text>
            </Text>
          </View>
          </Pressable>

          {/* 러닝 시작 — 정보 Pressable 의 형제(중첩 아님). */}
          <Pressable
            style={({pressed}) => [styles.runBtn, pressed && {transform: [{scale: 0.98}]}]}
            onPress={() => onStartRun?.(shoe)}
            accessibilityRole="button" accessibilityLabel="러닝 시작"
          >
            <GlassEdge id={`edge-run-${i}`} radius={RADIUS.btn} />
            <Text style={styles.runGlyph}>􀊄</Text>
            <Text style={styles.runLabel}>러닝 시작</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── 가디언 ────────────────────────────────────────────────────────
function Guardian({danger, pct}: {danger: boolean; pct: number}) {
  const color = danger ? DANGER : WARN;
  const label = danger ? KEEP_GOING_REPLACE : `수명 ${Math.round(pct)}% · 슬슬 교체를 준비할 때`;
  return (
    <View style={[styles.guardian, {backgroundColor: withAlpha(color, 0.12), borderColor: withAlpha(color, 0.4)}]}>
      <View style={[styles.guardDot, {backgroundColor: color}]} />
      <Text style={styles.guardText} numberOfLines={1}>{label}</Text>
      {danger ? <Text style={[styles.guardCta, {color}]}>대안</Text> : null}
    </View>
  );
}

// ─── 상승감 표면 + 컨디션 상단 글로우 (SVG, blur 불필요) ─────────────
// 부모 카드에 borderRadius + overflow:'hidden' 이 있어 모서리로 클립된다.
// export: 앱 전역 카드가 같은 유리 표면을 재사용한다(GlassCard).
export function SurfaceBackground({id, glow}: {id: string; glow: string}) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        {/* 위가 밝고 아래가 어두운 세로 그라데이션 = 카드가 살짝 떠 보임 */}
        <SvgLinear id={`${id}-surf`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={HERO_BG} />
          <Stop offset="1" stopColor={CARD} />
        </SvgLinear>
        {/* 상단 중앙 컨디션 색 글로우(옅게) */}
        <SvgRadial id={`${id}-glow`} cx="50%" cy="4%" rx="72%" ry="52%" fx="50%" fy="4%">
          <Stop offset="0" stopColor={glow} stopOpacity={0.42} />
          <Stop offset="1" stopColor={glow} stopOpacity={0} />
        </SvgRadial>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-surf)`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-glow)`} />
    </Svg>
  );
}

// ─── 모서리 하이라이트 보더(애플 유리 엣지) ─────────────────────────
// 전체 라인이 아니라 좌상·우하 모서리만 밝고 옆면은 사라지는 대각 그라데이션 스트로크.
// react-native-svg 의 stroke gradient 로 구현(전체 border 처럼 밋밋하지 않게).
// ── 진짜 유리(BlurView)를 원하면: 이 컴포넌트 대신 부모를
//    <BlurView blurType="dark" blurAmount={24} style={StyleSheet.absoluteFill}/> 로 감싸고
//    카드 뒤(부모)에 컨디션 색 글로우 뷰를 깔면 됨(단, 검은 배경 단독이면 효과 약함).
export function GlassEdge({id, radius}: {id: string; radius: number}) {
  const [s, setS] = useState({w: 0, h: 0});
  const sw = 1.4;
  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    setS({w: width, h: height});
  };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {s.w > 1 ? (
        <Svg width={s.w} height={s.h}>
          <Defs>
            <SvgLinear id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={T1} stopOpacity={0.72} />
              <Stop offset="0.32" stopColor={T1} stopOpacity={0.06} />
              <Stop offset="0.55" stopColor={T1} stopOpacity={0} />
              <Stop offset="0.72" stopColor={T1} stopOpacity={0.07} />
              <Stop offset="1" stopColor={T1} stopOpacity={0.55} />
            </SvgLinear>
          </Defs>
          <Rect
            x={sw / 2} y={sw / 2} width={s.w - sw} height={s.h - sw}
            rx={radius} ry={radius} fill="none"
            stroke={`url(#${id})`} strokeWidth={sw}
          />
        </Svg>
      ) : null}
    </View>
  );
}

// 카테고리 라벨(카본/데일리 등)이 Shoe 에 없을 수 있어 안전 폴백.
function catOf(shoe: any): string {
  return shoe?.category ?? shoe?.cat ?? '러닝화';
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: BG, paddingTop: 8},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: GUTTER, paddingTop: 6,
  },
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  brandDot: {width: 9, height: 9, borderRadius: 999, backgroundColor: WARN},
  wordmark: {fontFamily: DISPLAY, fontSize: 19, fontWeight: '700', letterSpacing: -0.5, color: T1},
  avatar: {
    width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(T1, 0.08), borderWidth: 1, borderColor: withAlpha(T1, 0.12),
  },
  avatarGlyph: {fontFamily: FONT, color: withAlpha(T1, 0.9), fontSize: 16},

  titleWrap: {paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 10},
  eyebrow: {fontFamily: FONT, ...TYPE.label, color: T3},
  title: {fontFamily: FONT, fontSize: 26, fontWeight: '700', letterSpacing: -0.7, color: T1, marginTop: 3},

  card: {
    borderRadius: CARD_RADIUS, overflow: 'hidden', backgroundColor: CARD,
    // 카드가 배경에서 떠 보이도록 그림자(iOS/안드 공통 근사).
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: {width: 0, height: 18}, elevation: 12,
  },
  cardInner: {padding: 24},
  cardTop: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10},
  cardBrand: {fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, color: withAlpha(T1, 0.55)},
  cardModel: {fontFamily: FONT, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: T1, marginTop: 4},
  condChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: withAlpha(T1, 0.06), borderWidth: 1,
  },
  condDot: {width: 7, height: 7, borderRadius: 999},
  condLabel: {fontFamily: FONT, fontSize: 13, fontWeight: '600', color: T1},

  ringWrap: {width: RING, height: RING, alignSelf: 'center', marginTop: 20, alignItems: 'center', justifyContent: 'center'},
  ringCenter: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'},
  ringPctSub: {fontFamily: FONT, fontSize: 12, fontWeight: '600', color: withAlpha(T1, 0.55)},
  ringPctRow: {flexDirection: 'row', alignItems: 'flex-start', marginTop: 2},
  ringPct: {fontFamily: DISPLAY, fontSize: 58, fontWeight: '700', letterSpacing: -3, lineHeight: 60, color: T1},
  ringPctUnit: {fontFamily: DISPLAY, fontSize: 20, fontWeight: '700', color: withAlpha(T1, 0.7), marginTop: 6},

  kmRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 20},
  kmLabel: {fontFamily: FONT, fontSize: 13, fontWeight: '600', color: T3},
  kmStrong: {color: T1},
  kmSep: {width: 3, height: 3, borderRadius: 999, backgroundColor: withAlpha(T1, 0.28)},

  runBtn: {
    height: 54, borderRadius: RADIUS.btn, marginTop: 20, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    backgroundColor: withAlpha(T1, 0.1),
  },
  runGlyph: {fontFamily: FONT, color: T1, fontSize: 15},
  runLabel: {fontFamily: FONT, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: T1},

  dots: {flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: 16},
  dot: {height: 6, borderRadius: 999},
  dotActive: {width: 20, backgroundColor: WARN},
  dotIdle: {width: 6, backgroundColor: withAlpha(T1, 0.22)},

  guardian: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: GUTTER, marginTop: 20,
    paddingHorizontal: 18, paddingVertical: 14, borderRadius: 18, borderWidth: 1,
  },
  guardDot: {width: 9, height: 9, borderRadius: 999},
  guardText: {flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: T1},
  guardCta: {fontFamily: FONT, fontSize: 13, fontWeight: '700'},
});
