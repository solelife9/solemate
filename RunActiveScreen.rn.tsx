// ============================================================================
// RunActiveScreen.rn.tsx — 러닝 중 화면 (목업 v2 + 앱 기능 계약 보존 병합본)
// `Keego Detail Screens v2`(러닝 중) + `Keego Goal Reached`(목표 달성·초과) 디자인을
// RN 으로 1:1 가져오되, 앱이 이미 갖춘 기능 계약을 함께 유지한다:
//   · 목표 달성 축하 토스트(애니메이션) + 달성/초과 상태 링(목업 신규 UX)
//   · 진행도에 따라 색이 짙어지는 그라데이션 링(목업 신규)
//   · 주행 중 위치 권한 회수 복구 배너(permLost) — 안전 기능, 회수 탈출 유일 경로
//   · 라이브 상태 라벨(statusLabel: '러닝 중'/'일시정지'/'자동 일시정지')
//   · 컨트롤 버튼은 Ionicons + 접근성 라벨(스크린리더/통합 테스트 findability 보존)
//
// 데이터는 App.tsx 의 GPS 엔진(runTracker)이 흘려보낸다(거리/시간/페이스/케이던스/
// 칼로리/고도/신호강도/일시정지). 의존성 추가 없음(RN 내장 + react-native-svg +
// react-native-vector-icons + safe-area).
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Path, Circle } from 'react-native-svg';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · amber→WARN ·
// red→DANGER · text→T1–T4 · sep→SEP. 폰트 UI/DP → FONT/DISPLAY.
// (시각 동등: 다크+오렌지 유지)
import {
  BG, CARD, ACCENT, GOOD, WARN, DANGER, T1, T2, T3, T4, SEP,
  FONT, DISPLAY, HERO, withAlpha,
} from './theme';
// lib/haptics 배선: 일시정지/재개 → tap · 목표 달성 → impactHeavy · 종료 확정 → warning.
import { tap, impactHeavy, warning } from './lib/haptics';

// 러닝 중 화면엔 지도를 두지 않는다. 야외·데이터 없음(공기계)에서 Google Maps 타일이
// 안 떠 흰 "Google" 화면이 컨트롤(일시정지/정지)을 가려 저장조차 못 하는 사고가 있었다.
// → 라이브 경로 지도는 러닝이 끝난 뒤 "상세보기"에서 보여준다(보통 WiFi 환경). GPS 거리·
// 페이스 기록은 지도와 무관하게 계속된다.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Ring (진행할수록 짙어지는 호) ─────────────────────────────────────────────────
// 캔버스 목업과 동일 원리: 호를 여러 세그먼트로 쪼개어 앵버(시작)→진한 엠버(선두)로
// 색을 보간한다. 진행률만큼만 그려 "얼마나 왔는지"가 색으로 읽힌다.
const RING_LIGHT = [0xFF, 0xC0, 0x7A];
const RING_MID = [0xFF, 0x7A, 0x1E];
const RING_DEEP = [0xE8, 0x43, 0x0A];
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
const ringColor = (f: number) => (f < 0.5 ? mix(RING_LIGHT, RING_MID, f / 0.5) : mix(RING_MID, RING_DEEP, (f - 0.5) / 0.5));
function arcD(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

function Ring({ size, stroke, progress, children }: { size: number; stroke: number; progress: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const START = -Math.PI / 2, TWO = Math.PI * 2;
  const pct = Math.max(0, Math.min(1, progress));
  const SEG = 64;
  const segs: React.ReactNode[] = [];
  for (let i = 0; i < SEG; i++) {
    const f0 = i / SEG, f1 = (i + 1) / SEG;
    if (f0 >= pct) break;
    const a0 = START + f0 * TWO, a1 = START + Math.min(f1, pct) * TWO;
    segs.push(<Path key={i} d={arcD(cx, cy, r, a0, a1)} stroke={ringColor(pct > 0 ? f0 / pct : 0)} strokeWidth={stroke} strokeLinecap="round" fill="none" />);
  }
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cy} r={r} stroke={SEP} strokeWidth={stroke} fill="none" />
        {segs}
      </Svg>
      {children}
    </View>
  );
}

