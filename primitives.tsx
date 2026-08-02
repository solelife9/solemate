// ============================================================================
// primitives.tsx — shared Keego UI primitives
// Ring · TabBar · Button · Card · Pill · Metric ·
// KeegoWordmark · SectionTitle · status-color helpers.
// All colour/spacing/radius/type values come from theme tokens (no raw hex).
// Deps: react-native-svg, react-native-vector-icons
// ============================================================================
import React, {useId, useMemo, useRef, useState, useEffect, useContext} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {
  View,
  Image,
  Pressable,
  Animated,
  Easing,
  Modal,
  AccessibilityInfo,
  PanResponder,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import {Text} from './lib/text';
import type {TextInputProps} from 'react-native';
import {TextInput} from './lib/text';
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
  Path as SvgPath,
} from 'react-native-svg';
import {
  BG,
  CARD,
  CARD_HI,
  TOUCH_TARGET,
  ACCENT,
  ACCENT_2,
  WARN,
  DANGER,
  GOOD,
  BEST,
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
  NUMERIC,
  type NumericSize,
  GLASS,
  BRAND,
  withAlpha,
  MOTION,
  LEADING,
  GUTTER,
  SCRIM,
  ICON,
} from './theme';
import {tap as hapticTap} from './lib/haptics';
import {setToastClearance} from './lib/toast';
import {wearTier, type WearTierTone} from './lib/shoe';
import {InjuryLevel} from './lib/injury';

// (구 conditionColor/conditionTone 3단계 매핑은 2026-07-11 제거 — 컨디션 색/톤은
//  wearTier(4단계) tone → WEAR_TONE_COLOR 가 단일 소스다.)
export type Tone = 'good' | 'warn' | 'danger' | 'accent' | 'dim';

// 마모 4단계(wearTier) 톤 → theme 토큰. 최상=BEST 파랑·양호=GOOD·교체고려=WARN·
// 교체권장=DANGER — 2026-07-19 수명 링 색통일(c139934, 민우님 확정)과 동일 램프.
// FuelGauge·신발 탭이 이 export 를 직접 소비한다(사본 금지 — 과거 사본이 한 단계
// 밀린 램프 + '교체고려'=흰(ACCENT) 으로 어긋나 '최상'과 같은 색이 되는 사고가 있었다).
export const WEAR_TONE_COLOR: Record<WearTierTone, string> = {
  good: BEST, mid: GOOD, warn: WARN, danger: DANGER,
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
        <Ionicons name="remove" size={ri(ICON.action)} color={T1} />
      </Pressable>
      {children ?? (
        <View style={{flex: 1, alignItems: 'center'}} accessible accessibilityLabel={`${value} ${suffix}`}>
          {/* 값 타이포 = NUMERIC.lg — 숫자 표기 3벌(Stat·Metric·Stepper) 단일 램프 수렴(2026-07-25). */}
          <Text style={{color: T1, fontFamily: DISPLAY, ...NUMERIC.lg, fontVariant: ['tabular-nums']}}>{value}</Text>
          {!!suffix && <Text style={{color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '600', marginTop: rv(2)}}>{suffix}</Text>}
        </View>
      )}
      <Pressable onPress={onPlus} hitSlop={8} accessibilityRole="button"
        accessibilityLabel={plusLabel ?? `${suffix} 늘리기`} style={({pressed}) => btn(pressed)}>
        <Ionicons name="add" size={ri(ICON.action)} color={T1} />
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
  // 반응형 스케일 적용(2026-07-25 심사 — 주변은 rs 인데 Chip 만 고정이라 비기준 기기에서
  // 행 안 비율이 깨졌다). 터치 타깃은 렌더 높이 기준으로 TOUCH_TARGET(44pt) 보정.
  const h = rs(size === 'sm' ? 32 : 40);
  const slop = Math.max(0, Math.ceil((TOUCH_TARGET - h) / 2));
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
          height: h, paddingHorizontal: rs(size === 'sm' ? SPACE.md : SPACE.lg),
          borderRadius: RADIUS.pill, borderCurve: 'continuous',
          alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: rv(6),
          backgroundColor: selected ? withAlpha(ACCENT, 0.16) : CARD_HI,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: selected ? withAlpha(ACCENT, 0.55) : 'transparent',
        },
        pressed && {transform: [{scale: MOTION.press.scale}], opacity: MOTION.press.opacity},
        disabled && {opacity: 0.4},
        style,
      ]}>
      {children ?? (
        <Text style={{
          fontFamily: FONT, fontSize: size === 'sm' ? TYPE.caption.fontSize : TYPE.label.fontSize,
          fontWeight: selected ? '700' : '600',
          color: selected ? ACCENT : T2,
        }}>{label}</Text>
      )}
    </Pressable>
  );
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
//   · glints=false: 코너 글린트·sheen 을 끄고 베이스 방사 2점만 남긴 순수 '코너 페이드
//     헤어라인'(2026-07-10 사용자 확정 — "모든 카드 얇은 헤어라인, 우상·좌하로 갈수록
//     소멸"). 일반(콰이어트) 카드의 균일 RN 보더를 이것으로 대체한다. sheen 은 히어로
//     전용 빛맺힘이라 glints 와 함께 꺼진다.
// id 는 생략 가능(useId 자동 — 같은 화면 다중 인스턴스 안전). radius 는 부모 모서리와 동일값.

