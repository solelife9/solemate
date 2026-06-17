// ============================================================================
// OnboardingScreen.rn.tsx — Keego 첫 실행 온보딩 (6-screen cinematic flow)
//
// design_handoff_keego_onboarding 핸드오프를 React Native로 재현한다:
//   0 Welcome → 1 Shoes Matter → 2 Injury → 3 Management → 4 Register → 5 Ready
// 프로토타입(HTML/React)을 시각·인터랙션 스펙으로 삼아 RN 패턴으로 옮겼다.
//
// - 큰 숫자/헤드라인은 디스플레이 페이스(theme DISPLAY=Pretendard), 본문은 FONT(Pretendard).
// - 그라데이션/링/마모 곡선은 react-native-svg(앱에 expo-linear-gradient 미설치).
// - 등록 단계는 프로토타입과 동일하게 화면-로컬 상태로 동작하고, 완료 시 onDone로
//   브랜드/모델/거리를 상위(App)에 넘겨 실제 신발 등록에 연결할 수 있게 한다.
// - 완료 영속(AsyncStorage 'onboarded')은 App.tsx가 onDone 콜백에서 처리한다.
// ============================================================================
import React, {useContext, useEffect, useId, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ImageBackground,
  PanResponder,
  ActivityIndicator,
  Animated,
  Easing,
  AccessibilityInfo,
  StyleProp,
  ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
// 신발 브랜드/모델·권장수명은 data/shoeModels(단일 소스)에서 — 메인 AddShoe 화면과 동일.
import {BRANDS, modelsForBrand, getRecommendedLifespanKm} from './data/shoeModels';
import Svg, {
  Circle,
  Path,
  G,
  Rect,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import {
  BG,
  CARD,
  ACCENT,
  ACCENT_2,
  GOOD,
  WARN,
  DANGER,
  T1,
  T3,
  T4,
  SEP,
  FONT,
  DISPLAY,
  withAlpha,
} from './theme';
import {Button} from './primitives';

// ── 디자인 토큰 흡수 ──────────────────────────────────────────────────────────
// 과거 이 화면은 자체 다크 팔레트(const KG)와 BebasNeue 디스플레이 별칭(DISP)을 들고
// 있었으나, 메인 앱과 단일 소스를 공유하도록 theme.ts 토큰으로 흡수했다(시각 동등):
//   bg→BG · card→CARD · orange→ACCENT · green→GOOD · amber→WARN · red→DANGER ·
//   text→T1 · dim→T3 · faint→T4 · line→SEP · line2→withAlpha(T1,.14). 디스플레이/본문
//   폰트는 DISPLAY/FONT(둘 다 Pretendard — 핸드오프 정합). 알파 틴트는 withAlpha 로
//   토큰에서 파생해 raw rgba desync 를 막는다. 시네마틱 그라데이션 스톱(장식)만 인라인.

type StatusKey = 'good' | 'caution' | 'replace';
const STATUS: Record<StatusKey, {c: string; label: string; bg: string}> = {
  good: {c: GOOD, label: '좋음', bg: withAlpha(GOOD, 0.14)},
  caution: {c: WARN, label: '점검', bg: withAlpha(WARN, 0.14)},
  replace: {c: DANGER, label: '교체 권장', bg: withAlpha(DANGER, 0.14)},
};
function statusFor(km: number, max: number): StatusKey {
  const r = km / max;
  if (r >= 0.9) return 'replace';
  if (r >= 0.6) return 'caution';
  return 'good';
}

// 관리 화면 데모용 신발(핸드오프 데이터).
const SHOES = [
  {id: 'alphafly', brand: 'Nike', model: 'Alphafly 3', km: 118, max: 500},
  {id: 'novablast', brand: 'ASICS', model: 'Novablast 5', km: 540, max: 800},
  {id: 'adios', brand: 'adidas', model: 'Adizero Adios Pro 4', km: 752, max: 800},
];

export type RegisteredShoe = {brand: string; model: string; km: number; max: number};

// ════════════════════════════════════════════════════════════════════════════
// 모션(진입 stagger / 카운트업 / 링 드로우 / 컨페티)
//
// 핸드오프의 시네마틱 진입을 RN 내장 Animated로 재현한다(reanimated 미설치).
// 접근성: '동작 줄이기'가 켜져 있으면 모든 애니메이션을 끄고 최종 상태를 즉시 보여준다.
// ════════════════════════════════════════════════════════════════════════════
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// jest 워커에서는 타이머 기반 애니메이션을 건너뛰고 최종 상태를 즉시 보여준다(reduce-motion
// 과 동일 취급). 실제 앱 런타임엔 JEST_WORKER_ID가 없어 애니메이션이 정상 동작한다. 테스트
// teardown 뒤 잔여 Animated 타이머가 워커를 붙잡는 leak을 원천 차단한다.
const SKIP_ANIM = !!(typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID);

// 트리 전역으로 reduce-motion 플래그를 내려, 모든 모션 헬퍼가 동일 값을 공유한다.
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
    // JS 드라이버(useNativeDriver:false): 단발 진입(opacity/translate)이라 성능 영향이
    // 미미하고, 네이티브 드라이버는 jest 환경에 NativeAnimated 모듈이 없어 throw한다.
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

// 0 → target 카운트업 정수. animate=false(예: 슬라이더 실시간 값)거나 reduce-motion이면
// 즉시 target을 따라간다.
function useCountUp(target: number, animate = true, duration = 1200): number {
  const rm = useContext(ReduceMotionCtx);
  const [val, setVal] = useState(rm || SKIP_ANIM || !animate ? target : 0);
  useEffect(() => {
    if (rm || SKIP_ANIM || !animate) {
      setVal(target);
      return;
    }
    const a = new Animated.Value(0);
    const id = a.addListener(({value}) => setVal(Math.round(value)));
    const anim = Animated.timing(a, {toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false});
    anim.start();
    return () => {
      anim.stop();
      a.removeListener(id);
    };
  }, [target, animate, duration, rm]);
  return val;
}

// 등록 성공 컨페티(가벼운 낙하). reduce-motion이면 렌더 안 함.
const CONFETTI_COLORS = [ACCENT, ACCENT_2, GOOD, WARN, '#fff'];
function Confetti() {
  const rm = useContext(ReduceMotionCtx);
  const pieces = useMemo(
    () =>
      Array.from({length: 16}, (_, i) => ({
        leftPct: Math.round((i / 16) * 100),
        size: 6 + Math.round(Math.random() * 6),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.round(Math.random() * 400),
        drift: Math.round((Math.random() - 0.5) * 40),
        rounded: i % 2 === 0,
      })),
    [],
  );
  if (rm || SKIP_ANIM) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} {...p} />
      ))}
    </View>
  );
}
function ConfettiPiece({leftPct, size, color, delay, drift, rounded}: {leftPct: number; size: number; color: string; delay: number; drift: number; rounded: boolean}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(t, {toValue: 1, duration: 1400, delay, easing: Easing.in(Easing.quad), useNativeDriver: false});
    anim.start();
    return () => anim.stop();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: `${leftPct}%`,
        width: size,
        height: size,
        borderRadius: rounded ? size / 2 : 2,
        backgroundColor: color,
        opacity: t.interpolate({inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0]}),
        transform: [
          {translateY: t.interpolate({inputRange: [0, 1], outputRange: [-20, 620]})},
          {translateX: t.interpolate({inputRange: [0, 1], outputRange: [0, drift]})},
          {rotate: t.interpolate({inputRange: [0, 1], outputRange: ['0deg', '420deg']})},
        ],
      }}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 공용 프리미티브
