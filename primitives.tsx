// ============================================================================
// primitives.tsx — shared Keego UI primitives
// Ring · TabBar · Button · Card · Pill/Badge(TierBadge) · Metric ·
// KeegoWordmark · SectionTitle · status-color helpers.
// All colour/spacing/radius/type values come from theme tokens (no raw hex).
// Deps: react-native-svg, react-native-vector-icons
// ============================================================================
import React, {useId, useMemo} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {
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
  CARD_HI,
  ACCENT,
  ACCENT_2,
  WARN,
  DANGER,
  GOOD,
  T1,
  T3,
  SEP,
  FONT,
  DISPLAY,
  SPACE,
  RADIUS,
  TYPE,
  withAlpha,
} from './theme';
import {tierBadge, ShoeCondition} from './lib/shoe';

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
// 의존 없이 react-native-svg 만으로). 부모 Pressable 의 overflow:hidden 이 모서리를
// radius 로 잘라준다. useId 로 그라데이션 id 충돌을 막는다(같은 화면 다중 CTA 안전).
function GradientFill({
  radius,
  colors = [ACCENT, ACCENT_2],
}: {
  radius: number;
  colors?: [string, string];
}) {
  const id = `keego-grad-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
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

// ── Button (CTA = orange gradient radius16 · ghost = CARD_HI surface) ─────────
export function Button({
  label,
  onPress,
  variant = 'cta',
  icon,
  disabled = false,
  style,
  testID,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'cta' | 'ghost';
  icon?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const cta = variant === 'cta';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      style={({pressed}) => [
        btn.base,
        cta ? null : btn.ghost,
        disabled && btn.disabled,
        pressed && btn.pressed,
        style,
      ]}>
      {cta ? <GradientFill radius={RADIUS.md} /> : null}
      {icon ? <Ionicons name={icon} size={20} color={T1} /> : null}
      <Text style={btn.label}>{label}</Text>
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
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  ghost: {backgroundColor: CARD_HI},
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.85},
  label: {
    color: T1,
    fontFamily: FONT,
    fontSize: TYPE.heading.fontSize,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
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
    borderColor: SEP,
  },
  padded: {padding: SPACE.lg},
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
      <Text style={[pill.label, {color: fg, fontSize: md ? 12 : 10.5}]}>{label}</Text>
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

// ── Bottom tab bar (floating dock, Apple-Fitness capsule highlight) ───────────
const TABS = [
  {icon: 'home', label: '홈'},
  {icon: 'time', label: '기록'},
  {icon: 'footsteps', label: '신발'},
  {icon: 'person', label: '프로필'},
];

export function TabBar({active, onTab}: {active: number; onTab: (i: number) => void}) {
  // 하단 제스처바/홈 인디케이터 영역을 피하도록 safe-area inset 을 흡수한다(하드코딩
  // paddingBottom 대신). inset 이 없는 단말은 기존 여백(24)을 유지해 회귀를 막는다.
  const insets = useSafeAreaInsets();
  return (
    <View style={[t.wrap, {paddingBottom: insets.bottom > 0 ? insets.bottom + SPACE.sm : 24}]}>
      <View style={t.dock}>
        {TABS.map((tab, i) => {
          const on = i === active;
          return (
            <Pressable
              key={i}
              onPress={() => onTab(i)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{selected: on}}
              hitSlop={6}
              style={({pressed}) => [t.item, on && t.itemActive, pressed && t.itemPressed]}>
              <Ionicons
                name={on ? tab.icon : `${tab.icon}-outline`}
                size={24}
                color={on ? ACCENT : T3}
              />
              <Text style={[t.label, {color: on ? ACCENT : T3, fontWeight: on ? '600' : '500'}]}>
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
  wrap: {paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24},
  dock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-around',
    gap: SPACE.xs,
    padding: 6,
    borderRadius: 28,
    backgroundColor: 'rgba(28,28,32,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
    shadowColor: BG,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 10},
    elevation: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    paddingVertical: 9,
    borderRadius: RADIUS.lg,
  },
  itemActive: {backgroundColor: 'rgba(255,255,255,0.10)'},
  itemPressed: {opacity: 0.6},
  label: {fontFamily: FONT, fontSize: 10, letterSpacing: 0.1},
});