function GlassEdgeBase({
  id,
  radius,
  strokeWidth = 0.75,
  intensity = 1,
  sheen = true,
  glints = true,
  fade = true,
}: {
  id?: string;
  radius: number;
  strokeWidth?: number;
  intensity?: number;
  sheen?: boolean;
  glints?: boolean;
  /** false = 균일 헤어라인(버튼 전용 — 페이드 비대칭이 만드는 이중선 회피). */
  fade?: boolean;
}) {
  const autoId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = id ?? `glass-${autoId}`;
  const [s, setS] = useState({w: 0, h: 0});
  const onLayout = (e: LayoutChangeEvent) => {
    const {width, height} = e.nativeEvent.layout;
    // 정확한 레이아웃 치수 사용(내림 금지) — 내림하면 소수점 높이 카드(러닝기록 등)에서
    // SVG 가 1px 짧아져 아래 라인이 바닥에서 떠 보였다(기기 발견 2026-07-11).
    // 경계 클리핑은 스트로크 '바깥 모서리'를 1px 안쪽에 그려 방지한다(아래 edge).
    setS({w: width, h: height});
  };
  // 스트로크의 바깥 모서리가 정확히 1px 안쪽에 오도록 중심을 1+sw/2 들인다.
  // 이전엔 중심을 sw(0.75)만 들여 바깥 모서리 여유가 0.375px 뿐이었다 — 뷰가 소수점
  // 좌표에 놓여 픽셀 격자 반올림으로 우/하변이 최대 0.5px 잘리면 그 변의 헤어라인이
  // 얇아지거나 통째로 사라졌다(기기 발견 2026-07-11 밤: 재개 버튼 우변·러닝 시작
  // 버튼 하변). 1px 여유면 어떤 배율(2x/3x)·좌표에서도 네 변이 온전하다.
  const edge = (sw: number) => {
    const inset = 1 + sw / 2;
    return {
      x: inset,
      y: inset,
      width: s.w - inset * 2,
      height: s.h - inset * 2,
      rx: Math.max(0, Math.min(radius - inset, (s.w - inset * 2) / 2)),
    };
  };
  const op = (v: number) => Math.min(1, v * intensity);
  // 글린트 반경 — 타원(가로=폭·세로=높이 각 0.8): 빛이 인접 두 변을 따라 여행하다
  // 반대편 코너 전에 소멸. 원형 반경은 납작한 버튼에서 우상·좌하 코너까지 빛이 닿아
  // 사방 라인으로 보였다(기기 피드백 2026-07-11) — 베이스와 동일한 타원 정규화.
  const glintRx = s.w * 0.8;
  const glintRy = s.h * 0.8;
  // 글린트 중심 = 코너 '아크의 원 중심'(꼭짓점에서 radius 만큼 안쪽) — 꼭짓점 중심은
  // 아크 구간 내내 거의 등거리(균일 밝기)다가 직선 진입 순간 감쇠가 시작돼 접점에서
  // 밝기가 꺾여 보였다(기기 피드백 "뚝 끊김"). 아크 원 중심에 두면 아크 위 밝기가
  // 정확히 균일하고, 직선 구간 감쇠가 기울기 0에서 시작돼 전환이 매끄럽다.
  const rC = Math.max(0, Math.min(radius, s.w / 2, s.h / 2));
  const corners = (glints
    ? [
        {key: 'tl', cx: rC, cy: rC, peak: GLASS.edgeTL},
        {key: 'tr', cx: s.w - rC, cy: rC, peak: GLASS.edgeTR},
        {key: 'br', cx: s.w - rC, cy: s.h - rC, peak: GLASS.edgeBR},
        {key: 'bl', cx: rC, cy: s.h - rC, peak: GLASS.edgeBL},
      ]
    : []
  ).filter(c => c.peak > 0.005);
  const sheenOn = sheen && glints;
  // 베이스 헤어라인의 두 발원점(좌상·우하) — 반대 코너(우상·좌하)에 닿기 전에 0 으로 소멸.
  // 감쇠는 '타원'(가로 반경=폭 기준, 세로 반경=높이 기준) — 원형 반경은 낮은 카드에서
  // 반대편 코너까지 닿아 사면이 다 그려졌다(기기 피드백 2026-07-11). 타원 정규화는
  // 카드 크기와 무관하게 우상·좌하 코너가 항상 offset>1(=소멸)이라 스케일 불변.
  const baseRx = s.w * 0.72;
  const baseRy = s.h * 0.72;
  const baseCorners = [
    {key: 'tl', cx: rC, cy: rC},
    {key: 'br', cx: s.w - rC, cy: s.h - rC},
  ];
  return (
    <View testID="glass-edge" pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {s.w > 1 ? (
        <Svg width={s.w} height={s.h}>
          <Defs>
            {baseCorners.map(c => (
              <SvgRadialGradient
                key={`${c.key}-base`}
                id={`${gid}-${c.key}-base`} gradientUnits="userSpaceOnUse"
                cx={c.cx} cy={c.cy} fx={c.cx} fy={c.cy} rx={baseRx} ry={baseRy}>
                <Stop offset="0" stopColor={T1} stopOpacity={op(GLASS.edgeBase)} />
                <Stop offset="0.45" stopColor={T1} stopOpacity={op(GLASS.edgeBase * 0.85)} />
                <Stop offset="1" stopColor={T1} stopOpacity={0} />
              </SvgRadialGradient>
            ))}
            {corners.map(c => (
              <SvgRadialGradient
                key={c.key}
                id={`${gid}-${c.key}`} gradientUnits="userSpaceOnUse"
                cx={c.cx} cy={c.cy} fx={c.cx} fy={c.cy} rx={glintRx} ry={glintRy}>
                <Stop offset="0" stopColor={T1} stopOpacity={op(c.peak)} />
                {/* 초반 완만한 플래토 — 코너 부근 밝기 변화율을 낮춰 전환을 한층 부드럽게. */}
                <Stop offset="0.14" stopColor={T1} stopOpacity={op(c.peak * 0.92)} />
                <Stop offset="0.42" stopColor={T1} stopOpacity={op(c.peak * 0.4)} />
                <Stop offset="0.72" stopColor={T1} stopOpacity={op(c.peak * 0.11)} />
                <Stop offset="1" stopColor={T1} stopOpacity={0} />
              </SvgRadialGradient>
            ))}
            {sheenOn ? (
              <SvgGradient id={`${gid}-sheen`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={T1} stopOpacity={GLASS.sheen} />
                <Stop offset="0.42" stopColor={T1} stopOpacity={0} />
                <Stop offset="1" stopColor={T1} stopOpacity={0} />
              </SvgGradient>
            ) : null}
          </Defs>
          {/* 상단 광택(면 채움) → 베이스 헤어라인 → 코너 글린트 순으로 쌓는다. */}
          {sheenOn ? (
            <Rect
              x={0} y={0} width={s.w} height={s.h}
              rx={Math.max(0, Math.min(radius, s.w / 2, s.h / 2))}
              fill={`url(#${gid}-sheen)`}
            />
          ) : null}
          {/* 베이스: 히어로(glints)는 좌상 발원 페이드(빛과 같은 서사), 일반(quiet)은
              '균일' 헤어라인 — 페이드 비대칭은 버튼 이중선·스택 카드 아래줄 어긋남을
              만들었다(기기 반복 2026-07-11 확정: 균일이 자연스럽다). */}
          {fade ? (
            baseCorners.map(c => (
              <Rect key={`${c.key}-b`} {...edge(strokeWidth)} fill="none" stroke={`url(#${gid}-${c.key}-base)`} strokeWidth={strokeWidth} />
            ))
          ) : (
            <Rect {...edge(strokeWidth)} fill="none" stroke={T1} strokeOpacity={op(GLASS.edgeBase)} strokeWidth={strokeWidth} />
          )}
          {corners.map(c => (
            <Rect key={c.key} {...edge(strokeWidth)} fill="none" stroke={`url(#${gid}-${c.key})`} strokeWidth={strokeWidth} />
          ))}
        </Svg>
      ) : (
        // 측정 전 폴백(2026-07-26) — SVG 는 실측 폭·높이가 있어야 그릴 수 있는데 onLayout
        // 은 첫 페인트 '다음' 프레임에 온다. 그동안 여기가 null 이라 카드 테두리가 통째로
        // 비었다가 한 프레임 뒤에 켜졌다(마운트·화면 전환마다 유리 엣지가 늦게 들어오는 팝).
        // 같은 색·같은 반경의 균일 헤어라인으로 그 한 프레임을 메운다 — 측정되는 순간
        // SVG(코너 감쇠 포함)가 자리를 대체하므로 최종 시각은 불변이다.
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              borderCurve: 'continuous',
              borderWidth: strokeWidth,
              borderColor: withAlpha(T1, Math.min(1, GLASS.edgeBase * intensity)),
            },
          ]}
        />
      )}
    </View>
  );
}

