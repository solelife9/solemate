// ============================================================================
// primitives.tsx — shared Keego UI primitives
// Ring · TabBar · Button · Card · Pill/Badge(TierBadge) · Metric ·
// KeegoWordmark · SectionTitle · status-color helpers.
// All colour/spacing/radius/type values come from theme tokens (no raw hex).
// Deps: react-native-svg, react-native-vector-icons
// ============================================================================
import React, {useId, useMemo, useRef, useState, useEffect} from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  LayoutChangeEvent,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BlurView} from '@react-native-community/blur';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import {
  BG,
  CARD,
  CARD_DIM,
  CARD_HI,
  ACCENT,
  ACCENT_2,
  GRAD_TOP,
  GRAD_BOT,
  WARN,
  DANGER,
  GOOD,
  T1,
  T3,
  SEP,
  CARD_BORDER,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  TYPE,
  withAlpha,
} from './theme';
import {tierBadge, ShoeCondition} from './lib/shoe';
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

// ── Gradient fill (orange CTA surface, accent → accent2) ──────────────────────
// CTA 버튼 배경의 오렌지 그라데이션을 absolute SVG 레이어로 깐다(expo-linear-gradient
// 의존 없이 react-native-svg 만으로). 부모 Pressable 엔 overflow:hidden 이 없지만(글로우
// 보존), 그라데이션 Rect 가 rx 로 자체 라운딩하므로 모서리 클립이 필요 없다(이건 SVG
// gradient 에만 참 — plain View 인 gloss 는 자기 모서리를 직접 둥글린다, btn.gloss 참고).
// useId 로 그라데이션 id 충돌을 막는다(같은 화면 다중 CTA 안전).
function GradientFill({
  radius,
  colors = [GRAD_TOP, GRAD_BOT],
}: {
  radius: number;
  colors?: [string, string];
}) {
  const id = `keego-grad-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </SvgGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx={radius}
        ry={radius}
        fill={`url(#${id})`}
      />
    </Svg>
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

// ── Button — 단일 CTA 프리미티브 (앱 전역 주황 버튼의 유일한 출처) ──────────────
// 목업 주황 버튼을 1:1 재현한다:
//   • 세로 그라데이션 GRAD_TOP→GRAD_BOT (theme 토큰, GradientFill 단일 정의)
//   • 상단 1px 안쪽 하이라이트(유리 광택) — gloss 가 위쪽 모서리를 RADIUS.btn 으로
//     스스로 둥글린다(base 에 overflow:hidden 이 없으므로 클립을 못 받는다)
//   • 주황 글로우 그림자(ACCENT) — overflow 를 걸지 않아 iOS 에서도 잘리지 않는다
//     (그라데이션 Rect 는 rx 로, gloss 는 borderTopRadius 로 각자 모서리를 둥글린다)
//   • 누르면 살짝 작아짐(scale .97)
// 모서리는 RADIUS.btn 단일 토큰(과거 14/16/18 사각 CTA 혼재 제거). disabled 거나
// ghost 면 그라데이션/글로우를 끄고 CARD_HI 표면으로 떨어진다(disabled 라벨 dim).
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
}: {
  label: string;
  onPress?: () => void;
  variant?: 'cta' | 'ghost';
  icon?: string;
  iconNode?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  // filled = 주황 그라데이션 CTA 표면(활성 cta 일 때만). ghost·disabled 는 CARD_HI 표면.
  const filled = variant === 'cta' && !disabled;
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      style={({pressed}) => [
        btn.base,
        filled ? btn.glow : btn.flat,
        pressed && !disabled && btn.pressed,
        style,
      ]}>
      {filled ? <GradientFill radius={RADIUS.btn} /> : null}
      {filled ? <View pointerEvents="none" style={btn.gloss} /> : null}
      {iconNode ?? (icon ? <Ionicons name={icon} size={20} color={disabled ? T3 : T1} /> : null)}
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
  },
  // 주황 글로우 그림자(목업 0 14px 30px -12px rgba(255,101,0,.6) 대응). base 에
  // overflow 가 없어 iOS 에서도 그림자가 살아있다.
  glow: {
    shadowColor: ACCENT,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 12},
    elevation: 10,
  },
  // ghost / disabled 표면(올린 카드 톤). 그라데이션·글로우 없음.
  flat: {backgroundColor: CARD_HI},
  // 상단 1px 유리 광택. base 에 overflow:hidden 이 없으므로(글로우 보존) 이 plain
  // View 는 스스로 위쪽 두 모서리를 RADIUS.btn 으로 둥글려야 한다 — 안 그러면 흰
  // 사각 픽셀이 둥근 모서리 밖으로 삐져나온다(과거 MockupButton 의 inner clip 대체).
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderTopLeftRadius: RADIUS.btn,
    borderTopRightRadius: RADIUS.btn,
  },
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
export function Card({
  children,
  style,
  padded = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[card.base, padded && card.padded, style]}>{children}</View>;
}

