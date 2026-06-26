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
import { View, Text, Pressable, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · text→T1–T4 · hair→SEP.
// 폰트 별칭 UI/DP → FONT/DISPLAY. (시각 동등: 다크+오렌지 유지)
import { BG, CARD, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY, withAlpha } from './theme';
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

const SHOE_PATH =
  'M222-79q-32 0-61.5-12T108-127l-7-7q-9-8-11.5-20t2.5-23l194-495q8-20 27.5-30.5T354-708l58 11q17 4 32.5-2.5T471-717q14-15 18.5-31.5T489-782l-5-15q-5-16-1.5-32.5T498-858l43-43q17-18 42.5-18t42.5 17l181 184q22 23 22.5 54.5T809-609l19 19q11 11 11 28t-11 28q-12 11-28.5 11.5T772-531l-18-19-28 29 18 18q11 11 11 28t-11 28q-12 11-28.5 11.5T687-447l-18-17-112 114 17 16q12 12 12 28.5T574-277q-12 11-28.5 11.5T517-277l-16-17-28 29 16 16q11 11 11 28t-11 28q-12 11-28.5 11.5T432-193l-16-15-28 28 16 15q11 12 11 28.5T404-108q-12 11-28.5 11.5T347-108l-16-16q-23 23-50.5 34T222-79Z';
function ShoeGlyph({ color, size = 15 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 -960 960 960" style={{ transform: [{ scaleX: -1 }] }}><Path d={SHOE_PATH} fill={color} /></Svg>;
}

const R = 138, STROKE = 10, DASH = 2 * Math.PI * R, DIAL = 300;

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
          <Icon name="back" size={18} color={T2} /><Text style={s.cancelText}>취소</Text>
        </Pressable>
        <View style={s.shoeChip} accessibilityRole="text" accessibilityLabel={`선택한 신발 ${shoeLabel}`}><ShoeGlyph color={T2} /><Text style={s.shoeText}>{shoeLabel}</Text></View>
      </View>

      {/* dial */}
      <View style={s.center}>
        <View style={s.dial}>
          <Svg width={DIAL} height={DIAL} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke={SEP} strokeWidth={STROKE} fill="none" />
            <AnimatedCircle cx={DIAL / 2} cy={DIAL / 2} r={R} stroke={ACCENT} strokeWidth={STROKE} fill="none"
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

        {/* goal chips */}
        <View style={s.chips}>
          <View style={s.chip} accessibilityRole="text" accessibilityLabel={`목표 ${goalKm}.0 킬로미터`}><Icon name="target" size={14} color={T3} /><Text style={s.chipText}>목표 <Text style={s.chipB}>{goalKm}.0 km</Text></Text></View>
          <View style={s.chip} accessibilityRole="text" accessibilityLabel={outdoor ? '야외 러닝' : '실내 러닝'}><Icon name="route" size={14} color={T3} /><Text style={s.chipText}>{outdoor ? '야외 러닝' : '실내 러닝'}</Text></View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: 60, paddingBottom: 34 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 10, paddingRight: 14, borderRadius: 999, backgroundColor: withAlpha(T1, 0.05), borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  cancelText: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  shoeChip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  shoeText: { color: T2, fontFamily: DISPLAY, fontSize: 13, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dial: { width: DIAL, height: DIAL, alignItems: 'center', justifyContent: 'center' },
  dialFace: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  count: { color: T1, fontFamily: DISPLAY, fontSize: 150, fontWeight: '600', letterSpacing: -4, lineHeight: 156, includeFontPadding: false },
  countLabel: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 2 },
  go: { color: ACCENT, fontFamily: DISPLAY, fontSize: 104, fontWeight: '700', letterSpacing: -1, includeFontPadding: false },

  chips: { flexDirection: 'row', gap: 8, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: withAlpha(T1, 0.04), borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  chipText: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  chipB: { color: T1, fontFamily: DISPLAY, fontWeight: '600' },
});
