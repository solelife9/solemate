// ============================================================================
// primitives.tsx — shared Keego UI primitives
// Ring · TabBar · Button · Card · Pill/Badge(TierBadge) · Metric ·
// KeegoWordmark · SectionTitle · status-color helpers.
// All colour/spacing/radius/type values come from theme tokens (no raw hex).
// Deps: react-native-svg, react-native-vector-icons
// ============================================================================
import React, {useId, useMemo, useRef, useState, useEffect, useContext} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {
  View,
  Text,
  Image,
  Pressable,
  Animated,
  Easing,
  PanResponder,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BlurView} from '@react-native-community/blur';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  RadialGradient as SvgRadialGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import {
  BG,
  CARD,
  CARD_DIM,
  CARD_HI,
  ACCENT,
  ACCENT_2,
  WARN,
  DANGER,
  GOOD,
  T1,
  T2,
  T3,
  SEP,
  CARD_BORDER,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  TYPE,
  GLASS,
  BRAND,
  withAlpha,
} from './theme';
import {tap as hapticTap} from './lib/haptics';
import {tierBadge, ShoeCondition, type WearTierTone} from './lib/shoe';
import {InjuryLevel} from './lib/injury';

// ── Status colour helpers (single mapping shoeHealth.condition → colour/tone) ──
// shoeHealth 의 condition 을 화면 색/배지 톤으로 옮기는 단일 소스. 양호=GOOD,
// 주의=WARN, 교체=DANGER. 화면은 raw hex 대신 이 helper(=theme 토큰)를 쓴다.
export type Tone = 'good' | 'warn' | 'danger' | 'accent' | 'dim';

export function conditionColor(condition: ShoeCondition): string {
  if (condition === '교체') return DANGER;
  if (condition === '주의') return WARN;
  return GOOD;
}

// 마모 4단계(wearTier) 톤 → theme 토큰. 최상🟢/양호🟡/교체고려🟠/교체권장🔴 —
// 홈 히어로·신발 탭·러닝 목표가 같은 매핑을 쓴다(FuelGauge 와 동일 값, 공용 소스).
export const WEAR_TONE_COLOR: Record<WearTierTone, string> = {
  good: GOOD, mid: WARN, warn: ACCENT, danger: DANGER,
};