const SHOE_PATH =
  'M222-79q-32 0-61.5-12T108-127l-7-7q-9-8-11.5-20t2.5-23l194-495q8-20 27.5-30.5T354-708l58 11q17 4 32.5-2.5T471-717q14-15 18.5-31.5T489-782l-5-15q-5-16-1.5-32.5T498-858l43-43q17-18 42.5-18t42.5 17l181 184q22 23 22.5 54.5T809-609l19 19q11 11 11 28t-11 28q-12 11-28.5 11.5T772-531l-18-19-28 29 18 18q11 11 11 28t-11 28q-12 11-28.5 11.5T687-447l-18-17-112 114 17 16q12 12 12 28.5T574-277q-12 11-28.5 11.5T517-277l-16-17-28 29 16 16q11 11 11 28t-11 28q-12 11-28.5 11.5T432-193l-16-15-28 28 16 15q11 12 11 28.5T404-108q-12 11-28.5 11.5T347-108l-16-16q-23 23-50.5 34T222-79Z';
function ShoeGlyph({ color, size = 15 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 -960 960 960" style={{ transform: [{ scaleX: -1 }] }}><Path d={SHOE_PATH} fill={color} /></Svg>;
}

function GpsBars({ level = 3 }: { level?: number }) {
  const col = level >= 3 ? GOOD : level === 2 ? WARN : level <= 0 ? T4 : DANGER;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: 18 }}>
      {[10, 14, 18].map((h, i) => (
        <View key={i} style={{ width: 3.5, height: h, borderRadius: 2, backgroundColor: i < level ? col : withAlpha(T1, 0.14) }} />
      ))}
    </View>
  );
}

