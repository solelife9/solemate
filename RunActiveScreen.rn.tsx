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
import { View, Text, Pressable, StyleSheet, Animated, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Path, Circle } from 'react-native-svg';

const C = {
  bg: '#000000', surface: '#0F0F10',
  accent: '#FF6500', accent2: '#FF9F4A', sage: '#30D158', amber: '#FF9F0A', red: '#FF453A',
  t1: '#F4F4F6', t2: '#C2C2C8', t3: '#7E7E85', t4: '#54545b',
  sep: 'rgba(255,255,255,0.08)', hair2: 'rgba(255,255,255,0.045)',
};
const UI = 'PretendardVariable';
const DP = 'PretendardVariable';

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
        <Circle cx={cx} cy={cy} r={r} stroke={C.sep} strokeWidth={stroke} fill="none" />
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
  const col = level >= 3 ? C.sage : level === 2 ? C.amber : level <= 0 ? C.t4 : C.red;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: 18 }}>
      {[10, 14, 18].map((h, i) => (
        <View key={i} style={{ width: 3.5, height: h, borderRadius: 2, backgroundColor: i < level ? col : 'rgba(244,244,246,0.14)' }} />
      ))}
    </View>
  );
}

export default function RunActiveScreen({
  shoeLabel = 'Alphafly 3', distanceKm = 3.2, goalKm = 5,
  timeLabel = '16:04', paceLabel = "5'02\"",
  cadence = 174, calories = 205, elevationM = 46, gpsLevel = 3,
  paused: pausedProp, onPause, onStop,
  permLost = false, onOpenSettings, statusLabel,
}: {
  shoeLabel?: string; distanceKm?: number; goalKm?: number;
  timeLabel?: string; paceLabel?: string;
  cadence?: number; calories?: number; elevationM?: number; gpsLevel?: number;
  paused?: boolean; onPause?: () => void; onStop?: () => void;
  // 위치 권한이 런 도중 회수되면(permLost) 거리 기록이 멈춘다 — 탭하면 설정으로 보내
  // 다시 허용하게 하는 복구 배너를 띄운다(권한 회수에서 빠져나오는 유일 경로).
  permLost?: boolean;
  onOpenSettings?: () => void;
  // 라이브 상태 라벨('러닝 중'/'일시정지'/'자동 일시정지'). 미전달 시 paused 로 폴백.
  statusLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [pausedState, setPausedState] = useState(false);
  const paused = pausedProp ?? pausedState;
  const togglePause = () => (onPause ? onPause() : setPausedState(p => !p));

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
  const gpsColor = gpsLevel >= 3 ? C.sage : gpsLevel === 2 ? C.amber : gpsLevel <= 0 ? C.t3 : C.red;
  const sub = useMemo(() => ([
    { v: cadence > 0 ? String(cadence) : '--', l: '케이던스', u: '' },
    { v: calories > 0 ? String(calories) : '--', l: '칼로리', u: 'kcal' },
    { v: elevationM != null ? String(elevationM) : '--', l: '고도', u: 'm' },
  ]), [cadence, calories, elevationM]);

  return (
    <View style={[r.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" />

      {/* 목표 달성 축하 토스트 */}
      {met && (
        <Animated.View pointerEvents="none" style={[r.toast, { opacity: toastO, transform: [{ translateY: toastY }] }]}>
          <View style={r.toastTick}><Ionicons name="checkmark" size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={r.toastA}>목표 {goalKm}km 달성!</Text>
            <Text style={r.toastB}>계속 달려요 — 기록은 신발에 쌓이는 중</Text>
          </View>
        </Animated.View>
      )}

      {/* top */}
      <View style={r.top}>
        <View style={r.live}>
          <View style={[r.liveDot, met && { backgroundColor: C.sage }]} />
          <Text style={[r.liveText, met && { color: C.sage }]}>{statusLabel ?? (paused ? '일시정지' : '러닝 중')}</Text>
        </View>
        <View style={r.shoeChip}><ShoeGlyph color={C.t3} /><Text style={r.shoeText}>{shoeLabel}</Text></View>
      </View>

      {/* gps */}
      <View style={r.gpsRow}><GpsBars level={gpsLevel} /><Text style={[r.gpsLabel, { color: gpsColor }]}>{gpsTextStr}</Text></View>

      {/* 권한 회수 복구 배너 — 위치 권한이 꺼지면 탭해서 설정에서 다시 허용. */}
      {permLost && (
        <Pressable onPress={onOpenSettings} accessibilityRole="button" accessibilityLabel="위치 권한 다시 허용" style={r.permBanner}>
          <Ionicons name="alert-circle" size={15} color={C.red} />
          <Text style={r.permBannerText}>위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요.</Text>
        </Pressable>
      )}

      {/* ring */}
      <View style={r.ringWrap}>
        <Ring size={264} stroke={16} progress={pct}>
          <View style={{ alignItems: 'center' }}>
            {met ? (
              <View style={r.goalMet}><Ionicons name="checkmark-circle" size={14} color={C.sage} /><Text style={r.goalMetText}>목표 {goalKm}km 달성</Text></View>
            ) : (
              <Text style={r.goal}>목표 {goalKm}km · {Math.round(pct * 100)}%</Text>
            )}
            <Text style={r.bigDist}>{distanceKm.toFixed(2)}</Text>
            <Text style={[r.bigUnit, met && { color: C.sage, fontWeight: '600' }]}>
              {goalKm ? (met ? `+${over.toFixed(2)}km 초과` : `${remain.toFixed(2)}km 남음`) : 'km'}
            </Text>
          </View>
        </Ring>
      </View>

      {/* hero metrics */}
      <View style={r.heroMetrics}>
        <View style={r.hm}><Text style={r.hmV}>{timeLabel}</Text><Text style={r.hmL}>시간</Text></View>
        <View style={[r.hm, r.hmDivider]}><Text style={r.hmV}>{paceLabel}</Text><Text style={r.hmL}>평균 페이스</Text></View>
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

      <View style={{ flex: 1 }} />

      {/* controls */}
      <View style={r.controls}>
        {!paused ? (
          <View style={{ alignItems: 'center', gap: 9 }}>
            <Pressable onPress={togglePause} accessibilityRole="button" accessibilityLabel="일시정지" style={({ pressed }) => [r.cPrimary, pressed && { opacity: 0.85 }]}><Ionicons name="pause" size={36} color="#fff" /></Pressable>
            <Text style={r.ctrlHint}>일시정지</Text>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 9 }}>
              <Pressable onLongPress={onStop} delayLongPress={600} accessibilityRole="button" accessibilityLabel="길게 눌러 종료" style={({ pressed }) => [r.cStop, pressed && { backgroundColor: 'rgba(255,69,58,0.18)' }]}><Ionicons name="stop" size={26} color={C.red} /></Pressable>
              <Text style={r.ctrlHint}>길게 눌러 종료</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 9 }}>
              <Pressable onPress={togglePause} accessibilityRole="button" accessibilityLabel="재개" style={({ pressed }) => [r.cResume, pressed && { opacity: 0.85 }]}><Ionicons name="play" size={32} color="#fff" /></Pressable>
              <Text style={r.ctrlHint}>재개</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const r = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },

  toast: { position: 'absolute', left: 18, right: 18, top: 50, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 16, backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  toastTick: { width: 34, height: 34, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  toastA: { color: '#fff', fontFamily: UI, fontSize: 14.5, fontWeight: '700', letterSpacing: -0.2 },
  toastB: { color: 'rgba(255,255,255,0.88)', fontFamily: UI, fontSize: 12, fontWeight: '500', marginTop: 2 },

  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: C.accent },
  liveText: { color: C.accent, fontFamily: UI, fontSize: 14, fontWeight: '500', letterSpacing: 0.2 },
  shoeChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, height: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: C.sep },
  shoeText: { color: C.t3, fontFamily: DP, fontSize: 12.5, fontWeight: '600' },

  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, justifyContent: 'center' },
  gpsLabel: { fontFamily: UI, fontSize: 12.5, fontWeight: '600' },

  permBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.red, backgroundColor: 'rgba(255,69,58,0.14)' },
  permBannerText: { flex: 1, color: C.t1, fontFamily: UI, fontSize: 12.5, fontWeight: '500', lineHeight: 17 },

  ringWrap: { alignItems: 'center', marginTop: 24 },
  goal: { color: C.t3, fontFamily: UI, fontSize: 13, fontWeight: '500', marginBottom: 10 },
  goalMet: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  goalMetText: { color: C.sage, fontFamily: UI, fontSize: 13, fontWeight: '600' },
  bigDist: { color: C.t1, fontFamily: DP, fontSize: 76, fontWeight: '800', letterSpacing: -2, lineHeight: 80, includeFontPadding: false },
  bigUnit: { color: C.t3, fontFamily: UI, fontSize: 13.5, fontWeight: '600', marginTop: 8 },

  heroMetrics: { flexDirection: 'row', marginTop: 26, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.sep },
  hm: { flex: 1, alignItems: 'center' },
  hmDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.hair2 },
  hmV: { color: C.t1, fontFamily: DP, fontSize: 34, fontWeight: '700', letterSpacing: -1 },
  hmL: { color: C.t3, fontFamily: UI, fontSize: 11.5, fontWeight: '500', marginTop: 5 },

  subMetrics: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14 },
  sm: { alignItems: 'center' },
  smV: { color: C.t2, fontFamily: DP, fontSize: 16, fontWeight: '500' },
  smU: { color: C.t4, fontFamily: UI, fontSize: 10 },
  smL: { color: C.t4, fontFamily: UI, fontSize: 10.5, fontWeight: '500', marginTop: 3 },

  controls: { flexDirection: 'row', justifyContent: 'center', gap: 48, paddingBottom: 8 },
  cPrimary: { width: 88, height: 88, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', shadowColor: C.accent, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  cResume: { width: 76, height: 76, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  cStop: { width: 76, height: 76, borderRadius: 999, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,69,58,0.5)', alignItems: 'center', justifyContent: 'center' },
  ctrlHint: { color: C.t3, fontFamily: UI, fontSize: 12, fontWeight: '500' },
});