// ════════════════════════════════════════════════════════════════════════════

// 세로형 선형 그라데이션을 절대 레이어로 깐다(카드 배경·레전더빌리티 페이드).
// react-native-svg 의 <Stop> 은 stopColor 의 rgba 알파를 무시하고 불투명으로 칠한다.
// 따라서 'rgba(r,g,b,a)' 를 rgb 색 + stopOpacity 로 분리해 넘겨야 투명 페이드가 실제로
// 비친다(미분리 시 페이드가 불투명 판이 되어 아래 이미지를 가린다). hex/rgb 는 그대로.
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
    // pointerEvents none: 장식용 절대 레이어가 위에 깔려도 아래 Pressable(버튼)/칩 터치를 가로채지 않게 한다.
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

// 진행 링(상태색 단색 + 배경 트랙). center 라벨은 children으로.
function ProgressRing({
  size,
  stroke,
  progress,
  color,
  children,
  animate = true,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  children?: React.ReactNode;
  animate?: boolean;
}) {
  const rm = useContext(ReduceMotionCtx);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const target = c * (1 - p);
  // 정적이면(예: 등록 프리뷰처럼 슬라이더로 실시간 갱신) 바로 target. 진입 시엔 빈
  // 원(offset=c)에서 target까지 stroke-dashoffset을 그려 링이 채워지는 연출.
  const off = useRef(new Animated.Value(rm || SKIP_ANIM || !animate ? target : c)).current;
  useEffect(() => {
    if (rm || SKIP_ANIM || !animate) {
      off.setValue(target);
      return;
    }
    const anim = Animated.timing(off, {toValue: target, duration: 1200, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: false});
    anim.start();
    return () => anim.stop();
  }, [off, target, c, rm, animate]);
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={size} height={size} style={{position: 'absolute', transform: [{rotate: '-90deg'}]}}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
        />
      </Svg>
      {children}
    </View>
  );
}

// 수명 링(중앙: km / max KM). 진입 시 링 드로우 + km 카운트업.
function LifespanRing({km, max, size = 128, stroke = 11, animate = true}: {km: number; max: number; size?: number; stroke?: number; animate?: boolean}) {
  const col = STATUS[statusFor(km, max)].c;
  const shown = useCountUp(km, animate);
  return (
    <ProgressRing size={size} stroke={stroke} progress={km / max} color={col} animate={animate}>
      <View style={{alignItems: 'center'}}>
        <Text style={{fontFamily: DISPLAY, fontSize: Math.round(size * 0.3), color: T1}}>{shown}</Text>
        <Text style={{fontFamily: FONT, fontSize: 11, color: T3, marginTop: 2, letterSpacing: 0.5}}>/ {max} KM</Text>
      </View>
    </ProgressRing>
  );
}

// 잔여수명 % 링(중앙: NN%). animate=false면 링/숫자 즉시(예: 등록 프리뷰 실시간 갱신).
function PctRing({pct, color, size = 72, stroke = 7, animate = true}: {pct: number; color: string; size?: number; stroke?: number; animate?: boolean}) {
  const shown = useCountUp(pct, animate);
  return (
    <ProgressRing size={size} stroke={stroke} progress={pct / 100} color={color} animate={animate}>
      <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
        <Text style={{fontFamily: DISPLAY, fontSize: Math.round(size * 0.3), color: '#fff'}}>{shown}</Text>
        <Text style={{fontFamily: FONT, fontSize: Math.round(size * 0.16), color: T3}}>%</Text>
      </View>
    </ProgressRing>
  );
}