// ── Ring v2 (arc progress, gradient sweep · optional animated slide) ──────────
// 앱의 모든 원형 진행 링의 단일 진실원(2026-07-16 링 통일 2단계 — 구현도 한 벌).
//  • 정적(기본): 홈 컨디션 게이지·챌린지 미니링 — 기존 동작 그대로(픽셀 동등).
//  • stops: 3스톱 그라데이션(러닝 플로우 = RUN_RING_STOPS 파파야) — 주면 color/color2
//    2스톱 대신 쓴다.
//  • animated: progress 가 바뀔 때마다 strokeDashoffset 이 duration 으로 미끄러진다
//    (구 RunActive 로컬 Ring 의 '흐르는 링' 문법을 프리미티브로 승격).
//  • from: 마운트 시작 진행률 — 카운트다운→러닝 핸드오프(가득 찬 링이 풀려나며 현재
//    진행으로 드레인)와 세리머니(0→1 차오름)의 시작점.
//  • delay/onSweepEnd: 슬라이드 시작 지연·완료 콜백(세리머니 페이드 후 시작 + 완성 햅틱).
/**
 * 신발 수명 링(작게, 줄 앞에). **남은 수명**을 그린다 — 새 신발이 가득 차고 닳을수록
 * 비워지는 배터리 방향이다(2026-07-05 사용자 결정, FuelGauge·홈 링·락커 바와 동일).
 * 색은 4단계 컨디션 램프(최상=파랑 … 교체권장=빨강) 단일 소스.
 *
 * 인자는 **사용률(%)** 이다(0=새 신발). 100을 넘겨도 색은 tier 가 정확히 잡고
 * 링은 빈 채로 멈춘다 — 수명 초과도 정상 상태이지 오류가 아니다.
 *
 * 아래 Ring 과 역할이 다르다: Ring 은 러닝 진행용(애니메이션·핸드오프·세리머니)이라
 * 무겁고, 이건 목록 줄 앞에 붙는 정적 배지다. SocialProfileCard 안에만 있던 것을
 * 러닝화 찾기·비교에서도 쓰게 되어 승격했다(사본 금지 — 램프가 어긋난 전례가 있다).
 */
export function WearRing({pct, size = rs(30)}: {pct: number; size?: number}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const used = Math.max(0, Math.min(1, (Number.isFinite(pct) ? pct : 0) / 100));
  const remain = 1 - used;
  const color = WEAR_TONE_COLOR[wearTier(Number.isFinite(pct) ? pct : 0).tone];
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx="20" cy="20" r={r} fill="none" stroke={withAlpha(T1, 0.1)} strokeWidth={4} />
      <Circle
        cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth={4}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - remain)}
        transform="rotate(-90 20 20)"
      />
    </Svg>
  );
}

const AnimatedRingCircle = Animated.createAnimatedComponent(Circle);