// ── Stepper — ± 조정 컨트롤 단일 프리미티브(2026-07-04 DS 감사) ─────────────────
// 화면마다 손구현되던 스텝퍼(마이 탭 46/r14 · 챌린지 44/r14·40/r12 · 스피드 38/r19)를
// 하나로: [−] 중앙값 [+]. 중앙은 value+suffix 기본 렌더 또는 children 으로 교체
// (스피드 패널처럼 자체 표시가 필요한 곳). 버튼 = size² · RADIUS.input · CARD_HI.
export function Stepper({
  value,
  suffix = '',
  onMinus,
  onPlus,
  size = 46,
  minusLabel,
  plusLabel,
  children,
  style,
}: {
  value?: number | string;
  /** 단위/이름 — 중앙 보조 라벨 + 기본 a11y 라벨('{suffix} 줄이기/늘리기')에 쓴다. */
  suffix?: string;
  onMinus: () => void;
  onPlus: () => void;
  /** 버튼 한 변(pt). 기본 46 — 좁은 곳은 38~44. */
  size?: number;
  minusLabel?: string;
  plusLabel?: string;
  /** 중앙 커스텀 렌더(기본 value/suffix 대체). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const btn = (pressed: boolean): StyleProp<ViewStyle> => [
    {
      width: size, height: size, borderRadius: RADIUS.input, borderCurve: 'continuous',
      backgroundColor: pressed ? CARD : CARD_HI, alignItems: 'center', justifyContent: 'center',
    },
  ];
  return (
    <View style={[{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rv(14)}, style]}>
      <Pressable onPress={onMinus} hitSlop={8} accessibilityRole="button"
        accessibilityLabel={minusLabel ?? `${suffix} 줄이기`} style={({pressed}) => btn(pressed)}>
        <Ionicons name="remove" size={ri(20)} color={T1} />
      </Pressable>
      {children ?? (
        <View style={{flex: 1, alignItems: 'center'}} accessible accessibilityLabel={`${value} ${suffix}`}>
          <Text style={{color: T1, fontFamily: DISPLAY, fontSize: rf(30), letterSpacing: 0.3}}>{value}</Text>
          {!!suffix && <Text style={{color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '600', marginTop: rv(2)}}>{suffix}</Text>}
        </View>
      )}
      <Pressable onPress={onPlus} hitSlop={8} accessibilityRole="button"
        accessibilityLabel={plusLabel ?? `${suffix} 늘리기`} style={({pressed}) => btn(pressed)}>
        <Ionicons name="add" size={ri(20)} color={T1} />
      </Pressable>
    </View>
  );
}

// ── Chip — 선택형 필터 칩 단일 프리미티브(2026-07-04 DS 감사) ────────────────────
// 화면마다 높이·모서리·선택색이 다르던 필터 칩(카운트다운 h32 · 히스토리 · 신발추가
// h40 · 온보딩 r11)을 하나로: pill 라디우스, 기본 CARD_HI 표면, 선택 시 오렌지 틴트
// (Pill accent 톤과 동일 문법). 콘텐츠가 복잡하면 children 으로.
export function Chip({
  label,
  selected = false,
  onPress,
  size = 'md',
  disabled = false,
  accessibilityLabel,
  testID,
  style,
  children,
}: {
  label?: string;
  selected?: boolean;
  onPress?: () => void;
  /** sm=h32(밀집 필터 행) · md=h40(기본). */
  size?: 'sm' | 'md';
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const h = size === 'sm' ? 32 : 40;
  // 시각 높이는 유지하되 hitSlop 으로 44pt 터치 타깃 확보(HIG) — sm +6/+6, md +2/+2.
  const slop = Math.max(0, Math.ceil((44 - h) / 2));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={{top: slop, bottom: slop, left: 0, right: 0}}
      accessibilityRole="button"
      accessibilityState={{selected, disabled}}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={({pressed}) => [
        {
          height: h, paddingHorizontal: size === 'sm' ? 12 : 15,
          borderRadius: RADIUS.pill, borderCurve: 'continuous',
          alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: rv(6),
          backgroundColor: selected ? withAlpha(ACCENT, 0.16) : CARD_HI,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: selected ? withAlpha(ACCENT, 0.55) : 'transparent',
        },
        pressed && {opacity: 0.8},
        disabled && {opacity: 0.4},
        style,
      ]}>
      {children ?? (
        <Text style={{
          fontFamily: FONT, fontSize: size === 'sm' ? 13 : 14,
          fontWeight: selected ? '700' : '600',
          color: selected ? ACCENT : T2,
        }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function conditionTone(condition: ShoeCondition): Tone {
  if (condition === '교체') return 'danger';
  if (condition === '주의') return 'warn';
  return 'good';
}

// 톤별 전경/반투명 배경. 배경은 theme 의 GOOD/WARN/DANGER/ACCENT 토큰에서
// withAlpha(…, 0.15) 로 파생하므로 토큰 색을 바꾸면 반투명 배경도 함께 따라간다
// (수동 rgba 복제 없음 = 단일 진실원). dim 은 CARD_HI 표면.
const TONE_FG: Record<Tone, string> = {
  good: GOOD,
  warn: WARN,
  danger: DANGER,
  accent: ACCENT,
  dim: T3,
};
export const TONE_BG: Record<Tone, string> = {
  good: withAlpha(GOOD, 0.15),
  warn: withAlpha(WARN, 0.15),
  danger: withAlpha(DANGER, 0.15),
  accent: withAlpha(ACCENT, 0.15),
  dim: CARD_HI,
};

// ── GlassEdge — 유리 엣지(코너 글린트 림) ─────────────────────────────────────
// 애플 유리 문법(2026-07-09 사용자 확정 — 목업 'B 대각 밸런스', theme.GLASS 단일 진실원):
//   · 전 둘레 헤어라인(GLASS.edgeBase) — 빛이 닿지 않는 변에서도 유리 판이 끊기지 않는다.
//   · 코너 글린트 4점: 좌상 주광(edgeTL) · 우하 반사(edgeBR) · 우상/좌하(edgeTR/BL)는
//     헤어라인 근처로 잦아듦. 각 글린트 = 그 코너 중심의 방사형 그라데이션 스트로크라
//     코너를 '감싸며' 인접 두 변으로 감쇠한다. (구 대각선 위치투영 모델은 넓은 버튼에서
//     좌우 변이 완전히 꺼져 위아래 줄무늬만 남았다 — 종횡비 무관한 배광으로 근본 수정.)
//   · sheen: 표면 상단 안쪽 광택(GLASS.sheen → 0, 42% 지점 소멸) — 유리 면의 빛맺힘.
//   · intensity: 활성/히어로 강조 배율(GLASS.activeIntensity) — 굵은 활성 보더의 대체.
// id 는 생략 가능(useId 자동 — 같은 화면 다중 인스턴스 안전). radius 는 부모 모서리와 동일값.

export function GlassEdge({
  id,
  radius,
  strokeWidth = 1,
  intensity = 1,
  sheen = true,
}: {
  id?: string;
  radius: number;
  strokeWidth?: number;
  intensity?: number;
  sheen?: boolean;
}) {
  const autoId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = id ?? `glass-${autoId}`;
  const [s, setS] = useState({w: 0, h: 0});
  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    setS({w: width, h: height});
  };
  // 스트로크는 자기 굵기의 절반만큼 안쪽으로 들여 부모 경계 안에만 그린다(클립 불필요).
  const edge = (sw: number) => ({
    x: sw / 2,
    y: sw / 2,
    width: s.w - sw,
    height: s.h - sw,
    rx: Math.max(0, Math.min(radius - sw / 2, (s.w - sw) / 2)),
  });
  const op = (v: number) => Math.min(1, v * intensity);
  // 글린트 반경 — 긴 변의 0.8: 빛이 인접 두 변을 따라 멀리 여행하며 반대편 코너 근처에서
  // 거의 소멸한다(기기 피드백: "멀어질수록 자연스럽게 옅어지게"). 감쇠는 4스톱 이징 —
  // 스톱이 적으면 코너 아크→직선 전환부에서 밝기 단차가 보인다(기기 피드백).
  const R = Math.max(s.w, s.h) * 0.8;
  const corners = [
    {key: 'tl', cx: 0, cy: 0, peak: GLASS.edgeTL},
    {key: 'tr', cx: s.w, cy: 0, peak: GLASS.edgeTR},
    {key: 'br', cx: s.w, cy: s.h, peak: GLASS.edgeBR},
    {key: 'bl', cx: 0, cy: s.h, peak: GLASS.edgeBL},
  ].filter(c => c.peak > 0.005);
  return (
    <View testID="glass-edge" pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {s.w > 1 ? (
        <Svg width={s.w} height={s.h}>
          <Defs>
            {corners.map(c => (
              <SvgRadialGradient
                key={c.key}
                id={`${gid}-${c.key}`} gradientUnits="userSpaceOnUse"
                cx={c.cx} cy={c.cy} fx={c.cx} fy={c.cy} rx={R} ry={R}>
                <Stop offset="0" stopColor={T1} stopOpacity={op(c.peak)} />
                <Stop offset="0.35" stopColor={T1} stopOpacity={op(c.peak * 0.42)} />
                <Stop offset="0.7" stopColor={T1} stopOpacity={op(c.peak * 0.12)} />
                <Stop offset="1" stopColor={T1} stopOpacity={0} />
              </SvgRadialGradient>
            ))}
            {sheen ? (
              <SvgGradient id={`${gid}-sheen`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={T1} stopOpacity={GLASS.sheen} />
                <Stop offset="0.42" stopColor={T1} stopOpacity={0} />
                <Stop offset="1" stopColor={T1} stopOpacity={0} />
              </SvgGradient>
            ) : null}
          </Defs>
          {/* 상단 광택(면 채움) → 헤어라인(전 둘레) → 코너 글린트 4점 순으로 쌓는다. */}
          {sheen ? (
            <Rect
              x={0} y={0} width={s.w} height={s.h}
              rx={Math.max(0, Math.min(radius, s.w / 2, s.h / 2))}
              fill={`url(#${gid}-sheen)`}
            />
          ) : null}
          <Rect {...edge(strokeWidth)} fill="none" stroke={T1} strokeOpacity={op(GLASS.edgeBase)} strokeWidth={strokeWidth} />
          {corners.map(c => (
            <Rect key={c.key} {...edge(strokeWidth)} fill="none" stroke={`url(#${gid}-${c.key})`} strokeWidth={strokeWidth} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

// ── Ring (arc progress, gradient sweep) — unchanged behaviour ─────────────────
export function Ring({
  size,
  stroke,
  progress,
  children,
  color = ACCENT,
  color2 = ACCENT_2,
}: {
  size: number;
  stroke: number;
  progress: number;
  children?: React.ReactNode;
  color?: string;
  color2?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = useMemo(
    () => `g${Math.round(progress * 1e6)}_${size}_${stroke}`,
    [progress, size, stroke],
  );
  return (
    <View style={[ring.box, {width: size, height: size}]}>
      <Svg width={size} height={size} style={ring.svg}>
        <Defs>
          <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color2} />
            <Stop offset="1" stopColor={color} />
          </SvgGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={SEP}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
        />
      </Svg>
      {children}
    </View>
  );
}

const ring = StyleSheet.create({
  box: {alignItems: 'center', justifyContent: 'center'},
  svg: {position: 'absolute', transform: [{rotate: '-90deg'}]},
});

// ── Button — 단일 CTA 프리미티브 (앱 전역 CTA 버튼의 유일한 출처) ──────────────
// 투명 유리 CTA(홈 '러닝 시작' 버튼과 동일 문법):
//   • 반투명 화이트 표면 withAlpha(T1, 0.1) + GlassEdge(상단 빛 하이라이트)
//   • 오렌지 필/그라데이션/글로우 폐지 — 포인트 컬러는 데이터·텍스트 강조에만 쓴다
//   • 누르면 살짝 작아짐(scale .97)
// 모서리는 RADIUS.btn 단일 토큰(과거 14/16/18 사각 CTA 혼재 제거). disabled 거나
// ghost 면 유리 표면을 끄고 CARD_HI 표면으로 떨어진다(disabled 라벨 dim).
// icon: Ionicons 이름(문자열). iconNode: 커스텀 아이콘 노드(SVG·MaterialCommunityIcons
// 등) — 둘 중 하나만. 과거 MockupButton/Onboarding PrimaryButton/인라인 SVG CTA 와
// 화면별 backgroundColor:ACCENT '사각형' 버튼들이 이 컴포넌트로 통합된다(App 재시도·
// 저장, 챌린지 만들기, 신발 편집·은퇴, Profile Google 로그인, RetirementFlow 등).
// 단, 모양이 다른 원형 런 컨트롤(App run.ctrlPrimary, RADIUS.pill)은 합치지 않는다 —
// 사각 CTA 가 아니므로 radius 토큰만 공유하고 이 통합 대상에서 제외한다.
export function Button({
  label,
  onPress,
  variant = 'cta',
  icon,
  iconNode,
  disabled = false,
  style,
  testID,
  haptic = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'cta' | 'ghost';
  icon?: string;
  iconNode?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** 누름 시 가벼운 탭 햅틱(기본 on). 자체 햅틱을 따로 울리는 곳에서만 false 로 끈다. */
  haptic?: boolean;
}) {
  // filled = 투명 유리 CTA 표면(활성 cta 일 때만). ghost·disabled 는 CARD_HI 표면.
  const filled = variant === 'cta' && !disabled;
  // 모든 공용 버튼에 누름 촉각을 한 곳에서 배선한다 — 결과 햅틱(success/warning 등)과
  // 별개의 '눌렀다' 피드백. 설정 off 면 hapticTap 자체가 no-op 이라 분기 불필요.
  const handlePress = onPress
    ? () => {
        if (haptic) hapticTap();
        onPress();
      }
    : undefined;
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      style={({pressed}) => [
        btn.base,
        filled ? btn.glass : btn.flat,
        pressed && !disabled && btn.pressed,
        style,
      ]}>
      {filled ? <GlassEdge radius={RADIUS.btn} /> : null}
      {iconNode ?? (icon ? <Ionicons name={icon} size={ri(20)} color={disabled ? T3 : T1} /> : null)}
      <Text style={[btn.label, disabled && btn.labelDim]}>{label}</Text>
    </Pressable>
  );
}

const btn = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.btn,
    borderCurve: 'continuous', // 애플 스쿼클(iOS) — 원호 모서리보다 부드러운 연속 곡률
  },
  // 투명 유리 CTA 표면 — 홈 카드 '러닝 시작' 버튼과 동일 문법(반투명 화이트 + GlassEdge).
  // 글로우/그림자 없음: 대비는 표면 밝기와 코너 글린트가 만든다(매트 미니멀).
  glass: {backgroundColor: GLASS.fillCta},
  // ghost / disabled 표면(올린 카드 톤). 그라데이션·글로우 없음.
  flat: {backgroundColor: CARD_HI},
  pressed: {opacity: 0.92, transform: [{scale: 0.97}]},
  label: {
    color: T1,
    fontFamily: FONT,
    fontSize: TYPE.heading.fontSize,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelDim: {color: T3},
});

// ── Card (CARD surface · SEP hairline border · radius) ────────────────────────
// 유리 2위계(2026-07-09 사용자 확정): 모든 카드가 같은 재질을 공유하되,
//   • quiet(기본) — 반투명 표면(GLASS.fill) + 헤어라인만. 콘텐츠 카드·리스트 아이템.
//     글린트 SVG 가 없어 긴 FlatList 에도 부담 없다.
//   • hero — 활성 표면(GLASS.fillActive) + 코너 글린트 림(GlassEdge). 화면당 소수의
//     주인공(히어로 카드·핵심 CTA 컨테이너)만. 전부 반짝이면 아무것도 반짝이지 않는다.
// 화면은 변형만 고른다 — 배경/보더/radius 를 인라인으로 조립하는 것 금지(DESIGN.md §5).
export function Card({
  children,
  style,
  padded = true,
  variant = 'quiet',
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  variant?: 'quiet' | 'hero';
}) {
  return (
    <View style={[card.base, variant === 'hero' ? card.hero : card.quiet, padded && card.padded, style]}>
      {variant === 'hero' ? <GlassEdge radius={RADIUS.lg} intensity={GLASS.activeIntensity} /> : null}
      {children}
    </View>
  );
}

const card = StyleSheet.create({
  base: {
    borderRadius: RADIUS.lg,
    borderCurve: 'continuous', // 애플 스쿼클(iOS)
    overflow: 'hidden',
  },
  quiet: {
    backgroundColor: GLASS.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  hero: {
    backgroundColor: GLASS.fillActive,
  },
  padded: {padding: SPACE.lg},
});

// ── AmbientBackdrop — 화면 상단 앰비언트 광(2026-07-09 사용자 확정 '나') ─────────
// 순흑 배경은 유리가 '비칠 것'이 없어 반투명 표면이 평평한 회색으로 죽는다. 상단에
// 아주 옅은 무채 광을 깔아 유리 너머로 비치는 명암을 만든다(레퍼런스 앱들의 문법).
// 무채 원칙 유지 — 색이 아니라 밝기만. 각 탭 화면 루트의 첫 자식으로 깐다(BG 위).
export function AmbientBackdrop() {
  const {width: w, height: winH} = useWindowDimensions();
  const h = Math.round(winH * 0.45);
  return (
    <View testID="ambient-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill, {height: h}]}>
      <Svg width={w} height={h}>
        <Defs>
          <SvgRadialGradient
            id="keego-ambient" gradientUnits="userSpaceOnUse"
            cx={w / 2} cy={-h * 0.3} fx={w / 2} fy={-h * 0.3} rx={w * 0.95} ry={h * 1.1}>
            <Stop offset="0" stopColor={T1} stopOpacity={0.07} />
            <Stop offset="0.55" stopColor={T1} stopOpacity={0.03} />
            <Stop offset="1" stopColor={T1} stopOpacity={0} />
          </SvgRadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill="url(#keego-ambient)" />
      </Svg>
    </View>
  );
}

// ── SegmentedControl (탭 스트립 단일 프리미티브) ───────────────────────────────
// 앱 전역에 흩어져 있던 4개 탭 스트립(History 기간 · Profile recap · Progression 섹션 ·
// RunGoal 모드)을 하나로 통합한다. 선택 상태·접근성(role/selected/label)·press 동작을
// 이 컴포넌트가 책임지고, 표면(컨테이너 배경/보더/반경 + 선택칩 색)은 variant 토큰으로
// 고정해 각 사용처의 기존 모양을 1:1 재현한다(시각 동등). variant 4종은 현재 4개 스트립의
// 외형을 그대로 옮긴 것:
//   • neutral    — 흰색 3.5% 컨테이너 + 흰색 9% 선택칩(History 기간)
//   • raised     — CARD 컨테이너(pill) + CARD_HI 선택칩(Progression 섹션)
//   • accentTint — CARD 컨테이너 + 주황 16% 틴트 선택칩(RunGoal 모드)
//   • accentSolid— CARD_DIM 컨테이너(pill, hug) + 주황 채움 선택칩(Profile recap)
// block=false 면 항목이 내용폭(hug)으로 줄고(profile recap 처럼 인라인), 기본은 flex 균등.
export type SegmentItem = {key: string; label: string};
type SegVariant = 'neutral' | 'raised' | 'accentTint' | 'accentSolid';

const SEG_VARIANTS: Record<
  SegVariant,
  {
    container: ViewStyle;
    item: ViewStyle;
    itemOn: ViewStyle;
    textOff: TextStyle;
    textOn: TextStyle;
  }
> = {
  neutral: {
    container: {
      backgroundColor: withAlpha(T1, 0.035),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: CARD_BORDER,
      borderRadius: rs(13),
      padding: rs(3),
      gap: rv(3),
    },
    // 44→38: 기간 스트립이 위아래로 뚱뚱하다는 사용자 피드백(2026-07-07). 시각 높이만
    // 줄이고 실효 터치 타깃은 item hitSlop(아래 SEG_VSLOP)으로 44pt 를 유지한다(HIG).
    item: {minHeight: rs(38), paddingVertical: rv(5), borderRadius: rs(10)},
    itemOn: {backgroundColor: withAlpha(T1, 0.09)},
    textOff: {color: T3, fontSize: rf(15), fontWeight: '500'},
    textOn: {color: T1, fontSize: rf(15), fontWeight: '700'},
  },
  raised: {
    container: {
      backgroundColor: CARD,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: CARD_BORDER,
      borderRadius: RADIUS.pill,
      padding: rs(4),
      gap: rv(6),
    },
    item: {paddingVertical: rv(9), borderRadius: RADIUS.pill},
    itemOn: {backgroundColor: CARD_HI},
    textOff: {color: T3, fontSize: rf(14), fontWeight: '700'},
    textOn: {color: T1, fontSize: rf(14), fontWeight: '700'},
  },
  accentTint: {
    container: {
      backgroundColor: CARD,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: CARD_BORDER,
      borderRadius: rs(14),
      padding: rs(4),
      gap: rv(4),
    },
    item: {height: rs(38), borderRadius: rs(10)},
    itemOn: {
      backgroundColor: withAlpha(ACCENT, 0.16),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(ACCENT, 0.28),
    },
    textOff: {color: T3, fontSize: rf(15), fontWeight: '600'},
    textOn: {color: ACCENT, fontSize: rf(15), fontWeight: '600'},
  },
  accentSolid: {
    container: {
      backgroundColor: CARD_DIM,
      borderRadius: RADIUS.pill,
      padding: rs(3),
      gap: rv(2),
    },
    item: {paddingHorizontal: rs(14), paddingVertical: rv(6), borderRadius: RADIUS.pill},
    itemOn: {backgroundColor: withAlpha(T1, 0.1)},
    textOff: {color: T3, fontSize: rf(14), fontWeight: '600'},
    textOn: {color: T1, fontSize: rf(14), fontWeight: '600'},
  },
};

// 시각 높이 < 44pt 인 variant 의 세로 hitSlop — 실효 터치 타깃을 44pt 로 끌어올린다.
// (neutral 항목 38 + 3·2 = 44. 나머지 variant 는 자체 높이로 충분해 0.)
const SEG_VSLOP: Record<SegVariant, number> = {neutral: 3, raised: 0, accentTint: 3, accentSolid: 0};

export function SegmentedControl({
  items,
  value,
  onChange,
  variant = 'neutral',
  block = true,
  role = 'button',
  labelFor,
  testIDFor,
  style,
}: {
  items: SegmentItem[];
  value: string;
  onChange: (key: string) => void;
  variant?: SegVariant;
  block?: boolean;
  role?: 'button' | 'tab';
  labelFor?: (item: SegmentItem, selected: boolean) => string;
  testIDFor?: (item: SegmentItem) => string;
  style?: StyleProp<ViewStyle>;
}) {
  const v = SEG_VARIANTS[variant];
  return (
    <View style={[seg.row, v.container, style]}>
      {items.map(item => {
        const on = item.key === value;
        return (
          <Pressable
            key={item.key}
            testID={testIDFor ? testIDFor(item) : undefined}
            onPress={() => onChange(item.key)}
            hitSlop={SEG_VSLOP[variant] ? {top: SEG_VSLOP[variant], bottom: SEG_VSLOP[variant]} : undefined}
            accessibilityRole={role}
            accessibilityState={{selected: on}}
            accessibilityLabel={labelFor ? labelFor(item, on) : item.label}
            style={({pressed}) => [
              seg.item,
              block && seg.block,
              v.item,
              on && v.itemOn,
              pressed && !on && {opacity: 0.7},
            ]}>
            <Text style={[seg.label, on ? v.textOn : v.textOff]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const seg = StyleSheet.create({
  row: {flexDirection: 'row'},
  item: {alignItems: 'center', justifyContent: 'center'},
  block: {flex: 1},
  label: {fontFamily: FONT},
});

// ── Stat / StatGrid (스탯 셀 + 그리드 단일 프리미티브) ─────────────────────────
// 화면마다 손으로 짜던 스탯 그리드(누적 기록 · 개인 기록 · 리캡 요약 · 진척 스탯줄 ·
// 러닝 상세 2×3)를 하나로 통합한다. 한 셀 = 큰 값(DISPLAY·tabular-nums) + 위첨자 단위
// (T3) + 라벨(T3). 색/폰트패밀리/tabular/구조는 토큰으로 고정(단일 진실원)하고, 크기·
// 굵기·자간만 사용처 타입스케일로 받는다(시각 동등). align='center' 는 카드 안 균등 줄,
// 'left' 는 2×3 좌측 정렬 그리드. divided 면 좌측 헤어라인 구분선(첫 칸 제외).
export type StatItem = {
  value: string | number;
  unit?: string;
  label?: string;
  top?: React.ReactNode;
  testID?: string;
};

export function Stat({
  value,
  unit,
  label,
  top,
  align = 'center',
  valueSize = rf(22),
  valueWeight = '700',
  valueLS = 0.2,
  unitSize = rf(13),
  unitWeight = '600',
  labelSize = rf(13),
  labelWeight = '600',
  labelMarginTop = 4,
  verticalPadding = 0,
  divided = false,
  style,
  testID,
}: {
  value: string | number;
  unit?: string;
  label?: string;
  top?: React.ReactNode;
  align?: 'center' | 'left';
  valueSize?: number;
  valueWeight?: TextStyle['fontWeight'];
  valueLS?: number;
  // unit/label 타이포는 사이트마다 원본이 다르다(Profile 12/600·11.5/600 vs 러닝상세
  // 11.5/500·11.5/normal vs 진척 11/700·11/600). 색/패밀리는 토큰 고정, 크기·굵기·라벨
  // 마진·셀 세로패딩만 prop 으로 노출해 각 사이트가 픽셀 단위 원본을 복원한다.
  unitSize?: number;
  unitWeight?: TextStyle['fontWeight'];
  labelSize?: number;
  labelWeight?: TextStyle['fontWeight'];
  labelMarginTop?: number;
  verticalPadding?: number;
  divided?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        statS.cell,
        align === 'center' ? statS.center : statS.left,
        verticalPadding ? {paddingVertical: verticalPadding} : null,
        divided && statS.divided,
        style,
      ]}>
      {top}
      <Text
        style={[
          statS.value,
          {fontSize: valueSize, fontWeight: valueWeight, letterSpacing: valueLS},
        ]}>
        {value}
        {unit ? (
          <Text style={[statS.unit, {fontSize: unitSize, fontWeight: unitWeight}]}>
            {unit}
          </Text>
        ) : null}
      </Text>
      {label != null ? (
        <Text
          style={[
            statS.label,
            {fontSize: labelSize, fontWeight: labelWeight, marginTop: labelMarginTop},
          ]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function StatGrid({
  items,
  align = 'center',
  divider = false,
  columns,
  valueSize = rf(22),
  valueWeight = '700',
  valueLS = 0.2,
  unitSize = rf(13),
  unitWeight = '600',
  labelSize = rf(13),
  labelWeight = '600',
  labelMarginTop = 4,
  verticalPadding = 0,
  style,
  testID,
}: {
  items: StatItem[];
  align?: 'center' | 'left';
  divider?: boolean;
  // columns 지정 시 wrap 그리드(각 칸 100/columns% 폭, 예 2×3=3). 미지정이면 flex 균등 줄.
  columns?: number;
  valueSize?: number;
  valueWeight?: TextStyle['fontWeight'];
  valueLS?: number;
  unitSize?: number;
  unitWeight?: TextStyle['fontWeight'];
  labelSize?: number;
  labelWeight?: TextStyle['fontWeight'];
  labelMarginTop?: number;
  verticalPadding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const wrap = columns != null;
  return (
    <View
      testID={testID}
      style={[wrap ? statS.gridWrap : statS.gridRow, style]}>
      {items.map((it, i) => (
        <Stat
          key={it.testID ?? `${it.label ?? ''}-${i}`}
          value={it.value}
          unit={it.unit}
          label={it.label}
          top={it.top}
          testID={it.testID}
          align={align}
          valueSize={valueSize}
          valueWeight={valueWeight}
          valueLS={valueLS}
          unitSize={unitSize}
          unitWeight={unitWeight}
          labelSize={labelSize}
          labelWeight={labelWeight}
          labelMarginTop={labelMarginTop}
          verticalPadding={verticalPadding}
          divided={divider && i > 0}
          style={wrap ? {width: `${100 / columns!}%`} : undefined}
        />
      ))}
    </View>
  );
}

const statS = StyleSheet.create({
  gridRow: {flexDirection: 'row'},
  gridWrap: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {},
  center: {flex: 1, alignItems: 'center'},
  left: {},
  divided: {borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: SEP},
  value: {
    color: T1,
    fontFamily: DISPLAY,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  // 크기·굵기·마진은 prop 으로 받는다(사이트별 원본 복원). 여기선 색·패밀리만 토큰 고정.
  unit: {color: T3, fontFamily: FONT},
  label: {color: T3, fontFamily: FONT},
});

// ── Pill / Badge (상태색 톤 + 반투명 배경) ────────────────────────────────────
export function Pill({
  tone,
  label,
  icon,
  size = 'sm',
  style,
  testID,
}: {
  tone: Tone;
  label: string;
  icon?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const md = size === 'md';
  const fg = TONE_FG[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        pill.base,
        md ? pill.md : pill.sm,
        {backgroundColor: TONE_BG[tone]},
        tone === 'dim' ? null : {borderColor: fg, borderWidth: StyleSheet.hairlineWidth},
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={md ? 13 : 11} color={fg} /> : null}
      <Text style={[pill.label, {color: fg, fontSize: md ? 12 : 11}]}>{label}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
  },
  sm: {gap: SPACE.xs, paddingHorizontal: SPACE.sm, paddingVertical: rv(3)},
  md: {gap: rv(5), paddingHorizontal: rs(11), paddingVertical: rv(5)},
  label: {fontFamily: FONT, fontWeight: '700', letterSpacing: 0.2},
});

// ── Tier badge (앱내 교체 배지: 홈/신발 목록/상세 공용) ───────────────────────
// shoeHealth 주의/교체 tier만 노출(양호 → null, 평상시 잡음 제거). Pill 위에 얹어
// 상태 톤 + 경고 아이콘 + 한국어 라벨로 교체 동선을 끌어올린다. testID 는 기존 그대로
// (tier-badge-주의|교체) 유지해 회귀 테스트 호환.
export function TierBadge({
  condition,
  size = 'sm',
}: {
  condition: ShoeCondition;
  size?: 'sm' | 'md';
}) {
  const badge = tierBadge(condition);
  if (!badge) return null;
  return (
    <Pill
      testID={`tier-badge-${badge.label}`}
      tone={badge.tone === 'danger' ? 'danger' : 'warn'}
      label={badge.label}
      icon="warning"
      size={size}
    />
  );
}

// ── Injury warning banner (부상예방 경고: 홈 히어로 · 신발 상세 공용) ──────────
// assessInjuryRisk 의 caution/high 등급만 경고 배너로 노출한다(safe → null, 안전
// 등급은 경고 미노출). 색은 tier 톤과 정렬: caution=WARN, high=DANGER. 배경은 해당
// 토큰의 withAlpha 파생 + 한 줄 keep-going 안내 문구. testID 는 injury-banner-{level}.
export function InjuryBanner({
  level,
  message,
  testID,
}: {
  level: InjuryLevel;
  message: string;
  testID?: string;
}) {
  if (level === 'safe' || !message) {
    return null;
  }
  const fg = level === 'high' ? DANGER : WARN;
  return (
    <View
      testID={testID ?? `injury-banner-${level}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={message}
      style={[
        injury.banner,
        {backgroundColor: withAlpha(fg, 0.12), borderColor: withAlpha(fg, 0.4)},
      ]}>
      <Ionicons
        name={level === 'high' ? 'alert-circle' : 'warning'}
        size={ri(17)}
        color={fg}
      />
      <Text style={[injury.text, {color: fg}]}>{message}</Text>
    </View>
  );
}

const injury = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rv(9),
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.lg,
    paddingVertical: rv(12),
  },
  text: {
    flex: 1,
    fontFamily: FONT,
    fontSize: rf(14),
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: rf(18),
  },
});

// ── Metric (value + unit, baseline 정렬 · tabular-nums) ────────────────────────
// 큰 숫자(value)와 단위(unit)를 baseline 정렬 + gap 으로 분리해 '0.0km' 같이 붙어
// 보이던 cramping 을 해소한다. 숫자는 DISPLAY(이제 Pretendard) + tabular-nums 로
// 자리수 흔들림을 막는다.
export function Metric({
  value,
  unit,
  size = 24,
  color = T1,
  align = 'left',
  style,
}: {
  value: string | number;
  unit?: string;
  size?: number;
  color?: string;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[metric.row, align === 'center' && metric.center, style]}>
      <Text style={[metric.value, {fontSize: size, color}]}>{value}</Text>
      {unit ? (
        <Text
          style={[
            metric.unit,
            {fontSize: Math.max(11, Math.round(size * 0.42)), color},
          ]}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

const metric = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs},
  center: {justifyContent: 'center'},
  value: {
    fontFamily: DISPLAY,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  unit: {
    fontFamily: FONT,
    fontWeight: '700',
    letterSpacing: 0,
    opacity: 0.7,
    includeFontPadding: false,
  },
});

// ── Keego wordmark (2026-07-04 확정 B안 — Helvetica Neue Medium) ────────────────
// 소문자 'keego' · Medium · 파파야(BRAND — 2026-07-09 'B 서명+진행' 확정, 흰→브랜드색) · 점 없음.
// iOS: Helvetica Neue(내장). Android: Helvetica Neue 가 없어 Roboto 로 폴백되던 것을
// 번들 Pretendard 로 대체(2026-07-06 사용자 결정 — iOS 룩 유지, Android 만 Pretendard).
// 두 플랫폼이 완전 동일하진 않지만(자간·g 결) Roboto 폴백보다 훨씬 브랜드에 맞는다.
export const WORDMARK_FONT = Platform.select({
  ios: 'Helvetica Neue',
  android: 'PretendardVariable',
  default: 'Helvetica Neue',
}) as string;

export function KeegoWordmark({
  size = 24,
  style,
}: {
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[{fontFamily: WORDMARK_FONT, fontWeight: '500', fontSize: size, color: BRAND, letterSpacing: -0.3, includeFontPadding: false} as TextStyle, style]}
      accessibilityLabel="keego">
      keego
    </Text>
  );
}

// ── Section title (T3 라벨, 화면 섹션 헤더) ───────────────────────────────────
export function SectionTitle({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[section.text, style]}>{children}</Text>;
}

const section = StyleSheet.create({
  text: {
    fontFamily: FONT,
    color: T3,
    fontSize: TYPE.label.fontSize,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});

// ── Bottom tab bar (Threads-style floating glass dock) ───────────────────────
// 신발은 커스텀 러닝화 SVG(react-native-svg), 나머지는 Ionicons(활성=채움/비활성 -outline).
// 유리 블러는 BlurView 를 dock 의 absolute 배경으로 깔아(신아키텍처 flex 붕괴 회피) 구현.
// 탭바 러닝화: 브랜드 라인아트 글리프(사용자 확정 에셋, 2026-07-03). 알파 채널만 쓰는
// 흰 글리프라 tintColor 로 활성/비활성 색을 입힌다. 원본이 왼쪽을 향하므로 flip 불필요.
// filled 변형(tab-shoe-fill.png)은 원본 스트로크의 몸통을 채우고 밑창 스트라이프만 컷아웃으로
// 남긴 파생 에셋 — Ionicons outline↔filled 와 같은 활성 문법(선택 시 러닝화 탭만 안 변하던 문제).
const TAB_SHOE = require('./assets/tab-shoe.png');
const TAB_SHOE_FILL = require('./assets/tab-shoe-fill.png');

function ShoeIcon({color, filled = false}: {color: string; filled?: boolean}) {
  return (
    <Image
      source={filled ? TAB_SHOE_FILL : TAB_SHOE}
      style={{width: rs(26), height: rs(26), tintColor: color}}
      resizeMode="contain"
    />
  );
}

// ── SwipeBack — 엣지 스와이프 뒤로가기(iOS 인터랙티브 pop 대응) ─────────────────
// 커스텀 내비게이션(상태 머신)이라 네이티브 pop 제스처가 없다 → RN 내장 PanResponder 로
// 재현한다: 화면 왼쪽 가장자리(28pt)에서 시작한 가로 드래그에만 반응해 화면이 손가락을
// 따라 밀리고, 1/3 이상 밀거나 빠르게 튕기면 onBack, 아니면 스프링 복귀. 세로 스크롤과
// 충돌하지 않도록 가로 성분이 우세할 때만 캡처한다. 신규 의존성 0(gesture-handler 불요).
// 러닝 중 화면·입력 폼에는 감싸지 않는다(실수 이탈 방지 — 명시적 버튼만).
// 가로 컨트롤(눈금 룰러·가로 칩 스크롤 등)이 화면 왼쪽 엣지까지 깔린 화면에서,
// 엣지 존(24pt)에서 시작한 오른쪽 드래그를 SwipeBack 이 가로채 화면이 뒤로 튕기는
// 충돌 방지 — 컨트롤을 <SwipeBackExclude> 로 감싸면 그 위에서 시작한 터치 동안
// SwipeBack 이 캡처를 양보한다. ref 공유라 리렌더 0(제스처 중 상태 갱신 없음).
const SwipeBackBlock = React.createContext<React.MutableRefObject<boolean> | null>(null);

export function SwipeBackExclude({children, style}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const blocked = useContext(SwipeBackBlock);
  return (
    <View
      style={style}
      onTouchStart={() => { if (blocked) blocked.current = true; }}
      onTouchEnd={() => { if (blocked) blocked.current = false; }}
      onTouchCancel={() => { if (blocked) blocked.current = false; }}>
      {children}
    </View>
  );
}

export function SwipeBack({onBack, enabled = true, children}: {
  onBack?: () => void;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const {width} = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  // PanResponder 는 한 번만 생성되므로 최신 props 는 ref 로 전달(stale closure 방지).
  const cbRef = useRef(onBack); cbRef.current = onBack;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const widthRef = useRef(width); widthRef.current = width;
  const blockRef = useRef(false); // SwipeBackExclude 영역 터치 중이면 true
  const springHome = () =>
    Animated.spring(x, {toValue: 0, useNativeDriver: false, speed: 20, bounciness: 4}).start();
  const pan = useRef(
    PanResponder.create({
      // 수평 '전용' 캡처 — 세로 성분이 조금이라도 크면(대각선 포함) 스크롤에 양보한다.
      // 구 조건(|dy| < dx·0.7)은 대각선 드래그를 잡아 세로 스크롤과 겹치며 화면이
      // 위아래로도 흔들리는 느낌을 만들었다(사용자 피드백).
      onMoveShouldSetPanResponder: (_e, g) =>
        !!cbRef.current && enabledRef.current && !blockRef.current &&
        g.x0 <= 24 && g.dx > 14 && Math.abs(g.dy) < 12 && g.dx > Math.abs(g.dy) * 2.5,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > widthRef.current / 3 || g.vx > 0.5) {
          Animated.timing(x, {
            toValue: widthRef.current, duration: 150,
            easing: Easing.out(Easing.quad), useNativeDriver: false,
          }).start(() => cbRef.current?.());
          // x 는 리셋하지 않는다 — onBack 이 이 화면을 언마운트하므로 값은 함께 버려진다.
          // (완료 직후 0으로 되돌리면 언마운트 전 한 프레임 동안 화면이 제자리로 '번쩍'
          //  나타났다 사라지는 플래시가 생긴다 — 사용자 피드백으로 제거.)
        } else springHome();
      },
      onPanResponderTerminate: springHome,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  return (
    <Animated.View style={{flex: 1, transform: [{translateX: x}]}} {...pan.panHandlers}>
      <SwipeBackBlock.Provider value={blockRef}>{children}</SwipeBackBlock.Provider>
    </Animated.View>
  );
}

// ── ShoeGlyph — 러닝화 글리프(빈 상태·플레이스홀더용) ─────────────────────────
// 하단 탭바와 동일한 브랜드 라인아트 글리프(TAB_SHOE) — 앱 전체에서 '신발'이
// 한 가지 형태로 보이게(사용자 결정 2026-07-03, 탭 교체와 함께 통일).
export function ShoeGlyph({size = 46, color = withAlpha(T1, 0.32)}: {size?: number; color?: string}) {
  return (
    <Image
      source={TAB_SHOE}
      style={{width: size, height: size, tintColor: color}}
      resizeMode="contain"
    />
  );
}

const TABS: {icon: string; label: string; shoe?: boolean; flip?: boolean}[] = [
  {icon: 'home', label: '홈'},
  {icon: 'shoe', label: '신발', shoe: true},
  {icon: 'time', label: '기록'},
  {icon: 'person', label: '마이'},
];

// 탭바는 화면마다 별도 인스턴스로 마운트된다(각 화면이 자기 TabBar 를 active 고정으로 렌더).
// 그래서 인스턴스 안의 Animated.Value 만으로는 탭 전환 시 '이전 위치'를 알 수 없어 슬라이드가
// 불가능하다(매 마운트가 0 또는 제자리에서 시작). 모든 화면의 독 레이아웃이 동일하므로,
// '직전 활성 탭'과 '측정된 슬롯 geometry'를 모듈 레벨에 공유해 — 새로 마운트된 TabBar 가
// 직전 탭 위치에서 시작해 현재 탭으로 스프링하게 한다(= 탭 간 미끄러지는 하이라이트).
// 한 번에 한 TabBar 만 마운트되므로(화면 상호배타) 공유 가변상태에 경쟁이 없다.
let tabLastActive = 0;
let tabCachedSlots: {x: number; w: number}[] = [];
const HL_PAD = 6;               // 좌우로 살짝 넓게(위아래 여백과 균형)
const hlGeom = (s: {x: number; w: number}) => {
  const w = s.w + HL_PAD;
  return {x: s.x + (s.w - w) / 2, w};
};

// 탭 화면 스크롤 콘텐츠의 하단 여백. 독이 콘텐츠 '위에 떠서'(absolute) 화면이 비치므로,
// 마지막 항목이 독에 가리지 않도록 각 탭 화면의 contentContainerStyle paddingBottom 에 쓴다.
// = paddingTop 6 + 독 62 + 홈인디케이터 inset 최대 34 + 숨쉴 틈. inset 이 작은 기기에선
// 여백이 조금 더 생길 뿐이라 상수 하나로 충분하다.
export const TABBAR_CLEARANCE = 118;

export function TabBar({active, onTab}: {active: number; onTab: (i: number) => void}) {
  const insets = useSafeAreaInsets();
  // 각 탭의 x중심/폭을 onLayout 으로 측정해 하이라이트를 정확히 정렬한다. 초기값은 모듈 캐시
  // (직전 마운트가 측정해 둔 동일 레이아웃) — 마운트 즉시 직전 탭→현재 탭 슬라이드를 시작할 수 있다.
  const [slots, setSlots] = useState<{x: number; w: number}[]>(() => tabCachedSlots.slice());
  // 초기값을 직전 탭 위치로(모듈 캐시) — 첫 프레임에 (0,0)에서 잠깐 보이는 깜빡임 방지. 그 다음
  // effect 가 현재 탭으로 스프링한다. 캐시가 없으면(앱 첫 부팅) 0 에서 시작하되 effect 가 즉시 점프.
  const hlInit = useRef(tabCachedSlots[tabLastActive] ? hlGeom(tabCachedSlots[tabLastActive]) : {x: 0, w: 0}).current;
  const hlX = useRef(new Animated.Value(hlInit.x)).current;
  const hlW = useRef(new Animated.Value(hlInit.w)).current;
  // 이 인스턴스가 최초 배치를 끝냈는지. 최초엔 직전 탭 위치에서 현재 탭으로 슬라이드(앱 첫 부팅
  // = 직전==현재 이면 점프)하고, 이후 같은 인스턴스 내 변경은 일반 스프링.
  const posed = useRef(false);

  const onSlot = (i: number) => (e: LayoutChangeEvent) => {
    const {x, width} = e.nativeEvent.layout;
    setSlots(prev => {
      const next = [...prev];
      next[i] = {x, w: width};
      return next;
    });
    tabCachedSlots[i] = {x, w: width};   // 모듈 캐시 갱신(다음 화면의 TabBar 가 즉시 재사용)
  };

  // 활성 인덱스/측정값이 바뀌면 하이라이트를 그 탭으로 이동(살짝 오버슈트).
  useEffect(() => {
    const s = slots[active];
    if (!s) return;
    const {x, w} = hlGeom(s);
    if (!posed.current) {
      posed.current = true;
      const from = slots[tabLastActive];
      if (from && tabLastActive !== active) {
        // 다른 탭에서 넘어옴: 직전 탭 위치에서 시작 → 현재 탭으로 스프링(미끄러짐).
        const f = hlGeom(from);
        hlX.setValue(f.x);
        hlW.setValue(f.w);
      } else {
        // 앱 첫 부팅(직전==현재) 또는 직전 geometry 미상: 글리치 없이 즉시 자리잡기.
        hlX.setValue(x);
        hlW.setValue(w);
        tabLastActive = active;
        return;
      }
    }
    tabLastActive = active;
    Animated.parallel([
      Animated.spring(hlX, {toValue: x, useNativeDriver: false, speed: 16, bounciness: 9}),
      Animated.spring(hlW, {toValue: w, useNativeDriver: false, speed: 16, bounciness: 9}),
    ]).start();
  }, [active, slots, hlX, hlW]);

  return (
    // box-none: 독 캡슐만 터치를 받고, 좌우 여백은 아래로 흐르는 콘텐츠에 그대로 통과시킨다
    // (wrap 이 absolute 로 하단 전폭을 덮으므로 필수).
    <View pointerEvents="box-none" style={[t.wrap, {paddingBottom: insets.bottom > 0 ? insets.bottom : 14}]}>
      {/* 떠있는 유리 블러 캡슐 독. BlurView 는 absolute 배경으로만 깔고(신아키텍처 flex
          붕괴 회피) 레이아웃은 일반 flex View 가 담당. overflow:hidden 으로 라운드 클립. */}
      <View style={t.dock}>
        <BlurView pointerEvents="none" style={StyleSheet.absoluteFill} blurType="dark" blurAmount={25} reducedTransparencyFallbackColor="rgba(46,46,52,0.9)" />
        {/* 미끄러지는 오벌 하이라이트 */}
        <Animated.View pointerEvents="none" style={[t.hl, {left: hlX, width: hlW}]} />
        {TABS.map((tab, i) => {
          const on = i === active;
          // 비활성도 밝게(T2) — 어두운 독+검정 배경에서 햇빛에도 보이도록. 활성 구분은
          // 채워진 아이콘 + 하이라이트 오벌이 담당한다(색 대비에만 의존하지 않음).
          const color = on ? T1 : T2;
          return (
            <Pressable
              key={i}
              onPress={() => onTab(i)}
              onLayout={onSlot(i)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{selected: on}}
              hitSlop={6}
              style={({pressed}) => [t.item, pressed && {opacity: 0.55}]}>
              <View style={tab.flip ? {transform: [{scaleX: -1}]} : undefined}>
                {tab.shoe ? (
                  <ShoeIcon color={color} filled={on} />
                ) : (
                  <Ionicons name={on ? tab.icon : `${tab.icon}-outline`} size={ri(24)} color={color} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const t = StyleSheet.create({
  // 독을 화면 좌우에서 띄워(40dp) 폭을 줄인다 — 프로토타입과 동일.
  // absolute 하단 고정: 콘텐츠가 독 '밑으로' 스크롤되어 유리 너머로 비친다(진짜 글래스).
  // 각 탭 화면은 TABBAR_CLEARANCE 만큼 스크롤 하단 여백을 확보한다.
  wrap: {position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: rs(40), paddingTop: rv(6)},
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    height: rs(62),
    // 좌우 안쪽 패딩 9 — 끝 탭 하이라이트가 독 가장자리에서 6dp 뜨게 해(끝 pill left
    // = paddingLeft - HL_PAD/2 = 9 - 3 = 6) 상하 여백(=(62-50)/2=6)과 정확히 일치시킨다.
    paddingHorizontal: rs(9),
    borderRadius: RADIUS.pill,
    overflow: 'hidden',                       // 하이라이트를 알약으로 클립
    borderWidth: StyleSheet.hairlineWidth,
    // 테두리를 또렷이(0.10→0.20) — 캡슐이 검정 배경과 분리돼 보이도록.
    borderColor: 'rgba(255,255,255,0.20)',
    // iOS: 콘텐츠가 독 밑으로 스크롤되므로 막을 얇게(0.62→0.30→0.14, 사용자 피드백) —
    // 블러 너머로 화면이 또렷이 비쳐야 유리다. 다크 블러 자체가 어둡게 깔아줘 가독성은 유지된다.
    // 안드로이드는 블러 미지원이 흔해 불투명 회색 유지(투명하면 글자와 아이콘이 충돌).
    backgroundColor: Platform.OS === 'android' ? 'rgba(46,46,52,0.86)' : 'rgba(24,24,28,0.14)',
    shadowColor: BG,
    shadowOpacity: 0.7,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: rs(14)},
    elevation: 14,
  },
  hl: {
    position: 'absolute',
    top: '50%',
    height: rs(50),
    marginTop: rv(-25),            // 세로 정중앙(translateY(-50%) 대응)
    borderRadius: RADIUS.pill,
    // 활성 하이라이트 강화(0.15→0.24) — 비활성 아이콘이 밝아진 만큼 활성 탭을 또렷이.
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  item: {flex: 1, height: rs(62), alignItems: 'center', justifyContent: 'center'},
  label: {fontFamily: FONT, fontSize: rf(11), letterSpacing: 0.1},
});