export default function RunActiveScreen({
  shoeLabel = 'Alphafly 3', distanceKm = 3.2, goalKm = 5,
  timeLabel = '16:04', paceLabel = "5'02\"", avgPaceLabel = "5'10\"",
  cadence = 174, calories = 205, elevationM = 46, gpsLevel = 3,
  paused: pausedProp, onPause, onStop,
  permLost = false, onOpenSettings, statusLabel,
}: {
  shoeLabel?: string; distanceKm?: number; goalKm?: number;
  timeLabel?: string; paceLabel?: string; avgPaceLabel?: string;
  cadence?: number; calories?: number; elevationM?: number; gpsLevel?: number;
  paused?: boolean; onPause?: () => void; onStop?: () => void;
  permLost?: boolean;
  onOpenSettings?: () => void;
  statusLabel?: string;
  liveCoords?: { lat: number; lon: number }[];
}) {
  const insets = useSafeAreaInsets();
  const [pausedState, setPausedState] = useState(false);
  const paused = pausedProp ?? pausedState;
  const togglePause = () => (onPause ? onPause() : setPausedState(p => !p));
  // 일시정지·재개는 가벼운 tap 햅틱으로 동작을 확인시킨다.
  const pauseRun = () => { tap(); togglePause(); };
  const resumeRun = () => { tap(); togglePause(); };

  // 길게 눌러 종료: 600ms 홀드 진행을 시각(링)으로 보여주고, 확정 시 warning 햅틱.
  // 되돌릴 수 없는 동작이라 또렷한 경고 진동을 쓴다(실수 종료 방지 + 확정 피드백).
  const HOLD_MS = 600;
  const STOP_R = 35;
  const STOP_CIRC = 2 * Math.PI * STOP_R;
  const holdAnim = useRef(new Animated.Value(0)).current;
  const holdOffset = holdAnim.interpolate({ inputRange: [0, 1], outputRange: [STOP_CIRC, 0] });
  const startHold = () => {
    holdAnim.setValue(0);
    Animated.timing(holdAnim, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
  };
  const cancelHold = () => {
    Animated.timing(holdAnim, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  };
  const confirmStop = () => { warning(); onStop?.(); };

  const pct = goalKm > 0 ? Math.min(1, distanceKm / goalKm) : 0;
  const remain = goalKm ? Math.max(0, goalKm - distanceKm) : 0;
  const met = goalKm > 0 && distanceKm >= goalKm;
  const over = met ? distanceKm - goalKm : 0;

  const [celebrated, setCelebrated] = useState(false);
  const toastY = useRef(new Animated.Value(-120)).current;
  const toastO = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!met || celebrated) return;
    setCelebrated(true);
    impactHeavy();  // 목표 달성 — 무게감 있는 단발 진동으로 성취를 알린다.
    Animated.parallel([
      Animated.spring(toastY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 8 }),
      Animated.timing(toastO, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastY, { toValue: -120, duration: 320, useNativeDriver: true }),
        Animated.timing(toastO, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }, 3200);
    return () => clearTimeout(t);
  }, [met, celebrated, toastY, toastO]);

  const gpsTextStr = gpsLevel >= 3 ? 'GPS 신호 좋음' : gpsLevel === 2 ? 'GPS 신호 보통' : gpsLevel <= 0 ? 'GPS 검색 중…' : 'GPS 신호 약함';
  const gpsColor = gpsLevel >= 3 ? GOOD : gpsLevel === 2 ? WARN : gpsLevel <= 0 ? T3 : DANGER;
  const sub = useMemo(() => ([
    { v: avgPaceLabel, l: '평균 페이스', u: '' },
    { v: cadence > 0 ? String(cadence) : '--', l: '케이던스', u: '' },
    { v: calories > 0 ? String(calories) : '--', l: '칼로리', u: 'kcal' },
    { v: elevationM != null ? String(elevationM) : '--', l: '고도', u: 'm' },
  ]), [avgPaceLabel, cadence, calories, elevationM]);

  return (
    <View style={[r.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" />

      {/* 목표 달성 축하 토스트 */}
      {met && (
        <Animated.View pointerEvents="none" style={[r.toast, { opacity: toastO, transform: [{ translateY: toastY }] }]} accessibilityLiveRegion="polite" accessibilityRole="text" accessibilityLabel={`목표 ${goalKm}킬로미터 달성! 계속 달려요`}>
          <View style={r.toastTick}><Ionicons name="checkmark" size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={r.toastA}>목표 {goalKm}km 달성!</Text>
            <Text style={r.toastB}>계속 달려요 — 기록은 신발에 쌓이는 중</Text>
          </View>
        </Animated.View>
      )}

      {/* top */}
      <View style={r.top}>
        <View style={r.live} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={`상태: ${statusLabel ?? (paused ? '일시정지' : '러닝 중')}`}>
          <View style={[r.liveDot, met && { backgroundColor: GOOD }]} />
          <Text style={[r.liveText, met && { color: GOOD }]}>{statusLabel ?? (paused ? '일시정지' : '러닝 중')}</Text>
        </View>
        <View style={r.shoeChip} accessibilityRole="text" accessibilityLabel={`신고 있는 신발 ${shoeLabel}`}><ShoeGlyph color={T3} /><Text style={r.shoeText}>{shoeLabel}</Text></View>
      </View>

      {/* gps */}
      <View style={r.gpsRow} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={gpsTextStr}><GpsBars level={gpsLevel} /><Text style={[r.gpsLabel, { color: gpsColor }]}>{gpsTextStr}</Text></View>

      {/* 권한 회수 복구 배너 — 위치 권한이 꺼지면 탭해서 설정에서 다시 허용.
          assertive live-region: 스크린리더가 즉시 끼어들어 '거리 기록 멈춤'을 알린다. */}
      {permLost && (
        <Pressable onPress={onOpenSettings} accessibilityRole="button" accessibilityLiveRegion="assertive" accessibilityLabel="위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요." style={r.permBanner}>
          <Ionicons name="alert-circle" size={15} color={DANGER} />
          <Text style={r.permBannerText}>위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요.</Text>
        </Pressable>
      )}

      {/* ring */}
      <View style={r.ringWrap}>
        <Ring size={232} stroke={14} progress={pct}>
          <View style={{ alignItems: 'center' }} accessibilityRole="text" accessibilityLiveRegion="polite"
            accessibilityLabel={`달린 거리 ${distanceKm.toFixed(2)}킬로미터${goalKm ? (met ? `, 목표 ${goalKm}킬로미터 달성, ${over.toFixed(2)}킬로미터 초과` : `, 목표 ${goalKm}킬로미터까지 ${remain.toFixed(2)}킬로미터 남음`) : ''}`}>
            {met ? (
              <View style={r.goalMet}><Ionicons name="checkmark-circle" size={14} color={GOOD} /><Text style={r.goalMetText}>목표 {goalKm}km 달성</Text></View>
            ) : (
              <Text style={r.goal}>목표 {goalKm}km · {Math.round(pct * 100)}%</Text>
            )}
            <Text style={r.bigDist}>{distanceKm.toFixed(2)}</Text>
            <Text style={[r.bigUnit, met && { color: GOOD, fontWeight: '600' }]}>
              {goalKm ? (met ? `+${over.toFixed(2)}km 초과` : `${remain.toFixed(2)}km 남음`) : 'km'}
            </Text>
          </View>
        </Ring>
      </View>

      {/* hero metrics */}
      <View style={r.heroMetrics}>
        <View style={r.hm} accessibilityRole="text" accessibilityLabel={`시간 ${timeLabel}`}><Text style={r.hmV}>{timeLabel}</Text><Text style={r.hmL}>시간</Text></View>
        <View style={[r.hm, r.hmDivider]} accessibilityRole="text" accessibilityLabel={`현재 페이스 ${paceLabel}`}><Text style={r.hmV}>{paceLabel}</Text><Text style={r.hmL}>현재 페이스</Text></View>
      </View>

      {/* sub metrics */}
      <View style={r.subMetrics}>
        {sub.map((m, i) => (
          <View key={i} style={r.sm}>
            <Text style={r.smV}>{m.v}{m.u ? <Text style={r.smU}> {m.u}</Text> : null}</Text>
            <Text style={r.smL}>{m.l}</Text>
          </View>
        ))}
      </View>

      {/* 러닝 중엔 지도를 두지 않는다(야외·데이터 없음에서 타일 실패로 컨트롤이 가려지는
          사고 방지). 경로 지도는 종료 후 상세보기에서 표시. 여기선 컨트롤을 하단에
          고정하는 여백만 둔다. */}
      <View style={{ flex: 1 }} />

      {/* controls */}
      <View style={r.controls}>
        {!paused ? (
          <View style={{ alignItems: 'center', gap: 9 }}>
            <Pressable onPress={pauseRun} accessibilityRole="button" accessibilityLabel="일시정지" style={({ pressed }) => [r.cPrimary, pressed && { opacity: 0.85 }]}><Ionicons name="pause" size={36} color="#fff" /></Pressable>
            <Text style={r.ctrlHint}>일시정지</Text>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 9 }}>
              {/* 홀드 진행 링: 길게 누르는 동안 DANGER 호가 채워져 '얼마나 더 눌러야
                  종료되는지'를 시각으로 보여준다(실수 종료 방지). */}
              <View style={r.cStopWrap}>
                <Svg width={76} height={76} style={StyleSheet.absoluteFill} pointerEvents="none">
                  <AnimatedCircle cx={38} cy={38} r={STOP_R} stroke={DANGER} strokeWidth={3} fill="none"
                    strokeLinecap="round" strokeDasharray={STOP_CIRC} strokeDashoffset={holdOffset}
                    transform="rotate(-90 38 38)" />
                </Svg>
                <Pressable
                  onPressIn={startHold} onPressOut={cancelHold}
                  onLongPress={confirmStop} delayLongPress={HOLD_MS}
                  accessibilityRole="button" accessibilityLabel="길게 눌러 종료"
                  accessibilityHint="0.6초 동안 길게 누르면 러닝을 종료합니다"
                  style={({ pressed }) => [r.cStop, pressed && { backgroundColor: withAlpha(DANGER, 0.18) }]}>
                  <Ionicons name="stop" size={26} color={DANGER} />
                </Pressable>
              </View>
              <Text style={r.ctrlHint}>길게 눌러 종료</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 9 }}>
              <Pressable onPress={resumeRun} accessibilityRole="button" accessibilityLabel="재개" style={({ pressed }) => [r.cResume, pressed && { opacity: 0.85 }]}><Ionicons name="play" size={32} color="#fff" /></Pressable>
              <Text style={r.ctrlHint}>재개</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const r = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingHorizontal: 24 },

  toast: { position: 'absolute', left: 18, right: 18, top: 50, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 16, backgroundColor: ACCENT },
  toastTick: { width: 34, height: 34, borderRadius: 999, backgroundColor: withAlpha(T1, 0.2), alignItems: 'center', justifyContent: 'center' },
  toastA: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  toastB: { color: withAlpha(T1, 0.88), fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 2 },

  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: ACCENT },
  liveText: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  shoeChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: CARD, borderRadius: 999, paddingHorizontal: 12, height: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  shoeText: { color: T3, fontFamily: DISPLAY, fontSize: 13, fontWeight: '600' },

  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, justifyContent: 'center' },
  gpsLabel: { fontFamily: FONT, fontSize: 13, fontWeight: '600' },

  permBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: DANGER, backgroundColor: withAlpha(DANGER, 0.14) },
  permBannerText: { flex: 1, color: T1, fontFamily: FONT, fontSize: 13, fontWeight: '500', lineHeight: 17 },

  ringWrap: { alignItems: 'center', marginTop: 24 },
  goal: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginBottom: 10 },
  goalMet: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  goalMetText: { color: GOOD, fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  bigDist: { color: T1, fontFamily: DISPLAY, fontSize: HERO.mega, fontWeight: '700', letterSpacing: -2, lineHeight: 80, includeFontPadding: false, fontVariant: ['tabular-nums'] },
  bigUnit: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 8 },

  heroMetrics: { flexDirection: 'row', marginTop: 26, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEP },
  hm: { flex: 1, alignItems: 'center' },
  hmDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: withAlpha(T1, 0.045) },
  hmV: { color: T1, fontFamily: DISPLAY, fontSize: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  hmL: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500', marginTop: 5 },

  subMetrics: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14 },
  sm: { alignItems: 'center' },
  smV: { color: T1, fontFamily: DISPLAY, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  smU: { color: T4, fontFamily: FONT, fontSize: 10 },
  smL: { color: T4, fontFamily: FONT, fontSize: 11, fontWeight: '500', marginTop: 3 },

  mapWrap: {
    flex: 1,
    minHeight: 130,
    maxHeight: 180,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEP,
  },
  positionDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ACCENT,
    borderWidth: 3,
    borderColor: T1,
    shadowColor: ACCENT,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 48, paddingBottom: 8 },
  cPrimary: { width: 88, height: 88, borderRadius: 999, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  cResume: { width: 76, height: 76, borderRadius: 999, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  cStopWrap: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  cStop: { width: 76, height: 76, borderRadius: 999, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(DANGER, 0.5), alignItems: 'center', justifyContent: 'center' },
  ctrlHint: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },
});