export function Ring({
  size,
  stroke,
  progress,
  children,
  color = ACCENT,
  color2 = ACCENT_2,
  stops,
  animated = false,
  duration = MOTION.dur.ring,
  easing,
  delay = 0,
  from,
  onSweepEnd,
  trackColor = SEP,
}: {
  size: number;
  stroke: number;
  progress: number;
  children?: React.ReactNode;
  color?: string;
  color2?: string;
  /** 3스톱 그라데이션(0 → 0.55 → 1). 러닝 플로우 링은 RUN_RING_STOPS 를 준다. */
  stops?: readonly [string, string, string];
  /** progress 변경 시 부드러운 슬라이드(기본 900ms·quad-out — fix 간격과 맞물림). */
  animated?: boolean;
  duration?: number;
  easing?: (v: number) => number;
  /** 슬라이드 시작 지연(ms) — 세리머니가 페이드인 뒤 차오르게. */
  delay?: number;
  /** 마운트 시작 진행률(핸드오프 인트로). 생략 시 progress 에서 시작(마운트 모션 없음). */
  from?: number;
  /** 슬라이드 완료 콜백(중단 시엔 안 부른다) — 세리머니 완성 햅틱 타이밍. */
  onSweepEnd?: () => void;
  trackColor?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, progress));
  // 정적 링의 progress 기반 id 재생성은 기존 동작 유지(그라데이션 재등록 워크어라운드).
  // 애니메이티드 링은 리렌더마다 id 가 바뀌면 안 되므로 인스턴스 고정 id 를 쓴다.
  const autoId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const staticId = useMemo(
    () => `g${Math.round(pct * 1e6)}_${size}_${stroke}`,
    [pct, size, stroke],
  );
  const id = animated ? `ring-${autoId}` : staticId;
  const anim = useRef(new Animated.Value(Math.max(0, Math.min(1, from ?? pct)))).current;
  const sweepEndRef = useRef(onSweepEnd);
  sweepEndRef.current = onSweepEnd;
  const rm = useReduceMotion();
  useEffect(() => {
    if (!animated) return;
    // 동작 줄이기(DESIGN §6.7): 스윕 생략, 최종 진행도로 점프(완료 콜백은 유지).
    if (rm) {
      anim.setValue(pct);
      sweepEndRef.current?.();
      return;
    }
    const a = Animated.timing(anim, {
      toValue: pct,
      duration,
      delay,
      easing: easing ?? MOTION.ease.quad,
      useNativeDriver: false, // strokeDashoffset = JS 드라이버
    });
    a.start(({finished}) => {
      if (finished) sweepEndRef.current?.();
    });
    return () => a.stop(); // 언마운트/값 교체 시 타이머 정리
  }, [animated, anim, pct, duration, delay, easing, rm]);
  const arcProps = {
    cx: size / 2,
    cy: size / 2,
    r,
    stroke: `url(#${id})`,
    strokeWidth: stroke,
    fill: 'none',
    strokeLinecap: 'round',
    strokeDasharray: c,
  } as const;
  return (
    <View style={[ring.box, {width: size, height: size}]}>
      <Svg width={size} height={size} style={ring.svg}>
        <Defs>
          {stops ? (
            <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={stops[0]} />
              <Stop offset="0.55" stopColor={stops[1]} />
              <Stop offset="1" stopColor={stops[2]} />
            </SvgGradient>
          ) : (
            <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={color2} />
              <Stop offset="1" stopColor={color} />
            </SvgGradient>
          )}
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {animated ? (
          <AnimatedRingCircle
            {...arcProps}
            strokeDashoffset={anim.interpolate({inputRange: [0, 1], outputRange: [c, 0]})}
          />
        ) : (
          <Circle {...arcProps} strokeDashoffset={c * (1 - pct)} />
        )}
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
  size = 'md',
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
  /** hero = 풀폭 대형 CTA(높이 rs54·라벨 heading 700) — 화면 하단 단일 주행동
      (LocationPrime '계속'·Celebration '계속하기' 등). 화면별 수제 54px Pressable 수렴
      (검수 디밸롭 ⑤, 2026-07-17). */
  size?: 'md' | 'hero';
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
        size === 'hero' && btn.hero,
        filled ? btn.glass : btn.flat,
        pressed && !disabled && btn.pressed,
        style,
      ]}>
      {filled ? <GlassEdge glints={false} fade={false} radius={RADIUS.btn} /> : null}
      {iconNode ?? (icon ? <Ionicons name={icon} size={ri(ICON.action)} color={disabled ? T3 : T1} /> : null)}
      <Text style={[btn.label, size === 'hero' && btn.labelHero, disabled && btn.labelDim]}>{label}</Text>
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
  // hero — 화면 하단 단일 주행동 CTA: 고정 높이(수제 rs54 Pressable 들과 픽셀 동등)로
  // 패딩 기반 높이 편차를 없앤다. 풀폭은 호출부 컨테이너가 결정.
  hero: {minHeight: rs(54), paddingVertical: 0, alignSelf: 'stretch'},
  label: {
    color: T1,
    fontFamily: FONT,
    fontSize: TYPE.heading.fontSize,
    fontWeight: '700',
    // 자간 규칙(≥16pt=음수) 정합 — 구 +0.3 은 heading(18) 프리셋과 어긋난 사설값.
    letterSpacing: TYPE.heading.letterSpacing,
  },
  labelHero: {letterSpacing: -0.2}, // 큰 라벨은 자간을 살짝 좁혀(수제 CTA 들과 동일 시감)
  labelDim: {color: T3},
});

// ── Card (GLASS surface · corner-fade hairline · radius) ──────────────────────
// 유리 2위계(2026-07-09 사용자 확정, 2026-07-10 헤어라인 통일): 모든 카드가 같은 재질을
// 공유하되,
//   • quiet(기본) — 반투명 표면(GLASS.fill) + 코너 페이드 헤어라인(GlassEdge glints=false:
//     좌상·우하 발원 베이스 방사가 우상·좌하 코너에서 소멸). 균일 RN 보더 폐지 —
//     콘텐츠 카드·리스트 아이템.
//   • hero — 활성 표면(GLASS.fillActive)만 한 단 밝음, 림은 quiet 와 같은 헤어라인.
//     화면당 소수의 주인공(히어로 카드·핵심 CTA 컨테이너)만.
//     '글린트 림' 차등은 목업 승인 후 실기기 3곳 적용에서 사용자 반려로 폐지
//     (2026-07-17 DESIGN §2 갱신 — 순흑 위에선 헤어라인 하나가 더 프리미엄).
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
      <GlassEdge glints={false} radius={RADIUS.lg} />
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

// ── Rise — 진입 모션 표준(마운트 시 14px 아래→위 페이드인) ─────────────────────
// 홈에서 확립된 유일한 화면 진입 모션(DESIGN.md §6)을 전역 프리미티브로 승격.
// JS 드라이버 — 코드베이스 관례(react-test-renderer 호환). 420ms 단발이라 체감 차이 없음.
export function Rise({delay = 0, children, style}: {delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle>}) {
  const v = useRef(new Animated.Value(0)).current;
  const rm = useReduceMotion();
  useEffect(() => {
    // 동작 줄이기(DESIGN §6.7): 장식 진입 모션은 생략하고 최종 상태로 점프.
    if (rm) { v.setValue(1); return; }
    const anim = Animated.timing(v, {toValue: 1, duration: MOTION.rise.dur, delay, easing: MOTION.ease.out, useNativeDriver: false});
    anim.start();
    return () => anim.stop(); // 언마운트 시 타이머 정리
  }, [v, delay, rm]);
  return (
    <Animated.View style={[{opacity: v, transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [MOTION.rise.dy, 0]})}]}, style]}>
      {children}
    </Animated.View>
  );
}

