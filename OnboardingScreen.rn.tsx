// ============================================================================
// OnboardingScreen.rn.tsx — keego 첫 실행 온보딩 (3-screen flow)
//
// 2026-07-22 심사 #8: 소개 3화면(신발 인텔리전스·성능·성취)을 가치 1화면으로 압축 —
// 화면당 이탈 누적을 줄이고 등록(가치)까지 최단 경로로. 구성:
//   0 Welcome(훅) → 1 가치(마모 곡선 + 핵심 3행) → 2 등록
// (2026-07-07 재설계의 4화면 구성은 이 압축의 전신 — 사용자 승인 목업 f0755f95 계보.)
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
  StyleSheet,
  Pressable,
  ScrollView,
  ImageBackground,
  PanResponder,
  Animated,
  Linking,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {Text, FONT_SCALE_CAP_HERO} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {PRIVACY_URL, TERMS_URL} from './lib/legalLinks';
// 신발 브랜드/모델·권장수명은 data/shoeModels(단일 소스)에서 — 메인 AddShoe 화면과 동일.
import {getRecommendedLifespanKm} from './data/shoeModels';
import Svg, {
  Circle,
  Path,
  Rect,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import {
  BG,
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
  T2,
  T3,
  T4,
  SEP,
  FONT,
  DISPLAY,
  withAlpha, TYPE, GLASS,
  GUTTER, RADIUS, MOTION,
  ICON,
} from './theme';
import {Button, KeegoWordmark, GlassEdge, useReduceMotion} from './primitives';
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

// useReduceMotion 은 primitives 공용 훅을 소비한다(로컬 복붙 삭제, 2026-07-25).
// ReduceMotionCtx 공급/소비 구조는 그대로 — 훅 소스만 교체.

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
    // 시간·커브는 전역 Rise 표준(MOTION.rise)과 동일 — 로컬 구현은 reduce-motion 대응 때문에만 유지.
    const anim = Animated.timing(a, {toValue: 1, duration: MOTION.rise.dur, delay, easing: MOTION.ease.out, useNativeDriver: false});
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
    <View
      accessible
      accessibilityLabel={`${total}단계 중 ${step}`}
      style={{flexDirection: 'row', alignItems: 'center', gap: rv(4)}}>
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
      // 트랙 실높이 rs(26) < 44pt — hitSlop 으로 실효 터치 타깃을 TOUCH_TARGET 이상 확보.
      hitSlop={12}
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
function PulseIcon({size = 18, color = T1}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12h4l2.5-6.5L14 18l2.5-6H21" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
// 업적 = 정식 5각 별 아웃라인 — 손그림 4각 스파클은 작은 크기에서 형태가 뭉개졌다
// (실기기 "저게 뭐야", 2026-07-17 — 셀러브레이션 글리프 v2 때와 같은 교훈).
function TrophyIcon({size = 18, color = T1}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7.5 4h9v6a4.5 4.5 0 0 1-9 0V4z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M7.5 6H4.5c0 2.5 1.4 4 3 4.2M16.5 6h3c0 2.5-1.4 4-3 4.2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 14.5V19M8.5 19.5h7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
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
      <KeegoWordmark size={ri(ICON.feature)} style={{position: 'absolute', left: GUTTER, top: insetTop + 18}} />

      {/* 하단 콘텐츠 — staggered 진입 */}
      <View style={{flex: 1, justifyContent: 'flex-end', paddingHorizontal: GUTTER, paddingBottom: Math.max(insetBottom, 24) + 8}}>
        <Rise delay={80}>
          <Text maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} style={s.heroHeadline}>
            {/* 마침표 = 파파야 서명(keego 워드마크와 같은 문법). ACCENT 가 흰색으로 회수되며
                흰 마침표로 서명이 소실됐던 것 복원(검수 HIGH, 2026-07-16). */}
            KEEP{'\n'}GOING<Text style={{color: BRAND}}>.</Text>
          </Text>
        </Rise>
        <Rise delay={220}>
          <Text style={s.heroSub}>멈추지 않는 발걸음을 위해</Text>
        </Rise>
        <Rise delay={320}>
          <Text style={s.heroBody}>keego가 러닝화 수명을 추적해,{'\n'}부상 없이 평생 달리도록 도와요.</Text>
        </Rise>
        <Rise delay={440} style={{marginTop: rv(26)}}>
          <PrimaryButton testID="onboarding-start" label="시작하기" onPress={goNext} />
          {/* 소개 스킵 — 인증 게이트(LoginScreen)는 온보딩보다 먼저이므로 여기 도달한
              시점엔 이미 로그인돼 있다. 구 카피 "이미 계정이 있나요? 로그인"은 실제 동작
              (온보딩 완료→홈)과 달라 기대 위반이라 정직한 라벨로 교체(심사 #2, 2026-07-22). */}
          <Pressable
            testID="onboarding-skip-intro"
            onPress={goLogin}
            hitSlop={8}
            style={{alignItems: 'center', marginTop: rv(14)}}
            accessibilityRole="button"
            accessibilityLabel="건너뛰고 시작하기">
            <Text style={{fontFamily: FONT, fontSize: TYPE.body.fontSize, color: T3, fontWeight: '500'}}>
              건너뛰고 <Text style={{color: T1}}>시작하기</Text>
            </Text>
          </Pressable>
          {/* 약관 고지 — Ready 화면 제거(2026-07-07 재설계)로 첫 CTA 아래로 이전.
              링크는 인라인 Text onPress(터치 = 글줄 높이뿐, hitSlop 불가) 대신 Pressable 로 —
              paddingVertical + hitSlop 12 로 실효 44pt 터치 타깃 확보(HIG). */}
          <View style={s.termsRow}>
            <Text style={s.termsCaption}>계속 진행하면 keego의 </Text>
            <Pressable
              hitSlop={12}
              accessibilityRole="link"
              accessibilityLabel="이용약관 열기"
              onPress={() => { Linking.openURL(TERMS_URL).catch(() => {}); }}
              style={({pressed}) => [s.termsLink, pressed && s.pressed]}>
              <Text style={[s.termsCaption, s.termsLinkTxt]}>이용약관</Text>
            </Pressable>
            <Text style={s.termsCaption}>과 </Text>
            <Pressable
              hitSlop={12}
              accessibilityRole="link"
              accessibilityLabel="개인정보 처리방침 열기"
              onPress={() => { Linking.openURL(PRIVACY_URL).catch(() => {}); }}
              style={({pressed}) => [s.termsLink, pressed && s.pressed]}>
              <Text style={[s.termsCaption, s.termsLinkTxt]}>개인정보 처리방침</Text>
            </Pressable>
            <Text style={s.termsCaption}>에 동의하는 것으로 간주돼요.</Text>
          </View>
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
      {/* 위험 구간 틴트/기준선 — DANGER 토큰 파생(구 rgba(255,77,77) 는 토큰과 어긋난 사본). */}
      <Rect x="270" y="0" width="90" height="150" fill={withAlpha(DANGER, 0.08)} />
      <Path d="M270 0 L270 150" stroke={withAlpha(DANGER, 0.3)} strokeWidth={1} strokeDasharray="3 4" />
      <Path d={area} fill="url(#kg-dg)" />
      <Path d={line} fill="none" stroke="url(#kg-dl)" strokeWidth={3} strokeLinecap="round" />
      <Circle cx="354" cy="132" r="5.5" fill={DANGER} />
    </Svg>
  );
}

