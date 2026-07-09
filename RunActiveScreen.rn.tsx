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
import { rf, rs, ri, rv } from './lib/responsive';
import { View, Text, Pressable, StyleSheet, Animated, Easing, StatusBar, LayoutAnimation, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Circle, Defs, LinearGradient as SvgLinear, Stop } from 'react-native-svg';
import { GlassEdge, ShoeGlyph } from './primitives';
import { RunLiveMap } from './RunLiveMap';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · amber→WARN ·
// red→DANGER · text→T1–T4 · sep→SEP. 폰트 UI/DP → FONT/DISPLAY.
// (시각 동등: 다크+오렌지 유지)
import {
  BG, CARD, ACCENT, ACCENT_2, RING_ACCENT, RING_ACCENT_HI, RING_ACCENT_LO,
  GOOD, WARN, DANGER, T1, T2, T3, T4, SEP,
  FONT, DISPLAY, withAlpha, HR_ZONE_COLORS, TYPE, HERO, RADIUS,
} from './theme';
import { estimateMaxHR, zoneOf, HR_ZONE_LABEL } from './lib/analytics/hrZones';
import { fmtPaceSec } from './lib/pacePlan';
// lib/haptics 배선: 일시정지/재개 → tap · 목표 달성 → impactHeavy · 종료 확정 → warning.
import { tap, impactHeavy, warning } from './lib/haptics';

// 지도 배치 규칙(2026-07-09 승인). 러닝 '중'(active)엔 지도를 두지 않고 링+지표만 둔다 —
// 달리는 동안 화면 정보는 최소화. 지도는 '일시정지' 시 상단 패널로 등장하고(탭하면 전체화면
// 인터랙티브), 러닝 종료 후 "상세보기"에서 경로를 본다. Apple Maps(react-native-maps) 전환으로
// 옛 구글맵 타일 실패(흰 "Google" 화면이 컨트롤을 가려 저장조차 못 하던 사고)는 해소됨.
// GPS 거리·페이스 기록은 지도와 무관하게 계속된다.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Ring (부드럽게 미끄러지는 진행 호) ────────────────────────────────────────────
// 구버전은 호를 64조각(Path)으로 쪼개 조각 단위(5.6°)로 '뚝뚝' 끊겨 보였고, GPS fix 마다
// 값이 점프해 애니메이션도 없었다(사용자 피드백). 홈 히어로 링과 동일 문법으로 교체:
// 단일 원 스트로크 + SVG 그라데이션(앰버→딥 엠버) + Animated strokeDashoffset —
// 새 진행률이 올 때마다 900ms 로 미끄러져 fix 간격(~1s)과 맞물려 항상 흐르는 느낌.
function Ring({ size, stroke, progress, children }: { size: number; stroke: number; progress: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const CIRC = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, progress));
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(anim, {
      toValue: pct, duration: 900,
      easing: Easing.out(Easing.quad), useNativeDriver: false, // strokeDashoffset = JS 드라이버
    });
    a.start();
    return () => a.stop(); // 언마운트/값 교체 시 타이머 정리
  }, [anim, pct]);
  const dash = anim.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <SvgLinear id="run-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={RING_ACCENT_HI} />
            <Stop offset="0.55" stopColor={RING_ACCENT} />
            <Stop offset="1" stopColor={RING_ACCENT_LO} />
          </SvgLinear>
        </Defs>
        <Circle cx={cx} cy={cy} r={r} stroke={SEP} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={cx} cy={cy} r={r}
          stroke="url(#run-ring)" strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dash}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      {children}
    </View>
  );
}


function GpsBars({ level = 3 }: { level?: number }) {
  const col = level >= 3 ? GOOD : level === 2 ? WARN : level <= 0 ? T4 : DANGER;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: rs(18) }}>
      {[10, 14, 18].map((h, i) => (
        <View key={i} style={{ width: 3.5, height: h, borderRadius: rs(2), backgroundColor: i < level ? col : withAlpha(T1, 0.14) }} />
      ))}
    </View>
  );
}