// ── 고스트 빈 상태 부품(앱 전역 표준 — 2026-07-09 사용자 확정) ──────────────────
// 빈 화면은 '채워질 모습'을 실루엣으로 말한다(홈 GhostShoeCard 문법의 전역화).
// 중앙 히어로·안내문 박스 폐지 — 상단 시작: EmptyGhostHeader(타이포) + 실카드와
// 같은 재질의 고스트 아이템(내용만 딤 실루엣). 점선 금지(유틸리티 드롭존으로 읽힘).
// 화면은 이 부품으로 실카드 레이아웃을 그대로 흉내 낸다 — 실카드가 진화하면 고스트도 따라온다.
export function EmptyGhostHeader({title, sub}: {title: string; sub?: React.ReactNode}) {
  return (
    <View style={ghostS.head}>
      <Text style={ghostS.title}>{title}</Text>
      {sub ? <Text style={ghostS.sub}>{sub}</Text> : null}
    </View>
  );
}
/** 헤더 sub 안에서 강조할 단어를 감싼다(예: '보관 처리'). */
export function GhostStrong({children}: {children: React.ReactNode}) {
  return <Text style={ghostS.strong}>{children}</Text>;
}
/** 텍스트 실루엣 바. w = 퍼센트/px 폭, dim = 두 번째 줄 톤. */
export function GhostBar({w, dim, style}: {w: number | `${number}%`; dim?: boolean; style?: StyleProp<ViewStyle>}) {
  return <View style={[ghostS.bar, dim && ghostS.barDim, {width: w}, style]} />;
}
/** 썸네일 실루엣(글리프 자리). */
export function GhostThumb({size = 44, children}: {size?: number; children?: React.ReactNode}) {
  return <View style={[ghostS.thumb, {width: rs(size), height: rs(size)}]}>{children}</View>;
}
/** 비활성 액션 실루엣(예: '복원' 알약). */
export function GhostPill({label}: {label: string}) {
  return (
    <View style={ghostS.pill}>
      <Text style={ghostS.pillText}>{label}</Text>
    </View>
  );
}
const ghostS = StyleSheet.create({
  // 에디토리얼 스케일(2026-07-10 사용자 확정 — '에디토리얼 타이포 + 고스트 1~2장'):
  // 타이포가 빈 화면의 주인공, 고스트는 1~2장만 받쳐준다.
  head: {paddingHorizontal: rs(4), marginBottom: SPACE.xl},
  title: {color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: TYPE.title.letterSpacing, lineHeight: Math.round(TYPE.title.fontSize * LEADING.ui), marginTop: SPACE.xs},
  sub: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(22), marginTop: SPACE.md},
  strong: {color: T2, fontWeight: '700'},
  bar: {height: rs(9), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.1)},
  barDim: {backgroundColor: withAlpha(T1, 0.07), marginTop: rs(7)},
  thumb: {borderRadius: RADIUS.sm, backgroundColor: withAlpha(T1, 0.05), alignItems: 'center', justifyContent: 'center'},
  pill: {paddingHorizontal: rs(14), paddingVertical: rs(8), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.05)},
  pillText: {color: withAlpha(T1, 0.3), fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
});

// ── SegmentedControl (탭 스트립 단일 프리미티브) ───────────────────────────────
// 앱 전역 탭 스트립의 단일 '필' 문법(2026-07-25 민우님 목업 확정 — 4 variant 폐지).
// 과거 neutral/raised/accentTint/accentSolid 가 사용처별 원본 외형을 1:1 복원하던 것을
// 회수하고 표면을 하나로 고정한다:
//   컨테이너 = CARD + CARD_BORDER 헤어라인(SEP 급) + pill · padding 3 · gap 4
//   선택 칩  = 흰 12% 유리 + 흰 22% 헤어라인(pill)
// 남은 축은 크기뿐: md(주 탭 — 높이 38 · 글자 15) · sm(설정/보조 — 32 · 14).
// off = T3·500, on = T1·700. 시각 높이 < 44pt 는 세로 hitSlop 으로 실효 터치 타깃
// 44pt 를 보장한다(HIG — md 38+3·2, sm 32+6·2).
// block=false 면 항목이 내용폭(hug)으로 줄고(profile recap 처럼 인라인), 기본은 flex 균등.
export type SegmentItem = {key: string; label: string};
export type SegSize = 'md' | 'sm';

const SEG_SIZES: Record<SegSize, {item: ViewStyle; text: TextStyle; vslop: number}> = {
  md: {item: {height: rs(38)}, text: {fontSize: rf(15)}, vslop: 3},
  sm: {item: {height: rs(32)}, text: {fontSize: rf(14)}, vslop: 6},
};