function ShoeIntelligence({goNext, onSkip, insetTop, insetBottom}: ScreenProps) {
  return (
    <View style={s.screen}>
      <FlowHeader step={1} total={2} onSkip={onSkip} insetTop={insetTop} />
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
          <LinearGrad stops={[{color: ONBOARD_CARD_GRAD_TOP, offset: 0}, {color: ONBOARD_CARD_GRAD_BOT, offset: 1}]} radius={RADIUS.lg} />
          <GlassEdge glints={false} radius={RADIUS.lg} />
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

        {/* 핵심 가치 3행(심사 #8) — 구 성능·성취 화면을 요약해 흡수. 상세 서사는
            제품이 스스로 증명한다(교체 알림·정밀 측정·쌓이는 기록). */}
        <FeatureListCard delay={240} items={VALUE_ROWS} />
      </ScrollView>
      <View style={[s.footer, {paddingBottom: Math.max(insetBottom, 18)}]}>
        <PrimaryButton label="다음" onPress={goNext} />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 가치 화면 보조(심사 #8) — 구 성능(FEATURES)·성취(LEGACY) 목록을 3행 요약으로 압축.
// 가짜 개인 숫자 금지(신규 유저 첫 실행은 '측정 전') · 색은 의미로만.
// ════════════════════════════════════════════════════════════════════════════
type FeatureRow = {color: string; Icon: (p: {size?: number; color?: string}) => React.JSX.Element; title: string; desc: string};
const VALUE_ROWS: FeatureRow[] = [
  // 기능 아이콘은 Ember 가드레일 밖(브랜드색은 서명·진행 지표 전용) — 무채 T2 로.
  {color: T2, Icon: BellIcon, title: '교체 알림', desc: '교체 시점 50km 전, 미리 알려드려요'},
  {color: BEST, Icon: PulseIcon, title: '정밀 측정', desc: '심폐 체력·경사 보정 페이스·트랙 모드 — 폰만으로'},
  {color: HALL_GOLD, Icon: TrophyIcon, title: '쌓이는 기록', desc: '거리 PB·업적·메달 아카이브 — 달리다 보면 하나씩 열려요'},
];

// 기능 목록 카드 한 장(성능·성취 공용 문법 — 사용자 확정 "카드는 한통으로").
function FeatureListCard({items, delay = 130}: {items: FeatureRow[]; delay?: number}) {
  return (
    <Rise delay={delay} style={s.featCard}>
      <GlassEdge glints={false} radius={RADIUS.lg} />
      {items.map((f, i) => (
        <View key={f.title} style={[s.featRow, i > 0 && s.featRowDivider]} accessible accessibilityLabel={`${f.title}: ${f.desc}`}>
          <View style={[s.featIc, {backgroundColor: withAlpha(f.color, 0.14)}]}>
            <f.Icon size={ri(ICON.action)} color={f.color} />
          </View>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={{fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', color: T1, letterSpacing: -0.2}}>{f.title}</Text>
            <Text style={{fontFamily: FONT, fontSize: TYPE.label.fontSize, color: T3, marginTop: rv(3), lineHeight: rf(18)}}>{f.desc}</Text>
          </View>
        </View>
      ))}
    </Rise>
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

function Register({onSkip, onComplete, insetTop, insetBottom}: Omit<ScreenProps, 'goNext'> & {onComplete: (r: RegisteredShoe, weightKg?: number) => void}) {
  const [picked, setPicked] = useState<PickedShoe | null>(null);
  const [km, setKm] = useState(0);
  // 몸무게(선택) — null = 미설정(내구도 계수 1, 기존과 동일). 슬라이더를 건드리면 실제값이 잡힌다.
  const [weight, setWeight] = useState<number | null>(null);
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
    // 몸무게는 미설정(null)이면 넘기지 않는다 — 설정 기본값을 덮어쓰지 않도록(선택 존중).
    onComplete({brand: picked.brand, model: picked.model, km, max}, weight ?? undefined);
  };

  return (
    <View style={s.screen}>
      <FlowHeader step={2} total={2} onSkip={onSkip} insetTop={insetTop} />
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
            style={({pressed}) => [s.selector, pressed && s.pressed]}>
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

        {/* 3 몸무게(선택) — 러너 체중을 반영하면 수명 계산이 더 정확해진다(무거울수록 빨리 닳음).
            미설정이면 넘기지 않아 기존과 동일(계수 1). 나중에 설정에서 조정 가능. */}
        <Rise delay={340} style={{marginTop: rv(22)}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <FieldLabel n="3" label="몸무게 · 선택" />
            <Text style={s.kmVal}>
              {weight != null ? weight : '—'}<Text style={s.kmUnit}> KG</Text>
            </Text>
          </View>
          <View style={{marginTop: rv(14)}}>
            <KmSlider value={weight ?? 65} min={40} max={120} step={1} onChange={setWeight} />
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: rv(6)}}>
              <Text style={s.tick}>40</Text>
              <Text style={s.tick}>80</Text>
              <Text style={s.tick}>120 kg</Text>
            </View>
          </View>
          <Text style={[s.fieldHint, {marginTop: rv(10)}]}>몸무게를 입력하면 러닝화 수명을 더 정확히 계산해요.</Text>
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

export default function OnboardingScreen({onDone}: {onDone: (registered: RegisteredShoe | null, weightKg?: number) => void}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const goNext = () => setIndex(i => Math.min(2, i + 1));
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
        {index === 2 && <Register insetTop={insets.top} insetBottom={insets.bottom} onSkip={onSkip} onComplete={onDone} />}
      </View>
    </ReduceMotionCtx.Provider>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 스타일
// ════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  // 누름 표준(MOTION.press) — 사설 opacity 값 폐지.
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  flowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingBottom: rv(6)},
  // 인터랙티브 텍스트는 T4(장식/disabled 전용) 금지 — 정보성 최저 톤 T3.
  skip: {fontFamily: FONT, fontSize: TYPE.label.fontSize, color: T3, fontWeight: '500'},
  flex1: {flex: 1},
  bodyContent: {flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: rv(16)},
  eyebrow: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 1.4, color: ACCENT, textTransform: 'uppercase', marginBottom: rv(12)},
  title: {fontFamily: FONT, fontSize: TYPE.title1.fontSize, lineHeight: rf(33), fontWeight: '700', letterSpacing: -0.6, color: T1},
  body: {fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(23), color: T3, marginTop: rv(12), maxWidth: rs(360)},
  bodyStrong: {color: T1, fontWeight: '600'},

  // Welcome — 헤드라인 88→64→48 재축소(사용자 확정 2026-07-07).
  heroHeadline: {fontFamily: DISPLAY, fontSize: rf(48), lineHeight: rf(52), letterSpacing: -1.5, fontWeight: '600', color: T1},
  heroSub: {fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600', color: T1, marginTop: rv(18)},
  heroBody: {fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(22), color: 'rgba(246,246,248,0.66)', marginTop: rv(8)},
  // 약관 고지 — 정보성(법적 안내)이라 T4→T3 승격. 링크는 Pressable(44pt 확보) 조각으로 배열.
  termsRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: rv(10)},
  termsCaption: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T3, lineHeight: rf(17)},
  termsLink: {paddingVertical: rv(6)},
  termsLinkTxt: {textDecorationLine: 'underline'},

  footer: {paddingHorizontal: GUTTER, paddingTop: rv(8)},
  ctaCaption: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T3, textAlign: 'center', marginTop: rv(10)},

  // 신발 인텔리전스
  // 불투명 CARD 판 → 반투명 유리(GLASS.fill) — GlassEdge(유리 엣지)를 쓰면서 판만 불투명이던
  // 본편 세대차 해소(검수 HIGH 잔여, 2026-07-17). 본편 4탭 카드와 같은 재질.
  heroCard: {marginTop: rv(24), borderRadius: RADIUS.lg, borderCurve: 'continuous', backgroundColor: GLASS.fill},
  shoeRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(12),
    marginTop: rv(14),
    paddingVertical: rv(16),
    paddingHorizontal: rs(16),
    borderRadius: RADIUS.lg, borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: GLASS.fill,
  },
  shoeThumb: {width: rs(44), height: rs(44), borderRadius: rs(12), borderCurve: 'continuous', backgroundColor: withAlpha(T1, 0.06), alignItems: 'center', justifyContent: 'center'},
  pill: {flexDirection: 'row', alignItems: 'center', gap: rv(6), paddingVertical: rv(4), paddingHorizontal: rs(10), borderRadius: RADIUS.pill, alignSelf: 'center'},
  alertRow: {flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(22), paddingHorizontal: rs(2)},

  // 성능(기능 목록)
  featCard: {marginTop: rv(24), paddingHorizontal: rs(18), paddingVertical: rv(4), borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: GLASS.fill},
  featRow: {flexDirection: 'row', alignItems: 'center', gap: rv(14), paddingVertical: rv(18)},
  featRowDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP},
  featIc: {width: rs(38), height: rs(38), borderRadius: RADIUS.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center'},

  // 등록
  fieldBadge: {width: rs(20), height: rs(20), borderRadius: rs(6), backgroundColor: withAlpha(T1, 0.08), alignItems: 'center', justifyContent: 'center'},
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(10),
    minHeight: rs(48),
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
  // 슬라이더 눈금 — 값 판독에 쓰이는 정보성 라벨이라 T4→T3 승격.
  tick: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, color: T3},
});
