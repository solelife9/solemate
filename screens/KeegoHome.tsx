// ─── KeegoHome.tsx ───────────────────────────────────────────────
// 홈 = 런처 + 가디언. 신발 카드 캐러셀(좌우 스와이프)에서 신은 신발을 고르고 한 탭으로
// 러닝을 시작한다. 가디언은 고른 신발이 닳아 위험할 때(주의/교체)만 끼어든다.
//
// 프리미엄 표면은 '블러'가 아니라 '구조'로 낸다(중요):
//   · 카드 = SVG 세로 그라데이션 표면(위가 밝은 상승감) + 컨디션 색 상단 글로우
//   · 테두리 = 위에서 빛을 받은 유리 엣지(primitives GlassEdge — 상단 하이라이트가
//     코너를 감고 자연 소멸, 하단은 옅은 바닥 반사광)
//   · 링 트랙 = 컨디션 색 옅은 tint → 0%(새 신발)도 죽은 회색이 아니라 컨디션 halo
// backdrop-blur 는 검은 배경 위에선 번질 색이 없어 밋밋해지므로 쓰지 않는다.
//
// 의존성: react-native-svg 만 필요. 색·타이포·간격은 theme 토큰, 링 연속색은 lib/ringColor.

import React, {useRef, useState, useCallback, useEffect} from 'react';
import { rf, rs, ri, rv } from '../lib/responsive';
import {
  View, Text, Pressable, StyleSheet, Animated, Easing, useWindowDimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import Svg, {
  Circle, Defs, Stop,
  LinearGradient as SvgLinear,
} from 'react-native-svg';
import {
  BG, T1, T2, T3, WARN, DANGER, FONT, DISPLAY, TYPE, RADIUS, GUTTER, GLASS, withAlpha,
  type Shoe,
} from '../theme';
import {GlassEdge, ShoeGlyph} from '../primitives';
import {shoeHealth, wearTier, conditionForPercent, type RunLike, KEEP_GOING_REPLACE} from '../lib/shoe';
import {ringColor} from '../lib/ringColor';
import {displayNum, type Unit} from '../lib/units';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  shoes: Shoe[];
  runs?: RunLike[];
  onStartRun?: (shoe: Shoe) => void;
  onOpenShoe?: (shoe: Shoe) => void;
  onOpenProfile?: () => void;
};

const CARD_GAP = 14;
const CARD_RADIUS = 34;
// 링 '기준' 치수(874pt 화면 기준) — 실제 크기는 ShoeCard 가 화면 높이에 비례해 계산한다.
const RING = 172;
const RING_R = 76;