function Metric({
  value,
  unit,
  size = 40,
  color = '#fff',
  unitColor = T4,
  countUp = false,
}: {
  value: string | number;
  unit?: string;
  size?: number;
  color?: string;
  unitColor?: string;
  countUp?: boolean;
}) {
  const us = Math.max(12, Math.round(size * 0.4));
  // 숫자 값일 때만 0→value 카운트업. 문자열("500–800","1,410")은 그대로 표시.
  const numeric = typeof value === 'number';
  const counted = useCountUp(numeric ? value : 0, countUp && numeric);
  const display = numeric ? counted : value;
  return (
    <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
      <Text style={{fontFamily: DISPLAY, fontSize: size, color, letterSpacing: 0.2}}>{display}</Text>
      {unit ? (
        <Text style={{fontFamily: FONT, fontSize: us, fontWeight: '600', color: unitColor, marginLeft: Math.max(5, Math.round(size * 0.14))}}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

// 상단 진행 세그먼트 바(현재=24px 흰 알약, 나머지=7px 점).
function TopProgress({step, total}: {step: number; total: number}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
      {Array.from({length: total}).map((_, i) => {
        const cur = i === step - 1;
        return (
          <View
            key={i}
            style={{width: cur ? 24 : 7, height: 3.5, borderRadius: 3, backgroundColor: cur ? '#fff' : 'rgba(255,255,255,0.2)'}}
          />
        );
      })}
    </View>
  );
}

function Eyebrow({children}: {children: React.ReactNode}) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

function StatusPill({status}: {status: StatusKey}) {
  const st = STATUS[status];
  return (
    <View style={[s.pill, {backgroundColor: st.bg}]}>
      <View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: st.c}} />
      <Text style={{color: st.c, fontFamily: FONT, fontSize: 13, fontWeight: '600'}}>{st.label}</Text>
    </View>
  );
}

// 온보딩 1차 CTA. 과거엔 자체 LinearGrad(오렌지 그라데이션) + cta 스타일로 주황
// 그라데이션 버튼을 복제했으나, 앱 전역 단일 Button 프리미티브로 위임한다(그라데이션은
// GRAD_TOP/BOT 토큰·글로우·radius 토큰 일원화 — 중복 그라데이션 정의 제거). 시각 동등.
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

function Chip({label, active, onPress, small}: {label: string; active: boolean; onPress: () => void; small?: boolean}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected: active}}
      style={({pressed}) => [
        s.chip,
        small && s.chipSmall,
        active ? s.chipActive : s.chipIdle,
        pressed && {opacity: 0.8},
      ]}>
      <Text style={[s.chipLabel, {color: active ? '#fff' : T1, fontSize: small ? 13 : 13.5}]}>{label}</Text>
    </Pressable>
  );
}

function WearBar({pct, color}: {pct: number; color: string}) {
  return (
    <View style={{width: '100%', height: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden'}}>
      <View style={{height: '100%', borderRadius: 6, width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color}} />
    </View>
  );
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
  // 접근성: 스크린리더가 트랙을 '조절 가능' 슬라이더로 읽고 현재/최소/최대 km 를 announce
  // 한다. adjustmentAction(증가/감소)으로 step 만큼 키보드/제스처 조절도 지원한다.
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
      style={{height: 26, justifyContent: 'center'}}>
      <View style={{position: 'absolute', left: 0, right: 0, height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.09)'}} />
      <View style={{position: 'absolute', left: 0, width: pct * w, height: 8, borderRadius: 8, backgroundColor: ACCENT}} />
      <View
        style={{
          position: 'absolute',
          left: pct * w - 13,
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: '#fff',
          borderWidth: 5,
          borderColor: ACCENT,
        }}
      />
    </View>
  );
}

// Keego 앱마크: 내구도 게이지(마모=오렌지, 잔여=흐림)가 'K'를 감싼다.
function KeegoMark({size = 34, fill = 0.62}: {size?: number; fill?: number}) {
  const gid = `kg-mark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const R = 16.5,
    cx = 20,
    cy = 20,
    gap = 34;
  const pt = (deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  const start = 90 + gap,
    end = 90 - gap + 360;
  const [sx, sy] = pt(start);
  const [ex, ey] = pt(end);
  const [fx, fy] = pt(start + (end - start) * fill);
  const big = end - start > 180 ? 1 : 0;
  const bigF = (end - start) * fill > 180 ? 1 : 0;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <SvgGradient id={gid} x1="6" y1="34" x2="34" y2="6" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FF5A00" />
          <Stop offset="1" stopColor="#FFA63A" />
        </SvgGradient>
      </Defs>
      <Path d={`M${sx.toFixed(2)} ${sy.toFixed(2)} A${R} ${R} 0 ${big} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`} stroke="rgba(255,255,255,0.18)" strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <Path d={`M${sx.toFixed(2)} ${sy.toFixed(2)} A${R} ${R} 0 ${bigF} 1 ${fx.toFixed(2)} ${fy.toFixed(2)}`} stroke={`url(#${gid})`} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <G stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M15.5 11.5 V28.5" />
        <Path d="M15.5 20.2 L24 12" />
        <Path d="M15.5 19.8 L24.5 28.5" />
      </G>
    </Svg>
  );
}

// ── 인라인 라인 아이콘 ────────────────────────────────────────────────────────
function SparkIcon({size = 18, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" fill={color} />
    </Svg>
  );
}
function HeartIcon({size = 17, color = T3}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 20s-7-4.6-7-9.5A4.5 4.5 0 0112 7a4.5 4.5 0 017 3.5C19 15.4 12 20 12 20z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
function RulerIcon({size = 17, color = T3}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="8" width="18" height="8" rx="1.5" stroke={color} strokeWidth={1.8} />
      <Path d="M7 8v3M11 8v4M15 8v3M19 8v4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
function CheckIcon({size = 44, color = '#fff'}: {size?: number; color?: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── 소셜 로그인 마크 ──────────────────────────────────────────────────────────
function KakaoMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.7 6.6-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.3.1 1.9.1 5.5 0 10-3.5 10-7.8S17.5 3 12 3z" fill="#191600" />
    </Svg>
  );
}
function NaverMark() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M14.5 3v8.3L9.4 3H3v18h6.5v-8.3L14.6 21H21V3z" fill="#fff" />
    </Svg>
  );
}
function GoogleMark() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Path d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <Path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z" fill="#34A853" />
      <Path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 002 12c0 1.6.4 3.2 1.1 4.6L6.4 14z" fill="#FBBC05" />
      <Path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0012 2 10 10 0 003.1 7.4l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9z" fill="#EA4335" />
    </Svg>
  );
}

