// ============================================================================
// RunCountdownScreen.rn.tsx — 준비 · 카운트다운 · 목업 그대로 (standalone)
// `Keego Run Start.html` 을 RN 으로 1:1. GPS 락 → 3·2·1 → GO → onDone().
// 외부 의존 없음(색·아이콘·다이얼 내장). 의존성은 react-native-svg 뿐.
//
// 드롭인 / 연결:
//   목표 화면(onStart) → 이 화면 → onDone() 에서 실제 러닝 중 화면으로.
//   <RunCountdownScreen goalKm={5} shoeLabel="Alphafly 3"
//      onCancel={()=>goBackToGoal()} onDone={()=>enterRun(5)} />
//
//   App.tsx 권장 흐름(인라인 오버레이 한 단계 추가):
//     overlay: 'none' | 'add' | 'goal' | 'countdown' | 'run'
//     RunGoalScreen.onStart = (km)=>{ setActiveRun({...,goalKm:km}); setOverlay('countdown'); }
//     {overlay==='countdown' && activeRun && (
//       <RunCountdownScreen goalKm={activeRun.goalKm} shoeLabel={activeRun.name}
//         onCancel={()=>setOverlay('goal')} onDone={()=>setOverlay('run')} />
//     )}
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import { View, Text, Pressable, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import { ShoeGlyph } from './primitives';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinear, Stop } from 'react-native-svg';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · text→T1–T4 · hair→SEP.
// 폰트 별칭 UI/DP → FONT/DISPLAY. (시각 동등: 다크+오렌지 유지)
import { BG, CARD, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY, NUM, withAlpha, TYPE, RADIUS, GUTTER, RUN_RING_SIZE, RUN_RING_STROKE, RUN_RING_STOPS } from './theme';
// lib/haptics 배선: 카운트다운 비트(3·2·1) → countdownBeat, 시작(GO) → go.
import { countdownBeat, go as goHaptic } from './lib/haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Icon({ name, size = 22, color = T2 }: { name: string; size?: number; color?: string }) {
  const g: Record<string, React.ReactNode> = {
    back: <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    play: <Path d="M7 5v14l11-7z" fill={color} />,
    target: <><Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" /><Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={2} fill="none" /></>,
    route: <Path d="M3 17l6-6 4 4 8-8" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24">{g[name]}</Svg>;
}


// 다이얼 = 러닝 링과 같은 링(RUN_RING 토큰, 2026-07-16 링 통일): 크기·두께·파파야
// 그라데이션이 러닝 중 링과 동일 → 카운트다운이 차오른 그 링이 그대로 러닝 링이 된다.
// ri() 반응형도 이때 함께 해결(구 300/138/10 raw 는 작은 기기에서 혼자 비대했다).
const DIAL = ri(RUN_RING_SIZE), STROKE = RUN_RING_STROKE, R = (DIAL - STROKE) / 2, DASH = 2 * Math.PI * R;