export function SegmentedControl({
  items,
  value,
  onChange,
  size = 'md',
  block = true,
  role = 'button',
  labelFor,
  testIDFor,
  style,
}: {
  items: SegmentItem[];
  value: string;
  onChange: (key: string) => void;
  size?: SegSize;
  block?: boolean;
  role?: 'button' | 'tab';
  labelFor?: (item: SegmentItem, selected: boolean) => string;
  testIDFor?: (item: SegmentItem) => string;
  style?: StyleProp<ViewStyle>;
}) {
  const sz = SEG_SIZES[size];
  return (
    <View style={[seg.row, style]}>
      {items.map(item => {
        const on = item.key === value;
        return (
          <Pressable
            key={item.key}
            testID={testIDFor ? testIDFor(item) : undefined}
            onPress={() => onChange(item.key)}
            hitSlop={{top: sz.vslop, bottom: sz.vslop}}
            accessibilityRole={role}
            accessibilityState={{selected: on}}
            accessibilityLabel={labelFor ? labelFor(item, on) : item.label}
            style={({pressed}) => [
              seg.item,
              block ? seg.block : seg.hug,
              sz.item,
              on && seg.itemOn,
              pressed && !on && {opacity: 0.7},
            ]}>
            <Text style={[seg.label, sz.text, on ? seg.textOn : seg.textOff]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const seg = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: RADIUS.pill,
    borderCurve: 'continuous',
    padding: rs(3),
    gap: rs(4),
  },
  item: {alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.pill},
  block: {flex: 1},
  // hug(인라인) 항목은 내용폭 + 좌우 패딩으로 칩을 만든다(block 은 flex 균등이라 불필요).
  hug: {paddingHorizontal: rs(14)},
  itemOn: {
    backgroundColor: withAlpha(T1, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(T1, 0.22),
  },
  label: {fontFamily: FONT},
  textOff: {color: T3, fontWeight: '500'},
  textOn: {color: T1, fontWeight: '700'},
});

// ── Stat / StatGrid (스탯 셀 + 그리드 단일 프리미티브) ─────────────────────────
// 화면마다 손으로 짜던 스탯 그리드(누적 기록 · 개인 기록 · 리캡 요약 · 진척 스탯줄 ·
// 러닝 상세 2×3)를 하나로 통합한다. 한 셀 = 큰 값(DISPLAY·tabular-nums) + 위첨자 단위
// (T3) + 라벨(T3). 타이포는 NUMERIC 램프 한 벌로 고정(2026-07-25 민우님 목업 확정 —
// 과거 valueSize/unitSize/… 사이트별 픽셀 복원 탈출구 prop 10개 회수): 값 = NUMERIC[size]
// (700 고정·음수 자간·tabular), 단위 = 13 T3(값 Text 안 중첩 = baseline), 라벨 = caption T3.
// align='center' 는 카드 안 균등 줄, 'left' 는 2×3 좌측 정렬 그리드. divided 면 좌측
// 헤어라인 구분선(첫 칸 제외).
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
  size = 'md',
  divided = false,
  style,
  testID,
}: {
  value: string | number;
  unit?: string;
  label?: string;
  top?: React.ReactNode;
  align?: 'center' | 'left';
  /** NUMERIC 램프 단계 — sm(보조 그리드) · md(기본) · lg(히어로 급). */
  size?: NumericSize;
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
        divided && statS.divided,
        style,
      ]}>
      {top}
      <Text style={[statS.value, NUMERIC[size]]}>
        {value}
        {unit ? <Text style={statS.unit}>{unit}</Text> : null}
      </Text>
      {label != null ? <Text style={statS.label}>{label}</Text> : null}
    </View>
  );
}

export function StatGrid({
  items,
  align = 'center',
  divider = false,
  columns,
  size = 'md',
  inset = 'none',
  style,
  testID,
}: {
  items: StatItem[];
  align?: 'center' | 'left';
  divider?: boolean;
  // columns 지정 시 wrap 그리드(각 칸 100/columns% 폭, 예 2×3=3). 미지정이면 flex 균등 줄.
  columns?: number;
  size?: NumericSize;
  /**
   * 카드 안쪽 여백 — 소비처가 style 로 각자 패딩을 발명하던 탈출구를 이름 있는 변형으로
   * 수렴한다(2026-07-26). 네 화면이 16/18/20 + rowGap 을 제각각 쓰고 있었다.
   *  · none — 여백 없음(부모가 소유). 기본값이라 기존 무패딩 소비처는 불변.
   *  · card — 카드 안 그리드: 상하좌우 여백 + 행 간격(2행 이상 격자용).
   *  · band — 카드 안 한 줄 띠: 상하 여백만(좌우는 칸 divider 가 리듬을 잡는다).
   */
  inset?: 'none' | 'card' | 'band';
  /** 바깥 여백·정렬 전용(부모 레이아웃 몫). 안쪽 패딩은 inset 으로 준다. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const wrap = columns != null;
  return (
    <View
      testID={testID}
      style={[
        wrap ? statS.gridWrap : statS.gridRow,
        inset === 'card' && statS.insetCard,
        inset === 'band' && statS.insetBand,
        style,
      ]}>
      {items.map((it, i) => (
        <Stat
          key={it.testID ?? `${it.label ?? ''}-${i}`}
          value={it.value}
          unit={it.unit}
          label={it.label}
          top={it.top}
          testID={it.testID}
          align={align}
          size={size}
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
  // 카드 안 그리드 표준 — 좌우 16 은 앱 전역 카드 패딩(padding: rs(16))과 같은 값이라
  // 그리드가 든 카드와 형제 카드의 안쪽 여백이 맞는다.
  insetCard: {paddingVertical: rv(16), paddingHorizontal: rs(16), rowGap: rv(18)},
  // 한 줄 띠 — 좌우 여백 없이 상하만. 칸 사이 divider 가 가로 리듬을 소유한다.
  insetBand: {paddingVertical: rv(16)},
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
  // 단위/라벨은 NUMERIC 규칙으로 고정: 단위 13(T3, 값 Text 중첩 = baseline) · 라벨 caption(T3).
  unit: {color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '600'},
  label: {
    color: T3,
    fontFamily: FONT,
    fontSize: TYPE.caption.fontSize,
    fontWeight: TYPE.caption.fontWeight,
    letterSpacing: TYPE.caption.letterSpacing,
    marginTop: 4,
  },
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

// (구 TierBadge 3단계 배지 컴포넌트는 2026-07-11 제거 — 모든 화면이 wearTier 4단계
//  칩으로 통일돼 소비처가 사라졌다.)

// ── Toggle — iOS 스타일 스위치(작은 트랙 + 슬라이드 썸) ─────────────────────────
// 설정 on/off 의 단일 프리미티브(2026-07-16 사용자 확정: "우측에 작게, 주황, 좌우로
// 움직이게"). 풀폭 솔리드 바 토글을 대체한다 — 행은 무채, 색은 이 작은 트랙에만.
// ON 트랙 = BRAND(파파야), OFF = 무채. 썸은 180ms 슬라이드(native driver).
// 자체 Pressable 이 아니다 — 행 전체가 탭 영역이 되도록 부모 Pressable 안에 놓는다.
const TOGGLE_W = 46;
const TOGGLE_H = 28;
const TOGGLE_PAD = 3;
const TOGGLE_THUMB = TOGGLE_H - TOGGLE_PAD * 2;

export function Toggle({on}: {on: boolean}) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: on ? 1 : 0,
      duration: MOTION.dur.fast,
      easing: MOTION.ease.out,
      useNativeDriver: true,
    }).start();
  }, [on, v]);
  const tx = v.interpolate({inputRange: [0, 1], outputRange: [0, rs(TOGGLE_W - TOGGLE_H)]});
  return (
    <View style={[toggle.track, {backgroundColor: on ? BRAND : withAlpha(T1, 0.14)}]}>
      <Animated.View style={[toggle.thumb, {transform: [{translateX: tx}]}]} />
    </View>
  );
}

const toggle = StyleSheet.create({
  track: {
    width: rs(TOGGLE_W),
    height: rs(TOGGLE_H),
    borderRadius: RADIUS.pill,
    padding: rs(TOGGLE_PAD),
    justifyContent: 'center',
  },
  thumb: {
    width: rs(TOGGLE_THUMB),
    height: rs(TOGGLE_THUMB),
    borderRadius: RADIUS.pill,
    backgroundColor: T1,
  },
});

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
        size={ri(ICON.inline)}
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
// 보이던 cramping 을 해소한다. 숫자는 DISPLAY + tabular-nums 로 자리수 흔들림을 막는다.
// 타이포는 NUMERIC 램프 한 벌(2026-07-25 수렴): 값 = NUMERIC[size], 단위 = 13 고정
// (과거 Math.max(11, size*0.42) 매직 비율 폐지).
export function Metric({
  value,
  unit,
  size = 'md',
  color = T1,
  align = 'left',
  style,
}: {
  value: string | number;
  unit?: string;
  size?: NumericSize;
  color?: string;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[metric.row, align === 'center' && metric.center, style]}>
      <Text style={[metric.value, NUMERIC[size], {color}]}>{value}</Text>
      {unit ? <Text style={[metric.unit, {color}]}>{unit}</Text> : null}
    </View>
  );
}

const metric = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs},
  center: {justifyContent: 'center'},
  value: {
    fontFamily: DISPLAY,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  unit: {
    fontFamily: FONT,
    fontSize: rf(13),
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
    letterSpacing: TYPE.label.letterSpacing, // 사설 +0.4 → label 프리셋 정합(자간 단일 규칙)
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
  {icon: 'shoe', label: '러닝화', shoe: true},
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
  // 독이 떠 있는 동안 전역 토스트에 하단 클리어런스를 알린다 — 토스트가 독을 가리고
  // '실행취소'가 탭 터치와 충돌하던 P0(2026-07-24 심사 #3). 값 = 독 62 + wrap 상단 6.
  // 탭 전환 시 이전 화면 TabBar 정리(0) → 새 TabBar 설정 순서라 최종값이 항상 남는다.
  useEffect(() => {
    setToastClearance(rs(62) + rv(6));
    return () => setToastClearance(0);
  }, []);
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
                  <Ionicons name={on ? tab.icon : `${tab.icon}-outline`} size={ri(ICON.nav)} color={color} />
                )}
              </View>
              {/* 탭 라벨 복원(HIG 권고, 2026-07-25 민우님 확정) — 아이콘 온리에서 전환.
                  독 안이라 배율 상한은 1.2(레이아웃 보존). 활성=700 으로 오벌과 함께 이중 신호. */}
              <Text
                style={[t.label, {color, fontWeight: on ? '700' : '500'}]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}>
                {tab.label}
              </Text>
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
    minHeight: rs(62),
    // 좌우 안쪽 패딩 9 — 끝 탭 하이라이트가 독 가장자리에서 6dp 뜨게 해(끝 pill left
    // = paddingLeft - HL_PAD/2 = 9 - 3 = 6) 상하 여백(=(62-50)/2=6)과 정확히 일치시킨다.
    paddingHorizontal: rs(9),
    borderRadius: RADIUS.pill,
    overflow: 'hidden',                       // 하이라이트를 알약으로 클립
    borderWidth: StyleSheet.hairlineWidth,
    // 테두리를 또렷이(0.10→0.20) — 캡슐이 검정 배경과 분리돼 보이도록.
    borderColor: withAlpha(T1, 0.20),
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
    marginTop: -rs(50) / 2,        // 세로 정중앙 — height rs(50)과 같은 축(rs)으로(구 rv 축 불일치 수정)
    borderRadius: RADIUS.pill,
    // 활성 하이라이트 강화(0.15→0.24) — 비활성 아이콘이 밝아진 만큼 활성 탭을 또렷이.
    backgroundColor: withAlpha(T1, 0.24),
  },
  item: {flex: 1, minHeight: rs(62), alignItems: 'center', justifyContent: 'center', gap: rv(2)},
  label: {fontFamily: FONT, fontSize: rf(11), letterSpacing: 0.1},
});