const card = StyleSheet.create({
  base: {
    backgroundColor: CARD,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
  },
  padded: {padding: SPACE.lg},
});

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
      borderRadius: 13,
      padding: 3,
      gap: 3,
    },
    item: {minHeight: 44, paddingVertical: 6, borderRadius: 10},
    itemOn: {backgroundColor: withAlpha(T1, 0.09)},
    textOff: {color: T3, fontSize: 14, fontWeight: '500'},
    textOn: {color: T1, fontSize: 14, fontWeight: '700'},
  },
  raised: {
    container: {
      backgroundColor: CARD,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: CARD_BORDER,
      borderRadius: RADIUS.pill,
      padding: 4,
      gap: 6,
    },
    item: {paddingVertical: 9, borderRadius: RADIUS.pill},
    itemOn: {backgroundColor: CARD_HI},
    textOff: {color: T3, fontSize: 13, fontWeight: '700'},
    textOn: {color: T1, fontSize: 13, fontWeight: '700'},
  },
  accentTint: {
    container: {
      backgroundColor: CARD,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: CARD_BORDER,
      borderRadius: 14,
      padding: 4,
      gap: 4,
    },
    item: {height: 38, borderRadius: 10},
    itemOn: {
      backgroundColor: withAlpha(ACCENT, 0.16),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(ACCENT, 0.28),
    },
    textOff: {color: T3, fontSize: 14, fontWeight: '600'},
    textOn: {color: ACCENT, fontSize: 14, fontWeight: '600'},
  },
  accentSolid: {
    container: {
      backgroundColor: CARD_DIM,
      borderRadius: RADIUS.pill,
      padding: 3,
      gap: 2,
    },
    item: {paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.pill},
    itemOn: {backgroundColor: ACCENT},
    textOff: {color: T3, fontSize: 13, fontWeight: '600'},
    textOn: {color: T1, fontSize: 13, fontWeight: '600'},
  },
};

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
  valueSize = 21,
  valueWeight = '700',
  valueLS = 0.2,
  unitSize = 12,
  unitWeight = '600',
  labelSize = 12,
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
  valueSize = 21,
  valueWeight = '700',
  valueLS = 0.2,
  unitSize = 12,
  unitWeight = '600',
  labelSize = 12,
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
  sm: {gap: SPACE.xs, paddingHorizontal: SPACE.sm, paddingVertical: 3},
  md: {gap: 5, paddingHorizontal: 11, paddingVertical: 5},
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
        size={17}
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
    gap: 9,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 12,
  },
  text: {
    flex: 1,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 18,
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

// ── Keego wordmark (오렌지 그라데이션 텍스트) ─────────────────────────────────
// 'Keego' 를 accent → accent2 가로 그라데이션으로 칠한 워드마크. RN 에서 그라데이션
// 텍스트는 SVG <Text> + LinearGradient 로 구현한다(masked-view/expo 의존 없음).
export function KeegoWordmark({
  size = 24,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `keego-wm-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const text = 'Keego';
  const width = Math.ceil(size * (text.length * 0.66 + 0.4));
  const height = Math.ceil(size * 1.3);
  return (
    <Svg width={width} height={height} style={style}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={ACCENT} />
          <Stop offset="1" stopColor={ACCENT_2} />
        </SvgGradient>
      </Defs>
      <SvgText
        x="0"
        y={Math.round(size * 0.95)}
        fontFamily={DISPLAY}
        fontSize={size}
        fontWeight="800"
        letterSpacing={-0.6}
        fill={`url(#${id})`}>
        {text}
      </SvgText>
    </Svg>
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
const SHOE_PATH =
  'M222-79q-32 0-61.5-12T108-127l-7-7q-9-8-11.5-20t2.5-23l194-495q8-20 27.5-30.5T354-708l58 11q17 4 32.5-2.5T471-717q14-15 18.5-31.5T489-782l-5-15q-5-16-1.5-32.5T498-858l43-43q17-18 42.5-18t42.5 17l181 184q22 23 22.5 54.5T809-609l19 19q6 7 10.5 14.5T843-560q0 7-3 14t-11 15q-12 11-28.5 11.5T772-531l-18-19-28 29 18 18q11 11 11 28t-11 28q-12 11-28.5 11.5T687-447l-18-17-112 114 17 16q12 12 12 28.5T574-277q-12 11-28.5 11.5T517-277l-16-17-28 29 16 16q11 11 11 28t-11 28q-12 11-28.5 11.5T432-193l-16-15-28 28 16 15q11 12 11 28.5T404-108q-12 11-28.5 11.5T347-108l-16-16q-23 23-50.5 34T222-79Zm-57-283q5-11 8-19.5l3-8.5-22 56 3.5-8.5Q161-351 165-362Zm39-100q5-11 8-19.5l3-8.5-22 56 3.5-8.5Q200-451 204-462Zm39-100q5-11 8-19l3-8-22 55 3.5-8.5Q239-551 243-562Zm-21 402q17 0 31.5-6t25.5-18l471-478-166-169-20 20q12 40 4.5 78T528-662q-26 26-60 38.5t-71 4.5l-41-8-25 61 23 8q11 5 16 16t1 22q-4 12-15 18t-23 1l-24-9-17 44 19 7q11 5 16.5 16t1.5 22q-4 12-15.5 17.5t-23.5.5l-20-7-17 44 16 6q11 5 16 15.5t1 21.5q-4 12-15.5 18t-23.5 1l-16-6-54 136q10 7 21.5 10.5T222-160Zm242-336Z';

function ShoeIcon({color}: {color: string}) {
  return (
    <Svg width={25} height={25} viewBox="0 -960 960 960">
      <Path d={SHOE_PATH} fill={color} />
    </Svg>
  );
}

const TABS: {icon: string; label: string; shoe?: boolean; flip?: boolean}[] = [
  {icon: 'home', label: '홈'},
  {icon: 'shoe', label: '신발', shoe: true, flip: true},
  {icon: 'time', label: '기록'},
  {icon: 'person', label: '마이'},
];

export function TabBar({active, onTab}: {active: number; onTab: (i: number) => void}) {
  const insets = useSafeAreaInsets();
  // 각 탭의 x중심/폭을 onLayout 으로 측정해 하이라이트를 정확히 정렬한다.
  const [slots, setSlots] = useState<{x: number; w: number}[]>([]);
  const hlX = useRef(new Animated.Value(0)).current;
  const hlW = useRef(new Animated.Value(0)).current;

  const onSlot = (i: number) => (e: LayoutChangeEvent) => {
    const {x, width} = e.nativeEvent.layout;
    setSlots(prev => {
      const next = [...prev];
      next[i] = {x, w: width};
      return next;
    });
  };

  // 활성 인덱스/측정값이 바뀌면 하이라이트를 그 탭으로 이동(살짝 오버슈트).
  useEffect(() => {
    const s = slots[active];
    if (!s) return;
    const pad = 6;                 // 좌우로 살짝 넓게(위아래 여백과 균형)
    const w = s.w + pad;
    const x = s.x + (s.w - w) / 2;
    Animated.parallel([
      Animated.spring(hlX, {toValue: x, useNativeDriver: false, speed: 16, bounciness: 9}),
      Animated.spring(hlW, {toValue: w, useNativeDriver: false, speed: 16, bounciness: 9}),
    ]).start();
  }, [active, slots, hlX, hlW]);

  return (
    <View style={[t.wrap, {paddingBottom: insets.bottom > 0 ? insets.bottom : 14}]}>
      {/* 떠있는 유리 블러 캡슐 독. BlurView 는 absolute 배경으로만 깔고(신아키텍처 flex
          붕괴 회피) 레이아웃은 일반 flex View 가 담당. overflow:hidden 으로 라운드 클립. */}
      <View style={t.dock}>
        <BlurView pointerEvents="none" style={StyleSheet.absoluteFill} blurType="dark" blurAmount={18} reducedTransparencyFallbackColor="rgba(46,46,52,0.9)" />
        {/* 미끄러지는 오벌 하이라이트 */}
        <Animated.View pointerEvents="none" style={[t.hl, {left: hlX, width: hlW}]} />
        {TABS.map((tab, i) => {
          const on = i === active;
          const color = on ? T1 : T3;
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
                  <ShoeIcon color={color} />
                ) : (
                  <Ionicons name={on ? tab.icon : `${tab.icon}-outline`} size={24} color={color} />
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
  wrap: {paddingHorizontal: 40, paddingTop: 6},
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 62,
    paddingHorizontal: 6,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',                       // 하이라이트를 알약으로 클립
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    // iOS는 BlurView(프로스트 글래스)가 살아있어 어두운 막만 얹는다. 안드로이드는 블러
    // 미지원이 흔해(특히 에뮬레이터) 회색 캡슐이 보이도록 더 밝은 반투명 회색으로 대체한다 — 목업 정합.
    backgroundColor: Platform.OS === 'android' ? 'rgba(46,46,52,0.82)' : 'rgba(20,20,24,0.4)',
    shadowColor: BG,
    shadowOpacity: 0.7,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 14},
    elevation: 14,
  },
  hl: {
    position: 'absolute',
    top: '50%',
    height: 50,
    marginTop: -25,            // 세로 정중앙(translateY(-50%) 대응)
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  item: {flex: 1, height: 62, alignItems: 'center', justifyContent: 'center'},
  label: {fontFamily: FONT, fontSize: 10, letterSpacing: 0.1},
});