export default function RunCountdownScreen({
  goalKm = 5, shoeLabel = 'Alphafly 3', outdoor = true,
  onCancel, onDone,
}: {
  goalKm?: number; shoeLabel?: string; outdoor?: boolean;
  onCancel?: () => void; onDone?: () => void;
}) {
  const [phase, setPhase] = useState<'count' | 'go'>('count');
  const [num, setNum] = useState(3);

  const dialOffset = useRef(new Animated.Value(DASH)).current;     // ring sweep
  const numScale = useRef(new Animated.Value(1)).current;          // beat pop
  const numOpacity = useRef(new Animated.Value(1)).current;
  const goScale = useRef(new Animated.Value(0.6)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]).current;
  const startedRef = useRef(false);

  const at = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };
  const clearAll = () => { timers.splice(0).forEach(clearTimeout); };

  // beat: 숫자가 크게 튀어오르며 나타남 + 링이 1/3 더 채워짐
  const beat = (n: number, i: number) => {
    setNum(n);
    countdownBeat();            // 3·2·1 각 박자마다 짧은 단발 진동
    numScale.setValue(1.5); numOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(numScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.timing(numOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    Animated.timing(dialOffset, { toValue: DASH * (1 - (i + 1) / 3), duration: 1000, easing: Easing.linear, useNativeDriver: false }).start();
  };

  const startCountdown = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase('count');
    [3, 2, 1].forEach((n, i) => at(() => beat(n, i), i * 1000));
    at(() => {
      setPhase('go');
      goHaptic();               // GO — 카운트다운 종료, 강한 단발 진동
      goScale.setValue(0.6);
      Animated.spring(goScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 9 }).start();
    }, 3000);
    at(() => onDone?.(), 3650);
  };

  // 러닝 시작을 누르면 곧장 3·2·1 카운트다운(준비 연출/지연 없이). 실제 GPS 워밍업은
  // 트래킹 시작 시 WARMUP_FIXES 가 따로 처리하므로 여기서 기다릴 필요가 없다.(사용자 요청)
  useEffect(() => {
    startCountdown();
    return clearAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => { clearAll(); onCancel?.(); };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" />

      {/* top */}
      <View style={s.top}>
        <Pressable onPress={cancel} hitSlop={8} style={s.cancel} accessibilityRole="button" accessibilityLabel="카운트다운 취소">
          <Icon name="back" size={ri(18)} color={T2} /><Text style={s.cancelText}>취소</Text>
        </Pressable>
        <View style={s.shoeChip} accessibilityRole="text" accessibilityLabel={`선택한 신발 ${shoeLabel}`}><ShoeGlyph color={T2} size={ri(15)} /><Text style={s.shoeText}>{shoeLabel}</Text></View>
      </View>

      {/* dial */}
      <View style={s.center}>
        <View style={s.dial}>
          <Svg width={DIAL} height={DIAL} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Defs>
              {/* 러닝 링과 동일한 파파야 그라데이션(RUN_RING_STOPS) — 흰 다이얼 폐지.
                  차오른 이 링이 GO 직후 러닝 링으로 그대로 이어진다(시그니처 연속). */}
              <SvgLinear id="cd-ring" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={RUN_RING_STOPS[0]} />
                <Stop offset="0.55" stopColor={RUN_RING_STOPS[1]} />
                <Stop offset="1" stopColor={RUN_RING_STOPS[2]} />
              </SvgLinear>
            </Defs>
            <Circle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke={SEP} strokeWidth={STROKE} fill="none" />
            <AnimatedCircle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke="url(#cd-ring)" strokeWidth={STROKE} fill="none"
              strokeLinecap="round" strokeDasharray={DASH} strokeDashoffset={dialOffset} />
          </Svg>
          <View style={s.dialFace}>
            {phase === 'go' ? (
              <Animated.Text style={[s.go, { transform: [{ scale: goScale }] }]} accessibilityLiveRegion="assertive" accessibilityLabel="시작">GO</Animated.Text>
            ) : (
              <>
                <Animated.Text style={[s.count, { opacity: numOpacity, transform: [{ scale: numScale }] }]} accessibilityLiveRegion="assertive" accessibilityLabel={`${num}초 후 시작`}>{num}</Animated.Text>
                <Text style={s.countLabel}>곧 시작합니다</Text>
              </>
            )}
          </View>
        </View>

        {/* goal chips — 거리 목표가 있을 때만. 생 `${goalKm}.0` 이어붙이기는 하프 21.1 에서
            "21.1.0 km", 시간·자유 러닝(0)에서 "0.0 km" 로 보이던 표기 버그(2026-07-16 수정). */}
        <View style={s.chips}>
          {goalKm > 0 && (
            <View style={s.chip} accessibilityRole="text" accessibilityLabel={`목표 ${goalKm.toFixed(1)} 킬로미터`}><Icon name="target" size={ri(14)} color={T3} /><Text style={s.chipText}>목표 <Text style={s.chipB}>{goalKm.toFixed(1)} km</Text></Text></View>
          )}
          <View style={s.chip} accessibilityRole="text" accessibilityLabel={outdoor ? '야외 러닝' : '실내 러닝'}><Icon name="route" size={ri(14)} color={T3} /><Text style={s.chipText}>{outdoor ? '야외 러닝' : '실내 러닝'}</Text></View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: rv(60), paddingBottom: rv(34) },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: rv(6), height: rs(34), paddingLeft: rs(10), paddingRight: rs(14), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.05), borderWidth: 1, borderColor: SEP },
  cancelText: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  shoeChip: { flexDirection: 'row', alignItems: 'center', gap: rv(8), height: rs(34), paddingHorizontal: rs(14), borderRadius: RADIUS.pill, backgroundColor: CARD, borderWidth: 1, borderColor: SEP },
  shoeText: { color: T2, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: rv(76) },
  dial: { width: DIAL, height: DIAL, alignItems: 'center', justifyContent: 'center' },
  dialFace: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  // 카운트다운 숫자 = NUM(Jost) — 러닝 링 거리 숫자와 동일 규율(2026-07-16 통일).
  // Jost 어센더 보정: lineHeight ≈ fontSize×1.22.
  count: { color: T1, fontFamily: NUM, fontSize: rf(150), fontWeight: '500', letterSpacing: -2, lineHeight: rf(183), includeFontPadding: false, fontVariant: ['tabular-nums'] },
  countLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(2) },
  // 'GO' 도 NUM(Jost) — 카운트 숫자와 같은 슬롯이라 1초 간격 폰트 점프를 없앤다.
  go: { color: ACCENT, fontFamily: NUM, fontSize: rf(104), fontWeight: '700', letterSpacing: -1, lineHeight: rf(127), includeFontPadding: false },

  chips: { flexDirection: 'row', gap: rv(8), marginTop: rv(14) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: rv(8), height: rs(32), paddingHorizontal: rs(14), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.04), borderWidth: 1, borderColor: SEP },
  chipText: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  chipB: { color: T1, fontFamily: DISPLAY, fontWeight: '600' },
});