// ═══════════════════════════════════════════════════════════════════════════
// 2026-07-25 프리미티브 신설(HIG 심사 4차) — 화면들이 각자 재발명하던 5가지를 승격.
// 전부 '기존 승인된 look 의 통합'이며 새 비주얼 언어가 아니다(자율 범위).
// ═══════════════════════════════════════════════════════════════════════════

// GlassEdge memo 승격(2026-07-25 심사 P2 #68): 카드마다 방사 그라데이션 2~4개짜리
// SVG 를 들고 리스트를 스크롤하므로, props 불변이면 리렌더를 건너뛴다(순수 표시 컴포넌트).
export const GlassEdge = React.memo(GlassEdgeBase);

// ── 소셜 로그인 브랜드 심벌(공식 로고 지오메트리) ────────────────────────────────
// 카카오 말풍선·네이버 N 을 공식 심벌 패스로 렌더한다 — 구 Pretendard 글자 "K"/"N"
// 렌더는 양사 브랜드 가이드(공식 심벌 필수) 위반 + 위조 로고로 보였음(2026-07-24 심사).
// 색은 소비처가 theme 브랜드 토큰(KAKAO_LABEL/NAVER_LABEL)으로 지정한다.
export function KakaoMark({size, color}: {size: number; color: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <SvgPath
        fill={color}
        d="M12 3C6.48 3 2 6.54 2 10.9c0 2.77 1.79 5.2 4.49 6.6-.15.52-.96 3.33-.99 3.55 0 0-.02.17.09.24.11.07.24.02.24.02.32-.04 3.7-2.42 4.28-2.83.61.09 1.24.13 1.89.13 5.52 0 10-3.54 10-7.91C22 6.54 17.52 3 12 3z"
      />
    </Svg>
  );
}
export function NaverMark({size, color}: {size: number; color: string}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <SvgPath fill={color} d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" />
    </Svg>
  );
}

// ── useReduceMotion — 시스템 '동작 줄이기' 존중(DESIGN §6.7) ─────────────────
// Onboarding/RunRecap 에 2벌 복붙돼 있던 훅의 공용 승격. 장식 모션(Rise·링 스윕·
// 무한 loop)은 이 훅을 존중한다 — 전정장애 사용자에게 무한 반복은 리젝 사유.
export function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => {
      if (alive) setRm(v);
    }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return rm;
}

// ── Skeleton — 고스트 로딩 블록(스피너 폐지 정본의 단위 부품) ───────────────────
// App.tsx 안에 사유화돼 있던 SkelBlock 의 공용 승격 — 모든 화면이 같은 로딩 실루엣
// 언어를 쓰게 한다. 표면 = CARD_HI(부팅 스켈레톤과 동일 시각).
export function Skeleton({h, w, radius = RADIUS.sm, style}: {
  h: number; w?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[{height: h, width: w ?? '100%', borderRadius: radius, borderCurve: 'continuous', backgroundColor: CARD_HI}, style]}
    />
  );
}

