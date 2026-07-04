// ============================================================================
// CelebrationScreen.rn.tsx — 풀스크린 셀러브레이션 (design-reference/celebration-*)
//   ① 업적 획득(achievement) — 희귀도 색 메달 + 이름/카테고리/설명 + +XP
//   ② 등급 상승(rankup)     — 등급색 방패(별) + 이전→현재 등급 + 다음까지 XP
//
// 게임이 아니다. 한 순간의 무게를 담는 절제된 연출 — radial 글로우 + ping 링 +
// 스태거 진입(Rise). App 이 progression 델타로 data 를 만들어 오버레이로 띄운다.
// 색은 호출부가 넘긴 tierColor/rarityColor(=theme TIER_COLORS / 희귀도색)만 사용.
// ============================================================================
import React, {useEffect, useRef} from 'react';
import {View, Text, Pressable, StyleSheet, Animated, Easing} from 'react-native';
import Svg, {Defs, RadialGradient, LinearGradient, Stop, Circle, Ellipse, Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BG, T1, T3, ACCENT, FONT, DISPLAY, RADIUS, HALL_GOLD, withAlpha} from './theme';
import {success, impactHeavy} from './lib/haptics';

export type CelebrationData =
  | {
      type: 'rankup';
      /** 도달한 등급(한글/영문/색). */
      rankKo: string;
      rankName: string;
      rankColor: string;
      /** 직전 등급(한글) — 있으면 "실버 →". */
      prevKo?: string | null;
      /** 다음 등급(한글) + 남은 XP — 없으면 최고 등급 문구. */
      nextKo?: string | null;
      xpToNext?: number;
    }
  | {
      type: 'achievement';
      nameKo: string;
      catKo: string;
      rarityKo: string;
      rarityColor: string;
      /** 메달 글리프 id(medal|trophy|flag|route|run|star). */
      icon?: AchIconId;
      xp: number;
      detail: string;
      legendary?: boolean;
    };

type AchIconId = 'medal' | 'trophy' | 'flag' | 'route' | 'run' | 'star';