// 링 아크 스윕용 — SVG Circle 의 strokeDashoffset 을 Animated 로 구동한다.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function KeegoHome({shoes, runs = [], onStartRun, onOpenShoe, onOpenProfile}: Props) {
  const {width} = useWindowDimensions();
  // HomeScreen 캐러셀과 동일한 비율 규칙(화면 폭 82%, 380 상한) — 기기 간 동일 구도.
  const CARD_W = Math.min(Math.round(width * 0.82), 380);
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
          <Ionicons name="person" size={ri(16)} color={withAlpha(T1, 0.9)} />
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
        contentContainerStyle={{paddingHorizontal: SIDE - CARD_GAP / 2, gap: CARD_GAP, paddingVertical: rv(8)}}
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
  // 링 크기 = 화면 높이 비례(기준 874pt 에서 172px — 현행과 동일). 고정 172px 은 SE/mini
  // 같은 짧은 화면에서 러닝 시작 버튼을 폴드 밖으로 밀었다. 클램프로 극단만 방지.
  const {height: winH} = useWindowDimensions();
  const ring = Math.max(144, Math.min(180, Math.round(winH * (172 / 874))));
  const ringR = ring * (RING_R / RING);
  const ringC = 2 * Math.PI * ringR;
  const h = shoeHealth(shoe as any, runs);
  const pct = Math.round(h.percentUsed);
  // 사용자 노출 % = '남은 수명'(배터리 방향, 100→0). 소진율(↑)과 "남음" 카피가 뒤섞여
  // 읽기 마찰이 있었다 — 링·%·카피를 전부 '남음' 한 방향으로 통일(사용자 결정).
  // 색/컨디션 판정은 계속 마모(percentUsed) 기준(경고 임계값의 단일 진실원).
  const remainPct = Math.max(0, 100 - pct);
  const rc = ringColor(h.percentUsed);
  const tier = wearTier(h.percentUsed);
  // 거리는 사용자 단위(km/mi)로 표시한다 — 저장은 km, 표기만 환산(displayNum).
  const usedText = `${displayNum(h.usedKm, unit)}/${displayNum(shoe.max, unit)}${unit}`;
  const remainText = h.remainingKm > 0 ? `${displayNum(h.remainingKm, unit)}${unit} 남음` : '수명 초과';

  // 중앙 카드 강조: 이웃은 살짝 축소 + 흐리게.
  const inputRange = [(i - 1) * stride, i * stride, (i + 1) * stride];
  const scale = scrollX.interpolate({inputRange, outputRange: [0.93, 1, 0.93], extrapolate: 'clamp'});
  const opacity = scrollX.interpolate({inputRange, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp'});

  // 링 아크 = 남은 수명(배터리): 새 신발 = 가득 찬 링, 닳을수록 비워진다.
  // 마운트 시 0→현재%로 차오르는 스윕 — 정적 게이지에 물리감을 준다. 1400ms 로 느긋하게
  // (800ms 는 급하다는 사용자 피드백 — 차오르는 과정 자체가 보여야 멋이 산다).
  // strokeDashoffset 은 네이티브 드라이버 미지원 prop 이라 JS 드라이버(false)로 구동.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(sweep, {
      toValue: Math.min(remainPct, 100), duration: 1400,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop(); // 언마운트 시 타이머 정리(테스트/화면전환 누수 방지)
  }, [sweep, remainPct]);
  const dash = sweep.interpolate({inputRange: [0, 100], outputRange: [ringC, 0]});
  // 링 중앙 숫자 — 스윕에 맞춰 살짝 떠오르며 페이드인.
  const centerIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(centerIn, {
      toValue: 1, duration: 500, delay: 150,
      // JS 드라이버 — 링 스윕과 동일(테스트 렌더러 호환 + 코드베이스 관례).
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [centerIn]);

  return (
    <Animated.View style={{width, transform: [{scale}], opacity}}>
      <View style={styles.card}>
        {/* 유리 재질(2026-07-09 확정): 반투명 표면(styles.card) + 코너 글린트 림 + 상단 광택.
            구 그라데이션 표면·컨디션색 글로우는 폐지 — 효과가 겹겹이 싸워 어색하다는 실기기
            피드백. 컨디션 색은 점·링에만(색은 의미, 질감은 무채). 히어로라 림을 한 단 올린다. */}
        <GlassEdge id={`edge-card-${i}`} radius={CARD_RADIUS} intensity={GLASS.activeIntensity} />

        <View style={styles.cardInner}>
          {/* 정보영역(탭 → 상세). 러닝 시작 버튼은 이 Pressable '밖'의 형제라, 텍스트 기반
              테스트가 '러닝 시작'을 눌러도 상세로 새지 않는다(시각은 동일 — 이벤트 중첩만 분리). */}
          <Pressable onPress={() => onOpenShoe?.(shoe)} accessibilityRole="button" accessibilityLabel={`${shoe.brand} ${shoe.model}, 컨디션 ${tier.label}, 남은 수명 ${remainPct}%, 상세 보기`}>
          {/* 상단: 브랜드/모델(좌) · 컨디션(우) */}
          <View style={styles.cardTop}>
            <View style={{flexShrink: 1}}>
              <Text style={styles.cardBrand}>{shoe.brand} · {catOf(shoe)}</Text>
              <Text style={styles.cardModel} numberOfLines={1}>{shoe.model}</Text>
            </View>
            {/* 컨디션 = 점 + 텍스트만(칩 박스 제거 — 배지보다 조용한 표기, 폴리싱 2026-07-02).
                색은 점에만, 텍스트는 무채색. testID 는 기존 계약 유지. */}
            <View style={styles.condChip} testID={`home-cond-${tier.key}`}>
              <View style={[styles.condDot, {backgroundColor: rc.to}]} />
              <Text style={styles.condLabel}>{tier.label}</Text>
            </View>
          </View>

          {/* 링 게이지 — 크기는 화면 높이 비례(ring, 기기 간 동일 구도).
              평면 링(2026-07-05, 사용자 결정): 유리 튜브 질감(안팎 헤어라인·광택 코어)을
              걷어내 깨끗한 평면 링으로. 트랙 tint + 컨디션 색 아크만 — 색은 의미이지 질감이
              아니다. 미니멀 럭셔리 방향과 정렬. */}
          <View style={[styles.ringWrap, {width: ring, height: ring}]}>
            <Svg width={ring} height={ring}>
              <Defs>
                <SvgLinear id={`ring-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={rc.from} />
                  <Stop offset="1" stopColor={rc.to} />
                </SvgLinear>
              </Defs>
              {/* 트랙: 컨디션 색 옅은 tint → 0% 도 죽은 회색이 아님 */}
              <Circle
                cx={ring / 2} cy={ring / 2} r={ringR}
                stroke={withAlpha(rc.solid, 0.16)} strokeWidth={14} fill="none"
              />
              {/* 진행 아크: 컨디션 색 그라데이션 — 마운트 시 0→현재%로 차오른다 */}
              <AnimatedCircle
                cx={ring / 2} cy={ring / 2} r={ringR}
                stroke={`url(#ring-${i})`} strokeWidth={14} fill="none"
                strokeLinecap="round"
                strokeDasharray={ringC}
                strokeDashoffset={dash}
                transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
              />
            </Svg>
            <Animated.View style={[styles.ringCenter, {
              opacity: centerIn,
              transform: [{translateY: centerIn.interpolate({inputRange: [0, 1], outputRange: [8, 0]})}],
            }]}>
              <Text style={styles.ringPctSub}>남은 수명</Text>
              <View style={styles.ringPctRow}>
                <Text style={styles.ringPct}>{remainPct}</Text>
                <Text style={styles.ringPctUnit}>%</Text>
              </View>
            </Animated.View>
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
            <GlassEdge glints={false} fade={false} id={`edge-run-${i}`} radius={RADIUS.btn} />
            <Ionicons name="play" size={ri(15)} color={T1} style={{marginRight: rs(6)}} />
            <Text style={styles.runLabel}>러닝 시작</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── 고스트 카드(빈 상태) ──────────────────────────────────────────
// 빈 상태 = 채워진 카드의 유령. 실카드와 같은 실루엣(유리 표면·엣지·링 자리·유리 CTA)으로
// "등록하면 이 자리가 이렇게 채워진다"를 형태로 말한다. 홈·신발탭 빈 상태가 공유하는
// 단일 소스 — 실카드 디자인이 진화하면 고스트도 같이 따라온다.
export function GhostShoeCard({width, onPress}: {width: number; onPress?: () => void}) {
  const {height: winH} = useWindowDimensions();
  const ring = Math.max(144, Math.min(180, Math.round(winH * (172 / 874))));
  const ringR = ring * (RING_R / RING);
  return (
    <View style={{width, alignSelf: 'center'}}>
      <View style={styles.card}>
        {/* 실카드와 동일한 유리 재질(글로우 없음) — 고스트는 기본 림 세기. */}
        <GlassEdge id="edge-card-ghost" radius={CARD_RADIUS} />
        <View style={styles.cardInner}>
          <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="첫 러닝화 등록">
            {/* 빈 수명 링 — 트랙만 남긴 링 중앙에 신발 글리프(여기가 네 신발의 자리) */}
            <View style={[styles.ringWrap, {width: ring, height: ring}]}>
              <Svg width={ring} height={ring}>
                <Circle
                  cx={ring / 2} cy={ring / 2} r={ringR}
                  stroke={withAlpha(T1, 0.08)} strokeWidth={14} fill="none"
                />
              </Svg>
              <View style={styles.ringCenter}>
                <ShoeGlyph size={ri(46)} />
              </View>
            </View>
            <Text style={styles.ghostHint}>등록하면 이 링이 신발 수명을 지켜봐요</Text>
            <View style={styles.ghostValues}>
              <Text style={styles.ghostValTxt}>누적 거리</Text>
              <View style={styles.kmSep} />
              <Text style={styles.ghostValTxt}>교체 시기</Text>
              <View style={styles.kmSep} />
              <Text style={styles.ghostValTxt}>부상 예방</Text>
            </View>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.runBtn, pressed && {transform: [{scale: 0.98}]}]}
            onPress={onPress}
            accessibilityRole="button" accessibilityLabel="러닝화 등록"
          >
            <GlassEdge glints={false} fade={false} id="edge-run-ghost" radius={RADIUS.btn} />
            <Ionicons name="add" size={ri(16)} color={T1} style={{marginRight: rs(6)}} />
            <Text style={styles.runLabel}>러닝화 등록</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── 가디언 ────────────────────────────────────────────────────────
function Guardian({danger, pct}: {danger: boolean; pct: number}) {
  const color = danger ? DANGER : WARN;
  // pct 는 마모(percentUsed) — 사용자 노출은 '남은 수명' 방향으로 환산(표기 통일).
  const label = danger ? KEEP_GOING_REPLACE : `남은 수명 ${Math.max(0, 100 - Math.round(pct))}% · 슬슬 교체를 준비할 때`;
  return (
    <View style={[styles.guardian, {backgroundColor: withAlpha(color, 0.12), borderColor: withAlpha(color, 0.4)}]}>
      <View style={[styles.guardDot, {backgroundColor: color}]} />
      <Text style={styles.guardText} numberOfLines={1}>{label}</Text>
      {danger ? <Text style={[styles.guardCta, {color}]}>대안</Text> : null}
    </View>
  );
}

// ─── 유리 재질 노트 ─────────────────────────────────────────────────
// 구 SurfaceBackground(상승감 그라데이션 + 컨디션 글로우)는 2026-07-09 글라스 확정으로
// 폐지 — 표면은 styles.card 의 반투명 채움, 빛은 primitives.GlassEdge(코너 글린트)가
// 담당한다. 홈 카드·러닝 시작 버튼·전역 CTA(Button)가 같은 빛(theme.GLASS)을 공유한다.

// 카테고리 라벨(카본/데일리 등)이 Shoe 에 없을 수 있어 안전 폴백.
function catOf(shoe: any): string {
  return shoe?.category ?? shoe?.cat ?? '러닝화';
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: BG, paddingTop: rv(8)},
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: GUTTER, paddingTop: rv(6),
  },
  brandRow: {flexDirection: 'row', alignItems: 'center', gap: rv(8)},
  brandDot: {width: rs(9), height: rs(9), borderRadius: RADIUS.pill, backgroundColor: WARN},
  wordmark: {fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.5, color: T1},
  avatar: {
    width: rs(36), height: rs(36), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(T1, 0.08), borderWidth: 1, borderColor: withAlpha(T1, 0.12),
  },
  avatarGlyph: {fontFamily: FONT, color: withAlpha(T1, 0.9), fontSize: TYPE.heading.fontSize},

  titleWrap: {paddingHorizontal: GUTTER, paddingTop: rv(16), paddingBottom: rv(10)},
  eyebrow: {fontFamily: FONT, ...TYPE.label, color: T3},
  title: {fontFamily: FONT, fontSize: TYPE.title1.fontSize, fontWeight: '700', letterSpacing: -0.7, color: T1, marginTop: rv(3)},

  card: {
    // borderCurve:'continuous'(스퀴클) 제거 — iOS 스퀴클 클립이 GlassEdge 의 원호(Rect rx) 코너와
    // 어긋나 좌상단 모서리가 미세하게 어둡게 잘려 보였다(사용자 발견). Android 는 continuous 를
    // 무시(원호)해 애초에 정합이라 괜찮았다. 원호로 통일하면 하이라이트가 코너에서 매끈히 이어진다.
    // 표면 = 반투명 유리(GLASS.fillActive — 히어로라 활성 채움). 불투명 CARD 판 폐지.
    borderRadius: CARD_RADIUS, overflow: 'hidden', backgroundColor: GLASS.fillActive,
    // 그림자는 절제 — 구 값(불투명 0.5·radius 24·offset 18)은 유리의 빛(코너 글린트)과
    // 방향이 모순돼 재질이 싸웠다. 살짝 뜨는 정도만 남긴다.
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: {width: 0, height: rs(8)}, elevation: 6,
  },
  cardInner: {padding: rs(24)},
  cardTop: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: rv(10)},
  cardBrand: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 1.2, color: withAlpha(T1, 0.55)},
  cardModel: {fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.6, color: T1, marginTop: rv(4)},
  // 컨디션 표기 — 칩 박스 없이 점+텍스트(점만 컨디션색, 텍스트는 밝은 무채색).
  condChip: {flexDirection: 'row', alignItems: 'center', gap: rv(8), flexShrink: 0, paddingVertical: rv(6)},
  condDot: {width: rs(7), height: rs(7), borderRadius: RADIUS.pill},
  condLabel: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', color: T2},

  // width/height 는 렌더에서 화면 비례값(ring)으로 덮어쓴다.
  ringWrap: {alignSelf: 'center', marginTop: rv(20), alignItems: 'center', justifyContent: 'center'},
  ringCenter: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'},
  ringPctSub: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', color: withAlpha(T1, 0.55)},
  ringPctRow: {flexDirection: 'row', alignItems: 'flex-start', marginTop: rv(2)},
  // 58 → 52: 링 안에서 숫자가 꽉 차 보인다는 피드백(2026-07-04) — 살짝 줄여 숨통.
  ringPct: {fontFamily: DISPLAY, fontSize: rf(52), fontWeight: '700', letterSpacing: -2.6, lineHeight: rf(54), color: T1},
  ringPctUnit: {fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', color: withAlpha(T1, 0.7), marginTop: rv(6)},

  kmRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(12), marginTop: rv(20)},
  kmLabel: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', color: T3},
  kmStrong: {color: T1},
  kmSep: {width: rs(3), height: rs(3), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.28)},

  runBtn: {
    height: rs(54), borderRadius: RADIUS.btn, borderCurve: 'continuous', marginTop: rv(20), overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8),
    backgroundColor: withAlpha(T1, 0.1),
  },
  runGlyph: {fontFamily: FONT, color: T1, fontSize: TYPE.body.fontSize},
  runLabel: {fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2, color: T1},

  // 고스트 카드(빈 상태) 전용 — 힌트/가치 라인은 실카드 kmRow 자리의 유령.
  ghostHint: {textAlign: 'center', color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: -0.2, marginTop: rv(20)},
  ghostValues: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(12), marginTop: rv(12)},
  ghostValTxt: {color: withAlpha(T1, 0.35), fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500'},

  dots: {flexDirection: 'row', justifyContent: 'center', gap: rv(8), marginTop: rv(16)},
  dot: {height: rs(6), borderRadius: RADIUS.pill},
  dotActive: {width: rs(20), backgroundColor: WARN},
  dotIdle: {width: rs(6), backgroundColor: withAlpha(T1, 0.22)},

  guardian: {
    flexDirection: 'row', alignItems: 'center', gap: rv(12), marginHorizontal: GUTTER, marginTop: rv(20),
    paddingHorizontal: rs(18), paddingVertical: rv(14), borderRadius: rs(18), borderWidth: 1,
  },
  guardDot: {width: rs(9), height: rs(9), borderRadius: RADIUS.pill},
  guardText: {flex: 1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: -0.2, color: T1},
  guardCta: {fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700'},
});