// 화면 1~5 공통 상단(진행 바 + 건너뛰기).
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
// 0 · Welcome
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
        <LinearGrad x1={0} y1={0} x2={1} y2={1} stops={[{color: 'rgba(255,101,0,0.30)', offset: 0}, {color: 'rgba(255,101,0,0)', offset: 0.55}]} />
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

      {/* 워드마크 */}
      <Text style={[s.wordmark, {top: insetTop + 18}]}>KEEGO</Text>

      {/* 하단 콘텐츠 — staggered 진입 */}
      <View style={{flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: Math.max(insetBottom, 24) + 8}}>
        <Rise delay={80}>
          <Text style={s.heroHeadline}>
            KEEP{'\n'}GOING<Text style={{color: ACCENT}}>.</Text>
          </Text>
        </Rise>
        <Rise delay={220}>
          <Text style={s.heroSub}>멈추지 않는 발걸음을 위해</Text>
        </Rise>
        <Rise delay={320}>
          <Text style={s.heroBody}>Keego가 러닝화 수명을 추적해, 부상 없이{'\n'}끝까지 달릴 수 있도록 돕습니다.</Text>
        </Rise>
        <Rise delay={440} style={{marginTop: 26}}>
          <PrimaryButton testID="onboarding-start" label="시작하기" onPress={goNext} />
          {/* 이미 계정이 있는 사용자: 온보딩 투어를 건너뛰고 곧장 로그인(Ready) 화면으로.
              과거 버그 — 이 링크가 goNext()를 불러 '다음 온보딩 단계'로 갈 뿐 로그인이
              아니었다. 이제 goLogin()이 마지막 로그인 화면(소셜/이메일 인증)으로 점프한다. */}
          <Pressable
            testID="onboarding-login"
            onPress={goLogin}
            hitSlop={8}
            style={{alignItems: 'center', marginTop: 14}}
            accessibilityRole="button"
            accessibilityLabel="이미 계정이 있나요? 로그인">
            <Text style={{fontFamily: FONT, fontSize: 14, color: T3, fontWeight: '500'}}>
              이미 계정이 있나요? <Text style={{color: '#fff'}}>로그인</Text>
            </Text>
          </Pressable>
        </Rise>
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · Shoes Matter
// ════════════════════════════════════════════════════════════════════════════
function DegradeCurve() {
  const line = 'M6 18 C 70 22, 120 34, 180 70 S 300 120, 354 132';
  const area = 'M6 18 C 70 22, 120 34, 180 70 S 300 120, 354 132 L354 150 L6 150 Z';
  return (
    <Svg viewBox="0 0 360 150" width="100%" height={92}>
      <Defs>
        <SvgGradient id="kg-dg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="rgba(55,214,122,0.30)" />
          <Stop offset="1" stopColor="rgba(255,77,77,0.02)" />
        </SvgGradient>
        <SvgGradient id="kg-dl" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#37D67A" />
          <Stop offset="0.6" stopColor="#FFB23E" />
          <Stop offset="1" stopColor="#FF4D4D" />
        </SvgGradient>
      </Defs>
      <Rect x="270" y="0" width="90" height="150" fill="rgba(255,77,77,0.08)" />
      <Path d="M270 0 L270 150" stroke="rgba(255,77,77,0.3)" strokeWidth={1} strokeDasharray="3 4" />
      <Path d={area} fill="url(#kg-dg)" />
      <Path d={line} fill="none" stroke="url(#kg-dl)" strokeWidth={3} strokeLinecap="round" />
      <Circle cx="354" cy="132" r="5.5" fill="#FF4D4D" />
    </Svg>
  );
}