// ── Input — 표준 텍스트 입력(8개 화면 인라인 재조립의 통합) ─────────────────────
// lib/text.TextInput(배율 상한+다크 키보드) 위에 유리 표면·RADIUS.input(14)·
// placeholder T3·44pt 최소 높이를 묶는다. 화면은 style 로 여백만 더한다.
export function Input({style, variant = 'box', ...props}: TextInputProps & {variant?: 'box' | 'inline'}) {
  return (
    <TextInput
      placeholderTextColor={T3}
      {...props}
      style={[variant === 'inline' ? inputS.inline : inputS.base, style]}
    />
  );
}
const inputS = StyleSheet.create({
  base: {
    backgroundColor: GLASS.fill,
    borderRadius: RADIUS.input, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER,
    color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize,
    paddingHorizontal: rs(14), paddingVertical: rv(12),
    minHeight: rs(TOUCH_TARGET),
  },
  // inline: 밑줄형 인라인 에디터(프로필 이름·리캡 메모 문법) — 유리 카드 '안'이나
  // 아이덴티티 행처럼 박스가 이중이 되는 자리 전용. 밑줄 색은 소비처가 style 로
  // (편집 활성 = ACCENT 등 상태 표현).
  inline: {
    color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize,
    paddingHorizontal: 0, paddingVertical: rv(6),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: withAlpha(T1, 0.3),
    minHeight: rs(36),
  },
});

// ── ScreenHeader — back-chevron 내비 헤더(10개 화면 수제 조립의 통합) ───────────
// 기존 시각(iconBtn 38 pill · CARD_HI · 흰 12% 보더) 그대로. 타이틀 중앙, 좌우
// 슬롯 균형(spacer)으로 어느 화면에서도 타이틀이 같은 자리에 선다. 터치 44pt 보정.
export function ScreenHeader({title, onBack, backLabel = '뒤로', right, testID, style}: {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[hdrS.row, style]} testID={testID}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          style={({pressed}) => [hdrS.iconBtn, pressed && {transform: [{scale: MOTION.press.scale}], opacity: MOTION.press.opacity}]}>
          <Ionicons name="chevron-back" size={ri(ICON.action)} color={T1} />
        </Pressable>
      ) : <View style={hdrS.spacer} />}
      {title != null ? <Text style={hdrS.title} numberOfLines={1}>{title}</Text> : <View style={{flex: 1}} />}
      {right ?? <View style={hdrS.spacer} />}
    </View>
  );
}
const hdrS = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, paddingVertical: rv(8), gap: rv(8)},
  iconBtn: {width: rs(38), height: rs(38), borderRadius: RADIUS.pill, backgroundColor: CARD_HI, borderWidth: 1, borderColor: withAlpha(T1, 0.12), alignItems: 'center', justifyContent: 'center'},
  spacer: {width: rs(38)},
  title: {flex: 1, textAlign: 'center', color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600', letterSpacing: TYPE.heading.letterSpacing},
});

// ── BottomSheet — 시그니처 420ms 시트(수제 Modal 6벌의 통합) ────────────────────
// 정본 모션(MOTION.dur.sheet · inOut-cubic — '나이키 문법' 일시정지 시트와 동일
// 시그니처)이 드디어 모든 시트에 적용된다. 구 수제 시트들은 네이티브 slide 고정이라
// 자기 시그니처를 자기 시트가 안 썼다(2026-07-24 심사 P1 #18). 표면 = CARD +
// 상단 RADIUS.xl(HistoryScreen 승인 문법). 헤더는 취소/타이틀/확인 3슬롯(선택).
// reduce-motion·jest 에선 무전환 점프. 드래그 dismiss 는 미구현 — 그래버를 그리지
// 않는다(거짓 어포던스 금지).
const SHEET_TEST = !!(typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID);
export function BottomSheet({visible, onClose, title, cancelLabel = '취소', confirmLabel, onConfirm, children, testID}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const rm = useReduceMotion();
  const [shown, setShown] = useState(visible);
  const [sheetH, setSheetH] = useState(0);
  const v = useRef(new Animated.Value(0)).current;
  const skip = rm || SHEET_TEST;

  useEffect(() => {
    if (visible) {
      setShown(true);
      if (skip) { v.setValue(1); return; }
      Animated.timing(v, {toValue: 1, duration: MOTION.dur.sheet, easing: MOTION.ease.inout, useNativeDriver: true}).start();
    } else {
      if (skip) { v.setValue(0); setShown(false); return; }
      Animated.timing(v, {toValue: 0, duration: MOTION.dur.sheet, easing: MOTION.ease.inout, useNativeDriver: true}).start(({finished}) => {
        if (finished) setShown(false);
      });
    }
    // v 는 ref — deps 불필요. skip 변화는 다음 토글에 반영되면 충분.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!shown) return null;
  const slide = v.interpolate({inputRange: [0, 1], outputRange: [Math.max(sheetH, 120), 0]});
  const hasHeader = !!(title || confirmLabel);
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} testID={testID}>
      <Animated.View style={[StyleSheet.absoluteFill, {backgroundColor: SCRIM, opacity: v}]}>
        <Pressable style={{flex: 1}} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
      </Animated.View>
      <View style={sheetS.host} pointerEvents="box-none">
        <Animated.View
          onLayout={e => setSheetH(e.nativeEvent.layout.height)}
          style={[sheetS.sheet, {paddingBottom: insets.bottom + rv(16), transform: [{translateY: slide}]}]}>
          {hasHeader && (
            <View style={sheetS.header}>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={sheetS.cancel}>{cancelLabel}</Text>
              </Pressable>
              <Text style={sheetS.title} numberOfLines={1}>{title}</Text>
              {confirmLabel ? (
                <Pressable onPress={onConfirm} hitSlop={12} accessibilityRole="button">
                  <Text style={sheetS.confirm}>{confirmLabel}</Text>
                </Pressable>
              ) : <View style={{width: rs(32)}} />}
            </View>
          )}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
const sheetS = StyleSheet.create({
  host: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderCurve: 'continuous',
  },
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingVertical: rv(16)},
  cancel: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize},
  title: {flex: 1, textAlign: 'center', color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  confirm: {color: ACCENT, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
});