// ── 아이콘 글리프(라인) ──────────────────────────────────────────────────────────
function AchIcon({id, size = 64, color = T1}: {id: AchIconId; size?: number; color?: string}) {
  const p = {fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  const glyphs: Record<AchIconId, React.JSX.Element[]> = {
    medal: [
      <Path key="a" d="M9 3 7 9M15 3l2 6" {...p} />,
      <Circle key="b" cx="12" cy="15" r="5.5" {...p} />,
      <Path key="c" d="m12 12.6 1 2 2.2.2-1.6 1.5.5 2.2-2.1-1.2-2.1 1.2.5-2.2-1.6-1.5 2.2-.2 1-2Z" {...p} />,
    ],
    trophy: [
      <Path key="a" d="M7 4h10v4.5a5 5 0 0 1-10 0V4ZM7 5.5H4.3V7a3 3 0 0 0 3 3M17 5.5h2.7V7a3 3 0 0 1-3 3M10 13.6h4M9.5 20.5h5M12 13.6v2.4c0 .9-.5 1.7-1.2 2.2L10 19h4l-.8-.8c-.7-.5-1.2-1.3-1.2-2.2" {...p} />,
    ],
    flag: [<Path key="a" d="M6 21V4M6 5h11l-2 3.2L17 11.5H6" {...p} />],
    route: [
      <Circle key="a" cx="6" cy="6.5" r="2.3" {...p} />,
      <Circle key="b" cx="18" cy="17.5" r="2.3" {...p} />,
      <Path key="c" d="M6 8.8v3.4c0 2 1.6 3.6 3.6 3.6h2.8M18 15.2v-1.6" {...p} />,
    ],
    run: [
      <Circle key="a" cx="15.5" cy="5" r="1.9" {...p} />,
      <Path key="b" d="M14 9.2 10.6 11l1.6 3.2 1.1 5M11.8 19.4l1.5-4.2 2.2-2.3 2.5 2.1 2.3.4M8 12.6l1.8-2.4 2.4-.6M6.5 16.5 8 19" {...p} />,
    ],
    star: [<Path key="a" d="M12 3.5l2.4 5 5.5.6-4.1 3.7 1.2 5.4L12 20.4 7 18.2l1.2-5.4L4.1 9.1l5.5-.6Z" {...p} />],
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {glyphs[id] ?? glyphs.flag}
    </Svg>
  );
}

// ── 메달('러닝의 옷' 리디자인 2026-07-04) — 애플 워치 어워드 문법 ────────────────
// 이전의 '틴트 원 + 라인 아이콘'은 납작했다(사용자: 대충 만든 것 같다). 층위로 입체를
// 만든다: ①금속 림(수직 그라데이션 — 위는 빛, 아래는 그늘) ②다크 페이스(등급색
// 라디얼 틴트) ③새김 홈(밝은 선 위·어두운 선 아래 = 파인 느낌) ④좌상단 스펙큘러
// ⑤글리프는 웜 화이트(금속에 새긴 인상 — 색은 림과 글로우가 말한다).
// 레전더리는 샴페인 골드(HALL_GOLD 계열 — 전당과 같은 언어).
function Medal({color, legendary, icon}: {color: string; legendary?: boolean; icon: AchIconId}) {
  const c = legendary ? HALL_GOLD : color;
  const uid = icon; // 화면당 1개 마운트 — id 충돌 없음
  return (
    <View style={{width: 148, height: 148, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={148} height={148}>
        <Defs>
          <LinearGradient id={`rim-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.5} />
          </LinearGradient>
          <RadialGradient id={`face-${uid}`} cx="50%" cy="36%" rx="72%" ry="72%">
            <Stop offset="0" stopColor={c} stopOpacity={0.3} />
            <Stop offset="0.6" stopColor={c} stopOpacity={0.1} />
            <Stop offset="1" stopColor={c} stopOpacity={0.02} />
          </RadialGradient>
        </Defs>
        {/* 림 — 등급색 금속 */}
        <Circle cx={74} cy={74} r={70} fill={c} opacity={0.92} />
        <Circle cx={74} cy={74} r={70} fill={`url(#rim-${uid})`} />
        {/* 페이스 — 깊은 차콜 + 등급색 틴트 */}
        <Circle cx={74} cy={74} r={59} fill="#141417" />
        <Circle cx={74} cy={74} r={59} fill={`url(#face-${uid})`} />
        {/* 새김 홈 — 위 밝음/아래 어두움의 1px 쌍 */}
        <Circle cx={74} cy={74} r={52.5} stroke={withAlpha('#FFFFFF', 0.12)} strokeWidth={1} fill="none" />
        <Circle cx={74} cy={74} r={51.5} stroke={withAlpha('#000000', 0.4)} strokeWidth={1} fill="none" />
        {/* 좌상단 스펙큘러 */}
        <Ellipse cx={54} cy={44} rx={30} ry={15} fill="#FFFFFF" opacity={0.09} />
      </Svg>
      <View style={{position: 'absolute'}} pointerEvents="none">
        <AchIcon id={icon} size={58} color={legendary ? '#F4E8C8' : '#F1EFE9'} />
      </View>
    </View>
  );
}

// 큰 메달/크레스트 글로우(radial)
function Glow({color}: {color: string}) {
  return (
    <Svg width={380} height={380} style={st.glow} pointerEvents="none">
      <Defs>
        <RadialGradient id="cel-glow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.16} />
          <Stop offset="0.62" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="190" cy="190" r="190" fill="url(#cel-glow)" />
    </Svg>
  );
}

// 메달 주변 ping 링(무한)
function PingRing({color, delay = 0}: {color: string; delay?: number}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {toValue: 1, duration: 2800, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  const scale = v.interpolate({inputRange: [0, 1], outputRange: [1, 1.7]});
  const opacity = v.interpolate({inputRange: [0, 0.1, 1], outputRange: [0, 0.55, 0]});
  return <Animated.View style={[st.ring, {borderColor: withAlpha(color, 0.36), opacity, transform: [{scale}]}]} pointerEvents="none" />;
}

// 스태거 진입 래퍼
function Rise({
  anim, from, to, children, style, pop,
}: {
  anim: Animated.Value;
  from: number;
  to: number;
  children: React.ReactNode;
  style?: any;
  pop?: boolean;
}) {
  const opacity = anim.interpolate({inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp'});
  const ty = anim.interpolate({inputRange: [from, to], outputRange: [pop ? 0 : 14, 0], extrapolate: 'clamp'});
  const scale = anim.interpolate({inputRange: [from, to], outputRange: [pop ? 0.6 : 1, 1], extrapolate: 'clamp'});
  return <Animated.View style={[style, {opacity, transform: pop ? [{scale}] : [{translateY: ty}]}]}>{children}</Animated.View>;
}

export default function CelebrationScreen({data, onClose}: {data: CelebrationData; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // 보상 순간의 촉각 피드백 — 등급 상승은 묵직한 단발, 그 외 업적은 성공 펄스.
    // (큐로 다음 축하가 떠도 마운트마다 한 번씩 울린다. 설정 off 면 graceful no-op.)
    if (data.type === 'rankup') impactHeavy();
    else success();
    Animated.timing(anim, {toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start();
  }, [anim, data.type]);

  if (data.type === 'rankup') {
    const c = data.rankColor;
    return (
      <View style={[st.screen, {paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32}]}>
        <Glow color={c} />
        <View style={st.body}>
          <Rise anim={anim} from={0.05} to={0.35}>
            <Text style={[st.eyebrow, {color: c}]}>등급 상승</Text>
          </Rise>
          <Rise anim={anim} from={0.12} to={0.5} pop style={st.medalwrap}>
            <PingRing color={c} />
            <PingRing color={c} delay={1400} />
            <Medal color={c} icon="star" />
          </Rise>
          {!!data.prevKo && (
            <Rise anim={anim} from={0.16} to={0.6}>
              <Text style={st.rankfrom}>{`${data.prevKo} → `}</Text>
            </Rise>
          )}
          <Rise anim={anim} from={0.2} to={0.6}>
            <Text style={[st.name, {color: c}]}>{data.rankKo}</Text>
          </Rise>
          <Rise anim={anim} from={0.26} to={0.66}>
            <Text style={st.meta}>{data.rankName}</Text>
          </Rise>
          <Rise anim={anim} from={0.32} to={0.72}>
            <Text style={st.desc}>
              {data.nextKo ? (
                <>
                  이제 <Text style={st.b}>{data.rankKo}</Text>예요. 다음 여정은 <Text style={st.b}>{data.nextKo}</Text>.
                </>
              ) : (
                <>
                  최고 등급 <Text style={st.b}>{data.rankKo}</Text>에 도달했어요. 여정의 정점이에요.
                </>
              )}
            </Text>
          </Rise>
        </View>
        <Rise anim={anim} from={0.48} to={0.9} style={st.actions}>
          <Pressable style={st.primary} onPress={onClose} accessibilityRole="button" accessibilityLabel="계속하기">
            <Text style={st.primaryTxt}>계속하기</Text>
          </Pressable>
        </Rise>
      </View>
    );
  }

  // 업적 획득
  const c = data.rarityColor;
  return (
    <View style={[st.screen, {paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32}]}>
      <Glow color={c} />
      <Pressable style={[st.skip, {top: insets.top + 14}]} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="건너뛰기">
        <Text style={st.skipTxt}>건너뛰기</Text>
      </Pressable>
      <View style={st.body}>
        <Rise anim={anim} from={0.05} to={0.35}>
          <Text style={[st.eyebrow, {color: c}]}>업적 획득</Text>
        </Rise>
        <Rise anim={anim} from={0.12} to={0.5} pop style={st.medalwrap}>
          <PingRing color={c} />
          <PingRing color={c} delay={1400} />
          <Medal color={c} legendary={data.legendary} icon={data.icon ?? 'medal'} />
        </Rise>
        <Rise anim={anim} from={0.2} to={0.6}>
          <Text style={st.name}>{data.nameKo}</Text>
        </Rise>
        <Rise anim={anim} from={0.26} to={0.66}>
          {/* 레어리티 단어·+XP 는 표면에 세우지 않는다('러닝의 옷') — 색과 메달이 말한다. */}
          <Text style={st.meta}>{data.catKo}</Text>
        </Rise>
        <Rise anim={anim} from={0.32} to={0.72}>
          <Text style={st.desc}>{data.detail}</Text>
        </Rise>
      </View>
      <Rise anim={anim} from={0.48} to={0.9} style={st.actions}>
        <Pressable style={st.primary} onPress={onClose} accessibilityRole="button" accessibilityLabel="확인">
          <Text style={st.primaryTxt}>확인</Text>
        </Pressable>
      </Rise>
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, alignItems: 'center', paddingHorizontal: 28, overflow: 'hidden'},
  glow: {position: 'absolute', top: '-8%'},
  skip: {position: 'absolute', right: 22, zIndex: 2, padding: 6},
  skipTxt: {fontSize: 13, fontWeight: '500', color: T3, fontFamily: FONT},
  body: {flex: 1, alignItems: 'center', justifyContent: 'center'},

  eyebrow: {fontSize: 12, fontWeight: '700', letterSpacing: 2.6, marginBottom: 32, textTransform: 'uppercase', fontFamily: FONT},
  medalwrap: {width: 124, height: 124, marginBottom: 30, alignItems: 'center', justifyContent: 'center'},
  ring: {position: 'absolute', width: 124, height: 124, borderRadius: 62, borderCurve: 'continuous', borderWidth: 1},

  rankfrom: {fontSize: 14, fontWeight: '500', color: T3, marginBottom: 2, fontFamily: FONT, textAlign: 'center'},
  name: {fontSize: 32, fontWeight: '800', color: T1, letterSpacing: -0.6, lineHeight: 38, textAlign: 'center', fontFamily: DISPLAY},
  meta: {fontSize: 13, fontWeight: '500', color: T3, fontFamily: FONT},
  desc: {fontSize: 15, color: withAlpha(T1, 0.72), lineHeight: 24, marginTop: 18, maxWidth: 300, textAlign: 'center', fontFamily: FONT},
  b: {color: T1, fontWeight: '700'},

  actions: {alignSelf: 'stretch'},
  primary: {height: 56, borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center'},
  primaryTxt: {fontSize: 17, fontWeight: '700', color: T1, fontFamily: FONT},
});