function ShoesMatter({goNext, onSkip, insetTop, insetBottom}: ScreenProps) {
  return (
    <View style={s.screen}>
      <FlowHeader step={1} total={5} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <Rise>
          <Eyebrow>Your shoes matter</Eyebrow>
          <Text style={s.title}>러닝화도 관리가 필요합니다</Text>
          <Text style={s.body}>
            러닝화는 <Text style={s.bodyStrong}>누적 거리에 따라 성능이 달라집니다.</Text> 쿠셔닝이 닳은 신발은 충격을 그대로 무릎과 발목에 전달합니다.
          </Text>
        </Rise>

        {/* 마모 곡선 카드 */}
        <Rise delay={130} style={[s.heroCard, {overflow: 'hidden'}]}>
          <LinearGrad stops={[{color: '#1A1A1F', offset: 0}, {color: '#141417', offset: 1}]} radius={22} />
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, paddingBottom: 0}}>
            <View>
              <Text style={{fontFamily: FONT, fontSize: 13, color: T3}}>당신의 데일리 러닝화</Text>
              <Text style={{fontFamily: FONT, fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 2}}>
                누적 <Text style={{color: DANGER}}>742 km</Text>
              </Text>
            </View>
            <StatusPill status="replace" />
          </View>
          <View style={{paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
              <Text style={{fontFamily: FONT, fontSize: 12, color: T4, letterSpacing: 0.8}}>쿠셔닝 성능</Text>
              <Text style={{fontFamily: FONT, fontSize: 12, color: T4}}>0 → 800 KM</Text>
            </View>
            <DegradeCurve />
          </View>
        </Rise>

        {/* 권장 수명 팩트 스트립 */}
        <Rise delay={240} style={s.factStrip}>
          <View>
            <Text style={{fontFamily: FONT, fontSize: 14, color: T3}}>러닝화 권장 수명</Text>
            <Metric value="500–800" unit="KM" size={30} />
          </View>
          <Text style={{marginLeft: 'auto', fontFamily: FONT, fontSize: 13, color: T3, textAlign: 'right', lineHeight: 18}}>
            대부분의 러너가{'\n'}이 시기를 놓칩니다
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
// 2 · Injury
// ════════════════════════════════════════════════════════════════════════════
function Injury({goNext, onSkip, insetTop, insetBottom}: ScreenProps) {
  return (
    <View style={s.screen}>
      <FlowHeader step={2} total={5} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <Rise>
          <Eyebrow>Run injury free</Eyebrow>
          <Text style={s.title}>부상 없이 오래 달리세요</Text>
          <Text style={s.body}>
            Keego가 신발 마일리지를 추적해 <Text style={s.bodyStrong}>교체 시기를 미리</Text> 알려드려요.
          </Text>
        </Rise>

        {/* 링 히어로 */}
        <Rise delay={130} style={[s.heroCard, {flexDirection: 'row', alignItems: 'center', gap: 18, padding: 14, overflow: 'hidden'}]}>
          <LinearGrad stops={[{color: '#1E1E24', offset: 0}, {color: '#141417', offset: 1}]} radius={22} />
          <LifespanRing km={540} max={800} size={104} stroke={9} />
          <View style={{flex: 1}}>
            <StatusPill status="caution" />
            <Text style={{fontFamily: FONT, fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 10}}>ASICS Novablast 5</Text>
            <Text style={{fontFamily: FONT, fontSize: 13, color: T3, marginTop: 3, lineHeight: 19}}>
              수명의 <Text style={{color: WARN, fontWeight: '600'}}>68%</Text>를 사용했어요.
            </Text>
          </View>
        </Rise>

        {/* 분석 그리드 */}
        <Rise delay={240} style={{flexDirection: 'row', gap: 12, marginTop: 10}}>
          <View style={[s.analyticCard, {flex: 1}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8}}>
              <HeartIcon />
              <Text style={{fontFamily: FONT, fontSize: 13, color: T3}}>충격 흡수율</Text>
            </View>
            <Metric value={78} unit="%" size={32} countUp />
            <View style={{marginTop: 8}}>
              <WearBar pct={78} color={WARN} />
            </View>
          </View>
          <View style={[s.analyticCard, {flex: 1}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8}}>
              <RulerIcon />
              <Text style={{fontFamily: FONT, fontSize: 13, color: T3}}>교체까지</Text>
            </View>
            <Metric value={260} unit="KM" size={32} countUp />
            <Text style={{fontFamily: FONT, fontSize: 12, color: T3, marginTop: 8}}>약 3주 후 예상</Text>
          </View>
        </Rise>

        {/* 알림 배너 */}
        <Rise delay={340} style={s.alertBanner}>
          <View style={s.alertIconChip}>
            <SparkIcon size={18} color={ACCENT} />
          </View>
          <Text style={{flex: 1, fontFamily: FONT, fontSize: 14, color: T1, lineHeight: 19}}>
            교체 시점 <Text style={{color: ACCENT, fontWeight: '600'}}>50 km 전</Text> 미리 알림을 보내드려요.
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
// 3 · Management
// ════════════════════════════════════════════════════════════════════════════
function ShoeCard({shoe}: {shoe: (typeof SHOES)[number]}) {
  const st = statusFor(shoe.km, shoe.max);
  const col = STATUS[st].c;
  const remain = Math.round((1 - shoe.km / shoe.max) * 100);
  const isReplace = st === 'replace';
  return (
    <View style={[s.shoeCard, isReplace && {borderColor: 'rgba(255,77,77,0.28)'}]}>
      <PctRing pct={remain} color={col} size={56} stroke={6} />
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={s.brandEyebrow}>{shoe.brand.toUpperCase()}</Text>
        <Text numberOfLines={1} style={{fontFamily: FONT, fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 2}}>
          {shoe.model}
        </Text>
        <Text style={{fontFamily: FONT, fontSize: 14, color: T3, marginTop: 7}}>
          {shoe.km.toLocaleString()} / {shoe.max.toLocaleString()} km
          <Text style={{color: T4}}> · </Text>
          <Text style={{color: col, fontWeight: '600'}}>{STATUS[st].label}</Text>
        </Text>
      </View>
    </View>
  );
}

function Management({goNext, onSkip, insetTop, insetBottom}: ScreenProps) {
  return (
    <View style={s.screen}>
      <FlowHeader step={3} total={5} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <Rise>
          <Eyebrow>Smart shoe management</Eyebrow>
          <Text style={s.title}>신발 수명을 한눈에</Text>
        </Rise>

        {/* 요약 히어로 */}
        <Rise delay={120} style={[s.summaryHero, {marginTop: 12}]}>
          <View>
            <Text style={{fontFamily: FONT, fontSize: 12, color: T3, letterSpacing: 0.8}}>전체 누적 거리</Text>
            <Metric value="1,410" unit="KM" size={40} unitColor={T3} />
          </View>
          <View style={{alignItems: 'flex-end'}}>
            <Text style={{fontFamily: DISPLAY, fontSize: 34, color: '#fff'}}>3</Text>
            <Text style={{fontFamily: FONT, fontSize: 12, color: T3}}>켤레 관리 중</Text>
          </View>
        </Rise>

        {/* 신발 리스트 — 카드별 stagger */}
        <View style={{marginTop: 10, gap: 8}}>
          {SHOES.map((sh, i) => (
            <Rise key={sh.id} delay={220 + i * 90}>
              <ShoeCard shoe={sh} />
            </Rise>
          ))}
        </View>

        {/* 추천 스트립 */}
        <Rise delay={220 + SHOES.length * 90} style={s.recoStrip}>
          <SparkIcon size={18} color={DANGER} />
          <Text style={{flex: 1, fontFamily: FONT, fontSize: 14, color: T1, lineHeight: 19}}>
            <Text style={{fontWeight: '700'}}>Adizero Adios Pro 4</Text> 교체 시기예요. 새 러닝화를 추천받아 보세요.
          </Text>
        </Rise>
      </ScrollView>
      <View style={[s.footer, {paddingBottom: Math.max(insetBottom, 18)}]}>
        <PrimaryButton label="내 신발 등록하기" onPress={goNext} />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · Register (interactive)
// ════════════════════════════════════════════════════════════════════════════
function FieldLabel({n, label}: {n: string; label: string}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 9}}>
      <View style={s.fieldBadge}>
        <Text style={{fontFamily: FONT, fontSize: 12, fontWeight: '700', color: T3}}>{n}</Text>
      </View>
      <Text style={{fontFamily: FONT, fontSize: 14, fontWeight: '600', color: T1}}>{label}</Text>
    </View>
  );
}

function Register({goNext, onSkip, onRegister, insetTop, insetBottom}: ScreenProps & {onRegister: (r: RegisteredShoe) => void}) {
  const [brand, setBrand] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const [km, setKm] = useState(60);
  const [done, setDone] = useState(false);
  const ready = !!brand && !!model;
  // 권장 수명은 선택한 브랜드/모델 기준(data/shoeModels) — 메인 AddShoe 화면과 동일.
  const max = useMemo(() => getRecommendedLifespanKm({brand: brand ?? undefined, model: model ?? undefined}), [brand, model]);
  // 모델 변경으로 권장수명이 줄면 기존 누적거리 입력이 수명을 넘지 않도록 클램프.
  useEffect(() => { setKm(k => Math.min(k, max)); }, [max]);
  const st = statusFor(km, max);
  const col = STATUS[st].c;
  const remain = Math.round((1 - km / max) * 100);

  const submit = () => {
    if (!ready) return;
    onRegister({brand: brand!, model: model!, km, max});
    setDone(true);
  };

  return (
    <View style={s.screen}>
      <FlowHeader step={4} total={5} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={s.bodyContent} showsVerticalScrollIndicator={false}>
        <Rise>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <SparkIcon size={15} color={ACCENT} />
            <Text style={[s.eyebrow, {marginBottom: 0}]}>거의 다 왔어요</Text>
          </View>
          <Text style={[s.title, {fontSize: 22}]}>첫 러닝화를{'\n'}등록해볼까요?</Text>
          <Text style={s.body}>지금 신고 있는 러닝화를 등록하면{'\n'}Keego가 수명을 추적해드려요.</Text>
        </Rise>

        {/* 라이브 프리뷰 카드 */}
        <Rise delay={120} style={[s.previewCard, {borderColor: ready ? 'rgba(255,101,0,0.3)' : SEP, overflow: 'hidden'}]}>
          <LinearGrad stops={[{color: '#1C1C22', offset: 0}, {color: '#141417', offset: 1}]} radius={18} />
          <PctRing pct={remain} color={col} size={52} stroke={6} animate={false} />
          <View style={{flex: 1, minWidth: 0, marginLeft: 14}}>
            <Text style={s.brandEyebrow}>{brand || '브랜드'}</Text>
            <Text numberOfLines={1} style={{fontFamily: FONT, fontSize: 16, fontWeight: '700', color: model ? '#fff' : T4, marginTop: 2}}>
              {model || '모델을 선택하세요'}
            </Text>
            <Text style={{fontFamily: FONT, fontSize: 13, color: T3, marginTop: 5}}>
              {km.toLocaleString()} / {max} km
              <Text style={{color: T4}}> · </Text>
              <Text style={{color: col, fontWeight: '600'}}>{STATUS[st].label}</Text>
            </Text>
          </View>
        </Rise>

        {/* 1 브랜드 */}
        <View style={{marginTop: 12}}>
          <FieldLabel n="1" label="브랜드" />
          <View style={s.chipWrap}>
            {BRANDS.map(b => (
              <Chip
                key={b}
                label={b}
                active={brand === b}
                onPress={() => {
                  setBrand(b);
                  setModel(null);
                }}
              />
            ))}
          </View>
        </View>

        {/* 2 모델 */}
        <View style={{marginTop: 12}}>
          <FieldLabel n="2" label="모델" />
          {brand ? (
            <View style={s.chipWrap}>
              {modelsForBrand(brand).map(m => (
                <Chip key={m} label={m} active={model === m} onPress={() => setModel(m)} />
              ))}
            </View>
          ) : (
            <Text style={{fontFamily: FONT, fontSize: 13, color: T4, marginTop: 8, paddingVertical: 3}}>브랜드를 먼저 선택하세요</Text>
          )}
        </View>

        {/* 3 구매 시기 */}
        <View style={{marginTop: 12}}>
          <FieldLabel n="3" label="구매 시기" />
          <View style={s.chipWrap}>
            {['1개월 이내', '3개월', '6개월', '직접 입력'].map(w => (
              <Chip key={w} label={w} active={when === w} onPress={() => setWhen(w)} small />
            ))}
          </View>
        </View>

        {/* 4 현재 누적 거리 */}
        <View style={{marginTop: 12}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <FieldLabel n="4" label="현재 누적 거리" />
            <Metric value={km} unit="KM" size={22} />
          </View>
          <View style={{marginTop: 10}}>
            <KmSlider value={km} min={0} max={max} step={10} onChange={setKm} />
            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 6}}>
              <Text style={s.tick}>새 신발</Text>
              <Text style={s.tick}>{Math.round(max / 2)} km</Text>
              <Text style={s.tick}>{max} km+</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 스티키 CTA */}
      <View style={[s.footer, {paddingBottom: Math.max(insetBottom, 18)}]}>
        <PrimaryButton label={ready ? '등록 완료' : '브랜드와 모델을 선택하세요'} onPress={submit} disabled={!ready} />
      </View>

      {done && (
        <View style={s.successOverlay}>
          <Confetti />
          <View style={s.successBadge}>
            <CheckIcon size={44} />
          </View>
          <Text style={{fontFamily: DISPLAY, fontSize: 46, color: '#fff', marginTop: 24}}>등록 완료!</Text>
          <Text style={{fontFamily: FONT, fontSize: 15, color: T3, marginTop: 12, lineHeight: 22, textAlign: 'center'}}>
            <Text style={{color: '#fff', fontWeight: '600'}}>
              {brand} {model}
            </Text>
            {'\n'}이제 Keego가 {km}km부터 수명을 추적해드려요.
          </Text>
          <View style={{width: '100%', marginTop: 30}}>
            <PrimaryButton label="마지막 단계로" onPress={goNext} />
          </View>
        </View>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · Ready
// ════════════════════════════════════════════════════════════════════════════
function LoginBtn({
  label,
  bg,
  color,
  border,
  icon,
  busy,
  onPress,
}: {
  label: string;
  bg: string;
  color: string;
  border?: boolean;
  icon: React.ReactNode;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [
        s.loginBtn,
        {backgroundColor: bg},
        border && {borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)'},
        pressed && !busy && {transform: [{scale: 0.98}]},
      ]}>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          <View style={{position: 'absolute', left: 18}}>{icon}</View>
          <Text style={{fontFamily: FONT, fontSize: 16, fontWeight: '600', color}}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function Ready({registered, onFinish, onSkip, insetTop, insetBottom}: ScreenProps & {registered: RegisteredShoe | null; onFinish: () => void}) {
  const [busy, setBusy] = useState<string | null>(null);
  // 신발 요약 카드는 *실제로 등록한 신발이 있을 때만* 보여준다. 과거엔 폴백
  // {Nike Alphafly 3, 60/600}을 깔아 두었는데, '이미 계정이 있나요? 로그인'으로 진입한
  // 복귀 유저(registered=null)에게 그 날조 신발 + '추적 시작됨' + '이제 달릴 준비가
  // 되었습니다' 축하문구가 노출돼 오해를 줬다(날조 금지 위배). 등록이 없으면 카드를
  // 숨기고 헤드라인/본문을 로그인 맥락으로 바꾼다.
  const shoe = registered;
  const st = shoe ? statusFor(shoe.km, shoe.max || 600) : 'good';
  const col = STATUS[st].c;
  const remain = shoe ? Math.round((1 - shoe.km / (shoe.max || 600)) * 100) : 0;
  const press = (k: string) => {
    setBusy(k);
    setTimeout(() => {
      setBusy(null);
      onFinish();
    }, 1200);
  };
  return (
    <View style={s.screen}>
      {/* 상단 글로우 */}
      <LinearGrad
        x1={0}
        y1={0}
        x2={0}
        y2={1}
        style={{height: 260}}
        stops={[{color: 'rgba(255,101,0,0.22)', offset: 0}, {color: 'rgba(255,101,0,0)', offset: 0.65}]}
      />
      <FlowHeader step={5} total={5} onSkip={onSkip} insetTop={insetTop} />
      <ScrollView style={s.flex1} contentContainerStyle={[s.bodyContent, {alignItems: 'center'}]} showsVerticalScrollIndicator={false}>
        <Rise>
          <View style={s.readyBadge}>
            <KeegoMark size={30} />
          </View>
        </Rise>
        <Rise delay={120} style={{alignSelf: 'stretch'}}>
          <Text style={[s.title, {textAlign: 'center', marginTop: 14}]}>
            {shoe ? '이제 달릴 준비가\n되었습니다' : '다시 오신 걸\n환영합니다'}
          </Text>
          <Text style={[s.body, {textAlign: 'center'}]}>
            {shoe ? 'Keego와 함께 더 오래,\n더 건강하게 달리세요.' : '로그인하고 이어서 달려보세요.'}
          </Text>
        </Rise>

        {/* 등록 신발 요약 — 실제 등록한 신발이 있을 때만(로그인 진입 시엔 숨김, 날조 금지) */}
        {shoe && (
          <Rise delay={240} style={[s.readyShoeCard, {alignSelf: 'stretch'}]}>
            <PctRing pct={remain} color={col} size={52} stroke={6} />
            <View style={{flex: 1, minWidth: 0, marginLeft: 15}}>
              <Text style={[s.brandEyebrow, {fontSize: 11}]}>추적 시작됨</Text>
              <Text numberOfLines={1} style={{fontFamily: FONT, fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 1}}>
                {shoe.brand} {shoe.model}
              </Text>
              <Text style={{fontFamily: FONT, fontSize: 13, color: T3, marginTop: 5}}>
                {shoe.km.toLocaleString()} / {(shoe.max || 600).toLocaleString()} km
                <Text style={{color: T4}}> · </Text>
                <Text style={{color: col, fontWeight: '600'}}>{STATUS[st].label}</Text>
              </Text>
            </View>
          </Rise>
        )}
      </ScrollView>

      {/* 로그인 */}
      <View style={[s.footer, {paddingBottom: Math.max(insetBottom, 18), gap: 10}]}>
        <LoginBtn label="카카오로 시작하기" bg="#FEE500" color="#191600" icon={<KakaoMark />} busy={busy === 'kakao'} onPress={() => press('kakao')} />
        <LoginBtn label="네이버로 시작하기" bg="#03C75A" color="#fff" icon={<NaverMark />} busy={busy === 'naver'} onPress={() => press('naver')} />
        <LoginBtn label="Google로 시작하기" bg="#fff" color="#1A1A1A" border icon={<GoogleMark />} busy={busy === 'google'} onPress={() => press('google')} />
        <Pressable
          testID="onboarding-email-login"
          onPress={() => press('email')}
          hitSlop={8}
          style={{alignItems: 'center', marginTop: 6}}
          accessibilityRole="button"
          accessibilityLabel="이메일로 계속하기">
          <Text style={{fontFamily: FONT, fontSize: 15, color: T3, fontWeight: '500'}}>이메일로 계속하기</Text>
        </Pressable>
        <Text style={{fontFamily: FONT, fontSize: 11, color: T4, textAlign: 'center', lineHeight: 17, marginTop: 8}}>
          계속 진행하면 Keego의 <Text style={{textDecorationLine: 'underline'}}>이용약관</Text>과 <Text style={{textDecorationLine: 'underline'}}>개인정보 처리방침</Text>에{'\n'}동의하는 것으로 간주됩니다.
        </Text>
      </View>
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
  const [registered, setRegistered] = useState<RegisteredShoe | null>(null);
  const goNext = () => setIndex(i => Math.min(5, i + 1));
  // 로그인 진입: 기존 계정 사용자는 온보딩 소개(1~4)를 건너뛰고 마지막 인증 화면(Ready,
  // index 5)으로 곧장 간다. 거기 소셜/이메일 로그인이 끝나면 onFinish→onDone 로 온보딩이
  // 종료되고 App 이 로그인 후 홈으로 전환한다.
  const goLogin = () => setIndex(5);
  const onSkip = () => onDone(null);
  const common = {insetTop: insets.top, insetBottom: insets.bottom, onSkip, goNext};

  // 각 화면은 index 전환 시 마운트/언마운트되므로, 도착할 때마다 Rise 진입이 1회 재생된다.
  return (
    <ReduceMotionCtx.Provider value={reduceMotion}>
      <View testID="onboarding" style={{flex: 1, backgroundColor: BG}}>
        {index === 0 && <Welcome goNext={goNext} goLogin={goLogin} insetTop={insets.top} insetBottom={insets.bottom} />}
        {index === 1 && <ShoesMatter {...common} />}
        {index === 2 && <Injury {...common} />}
        {index === 3 && <Management {...common} />}
        {index === 4 && <Register {...common} onRegister={setRegistered} />}
        {index === 5 && <Ready {...common} registered={registered} onFinish={() => onDone(registered)} />}
      </View>
    </ReduceMotionCtx.Provider>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 스타일
// ════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  flowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 6},
  skip: {fontFamily: FONT, fontSize: 13, color: T4, fontWeight: '500'},
  // 본문은 ScrollView로 감싸되 contentContainerStyle에 flexGrow:1을 줘, 콘텐츠가 화면에
  // 들어오면 스크롤이 생기지 않고(=한 화면), 넘칠 때만 스크롤된다. footer(CTA)는 ScrollView
  // 바깥 형제로 항상 하단에 고정돼 어떤 선택 상태에서도 사라지지 않는다.
  flex1: {flex: 1},
  bodyContent: {flexGrow: 1, paddingHorizontal: 24, paddingTop: 8},
  eyebrow: {fontFamily: FONT, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: ACCENT, textTransform: 'uppercase', marginBottom: 6},
  title: {fontFamily: FONT, fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -0.5, color: T1},
  body: {fontFamily: FONT, fontSize: 14, lineHeight: 19, color: T3, marginTop: 8, maxWidth: 360},
  bodyStrong: {color: '#fff', fontWeight: '600'},

  // Welcome
  wordmark: {position: 'absolute', left: 24, fontFamily: DISPLAY, fontSize: 26, letterSpacing: 1.2, color: '#fff'},
  // lineHeight 90: 맥의 'KEEP GOING' 헤드라인 글자 잘림 수정 보존(76→90).
  heroHeadline: {fontFamily: DISPLAY, fontSize: 88, lineHeight: 90, color: '#fff'},
  heroSub: {fontFamily: FONT, fontSize: 17, fontWeight: '600', color: '#fff', marginTop: 18},
  heroBody: {fontFamily: FONT, fontSize: 15, lineHeight: 22, color: 'rgba(246,246,248,0.66)', marginTop: 7},

  // CTA
  // CTA 사각 스타일(cta/ctaGhost/ctaGloss/ctaLabel)은 단일 Button 프리미티브로
  // 대체하며 제거했다(PrimaryButton 참조).

  footer: {paddingHorizontal: 24, paddingTop: 8},

  // cards
  heroCard: {marginTop: 12, borderRadius: 22, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  factStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
    padding: 13,
    borderRadius: 18,
    backgroundColor: 'rgba(255,101,0,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,101,0,0.22)',
  },
  analyticCard: {padding: 13, borderRadius: 18, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
  },
  alertIconChip: {width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,101,0,0.14)', alignItems: 'center', justifyContent: 'center'},

  // Management
  summaryHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,101,0,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,101,0,0.22)',
  },
  shoeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 13,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
  },
  brandEyebrow: {fontFamily: FONT, fontSize: 12, color: T4, letterSpacing: 0.7},
  recoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,77,77,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,77,77,0.22)',
  },

  // Register
  previewCard: {marginTop: 12, padding: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1},
  chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8},
  chip: {paddingVertical: 7, paddingHorizontal: 13, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth},
  chipSmall: {paddingVertical: 6, paddingHorizontal: 11},
  chipIdle: {backgroundColor: 'rgba(255,255,255,0.05)', borderColor: withAlpha(T1, 0.14)},
  chipActive: {backgroundColor: ACCENT, borderColor: ACCENT},
  chipLabel: {fontFamily: FONT, fontWeight: '600', letterSpacing: -0.1},
  fieldBadge: {width: 20, height: 20, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center'},
  tick: {fontFamily: FONT, fontSize: 11, color: T4},
  pill: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 100, alignSelf: 'flex-start'},
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,8,10,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Ready
  readyBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    marginTop: 14,
    backgroundColor: 'rgba(255,101,0,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,101,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyShoeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    alignSelf: 'stretch',
  },
  loginBtn: {height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row'},
});