export default function RunActiveScreen({
  shoeLabel = 'Alphafly 3', distanceKm = 3.2, goalKm = 5,
  timeLabel = '16:04', paceLabel = "5'02\"", avgPaceLabel = "5'10\"",
  cadence = 174, calories = 205, elevationM = 46, gpsLevel = 3, bpm = 0,
  age = 0, restHR = 0,
  paused: pausedProp, onPause, onStop,
  permLost = false, onOpenSettings, statusLabel,
  currentPaceSec = null, targetPaceSec = null,
  liveCoords = [],
  track = null, onLap, onUndoLap,
}: {
  shoeLabel?: string; distanceKm?: number; goalKm?: number;
  timeLabel?: string; paceLabel?: string; avgPaceLabel?: string;
  // 스피드 모드 코칭: 현재(롤링) 페이스 vs 현재 km 목표 페이스(초/km). targetPaceSec=null 이면
  // 코칭 배너를 숨긴다(거리/시간 모드). 둘 다 있으면 빠름/적정/느림을 색·라벨로 보여준다.
  currentPaceSec?: number | null; targetPaceSec?: number | null;
  // bpm: 심박(분당). 0이면 미측정('--' 표시). HealthKit/Apple Watch 연동 시 채워진다.
  cadence?: number; calories?: number; elevationM?: number; gpsLevel?: number; bpm?: number;
  // 라이브 심박 존 산출용(2026-07-05). age→estimateMaxHR, restHR→Karvonen 보정.
  // 심박이 흐를 때만(bpm>0) 존 색·라벨을 노출한다 — 없으면 기존 '--·심박' 그대로(조건부).
  age?: number; restHR?: number;
  paused?: boolean; onPause?: () => void; onStop?: () => void;
  permLost?: boolean;
  onOpenSettings?: () => void;
  statusLabel?: string;
  liveCoords?: { lat: number; lon: number }[];
  // 트랙 모드 — 있으면 링 센터를 '바퀴 수' 중심으로 바꾸고 랩 기록 버튼을 띄운다.
  // lapM=확정 한 바퀴(m), lapDistKm=랩수×lapM, calibrated=첫 랩 GPS 보정 완료,
  // progress=현재 바퀴 진행(0~1, 링 채움), recent=지난 랩(최근 3, 구간시간 초).
  track?: { lapCount: number; lapM: number; lapDistKm: number; calibrated: boolean; progress: number; recent: { lap: number; split: number }[] } | null;
  onLap?: () => void;      // 수동 랩 기록(+1)
  onUndoLap?: () => void;  // 마지막 랩 되돌리기(-1)
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [pausedState, setPausedState] = useState(false);
  const paused = pausedProp ?? pausedState;

  // 확대↔축소 호흡(2026-07-07 사용자): 달릴 땐 링·핵심 지표가 크게, 일시정지하면 줄어들며
  // 서브 지표(평균페이스·케이던스·칼로리·고도)가 펼쳐진다. paused 는 수동·자동(autoPause)
  // 양쪽에서 바뀌므로 로컬 uiPaused 로 한 박자 미러링해 어느 경로든 같은 전환이 걸리게 한다.
  // 레이아웃 변화(폰트·마진 축소, 서브 등장)는 LayoutAnimation, 링 축소는 native 스프링.
  const [uiPaused, setUiPaused] = useState(paused);
  // 전환값 t (0=러닝, 1=일시정지). 링 스케일·마진을 한 값으로 묶어(비네이티브) desync 방지 —
  // 스케일(네이티브)과 마진(레이아웃)을 따로 돌리면 재개 시 링이 원래 크기로 안 돌아오는
  // 버그가 있었다(기기 피드백). 이제 t 하나로 스케일·상하 마진을 동시에 보간해 확실히 복귀.
  const t = useRef(new Animated.Value(paused ? 1 : 0)).current;
  const subIn = useRef(new Animated.Value(paused ? 1 : 0)).current;
  useEffect(() => {
    if (paused === uiPaused) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setUiPaused(paused);
    Animated.parallel([
      Animated.timing(t, { toValue: paused ? 1 : 0, duration: 300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(subIn, { toValue: paused ? 1 : 0, duration: paused ? 260 : 160, delay: paused ? 70 : 0, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [paused, uiPaused, t, subIn]);
  // 일시정지 지도 패널을 탭하면 전체화면 인터랙티브 지도로 확장한다. 재개(uiPaused=false)하면 닫는다.
  const [mapFull, setMapFull] = useState(false);
  useEffect(() => { if (!uiPaused) setMapFull(false); }, [uiPaused]);
  // 전체화면 지도에서 '내 위치로 이동' 버튼 — 카운터가 바뀌면 RunLiveMap 이 현재 좌표로 카메라 이동.
  const [recenter, setRecenter] = useState(0);
  // 일시정지 시 링을 '아주 살짝'만 축소(0.92) — 링 안 거리 숫자가 항상 크게 읽히도록. 스케일은
  // 네이티브 드라이버(transform)만 쓰므로 재개 시 반드시 원래 크기로 복귀한다(예전엔 스케일+
  // Animated 마진+LayoutAnimation 이 서로 다른 시스템으로 같은 뷰를 밀며 desync→복귀불능 버그).
  // 서브 지표가 들어설 세로 공간은 스케일이 아니라 ringWrapPaused 여백 축소(LayoutAnimation)가 만든다.
  const ringScale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  // 라이브 심박 존 — 심박이 흐를 때만 산출(bpm>0). 워치 미연동이면 0 → 존 미표시.
  const hrZone = bpm > 0 ? zoneOf(bpm, estimateMaxHR(age), restHR || undefined) : 0;
  const hrColor = hrZone !== 0 ? HR_ZONE_COLORS[hrZone] : T1;
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
  // 일시정지 하단 3칸 — 평균 페이스는 상단 히어로(현재 페이스 자리)로 올라가므로 여기선 제외.
  const sub = useMemo(() => ([
    { v: cadence > 0 ? String(cadence) : '--', l: '케이던스', u: '' },
    { v: calories > 0 ? String(calories) : '--', l: '칼로리', u: 'kcal' },
    { v: elevationM != null ? String(elevationM) : '--', l: '고도', u: 'm' },
  ]), [cadence, calories, elevationM]);
  // 랩 구간시간(초) → m'ss" (트랙 '지난 랩' 표시용).
  const fmtLapSplit = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`;

  return (
    <View style={[r.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" />

      {/* 목표 달성 축하 토스트 */}
      {met && (
        <Animated.View pointerEvents="none" style={[r.toast, { opacity: toastO, transform: [{ translateY: toastY }] }]} accessibilityLiveRegion="polite" accessibilityRole="text" accessibilityLabel={`목표 ${goalKm}킬로미터 달성! 계속 달려요`}>
          <View style={r.toastTick}><Ionicons name="checkmark" size={ri(18)} color={ACCENT} /></View>
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
        <View style={r.shoeChip} accessibilityRole="text" accessibilityLabel={`신고 있는 신발 ${shoeLabel}`}><ShoeGlyph color={T3} size={ri(15)} /><Text style={r.shoeText}>{shoeLabel}</Text></View>
      </View>

      {/* gps */}
      <View style={r.gpsRow} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={gpsTextStr}><GpsBars level={gpsLevel} /><Text style={[r.gpsLabel, { color: gpsColor }]}>{gpsTextStr}</Text></View>

      {/* 권한 회수 복구 배너 — 위치 권한이 꺼지면 탭해서 설정에서 다시 허용.
          assertive live-region: 스크린리더가 즉시 끼어들어 '거리 기록 멈춤'을 알린다. */}
      {permLost && (
        <Pressable onPress={onOpenSettings} accessibilityRole="button" accessibilityLiveRegion="assertive" accessibilityLabel="위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요." style={r.permBanner}>
          <Ionicons name="alert-circle" size={ri(15)} color={DANGER} />
          <Text style={r.permBannerText}>위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요.</Text>
        </Pressable>
      )}

      {/* 상단 스페이서 — 러닝 중(그리고 일시정지·실내처럼 지도가 없을 때)엔 아래 컨트롤 앞
          flex:1 과 짝을 이뤄 링+지표 블록을 세로 중앙에 둔다. 일시정지 + 지도 있을 땐 지도 패널이
          상단을 차지하므로 이 스페이서를 뺀다. */}
      {(!uiPaused || liveCoords.length === 0) && <View style={{ flex: 1 }} />}

      {/* 일시정지 상단 지도 패널(위 절반) — 야외(경로 있음)에서만. 탭하면 전체화면 인터랙티브
          지도로 확장(mapFull). flex:1 로 상단을 채우고, 아래로 거리·지표(원래 6개)가 온다. */}
      {uiPaused && liveCoords.length > 0 && (
        <Pressable
          onPress={() => setMapFull(true)}
          accessibilityRole="button"
          accessibilityLabel="지도 전체화면으로 보기"
          style={[r.mapPanel, { height: Math.round(winH * 0.32) }]}>
          <RunLiveMap coords={liveCoords} />
          <View style={r.mapExpandBadge} pointerEvents="none">
            <Ionicons name="expand" size={ri(15)} color={T1} />
          </View>
        </Pressable>
      )}

      {/* ring — 러닝 중에만(사용자 설계: 달릴 땐 링, 일시정지엔 링 없이 지도+하단 지표).
          거리/자유 모드는 거리 히어로, 트랙 모드는 '바퀴 수' 히어로(링=현재 바퀴 진행). */}
      {!uiPaused && (
      <Animated.View style={[r.ringWrap, { transform: [{ scale: ringScale }] }]}>
        <Ring size={ri(280)} stroke={16} progress={track ? track.progress : pct}>
          {track ? (
            <View style={{ alignItems: 'center' }} accessibilityRole="text" accessibilityLiveRegion="polite"
              accessibilityLabel={`${track.lapCount}바퀴, ${track.lapDistKm.toFixed(2)}킬로미터, 한 바퀴 ${track.lapM}미터 ${track.calibrated ? 'GPS 보정됨' : '예상'}`}>
              <Text style={r.lapHero}>{track.lapCount}</Text>
              <Text style={r.lapHeroUnit}>바퀴</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }} accessibilityRole="text" accessibilityLiveRegion="polite"
              accessibilityLabel={`달린 거리 ${distanceKm.toFixed(2)}킬로미터${goalKm ? (met ? `, 목표 ${goalKm}킬로미터 달성, ${over.toFixed(2)}킬로미터 초과` : `, 목표 ${goalKm}킬로미터까지 ${remain.toFixed(2)}킬로미터 남음`) : ''}`}>
              {/* 링 센터: 큰 거리 숫자 + 'km' 단위만. 목표·퍼센티지 표기는 화면에서 제거하고
                  음성으로만 안내한다(나이키식, 사용자 요청). 링의 채워지는 호가 진행을 시각화.
                  스크린리더 라벨엔 목표/남음을 그대로 두어 접근성은 보존. */}
              <Text style={r.bigDist}>{distanceKm.toFixed(2)}</Text>
              <Text style={r.goal}>km</Text>
            </View>
          )}
        </Ring>
      </Animated.View>
      )}

      {/* 일시정지 하단 헤드 — 링이 사라진 자리 대신 거리 히어로(목표 표기 없음, 음성 안내). */}
      {uiPaused && !track && (
        <View style={r.pausedHead}>
          <View style={r.pausedDistRow}>
            <Text style={r.pausedDist}>{distanceKm.toFixed(2)}</Text>
            <Text style={r.pausedDistUnit}>km</Text>
          </View>
        </View>
      )}

      {/* 트랙: 링 아래 회색 한 줄 — 거리 · 확정 랩거리 · 보정 상태(박스·색 없이 조용히) */}
      {track && (
        <Text style={r.trackUnder} accessibilityLabel={`${track.lapDistKm.toFixed(2)}킬로미터, 한 바퀴 ${track.lapM}미터${track.calibrated ? ', GPS 보정됨' : ''}`}>
          <Text style={r.trackUnderStrong}>{track.lapDistKm.toFixed(2)}</Text> km · {track.lapM} m 랩{track.calibrated ? <Text style={r.trackUnderCk}> · 보정됨</Text> : ''}
        </Text>
      )}

      {/* 스피드 코칭 — 현재 km 목표 페이스 대비 빠름/적정/느림(targetPaceSec 있을 때만) */}
      {targetPaceSec != null && (() => {
        const BUF = 8; // ±8초/km 허용 오차(GPS 출렁임 흡수)
        const diff = currentPaceSec != null ? currentPaceSec - targetPaceSec : null;
        const state = diff == null ? 'wait' : diff <= -BUF ? 'fast' : diff >= BUF ? 'slow' : 'on';
        const color = state === 'slow' ? WARN : state === 'wait' ? T3 : GOOD;
        const msg = state === 'fast' ? '목표보다 빠름' : state === 'slow' ? '속도를 올려요' : state === 'on' ? '적정 페이스' : '목표 페이스 유지';
        const icon = state === 'slow' ? 'arrow-up' : state === 'fast' ? 'flame' : state === 'wait' ? 'navigate' : 'checkmark-circle';
        return (
          <View style={[r.coach, { borderColor: withAlpha(color, 0.4), backgroundColor: withAlpha(color, 0.1) }]}
            accessibilityRole="text" accessibilityLiveRegion="polite"
            accessibilityLabel={`목표 페이스 ${fmtPaceSec(targetPaceSec)}, ${msg}`}>
            <Ionicons name={icon} size={ri(15)} color={color} />
            <Text style={r.coachTarget}>목표 <Text style={{ color }}>{fmtPaceSec(targetPaceSec)}</Text></Text>
            <View style={r.coachDot} />
            <Text style={[r.coachMsg, { color }]}>{msg}</Text>
          </View>
        );
      })()}

      {/* hero metrics — 순서: 시간 · 심박 · 페이스(사용자 지정). 프리미엄: 가벼운 값 + 마이크로
          라벨, 위 헤어라인만. 일시정지 시 22로 줄며 아래로 서브 지표가 펼쳐진다. */}
      <View style={[r.heroMetrics, uiPaused && r.heroMetricsPaused]}>
        <View style={r.hm} accessibilityRole="text" accessibilityLabel={`시간 ${timeLabel}`}><Text style={[r.hmV, uiPaused && r.hmVPaused]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{timeLabel}</Text><Text style={r.hmL}>시간</Text></View>
        <View style={[r.hm, r.hmDivider]} accessibilityRole="text" accessibilityLabel={hrZone !== 0 ? `심박 ${bpm}, 존 ${hrZone} ${HR_ZONE_LABEL[hrZone]}` : bpm > 0 ? `심박 ${bpm}` : '심박 측정 안 됨'}><Text style={[r.hmV, uiPaused && r.hmVPaused, hrZone !== 0 && { color: hrColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{bpm > 0 ? String(bpm) : '--'}</Text><Text style={[r.hmL, hrZone !== 0 && { color: hrColor, fontWeight: '600' }]}>{hrZone !== 0 ? `Z${hrZone} ${HR_ZONE_LABEL[hrZone]}` : '심박'}</Text></View>
        <View style={[r.hm, r.hmDivider]} accessibilityRole="text" accessibilityLabel={`${uiPaused ? '평균 페이스' : (track ? '랩 페이스' : '현재 페이스')} ${uiPaused ? avgPaceLabel : paceLabel}`}><Text style={[r.hmV, uiPaused && r.hmVPaused]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{uiPaused ? avgPaceLabel : paceLabel}</Text><Text style={r.hmL}>{uiPaused ? '평균 페이스' : (track ? '랩 페이스' : '현재 페이스')}</Text></View>
      </View>

      {/* 트랙: 지난 랩(최근 3) — 박스 없는 한 줄, 라벨 회색 + 랩번호/구간시간(직전 랩을 즉시 확인). */}
      {track && track.recent.length > 0 && (
        <View style={r.recent}>
          <Text style={r.recentK}>지난 랩</Text>
          {track.recent.map(rl => (
            <Text key={rl.lap} style={r.recentV} accessibilityLabel={`${rl.lap}랩 ${fmtLapSplit(rl.split)}`}>
              <Text style={r.recentN}>{rl.lap} </Text>{fmtLapSplit(rl.split)}
            </Text>
          ))}
        </View>
      )}

      {/* sub metrics — 일시정지 시에만 전체 펼침(평균페이스·케이던스·칼로리·고도). 달리는
          동안은 숨겨 핵심 지표만 크게 보이게 한다(나이키런 방식: 흘끗 봐도 읽힘).
          등장은 위 히어로가 줄어든 뒤 살짝 늦게 올라오며 펼쳐진다(subIn). */}
      {uiPaused && (
        <View style={r.subMetrics}>
          {sub.map((m, i) => (
            <View key={i} style={[r.sm, i > 0 && r.hmDivider]}>
              <Text style={r.smV}>{m.v}{m.u ? <Text style={r.smU}> {m.u}</Text> : null}</Text>
              <Text style={r.smL}>{m.l}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 트랙 모드 랩 기록 — 달리는 중에만. 자동랩(GPS 복귀)이 기본이고 이 버튼은 실내(GPS✗)
          주력 + 야외 보정용. 마지막 랩 되돌리기(-1)로 오검지/중복을 정리한다. */}
      {track && !paused && (
        <View style={r.lapBar}>
          <Pressable onPress={() => onLap?.()} accessibilityRole="button"
            accessibilityLabel={`랩 기록, 현재 ${track.lapCount}바퀴`}
            style={({ pressed }) => [r.lapBtn, pressed && { opacity: 0.85 }]}>
            <Ionicons name="flag-outline" size={ri(19)} color={T1} />
            <Text style={r.lapBtnText}>랩 기록</Text>
            <Text style={r.lapBtnCount}>{track.lapCount}</Text>
          </Pressable>
          {track.lapCount > 0 && (
            <Pressable onPress={onUndoLap} accessibilityRole="button" accessibilityLabel="마지막 랩 되돌리기"
              hitSlop={8} style={({ pressed }) => [r.lapUndo, pressed && { opacity: 0.7 }]}>
              <Ionicons name="arrow-undo" size={ri(17)} color={T3} />
            </Pressable>
          )}
        </View>
      )}

      {/* 하단 여백 — 러닝 중(상단 스페이서와 짝) 또는 일시정지-야외(지도 고정높이 아래 지표 뒤)
          엔 이 여백으로 컨트롤을 바닥에 고정한다. 일시정지-실내(지도 없음)엔 상단 스페이서가
          지표를 하단으로 밀므로 이 여백을 뺀다. */}
      {(!uiPaused || liveCoords.length > 0) && <View style={{ flex: 1 }} />}

      {/* controls */}
      <View style={r.controls}>
        {!paused ? (
          <View style={{ alignItems: 'center', gap: rv(8) }}>
            <Pressable onPress={pauseRun} accessibilityRole="button" accessibilityLabel="일시정지" style={({ pressed }) => [r.cPrimary, pressed && { opacity: 0.85 }]}><GlassEdge radius={44} /><Ionicons name="pause" size={ri(36)} color={T1} /></Pressable>
            <Text style={r.ctrlHint}>일시정지</Text>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: rv(8) }}>
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
                  <Ionicons name="stop" size={ri(26)} color={DANGER} />
                </Pressable>
              </View>
              <Text style={r.ctrlHint}>길게 눌러 종료</Text>
            </View>
            <View style={{ alignItems: 'center', gap: rv(8) }}>
              <Pressable onPress={resumeRun} accessibilityRole="button" accessibilityLabel="재개" style={({ pressed }) => [r.cResume, pressed && { opacity: 0.85 }]}><GlassEdge radius={38} /><Ionicons name="play" size={ri(32)} color={T1} /></Pressable>
              <Text style={r.ctrlHint}>재개</Text>
            </View>
          </>
        )}
      </View>

      {/* 전체화면 인터랙티브 지도 — 일시정지 지도 패널을 탭하면 열린다. 팬·줌 가능, 닫기 버튼.
          화면 좌우 패딩·상하 인셋을 상쇄해 진짜 전체화면. 재개하면 자동으로 닫힘(mapFull 리셋). */}
      {mapFull && (
        <View style={{ position: 'absolute', top: -(insets.top + 8), left: -24, right: -24, bottom: -(insets.bottom + 16), backgroundColor: BG }}>
          <RunLiveMap coords={liveCoords} interactive recenterKey={recenter} />
          {/* 하단 중앙 버튼 행 — 구석이 아니라 가운데·크게·살짝 위로(잘 눌리게). 좌=내 위치로
              이동, 우=닫기(일시정지 화면 복귀). 라벨 병기로 무엇인지 바로 읽힘. */}
          <View style={[r.mapBtnRow, { bottom: insets.bottom + 84 }]} pointerEvents="box-none">
            <Pressable
              onPress={() => setRecenter(x => x + 1)}
              accessibilityRole="button"
              accessibilityLabel="내 위치로 이동"
              hitSlop={12}
              style={({ pressed }) => [r.mapBtn, pressed && { opacity: 0.8 }]}>
              <Ionicons name="locate" size={ri(26)} color={T1} />
            </Pressable>
            <Pressable
              onPress={() => setMapFull(false)}
              accessibilityRole="button"
              accessibilityLabel="지도 닫기"
              hitSlop={12}
              style={({ pressed }) => [r.mapBtn, pressed && { opacity: 0.8 }]}>
              <Ionicons name="close" size={ri(28)} color={T1} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const r = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingHorizontal: rs(24) },
  // 일시정지 상단 지도 패널(위 절반) — 둥근 카드, 탭하면 전체화면. flex:1 로 상단을 채운다.
  mapPanel: { borderRadius: rs(20), borderCurve: 'continuous', overflow: 'hidden', marginTop: rv(6), marginBottom: rv(14), backgroundColor: CARD, borderWidth: 1, borderColor: SEP },
  // 패널 우하단 '전체화면' 힌트 배지.
  mapExpandBadge: { position: 'absolute', right: 12, bottom: 12, width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: withAlpha(T1, 0.2) },
  // 전체화면 지도 하단 중앙 버튼 행 — 구석 대신 가운데, 위로 올려 잘 눌리게.
  mapBtnRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: rv(20), zIndex: 20, elevation: 8 },
  // 큰 원형 아이콘 버튼(라벨 없음). zIndex/elevation 으로 네이티브 지도 위에서 확실히 탭.
  mapBtn: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: withAlpha(T1, 0.3), zIndex: 20, elevation: 8 },

  // 목표 달성 토스트 — 오렌지 판 대신 어두운 유리 막(투명 통일). 축하의 오렌지는 체크
  // 아이콘(포인트 컬러=강조 요소에만)이 담당한다.
  toast: { position: 'absolute', left: 18, right: 18, top: 50, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: rv(12), paddingVertical: rv(12), paddingHorizontal: rs(16), borderRadius: rs(16), borderCurve: 'continuous', backgroundColor: 'rgba(28,28,30,0.94)', borderWidth: 1, borderColor: withAlpha(T1, 0.16) },
  toastTick: { width: rs(34), height: rs(34), borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.2), alignItems: 'center', justifyContent: 'center' },
  toastA: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2 },
  toastB: { color: withAlpha(T1, 0.88), fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', marginTop: rv(2) },

  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  liveDot: { width: rs(8), height: rs(8), borderRadius: RADIUS.pill, backgroundColor: ACCENT },
  liveText: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: 0.2 },
  shoeChip: { flexDirection: 'row', alignItems: 'center', gap: rv(8), backgroundColor: CARD, borderRadius: RADIUS.pill, paddingHorizontal: rs(12), height: rs(30), borderWidth: 1, borderColor: SEP },
  shoeText: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600' },

  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(14), justifyContent: 'center' },
  gpsLabel: { fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },

  permBanner: { flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(12), paddingVertical: rv(10), paddingHorizontal: rs(12), borderRadius: rs(12), borderWidth: StyleSheet.hairlineWidth, borderColor: DANGER, backgroundColor: withAlpha(DANGER, 0.14) },
  permBannerText: { flex: 1, color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', lineHeight: rf(17) },

  ringWrap: { alignItems: 'center', marginTop: rv(26) },
  // 일시정지: 링을 살짝 위로 당기고(marginTop↓) 아래 시각 여백을 조금 회수(marginBottom-)해
  // 서브 지표가 들어설 공간을 낸다. 스케일이 0.92로 완만하므로 마진도 완만하게(겹침 방지).
  ringWrapPaused: { marginTop: rv(8), marginBottom: rv(-14) },
  goal: { color: withAlpha(T1, 0.72), fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: 1, marginTop: rv(18) },
  goalMet: { flexDirection: 'row', alignItems: 'center', gap: rv(4), marginTop: rv(14) },
  goalMetText: { color: GOOD, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: 0.6 },
  // marginTop 14 = 광학 중앙 보정(km 라벨이 아래 붙으며 블록 무게중심이 위로 쏠린 것 상쇄).
  bigDist: { color: T1, fontFamily: DISPLAY, fontSize: rf(104), fontWeight: '500', letterSpacing: -4, lineHeight: rf(106), includeFontPadding: false, fontVariant: ['tabular-nums'], marginTop: rv(14) },
  bigUnit: { color: withAlpha(T1, 0.62), fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: 0.8, marginTop: rv(16) },
  // 일시정지 하단 헤드 — 링 없이 거리 히어로 + 목표를, 지도 위·하단 지표 위에 얹는다.
  pausedHead: { alignItems: 'center', marginBottom: rv(8) },
  pausedDistRow: { flexDirection: 'row', alignItems: 'flex-end' },
  pausedDist: { color: T1, fontFamily: DISPLAY, fontSize: HERO.heroLg, fontWeight: '600', letterSpacing: -2, lineHeight: rf(58), includeFontPadding: false, fontVariant: ['tabular-nums'] },
  pausedDistUnit: { color: withAlpha(T1, 0.55), fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', marginLeft: rs(6), marginBottom: rv(8) },
  pausedGoal: { color: withAlpha(T1, 0.62), fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', letterSpacing: 0.8, marginTop: rv(8) },
  // 트랙 링 센터 — 바퀴수 하나만 히어로, 그 밑 작은 '바퀴'.
  lapHero: { color: T1, fontFamily: DISPLAY, fontSize: rf(96), fontWeight: '700', letterSpacing: -3, lineHeight: rf(96), includeFontPadding: false, fontVariant: ['tabular-nums'] },
  lapHeroUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: 0.6, marginTop: rv(6) },
  // 링 아래 회색 한 줄(거리 · 랩거리 · 보정) — 박스·색 없이 조용히.
  trackUnder: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', textAlign: 'center', marginTop: rv(16), fontVariant: ['tabular-nums'] },
  trackUnderStrong: { color: T1, fontFamily: DISPLAY, fontWeight: '700' },
  trackUnderCk: { color: ACCENT_2, fontWeight: '600' },
  // 지난 랩 한 줄 — 라벨 회색 + 랩번호(T4)/구간시간(T2), 박스 없음.
  recent: { flexDirection: 'row', alignItems: 'center', gap: rv(14), marginTop: rv(16), paddingHorizontal: rs(2) },
  recentK: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  recentV: { color: T2, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600', fontVariant: ['tabular-nums'] },
  recentN: { color: T2, fontWeight: '700' },
  coach: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: rv(8), marginTop: rv(18), paddingHorizontal: rs(14), height: rs(38), borderRadius: RADIUS.pill, borderWidth: 1 },
  coachTarget: { color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600' },
  coachDot: { width: rs(3), height: rs(3), borderRadius: rs(2), backgroundColor: T4 },
  coachMsg: { fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700' },

  // 달릴 땐 34(빈약하다는 피드백 → 30에서 확대), 일시정지 시 22로 줄어 서브에 자리를 내준다.
  // 프리미엄: 위 헤어라인만(아래 테두리 제거), 여백 크게, 가벼운 값 + 마이크로 라벨.
  heroMetrics: { flexDirection: 'row', marginTop: rv(30), paddingTop: rv(22), paddingBottom: rv(6), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEP },
  heroMetricsPaused: { marginTop: rv(16), paddingTop: rv(16), paddingBottom: rv(4) },
  hm: { flex: 1, alignItems: 'center' },
  hmDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: withAlpha(T1, 0.045) },
  hmV: { color: T1, fontFamily: DISPLAY, fontSize: rf(37), fontWeight: '500', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  hmVPaused: { fontSize: TYPE.title1.fontSize, letterSpacing: -0.5 },
  hmL: { color: withAlpha(T1, 0.45), fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: "600", letterSpacing: 0.4, marginTop: rv(8) },

  // 일시정지 하단 3칸(케이던스·칼로리·고도) — 상단 히어로 행과 같은 3열 그리드(6칸처럼).
  subMetrics: { flexDirection: 'row', paddingTop: rv(14), paddingBottom: rv(6) },
  sm: { flex: 1, alignItems: 'center' },
  smV: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title1.fontSize, fontWeight: '500', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  smU: { color: withAlpha(T1, 0.45), fontFamily: FONT, fontSize: TYPE.caption.fontSize },
  smL: { color: withAlpha(T1, 0.45), fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: "600", letterSpacing: 0.4, marginTop: rv(8) },

  mapWrap: {
    flex: 1,
    minHeight: rs(130),
    maxHeight: rs(180),
    marginTop: rv(10),
    marginBottom: rv(4),
    borderRadius: rs(16), borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SEP,
  },
  positionDot: {
    width: rs(16),
    height: rs(16),
    borderRadius: rs(8),
    backgroundColor: T2,
    borderWidth: 3,
    borderColor: T1,
    shadowColor: BG,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  // 트랙 랩 기록 바 — 큰 '랩 기록' 필 + 작은 되돌리기. 유리 문법(홈 CTA 계열).
  // 랩 기록 = 주 동작(오렌지 유리 필, 넓게) + 우측 현재 바퀴수. 되돌리기(-1)는 작은 보조.
  lapBar: { flexDirection: 'row', alignItems: 'center', gap: rv(10), marginTop: rv(18) },
  lapBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), height: rs(58), borderRadius: rs(18), borderCurve: 'continuous', backgroundColor: withAlpha(ACCENT, 0.12), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.4) },
  lapBtnText: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2 },
  lapBtnCount: { position: 'absolute', right: 18, color: ACCENT_2, fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '700', fontVariant: ['tabular-nums'] },
  lapUndo: { width: rs(52), height: rs(52), borderRadius: rs(16), borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: SEP },

  controls: { flexDirection: 'row', justifyContent: 'center', gap: rv(48), paddingBottom: rv(8) },
  // 러닝 컨트롤 — 오렌지 필 대신 투명 유리(홈 CTA 와 같은 문법). 종료(cStop)만 DANGER
  // 색을 유지해 '위험한 동작'의 색 언어를 지킨다.
  cPrimary: { width: rs(88), height: rs(88), borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center' },
  cResume: { width: rs(76), height: rs(76), borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center' },
  cStopWrap: { width: rs(76), height: rs(76), alignItems: 'center', justifyContent: 'center' },
  cStop: { width: rs(76), height: rs(76), borderRadius: RADIUS.pill, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(DANGER, 0.5), alignItems: 'center', justifyContent: 'center' },
  ctrlHint: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
});
