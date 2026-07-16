// ============================================================================
// OnboardingScreen.rn.tsx — keego 첫 실행 온보딩 (4-screen flow, 2026-07-07 재설계)
//
// 사용자 승인 목업(아티팩트 f0755f95, 스펙: memory solemate-onboarding-redesign-spec)을
// RN 으로 구현한다. 기존 6화면(Welcome→신발→부상→관리→등록→Ready)을 4화면으로 통합:
//   0 Welcome(훅) → 1 신발 인텔리전스(신발+부상+관리 통합) → 2 성능(신규) → 3 등록
// 등록 완료 시 Ready/축하 화면 없이 바로 홈(onDone). 확정 원칙:
//   · 충격흡수율 등 앱에 없는 지표 금지 — 누적 거리 추적으로만 말한다
//   · 상태 용어는 lib/shoe wearTier 4단계(최상/양호/교체 고려/교체 권장) 단일 소스
//   · 성능 화면은 가짜 개인 숫자 금지(신규 유저 첫 실행은 '측정 전') — 기능 목록으로
//   · 러닝화 선택은 2열 분할 피커(브랜드 레일+모델, 알파벳순+검색) — 인기순 큐레이션 금지
//   · 브랜드명 표기는 소문자 keego
// - 완료 영속(AsyncStorage 'onboarded')은 App.tsx가 onDone 콜백에서 처리한다.
// ============================================================================
import React, {useContext, useEffect, useId, useMemo, useRef, useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ImageBackground,
  PanResponder,
  Animated,
  Easing,
  AccessibilityInfo,
  Linking,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {PRIVACY_URL, TERMS_URL} from './lib/legalLinks';
// 신발 브랜드/모델·권장수명은 data/shoeModels(단일 소스)에서 — 메인 AddShoe 화면과 동일.
import {getRecommendedLifespanKm} from './data/shoeModels';
import {wearTier} from './lib/shoe';
import Svg, {
  Circle,
  Path,
  Rect,
  Ellipse,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import {
  BG,
  CARD,
  ACCENT,
  GOOD,
  WARN,
  DANGER,
  BEST,
  HALL_GOLD,
  BRAND,
  ONBOARD_CARD_GRAD_TOP,
  ONBOARD_CARD_GRAD_BOT,
  T1,
  T3,
  T4,
  SEP,
  FONT,
  DISPLAY,
  withAlpha, TYPE, GLASS,
} from './theme';
import {Button, KeegoWordmark, ShoeGlyph, WEAR_TONE_COLOR, GlassEdge} from './primitives';
// 러닝화 선택 모달(2열 분할 피커)은 메인 등록(AddShoeScreen)과 공유하는 단일 소스.
import {ShoePicker, type PickedShoe} from './ShoePicker';

export type RegisteredShoe = {brand: string; model: string; km: number; max: number};

// ════════════════════════════════════════════════════════════════════════════
// 모션(진입 stagger) — 접근성 '동작 줄이기' 시 전부 생략하고 최종 상태 즉시 표시.
// ════════════════════════════════════════════════════════════════════════════

// jest 워커에서는 타이머 기반 애니메이션을 건너뛰고 최종 상태를 즉시 보여준다(reduce-motion
// 과 동일 취급). 실제 앱 런타임엔 JEST_WORKER_ID가 없어 애니메이션이 정상 동작한다.
const SKIP_ANIM = !!(typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID);

const ReduceMotionCtx = React.createContext(false);

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => {
      if (alive) setRm(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return rm;
}

// 진입 애니메이션: fade + 약간 떠오르기(translateY). delay로 stagger.
function Rise({delay = 0, children, style}: {delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  const rm = useContext(ReduceMotionCtx);
  const a = useRef(new Animated.Value(rm || SKIP_ANIM ? 1 : 0)).current;
  useEffect(() => {
    if (rm || SKIP_ANIM) {
      a.setValue(1);
      return;
    }
    // JS 드라이버: 단발 진입이라 성능 영향 미미 + jest 에 NativeAnimated 모듈이 없다.
    const anim = Animated.timing(a, {toValue: 1, duration: 460, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false});
    anim.start();
    return () => anim.stop();
  }, [a, delay, rm]);
  return (
    <Animated.View
      style={[style, {opacity: a, transform: [{translateY: a.interpolate({inputRange: [0, 1], outputRange: [14, 0]})}]}]}>
      {children}
    </Animated.View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 공용 프리미티브
// ════════════════════════════════════════════════════════════════════════════

// react-native-svg 의 <Stop> 은 stopColor 의 rgba 알파를 무시한다 → rgb + stopOpacity 분리.
function splitStopColor(color: string): {color: string; opacity: number} {
  const m =
    /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(
      color,
    );
  if (m) {
    return {color: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, opacity: Number(m[4])};
  }
  return {color, opacity: 1};
}

function LinearGrad({
  stops,
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 1,
  radius = 0,
  style,
}: {
  stops: {color: string; offset: number}[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `kg-grad-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    // pointerEvents none: 장식 레이어가 아래 Pressable 터치를 가로채지 않게.
    <Svg pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Defs>
        <SvgGradient id={id} x1={String(x1)} y1={String(y1)} x2={String(x2)} y2={String(y2)}>
          {stops.map((s, i) => {
            const c = splitStopColor(s.color);
            return (
              <Stop
                key={i}
                offset={String(s.offset)}
                stopColor={c.color}
                stopOpacity={String(c.opacity)}
              />
            );
          })}
        </SvgGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

// 상단 진행 세그먼트 바(현재=24px 흰 알약, 나머지=7px 점).
function TopProgress({step, total}: {step: number; total: number}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: rv(4)}}>
      {Array.from({length: total}).map((_, i) => {
        const cur = i === step - 1;
        return (
          <View
            key={i}
            style={{width: cur ? 24 : 7, height: 3.5, borderRadius: rs(3), backgroundColor: cur ? T1 : withAlpha(T1, 0.2)}}
          />
        );
      })}
    </View>
  );
}

function Eyebrow({children}: {children: React.ReactNode}) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

// 온보딩 1차 CTA — 앱 전역 단일 Button 프리미티브에 위임.
function PrimaryButton({
  label,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return <Button label={label} onPress={onPress} disabled={disabled} testID={testID} />;
}

// 누적 거리 슬라이더(PanResponder 트랙, 오렌지 채움 + 흰 썸).
function KmSlider({value, min, max, step, onChange}: {value: number; min: number; max: number; step: number; onChange: (v: number) => void}) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  const pct = (value - min) / (max - min);
  const handle = (x: number) => {
    const width = wRef.current;
    if (width <= 0) return;
    const p = Math.max(0, Math.min(1, x / width));
    const snapped = Math.round((min + p * (max - min)) / step) * step;
    onChange(Math.max(min, Math.min(max, snapped)));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => handle(e.nativeEvent.locationX),
      onPanResponderMove: e => handle(e.nativeEvent.locationX),
    }),
  ).current;
  const adjust = (dir: 1 | -1) => onChange(Math.max(min, Math.min(max, value + dir * step)));
  return (
    <View
      onLayout={e => {
        const ww = e.nativeEvent.layout.width;
        wRef.current = ww;
        setW(ww);
      }}
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="현재 누적 거리"
      accessibilityValue={{min, max, now: value, text: `${value} 킬로미터`}}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'increment') adjust(1);
        else if (e.nativeEvent.actionName === 'decrement') adjust(-1);
      }}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      style={{height: rs(26), justifyContent: 'center'}}>
      <View style={{position: 'absolute', left: 0, right: 0, height: rs(8), borderRadius: rs(8), backgroundColor: withAlpha(T1, 0.09)}} />
      <View style={{position: 'absolute', left: 0, width: pct * w, height: rs(8), borderRadius: rs(8), backgroundColor: ACCENT}} />
      <View
        style={{
          position: 'absolute',
          left: pct * w - 13,
          width: rs(26),
          height: rs(26),
          borderRadius: rs(13),
          backgroundColor: T1,
          borderWidth: 5,
          borderColor: ACCENT,
        }}
      />
    </View>
  );
}

// ── 인라인 라인 아이콘(성능 목록·알림 행) ────────────────────────────────────
function BellIcon({size = 16, color = T3}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.7 20a2 2 0 0 1-3.4 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function MedalIcon({size = 18, color = T1}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={9} r={5} stroke={color} strokeWidth={1.8} />
      <Path d="M9.5 13.5 7.5 21l4.5-2.6L16.5 21l-2-7.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function PulseIcon({size = 18, color = T1}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12h4l2.5-6.5L14 18l2.5-6H21" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function TrackIcon({size = 18, color = T1}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Ellipse cx={12} cy={12} rx={9} ry={5.5} stroke={color} strokeWidth={1.8} />
      <Ellipse cx={12} cy={12} rx={4.5} ry={2.2} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}
function GaugeIcon({size = 18, color = T1}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 19a8 8 0 1 1 14 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 14l3.5-3.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function SearchIcon({size = 15, color = T3}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="M21 21l-4.3-4.3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ChevronDown({size = 12, color = T3}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 화면 1~3 공통 상단(진행 바 + 건너뛰기).
function FlowHeader({step, total, onSkip, insetTop}: {step: number; total: number; onSkip: () => void; insetTop: number}) {
  return (
    <View style={[s.flowHeader, {paddingTop: insetTop + 14}]}>
      <TopProgress step={step} total={total} />
      <Pressable testID="onboarding-skip" onPress={onSkip} hitSlop={10} accessibilityRole="button" accessibilityLabel="건너뛰기">
        <Text style={s.skip}>건너뛰기</Text>
      </Pressable>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 0 · Welcome — 훅. 기존 배경(흑백 러너 사진 + 브랜드 그라데이션 + 하단 페이드) 유지.
// ════════════════════════════════════════════════════════════════════════════
function Welcome({goNext, goLogin, insetTop, insetBottom}: {goNext: () => void; goLogin: () => void; insetTop: number; insetBottom: number}) {
  return (
    <View style={{flex: 1, backgroundColor: BG}}>
      <ImageBackground
        source={require('./assets/onboarding/hero-runner-bw.png')}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        imageStyle={{opacity: 0.92}}>
        {/* 따뜻한 브랜드 그라데이션(좌상단) */}
        <LinearGrad x1={0} y1={0} x2={1} y2={1} stops={[{color: withAlpha(ACCENT, 0.3), offset: 0}, {color: withAlpha(ACCENT, 0), offset: 0.55}]} />
        {/* 하단 가독성 페이드 → bgDeep */}
        <LinearGrad
          x1={0}
          y1={0}
          x2={0}
          y2={1}
          stops={[
            {color: 'rgba(0,0,0,0.55)', offset: 0},
            {color: 'rgba(0,0,0,0)', offset: 0.28},
            {color: 'rgba(5,5,6,0.78)', offset: 0.66},
            {color: BG, offset: 1},
          ]}
        />
      </ImageBackground>

      {/* 워드마크 — 홈과 동일한 공용 소문자 'keego'(KeegoWordmark). */}
      <KeegoWordmark size={ri(26)} style={{position: 'absolute', left: 24, top: insetTop + 18}} />

      {/* 하단 콘텐츠 — staggered 진입 */}
      <View style={{flex: 1, justifyContent: 'flex-end', paddingHorizontal: rs(24), paddingBottom: Math.max(insetBottom, 24) + 8}}>
        <Rise delay={80}>
          <Text style={s.heroHeadline}>
            {/* 마침표 = 파파야 서명(keego 워드마크와 같은 문법). ACCENT 가 흰색으로 회수되며
                흰 마침표로 서명이 소실됐던 것 복원(검수 HIGH, 2026-07-16). */}
            KEEP{'\n'}GOING<Text style={{color: BRAND}}>.</Text>
          </Text>
        </Rise>
        <Rise delay={220}>
          <Text style={s.heroSub}>멈추지 않는 발걸음을 위해</Text>
        </Rise>
        <Rise delay={320}>
          <Text style={s.heroBody}>keego가 러닝화 수명을 추적해,{'\n'}부상 없이 러닝 라이프를 이어갈 수 있도록 도와요.</Text>
        </Rise>
        <Rise delay={440} style={{marginTop: rv(26)}}>
          <PrimaryButton testID="onboarding-start" label="시작하기" onPress={goNext} />
          {/* 기존 계정 사용자: 온보딩 소개를 건너뛰고 바로 완료 — 인증 게이트(LoginScreen)는
              온보딩보다 먼저이므로 여기 도달한 시점엔 이미 로그인돼 있고, 동기화된 신발이
              있으면 온보딩 자체가 안 뜬다. 이 링크는 '소개 스킵' 의미로 유지한다. */}
          <Pressable
            testID="onboarding-login"
            onPress={goLogin}
            hitSlop={8}
            style={{alignItems: 'center', marginTop: rv(14)}}
            accessibilityRole="button"
            accessibilityLabel="이미 계정이 있나요? 로그인">
            <Text style={{fontFamily: FONT, fontSize: TYPE.body.fontSize, color: T3, fontWeight: '500'}}>
              이미 계정이 있나요? <Text style={{color: T1}}>로그인</Text>
            </Text>
          </Pressable>
          {/* 약관 고지 — Ready 화면 제거(2026-07-07 재설계)로 첫 CTA 아래로 이전. */}
          <Text style={s.termsCaption}>
            계속 진행하면 keego의 <Text style={{textDecorationLine: 'underline'}} accessibilityRole="link" accessibilityLabel="이용약관 열기" onPress={() => { Linking.openURL(TERMS_URL).catch(() => {}); }}>이용약관</Text>과 <Text style={{textDecorationLine: 'underline'}} accessibilityRole="link" accessibilityLabel="개인정보 처리방침 열기" onPress={() => { Linking.openURL(PRIVACY_URL).catch(() => {}); }}>개인정보 처리방침</Text>에 동의하는 것으로 간주돼요.
          </Text>
        </Rise>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · 신발 인텔리전스 — 기존 신발·부상·관리 3화면 통합(문제→해법→알림, A안).
// ════════════════════════════════════════════════════════════════════════════

// 데모 신발(온보딩 예시) — 수명은 카탈로그 실제값(Novablast 5 = 데일리 650km)과 일치시켜
// 등록 화면의 자동 설정 값과 모순되지 않게 한다.
const DEMO_SHOE = {brand: 'ASICS', model: 'Novablast 5', km: 442, max: 650};

function DegradeCurve() {
  const line = 'M6 18 C 70 22, 120 34, 180 70 S 300 120, 354 132';
  const area = 'M6 18 C 70 22, 120 34, 180 70 S 300 120, 354 132 L354 150 L6 150 Z';
  return (
    <Svg viewBox="0 0 360 150" width="100%" height={112}>
      <Defs>
        {/* 면 채움도 가로 초록→빨강(라인과 동일 축) — 신품(좌)=초록, 마모(우)=빨강이 한눈에. */}
        <SvgGradient id="kg-dg" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GOOD} stopOpacity={0.22} />
          <Stop offset="0.6" stopColor={WARN} stopOpacity={0.13} />
          <Stop offset="1" stopColor={DANGER} stopOpacity={0.2} />
        </SvgGradient>
        <SvgGradient id="kg-dl" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GOOD} />
          <Stop offset="0.6" stopColor={WARN} />
          <Stop offset="1" stopColor={DANGER} />
        </SvgGradient>
      </Defs>
      <Rect x="270" y="0" width="90" height="150" fill="rgba(255,77,77,0.08)" />
      <Path d="M270 0 L270 150" stroke="rgba(255,77,77,0.3)" strokeWidth={1} strokeDasharray="3 4" />
      <Path d={area} fill="url(#kg-dg)" />
      <Path d={line} fill="none" stroke="url(#kg-dl)" strokeWidth={3} strokeLinecap="round" />
      <Circle cx="354" cy="132" r="5.5" fill={DANGER} />
    </Svg>
  );
}

function ShoeIntelligence({goNext, onSkip, insetTop, insetBottom}: ScreenProps) {
  // 상태 필은 앱 실제 4단계(wearTier) 단일 소스 — 68% → '양호'(🟡).
  const pctUsed = Math.round((DEMO_SHOE.km / DEMO_SHOE.max) * 100);
  const tier = wearTier(pctUsed);
  const tierColor = WEAR_TONE_COLOR[tier.tone];
  return (
    <View style={s.screen}>
      <FlowHeader step={1} total={3} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <Rise>
          <Eyebrow>Your shoes matter</Eyebrow>
          <Text style={s.title}>러닝화도 관리가 필요해요</Text>
          <Text style={s.body}>
            러닝화는 <Text style={s.bodyStrong}>누적 거리에 따라 성능이 달라져요.</Text>{'\n'}쿠셔닝이 닳은 신발은 충격을 그대로{'\n'}무릎과 발목에 전달해요.
          </Text>
        </Rise>

        {/* 마모 곡선 카드 — 축은 예시 신발의 실제 권장 수명(650km)과 일치 */}
        <Rise delay={130} style={[s.heroCard, {overflow: 'hidden'}]}>
          <LinearGrad stops={[{color: ONBOARD_CARD_GRAD_TOP, offset: 0}, {color: ONBOARD_CARD_GRAD_BOT, offset: 1}]} radius={22} />
          <GlassEdge glints={false} radius={rs(22)} />
          <View style={{paddingHorizontal: rs(14), paddingTop: rv(14), paddingBottom: rv(14)}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: rv(8)}}>
              <Text style={{fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', color: T1, letterSpacing: -0.2}}>쿠셔닝 성능</Text>
              <Text style={{fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T3, letterSpacing: 0.6}}>0 → {DEMO_SHOE.max} KM</Text>
            </View>
            <DegradeCurve />
            <Text style={{fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600', color: withAlpha(DANGER, 0.85), textAlign: 'right', marginTop: rv(6), letterSpacing: 0.4}}>
              대부분의 러너가 이 구간을 놓쳐요
            </Text>
          </View>
        </Rise>

        {/* 신발 카드 — 앱 실제 카드 문법(글리프 + 누적/총 + wearTier 필) */}
        <Rise delay={240}>
        <View style={s.shoeRowCard} accessible accessibilityLabel={`${DEMO_SHOE.brand} ${DEMO_SHOE.model}, ${DEMO_SHOE.km} / ${DEMO_SHOE.max} 킬로미터, 수명의 ${pctUsed}퍼센트, 상태 ${tier.label}`}>
          <GlassEdge glints={false} radius={rs(22)} />
          <View style={s.shoeThumb}>
            <ShoeGlyph size={ri(26)} color={withAlpha(T1, 0.75)} />
          </View>
          <View style={{flex: 1, minWidth: 0}}>
            <Text numberOfLines={1} style={{fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', color: T1, letterSpacing: -0.2}}>
              {DEMO_SHOE.brand} {DEMO_SHOE.model}
            </Text>
            <Text style={{fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T3, marginTop: rv(3), fontVariant: ['tabular-nums']}}>
              {DEMO_SHOE.km} / {DEMO_SHOE.max} km · 수명의 {pctUsed}%
            </Text>
          </View>
          <View style={[s.pill, {backgroundColor: withAlpha(tierColor, 0.14)}]}>
            <View style={{width: rs(6), height: rs(6), borderRadius: rs(3), backgroundColor: tierColor}} />
            <Text style={{color: tierColor, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600'}}>{tier.label}</Text>
          </View>
        </View>
        </Rise>

        {/* 알림 한 줄 — 박스 없이 조용히 */}
        <Rise delay={340} style={s.alertRow}>
          <BellIcon size={ri(16)} color={withAlpha(T1, 0.75)} />
          <Text style={{flex: 1, fontFamily: FONT, fontSize: TYPE.label.fontSize, color: T3, letterSpacing: -0.1}}>
            교체 시점 <Text style={{color: T1, fontWeight: '600'}}>50 km 전</Text>, 미리 알려드려요
          </Text>
        </Rise>
      </ScrollView>
      <View style={[s.footer, {paddingBottom: Math.max(insetBottom, 18)}]}>
        <PrimaryButton label="다음" onPress={goNext} />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · 성능 (신규) — 기능 목록형. 가짜 개인 숫자 금지(신규 유저 첫 실행은 '측정 전').
// 심박 존은 Apple Watch 연동 전까지 실사용에서 안 보이므로 제외(정직 원칙).
// ════════════════════════════════════════════════════════════════════════════
const FEATURES: {color: string; Icon: (p: {size?: number; color?: string}) => React.JSX.Element; title: string; desc: string}[] = [
  {color: HALL_GOLD, Icon: MedalIcon, title: '거리 PB', desc: '5K부터 풀코스까지, 최고 기록을 자동 갱신해요'},
  {color: BEST, Icon: PulseIcon, title: '심폐 체력', desc: '달린 페이스로 VO₂max를 추정 — 따로 측정할 필요 없어요'},
  // 바이올렛 잔재 회수(검수, 2026-07-16): 골드=성취(PB)·파랑=컨디션(심폐)·앰버=경고(부하)는
  // 의미색으로 남기고, 의미 없는 트랙 모드만 무채(색은 의미에만 — 캔온).
  {color: T1, Icon: TrackIcon, title: '트랙 모드', desc: '400m 트랙에서 랩을 자동으로 세어줘요'},
  {color: WARN, Icon: GaugeIcon, title: '훈련 부하', desc: '과부하가 오기 전에 미리 알려줘요'},
];

function Performance({goNext, onSkip, insetTop, insetBottom}: ScreenProps) {
  return (
    <View style={s.screen}>
      <FlowHeader step={2} total={3} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <Rise>
          <Eyebrow>Run stronger</Eyebrow>
          <Text style={s.title}>달릴수록 강해지는 기록</Text>
          <Text style={s.body}>아이폰 하나로, 달릴 때마다 자동으로 쌓여요.</Text>
        </Rise>

        <Rise delay={130} style={s.featCard}>
          <GlassEdge glints={false} radius={rs(22)} />
          {FEATURES.map((f, i) => (
            <View key={f.title} style={[s.featRow, i > 0 && s.featRowDivider]} accessible accessibilityLabel={`${f.title}: ${f.desc}`}>
              <View style={[s.featIc, {backgroundColor: withAlpha(f.color, 0.14)}]}>
                <f.Icon size={ri(18)} color={f.color} />
              </View>
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={{fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', color: T1, letterSpacing: -0.2}}>{f.title}</Text>
                <Text style={{fontFamily: FONT, fontSize: TYPE.label.fontSize, color: T3, marginTop: rv(3), lineHeight: rf(18)}}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </Rise>

        {/* 하단 여백을 사실 한 줄로 채운다(기기 피드백) — HealthKit 워크아웃 쓰기는 실구현. */}
        <Rise delay={260} style={s.alertRow}>
          <PulseIcon size={ri(16)} color={withAlpha(T1, 0.75)} />
          <Text style={{flex: 1, fontFamily: FONT, fontSize: TYPE.label.fontSize, color: T3, letterSpacing: -0.1}}>
            달린 러닝은 <Text style={{color: T1, fontWeight: '600'}}>Apple 건강</Text>에도 자동으로 저장돼요
          </Text>
        </Rise>
      </ScrollView>
      <View style={[s.footer, {paddingBottom: Math.max(insetBottom, 18)}]}>
        <PrimaryButton label="다음" onPress={goNext} />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · 등록 — '내 러닝화' 선택(2열 분할 피커) + 현재 누적 거리. 완료 → 바로 홈.
// '구매 시기' 필드는 폐기: 기존에도 저장되지 않던 죽은 입력(사용자 확인 2026-07-07).
// ════════════════════════════════════════════════════════════════════════════

function FieldLabel({n, label}: {n: string; label: string}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: rv(8)}}>
      <View style={s.fieldBadge}>
        <Text style={{fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', color: T3}}>{n}</Text>
      </View>
      <Text style={{fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', color: T1}}>{label}</Text>
    </View>
  );
}

function Register({onSkip, onComplete, insetTop, insetBottom}: Omit<ScreenProps, 'goNext'> & {onComplete: (r: RegisteredShoe) => void}) {
  const [picked, setPicked] = useState<PickedShoe | null>(null);
  const [km, setKm] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ready = !!picked;
  // 권장 수명은 카탈로그 기준(모델 미확정이면 브랜드/기본값) — AddShoe 화면과 동일 소스.
  const max = useMemo(
    () => getRecommendedLifespanKm({brand: picked?.brand || undefined, model: picked?.model || undefined}),
    [picked],
  );
  // 모델 변경으로 권장수명이 줄면 기존 누적거리 입력이 수명을 넘지 않도록 클램프.
  useEffect(() => {
    setKm(k => Math.min(k, max));
  }, [max]);

  const submit = () => {
    if (!picked) return;
    // 등록 완료 → Ready/축하 화면 없이 바로 홈(승인 스펙). 신발 생성은 App.completeOnboarding.
    onComplete({brand: picked.brand, model: picked.model, km, max});
  };

  return (
    <View style={s.screen}>
      <FlowHeader step={3} total={3} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <Rise>
          <Eyebrow>Your first pair</Eyebrow>
          <Text style={s.title}>첫 러닝화를{'\n'}등록해볼까요?</Text>
          <Text style={s.body}>지금 신는 러닝화를 등록하면{'\n'}keego가 수명을 추적해드려요.</Text>
        </Rise>

        {/* 1 내 러닝화 — 누르면 2열 분할 피커 */}
        <Rise delay={130} style={{marginTop: rv(16)}}>
          <FieldLabel n="1" label="내 러닝화" />
          <Pressable
            testID="onboarding-shoe-select"
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={picked ? `내 러닝화 ${picked.brand} ${picked.model}, 눌러서 변경` : '내 러닝화 선택'}
            style={({pressed}) => [s.selector, pressed && {opacity: 0.85}]}>
            <GlassEdge glints={false} radius={rs(14)} />
            <SearchIcon />
            <Text numberOfLines={1} style={[s.selectorText, !picked && {color: T4, fontWeight: '500'}]}>
              {picked ? `${picked.brand ? `${picked.brand} · ` : ''}${picked.model}` : '브랜드·모델 선택'}
            </Text>
            <ChevronDown />
          </Pressable>
          <Text style={s.fieldHint}>
            {picked ? `교체 권장 ${max} km 자동 설정 — 눌러서 변경할 수 있어요` : '누르면 브랜드와 모델을 고를 수 있어요'}
          </Text>
        </Rise>

        {/* 2 현재 누적 거리 */}
        <Rise delay={240} style={{marginTop: rv(22)}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <FieldLabel n="2" label="현재 누적 거리" />
            <Text style={s.kmVal}>
              {km.toLocaleString()}<Text style={s.kmUnit}> KM</Text>
            </Text>
          </View>
          <View style={{marginTop: rv(14)}}>
            <KmSlider value={km} min={0} max={max} step={10} onChange={setKm} />
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: rv(6)}}>
              <Text style={s.tick}>새 신발</Text>
              <Text style={s.tick}>{Math.round(max / 2)} km</Text>
              <Text style={s.tick}>{max} km+</Text>
            </View>
          </View>
          <Text style={[s.fieldHint, {marginTop: rv(10)}]}>새 신발이면 0으로 두세요.</Text>
        </Rise>
      </ScrollView>

      <View style={[s.footer, {paddingBottom: Math.max(insetBottom, 18)}]}>
        <PrimaryButton testID="onboarding-register" label={ready ? '등록 완료' : '러닝화를 선택하세요'} onPress={submit} disabled={!ready} />
        <Text style={s.ctaCaption}>등록하면 바로 러닝을 시작할 수 있어요 · 신발은 나중에 더 추가할 수 있어요</Text>
      </View>

      <ShoePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={setPicked}
        insetTop={insetTop}
        insetBottom={insetBottom}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 오케스트레이터
// ════════════════════════════════════════════════════════════════════════════
type ScreenProps = {
  goNext: () => void;
  onSkip: () => void;
  insetTop: number;
  insetBottom: number;
};

export default function OnboardingScreen({onDone}: {onDone: (registered: RegisteredShoe | null) => void}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const goNext = () => setIndex(i => Math.min(3, i + 1));
  // 기존 계정 링크: 인증 게이트는 온보딩보다 먼저라 이미 로그인 상태 — 소개를 건너뛰고
  // 즉시 완료 처리한다(과거 Ready 인터스티셜 제거, 동일 종착지).
  const goLogin = () => onDone(null);
  const onSkip = () => onDone(null);
  const common = {insetTop: insets.top, insetBottom: insets.bottom, onSkip, goNext};

  // 각 화면은 index 전환 시 마운트/언마운트되므로, 도착할 때마다 Rise 진입이 1회 재생된다.
  return (
    <ReduceMotionCtx.Provider value={reduceMotion}>
      <View testID="onboarding" style={{flex: 1, backgroundColor: BG}}>
        {index === 0 && <Welcome goNext={goNext} goLogin={goLogin} insetTop={insets.top} insetBottom={insets.bottom} />}
        {index === 1 && <ShoeIntelligence {...common} />}
        {index === 2 && <Performance {...common} />}
        {index === 3 && <Register insetTop={insets.top} insetBottom={insets.bottom} onSkip={onSkip} onComplete={onDone} />}
      </View>
    </ReduceMotionCtx.Provider>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 스타일
// ════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  flowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(24), paddingBottom: rv(6)},
  skip: {fontFamily: FONT, fontSize: TYPE.label.fontSize, color: T4, fontWeight: '500'},
  flex1: {flex: 1},
  bodyContent: {flexGrow: 1, paddingHorizontal: rs(24), paddingTop: rv(16)},
  eyebrow: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 1.4, color: ACCENT, textTransform: 'uppercase', marginBottom: rv(12)},
  title: {fontFamily: FONT, fontSize: TYPE.title1.fontSize, lineHeight: rf(33), fontWeight: '700', letterSpacing: -0.6, color: T1},
  body: {fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(23), color: T3, marginTop: rv(12), maxWidth: rs(360)},
  bodyStrong: {color: T1, fontWeight: '600'},

  // Welcome — 헤드라인 88→64→48 재축소(사용자 확정 2026-07-07).
  heroHeadline: {fontFamily: DISPLAY, fontSize: rf(48), lineHeight: rf(52), letterSpacing: -1.5, fontWeight: '600', color: T1},
  heroSub: {fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600', color: T1, marginTop: rv(18)},
  heroBody: {fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(22), color: 'rgba(246,246,248,0.66)', marginTop: rv(8)},
  termsCaption: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T4, textAlign: 'center', lineHeight: rf(17), marginTop: rv(14)},

  footer: {paddingHorizontal: rs(24), paddingTop: rv(8)},
  ctaCaption: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T3, textAlign: 'center', marginTop: rv(10)},

  // 신발 인텔리전스
  // 불투명 CARD 판 → 반투명 유리(GLASS.fill) — GlassEdge(유리 엣지)를 쓰면서 판만 불투명이던
  // 본편 세대차 해소(검수 HIGH 잔여, 2026-07-17). 본편 4탭 카드와 같은 재질.
  heroCard: {marginTop: rv(24), borderRadius: rs(22), borderCurve: 'continuous', backgroundColor: GLASS.fill},
  shoeRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(12),
    marginTop: rv(14),
    paddingVertical: rv(16),
    paddingHorizontal: rs(16),
    borderRadius: rs(22), borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: GLASS.fill,
  },
  shoeThumb: {width: rs(44), height: rs(44), borderRadius: rs(12), borderCurve: 'continuous', backgroundColor: withAlpha(T1, 0.06), alignItems: 'center', justifyContent: 'center'},
  pill: {flexDirection: 'row', alignItems: 'center', gap: rv(6), paddingVertical: rv(4), paddingHorizontal: rs(10), borderRadius: 100, alignSelf: 'center'},
  alertRow: {flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(22), paddingHorizontal: rs(2)},

  // 성능(기능 목록)
  featCard: {marginTop: rv(24), paddingHorizontal: rs(18), paddingVertical: rv(4), borderRadius: rs(22), borderCurve: 'continuous', overflow: 'hidden', backgroundColor: GLASS.fill},
  featRow: {flexDirection: 'row', alignItems: 'center', gap: rv(14), paddingVertical: rv(18)},
  featRowDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  featIc: {width: rs(38), height: rs(38), borderRadius: rs(11), borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center'},

  // 등록
  fieldBadge: {width: rs(20), height: rs(20), borderRadius: rs(6), backgroundColor: withAlpha(T1, 0.08), alignItems: 'center', justifyContent: 'center'},
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(10),
    height: rs(48),
    marginTop: rv(10),
    paddingHorizontal: rs(14),
    borderRadius: rs(14), borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: GLASS.fill,
  },
  selectorText: {flex: 1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', color: T1, letterSpacing: -0.2},
  fieldHint: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T3, marginTop: rv(8), lineHeight: rf(17)},
  kmVal: {fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '600', color: T1, letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  kmUnit: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', color: T3, letterSpacing: 0.5},
  tick: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T4},
});
