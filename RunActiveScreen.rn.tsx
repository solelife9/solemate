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
import { View, Pressable, StyleSheet, Animated, Easing, StatusBar, LayoutAnimation, useWindowDimensions } from 'react-native';
import {Text} from './lib/text';
import type {Text as RNText} from 'react-native'; // ref 인스턴스 타입 전용
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Circle, Defs, RadialGradient as SvgRadial, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { GlassEdge, Ring, ShoeGlyph } from './primitives';
import { RunLiveMap } from './RunLiveMap';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · amber→WARN ·
// red→DANGER · text→T1–T4 · sep→SEP. 폰트 UI/DP → FONT/DISPLAY.
// (시각 동등: 다크+오렌지 유지)
import {
  BG, CARD, ACCENT, ACCENT_2,
  GOOD, WARN, DANGER, T1, T2, T3, T4, SEP, CARD_BORDER,
  FONT, DISPLAY, withAlpha, HR_ZONE_COLORS, TYPE, RADIUS, GUTTER, MOTION, BLACK, NUM,
  RUN_RING_SIZE, RUN_RING_STROKE, RUN_RING_STOPS,
} from './theme';
import { estimateMaxHR, zoneOf, HR_ZONE_LABEL } from './lib/analytics/hrZones';
import { setCeremonyNumRect } from './lib/motionHandoff';
import { fmtPaceSec } from './lib/pacePlan';
// lib/haptics 배선: 일시정지/재개 → tap · 목표 달성 → impactHeavy · 종료 확정 → warning ·
// 카운트다운 3·2·1 비트 → countdownBeat · GO → go(카운트다운 통합, 2026-07-16).
import { tap, impactHeavy, warning, countdownBeat, go as goHaptic } from './lib/haptics';

// 지도 배치 규칙(2026-07-09 승인). 러닝 '중'(active)엔 지도를 두지 않고 링+지표만 둔다 —
// 달리는 동안 화면 정보는 최소화. 지도는 '일시정지' 시 상단 패널로 등장하고(탭하면 전체화면
// 인터랙티브), 러닝 종료 후 "상세보기"에서 경로를 본다. Apple Maps(react-native-maps) 전환으로
// 옛 구글맵 타일 실패(흰 "Google" 화면이 컨트롤을 가려 저장조차 못 하던 사고)는 해소됨.
// GPS 거리·페이스 기록은 지도와 무관하게 계속된다.

// 러닝 링 = primitives.Ring v2(animated) — 구 로컬 재구현(64조각 Path → 단일 스트로크
// 슬라이드)을 프리미티브로 승격해 카운트다운·세리머니와 구현까지 한 벌(2026-07-16 2단계).

// jest 워커에서는 장식 모션(km 펄스·세리머니 등)을 건너뛴다 — RunRecapScreen 관례와 동일.
const SKIP_ANIM = !!(typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID);

// ════════════════════════════════════════════════════════════════════════════
// 완주 세리머니(모션 #5, A안 '절제' — 사용자 확정 2026-07-12): 종료 홀드 확정 순간
// 풀스크린 오버레이에서 파파야 링이 0→100% 로 차오르며(러닝의 마침표) 뒤로 은은한
// 흰 빛이 번졌다 스러지고, 링 완성에 impactHeavy. 끝나면 onDone(=onStop → 리캡의
// 체크 팝으로 이야기가 이어진다). 색·컨페티 없음 — Apple Fitness 링 완성의 결.
// 입력 차단(pointerEvents box-only)·약 1.05s. SKIP_ANIM(jest)이면 애초에 안 뜬다.
// ════════════════════════════════════════════════════════════════════════════
function FinishCeremony({ distanceKm, onDone }: { distanceKm: number; onDone: () => void }) {
  // 러닝 링과 같은 링(RUN_RING 토큰, 2026-07-16 링 통일) — 같은 자리·같은 크기에서
  // 마침표를 찍는다(구 240/14 는 러닝 링 280/16 과 미묘하게 달라 '다른 링'으로 읽혔다).
  const SIZE = ri(RUN_RING_SIZE);
  const STROKE = RUN_RING_STROKE;
  // 완주 숫자의 윈도 좌표를 리캡에 넘긴다(세리머니→리캡 히어로 모프) — 레이아웃 확정 시
  // 측정해 motionHandoff 에 남기면, 곧 마운트되는 RunRecapScreen 이 1회 소비한다.
  const distRef = useRef<RNText>(null);
  const measureDist = () => {
    const node: any = distRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (w > 0 && h > 0) setCeremonyNumRect({ x, y, w, h, fs: rf(64) }); // fs = cer.dist fontSize
      });
    }
  };
  const fade = useRef(new Animated.Value(0)).current; // 오버레이 페이드인
  const glow = useRef(new Animated.Value(0)).current; // 빛 번짐 0→1→0
  // 링 스윕은 primitives.Ring(animated) 이 맡는다: 페이드 완료 후(delay) 0→1 로 차오르고
  // onSweepEnd 에서 완성 햅틱 — 빛 번짐이 스러지는 것과 무관하게 링 완성 순간에 '쿵'.
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: MOTION.dur.fast, easing: MOTION.ease.quad, useNativeDriver: false }),
      // 빛은 링 완성 직전 피크 → 부드럽게 스러짐(0→1→0 은 아래 interpolate 가 성형)
      Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]);
    seq.start();
    return () => seq.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowO = glow.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0.16, 0] });
  const glowS = glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.22] });
  return (
    <Animated.View pointerEvents="box-only" style={[StyleSheet.absoluteFill, cer.wrap, { opacity: fade }]} testID="finish-ceremony">
      {/* 은은한 흰 빛 번짐 — 무채 언어(파파야는 링에만) */}
      <Animated.View style={[cer.glow, { width: SIZE * 1.9, height: SIZE * 1.9, opacity: glowO, transform: [{ scale: glowS }] }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <SvgRadial id="cer-glow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={T1} stopOpacity={1} />
              <Stop offset="0.6" stopColor={T1} stopOpacity={0.35} />
              <Stop offset="1" stopColor={T1} stopOpacity={0} />
            </SvgRadial>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill="url(#cer-glow)" />
        </Svg>
      </Animated.View>
      <Ring
        size={SIZE} stroke={STROKE} stops={RUN_RING_STOPS}
        animated from={0} progress={1}
        duration={MOTION.dur.sweep} delay={MOTION.dur.fast} easing={MOTION.ease.out}
        onSweepEnd={() => {
          impactHeavy(); // 링 완성 — 성취의 '쿵'(목표 달성과 같은 무게 언어)
          setTimeout(onDone, 220);
        }}>
        <Text ref={distRef} onLayout={measureDist} style={cer.dist}>{distanceKm.toFixed(2)}</Text>
        <Text style={cer.unit}>km</Text>
      </Ring>
    </Animated.View>
  );
}

const cer = StyleSheet.create({
  wrap: { backgroundColor: withAlpha(BG, 0.94), alignItems: 'center', justifyContent: 'center', zIndex: 40 },
  glow: { position: 'absolute' },
  // 세리머니 거리 = NUM(Jost) — 1초 뒤 리캡 히어로(NUM 68)로 넘겨받는 같은 숫자의
  // 폰트 점프 해소(2026-07-16 통일). weight 도 리캡 heroNum(700)과 정렬.
  dist: { color: T1, fontFamily: NUM, fontSize: rf(64), fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -1.5, lineHeight: rf(78), includeFontPadding: false },
  unit: { color: withAlpha(T1, 0.8), fontFamily: FONT, fontSize: rf(19), fontWeight: '700', letterSpacing: 0.6, marginTop: rv(4) },
});

export default function RunActiveScreen({
  shoeLabel = 'Alphafly 3', distanceKm = 3.2, goalKm = 5, goalMin = 0, elapsedSec = 0,
  timeLabel = '16:04', paceLabel = "5'02\"", avgPaceLabel = "5'10\"",
  calories = 205, elevationM = 46, gpsLevel = 3, bpm = 0, targetZone = 0, zoneDeviation = null,
  age = 0, restHR = 0,
  paused: pausedProp, onPause, onStop,
  permLost = false, onOpenSettings, statusLabel,
  currentPaceSec = null, targetPaceSec = null,
  liveCoords = [],
  track = null, onLap, onUndoLap,
  handoff = false,
  countdown = null,
  voiceMuted = false, onToggleVoice, pausedMoveNudge = false,
}: {
  shoeLabel?: string; distanceKm?: number; goalKm?: number;
  /** 시간 목표(분, #15). >0 이고 goalKm=0 이면 링 진행·달성 판정이 경과시간 기준. */
  goalMin?: number;
  /** 경과 초 — 시간 목표 진행/판정용(timeLabel 은 표시 전용 문자열). */
  elapsedSec?: number;
  timeLabel?: string; paceLabel?: string; avgPaceLabel?: string;
  // 스피드 모드 코칭: 현재(롤링) 페이스 vs 현재 km 목표 페이스(초/km). targetPaceSec=null 이면
  // 코칭 배너를 숨긴다(거리/시간 모드). 둘 다 있으면 빠름/적정/느림을 색·라벨로 보여준다.
  currentPaceSec?: number | null; targetPaceSec?: number | null;
  // bpm: 심박(분당). 0이면 미측정('--' 표시). HealthKit/Apple Watch 연동 시 채워진다.
  cadence?: number; calories?: number; elevationM?: number; gpsLevel?: number; bpm?: number;
  /** 심박존 가이드(#7): 목표 존(0=끄기·2·3·4)과 현재 이탈 방향(up=올려라/down=낮춰라/null). */
  targetZone?: number; zoneDeviation?: 'up' | 'down' | null;
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
  /** 카운트다운→러닝 링 핸드오프 인트로(가득 찬 링이 풀려나가는 드레인). 새 러닝 시작에만
      true — 크래시 복구(resume) 재진입은 이어 달리기라 인트로 없이 현재 진행으로 시작. */
  handoff?: boolean;
  /** 카운트다운 모드(2026-07-16 통합, 사용자 확정 "링이 한 링처럼"): 있으면 이 인스턴스는
      엔진 없이 러닝 화면과 '같은 레이아웃'으로 3·2·1→GO 를 링 그 자리에서 돌린다.
      onDone 에서 App 이 엔진 인스턴스로 스왑 — 레이아웃이 같아 링은 픽셀 그대로 이어지고,
      지표·컨트롤은 스왑 후 아래에서 떠오른다(uiIn). 구 RunCountdownScreen(별도 화면) 대체. */
  countdown?: { onCancel?: () => void; onDone?: () => void } | null;
  /** 러닝 중 음성 안내 온/오프(심사 #10) — 일시정지 화면의 스피커 토글. 설정은 다음 런부터라
      러닝 중 끌 방법이 없던 갭을 메운다(이 런에만 적용, 설정 미변경). */
  voiceMuted?: boolean;
  onToggleVoice?: () => void;
  /** 일시정지 이동 감지 넛지(#11 잔여) — 수동 일시정지 중 걸음이 계속 쌓이면 App 이 true 로.
      배너 1줄로 '기록이 멈춰 있음'을 알려만 준다(자동 재개 없음 — Apple 재개 미리 알림 문법). */
  pausedMoveNudge?: boolean;
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
    // 한 호흡 전환(2026-07-12 실기기 피드백 2차): 레이아웃 이동·생성·소멸 전부를 지도
    // 시트와 같은 420ms 커브로 동기화 — 화면 전체가 함께 내려와 바뀌는 것처럼 읽힌다.
    // delete 에 opacity 를 줘 링이 '띡' 사라지지 않고 페이드아웃되게 한다.
    LayoutAnimation.configureNext({
      duration: MOTION.dur.sheet,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setUiPaused(paused);
    Animated.parallel([
      Animated.timing(t, { toValue: paused ? 1 : 0, duration: MOTION.dur.base, easing: MOTION.ease.inout, useNativeDriver: true }),
      Animated.timing(subIn, { toValue: paused ? 1 : 0, duration: paused ? 260 : MOTION.dur.fast, delay: paused ? 70 : 0, easing: MOTION.ease.quad, useNativeDriver: true }),
    ]).start();
  }, [paused, uiPaused, t, subIn]);
  // 일시정지 지도 등장 모션(2026-07-12 사용자 확정 — 나이키 문법): 화면이 '띡' 바뀌는 대신
  // 지도가 위에서 시트처럼 내려온다(-H→0, 420ms). 동시에 기존 LayoutAnimation(260ms)이
  // 아래 지표들을 밀어 한 호흡의 전환이 된다. 재개는 즉시 복귀(달리기 재개의 긴박함 우선).
  const mapSlide = useRef(new Animated.Value(SKIP_ANIM ? 1 : 0)).current;
  const [mapH, setMapH] = useState(0);
  const mapShown = uiPaused && liveCoords.length > 0;
  useEffect(() => {
    if (!mapShown || SKIP_ANIM) return;
    mapSlide.setValue(0);
    const a = Animated.timing(mapSlide, { toValue: 1, duration: MOTION.dur.sheet, easing: MOTION.ease.inout, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [mapShown, mapSlide]);

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
  // 핸드오프 인트로는 '첫 마운트 한 번'만 — 링은 일시정지 때 언마운트됐다 재개 시 다시
  // 마운트되므로, prop 그대로 쓰면 재개마다 드레인이 재생된다. 첫 렌더에서 소비하고 끈다.
  const handoffArmed = useRef(handoff && !SKIP_ANIM);
  const handoffFrom = handoffArmed.current ? 1 : undefined;
  useEffect(() => { handoffArmed.current = false; }, []);

  // ── 카운트다운 통합 드라이버 ─────────────────────────────────────────────────
  // countdown 인스턴스에서만 돈다: 1초 간격 3·2·1 비트(햅틱+숫자 팝+링 1/3 채움) →
  // GO(강햅틱+칩 페이드아웃) → 650ms 뒤 onDone(App 이 엔진 인스턴스로 스왑).
  // 콜백은 ref 로 읽어 App 의 인라인 객체 재생성에 타이머가 리셋되지 않는다.
  const cd = !!countdown;
  const cdCb = useRef(countdown);
  cdCb.current = countdown;
  const [cdPhase, setCdPhase] = useState<'count' | 'go'>('count');
  const [cdNum, setCdNum] = useState(3);
  const [cdProgress, setCdProgress] = useState(0);
  const cdNumScale = useRef(new Animated.Value(1)).current;
  const cdNumOpacity = useRef(new Animated.Value(1)).current;
  const cdGoScale = useRef(new Animated.Value(0.6)).current;
  const cdChipFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!cd) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };
    const beat = (n: number, i: number) => {
      setCdNum(n);
      countdownBeat();          // 3·2·1 각 박자마다 짧은 단발 진동
      cdNumScale.setValue(1.5); cdNumOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(cdNumScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
        Animated.timing(cdNumOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      setCdProgress((i + 1) / 3); // Ring(1초 linear)이 1/3 씩 채운다
    };
    [3, 2, 1].forEach((n, i) => at(() => beat(n, i), i * 1000));
    at(() => {
      setCdPhase('go');
      goHaptic();               // GO — 카운트다운 종료, 강한 단발 진동
      cdGoScale.setValue(0.6);
      Animated.spring(cdGoScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 9 }).start();
      Animated.timing(cdChipFade, { toValue: 0, duration: MOTION.dur.base, easing: MOTION.ease.quad, useNativeDriver: true }).start();
    }, 3000);
    at(() => cdCb.current?.onDone?.(), 3650);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cd]);

  // 지표·컨트롤 라이즈('지표들이 날아온다') — 카운트다운 중엔 0(레이아웃은 그대로, 안 보임),
  // GO 스왑 후 엔진 인스턴스가 아래에서 떠올린다. 복구(resume) 등 핸드오프 없는 진입은 즉시 1.
  const uiIn = useRef(new Animated.Value(cd || (handoff && !SKIP_ANIM) ? 0 : 1)).current;
  useEffect(() => {
    if (cd) return;
    const a = Animated.timing(uiIn, { toValue: 1, duration: 480, delay: 60, easing: MOTION.ease.out, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [cd, uiIn]);
  const uiRise = uiIn.interpolate({ inputRange: [0, 1], outputRange: [rv(14), 0] });
  // 라이브 심박 존 — 심박이 흐를 때만 산출(bpm>0). 워치 미연동이면 0 → 존 미표시.
  const hrZone = bpm > 0 ? zoneOf(bpm, estimateMaxHR(age), restHR || undefined) : 0;
  const hrColor = hrZone !== 0 ? HR_ZONE_COLORS[hrZone] : T1;
  const togglePause = () => (onPause ? onPause() : setPausedState(p => !p));
  // 일시정지·재개는 가벼운 tap 햅틱으로 동작을 확인시킨다.
  const pauseRun = () => { tap(); togglePause(); };
  // 수동 재개 3·2·1 카운트다운(심사 #11, NRC 문법) — 정지 자세에서 바로 달리기로 돌아갈
  // 준비 시간을 준다. 엔진은 카운트 동안 일시정지 유지(시간 회계 불변), 탭하면 취소.
  // 자동 일시정지의 자동 재개는 이 경로를 타지 않는다(움직임이 곧 재개 신호라 지연이 오답).
  const [resumeCd, setResumeCd] = useState(0); // 0=꺼짐, 3→2→1 카운트 중
  const resumeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearResumeCd = () => {
    if (resumeTimer.current) { clearInterval(resumeTimer.current); resumeTimer.current = null; }
    setResumeCd(0);
  };
  const resumeRun = () => {
    tap();
    if (SKIP_ANIM) { togglePause(); return; }
    setResumeCd(3); countdownBeat();
    resumeTimer.current = setInterval(() => {
      setResumeCd(n => {
        if (n <= 1) {
          if (resumeTimer.current) { clearInterval(resumeTimer.current); resumeTimer.current = null; }
          goHaptic();
          togglePause();
          return 0;
        }
        countdownBeat();
        return n - 1;
      });
    }, 1000);
  };
  // 외부 재개(워치 미러링·자동 재개)나 언마운트 시 카운트다운 잔여 타이머 정리.
  useEffect(() => { if (!paused) clearResumeCd(); }, [paused]);
  useEffect(() => () => { if (resumeTimer.current) clearInterval(resumeTimer.current); }, []);

  // 길게 눌러 종료: 600ms 홀드 진행을 시각(링)으로 보여주고, 확정 시 warning 햅틱.
  // 되돌릴 수 없는 동작이라 또렷한 경고 진동을 쓴다(실수 종료 방지 + 확정 피드백).
  const HOLD_MS = 600;
  // 홀드 링 지오메트리 — 종료 버튼(cStop rs76)과 같은 rs 스케일로 정렬(감사 #3:
  // Svg 만 raw 76 이라 작은 기기에서 링이 버튼과 어긋났다). 반지름 = 버튼 반경 − 스트로크 여유.
  const STOP_D = rs(76);
  const STOP_STROKE = rs(3);
  const STOP_R = STOP_D / 2 - STOP_STROKE;
  const STOP_CIRC = 2 * Math.PI * STOP_R;
  const holdAnim = useRef(new Animated.Value(0)).current;
  const holdOffset = holdAnim.interpolate({ inputRange: [0, 1], outputRange: [STOP_CIRC, 0] });
  const startHold = () => {
    holdAnim.setValue(0);
    Animated.timing(holdAnim, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
  };
  const cancelHold = () => {
    Animated.timing(holdAnim, { toValue: 0, duration: MOTION.dur.fast, useNativeDriver: false }).start();
  };
  // 종료 확정 → 세리머니(A안) → onStop. 세리머니 ~1.05s 는 사용자가 그만큼 늦게 종료를
  // 누른 것과 동일한 회계(엔진은 onStop 에서 멈춤 — 데이터 정확성 불변). jest 는 즉시 종료.
  const [ceremony, setCeremony] = useState(false);
  const confirmStop = () => {
    warning();
    if (SKIP_ANIM) { onStop?.(); return; }
    setCeremony(true);
  };

  // 시간 목표(#15): goalMin>0(그리고 거리 목표 없음)이면 링 진행·달성 판정이 경과시간 기준.
  // 링 센터 숫자는 시간 목표여도 거리 유지(달린 거리는 항상 1번 관심사 — NRC 동일).
  const timeGoal = goalMin > 0 && !(goalKm > 0);
  const pct = timeGoal
    ? Math.min(1, elapsedSec / (goalMin * 60))
    : goalKm > 0 ? Math.min(1, distanceKm / goalKm) : 0;
  const remain = goalKm ? Math.max(0, goalKm - distanceKm) : 0;
  const met = timeGoal ? elapsedSec >= goalMin * 60 : goalKm > 0 && distanceKm >= goalKm;
  const over = met && !timeGoal ? distanceKm - goalKm : 0;

  const [celebrated, setCelebrated] = useState(false);
  const toastY = useRef(new Animated.Value(-120)).current;
  const toastO = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!met || celebrated) return;
    setCelebrated(true);
    impactHeavy();  // 목표 달성 — 무게감 있는 단발 진동으로 성취를 알린다.
    Animated.parallel([
      Animated.spring(toastY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 8 }),
      Animated.timing(toastO, { toValue: 1, duration: MOTION.dur.base, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastY, { toValue: -120, duration: MOTION.dur.base, useNativeDriver: true }),
        Animated.timing(toastO, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }, 3200);
    return () => clearTimeout(t);
  }, [met, celebrated, toastY, toastO]);

  // ── km 달성 모멘트(모션 #4, 2026-07-12) — km 를 넘는 순간 링 안 거리 숫자가 한 번
  // 숨 쉬듯 커졌다 정착한다(음성 km 안내와 같은 시점). 절제 원칙: 색·글로우 없이 스케일만,
  // 햅틱은 가벼운 tap(묵직한 impactHeavy 는 목표 달성 전용 위계 유지). 일시정지 중엔 발동 안 함.
  const kmPulse = useRef(new Animated.Value(1)).current;
  const lastKmRef = useRef(Math.floor(distanceKm));
  useEffect(() => {
    const k = Math.floor(distanceKm);
    if (k <= lastKmRef.current) {
      if (k < lastKmRef.current) lastKmRef.current = k; // 새 런 재사용 방어(거리 리셋)
      return;
    }
    lastKmRef.current = k;
    if (paused || SKIP_ANIM) return;
    tap();
    Animated.sequence([
      Animated.timing(kmPulse, { toValue: 1.07, duration: MOTION.dur.fast, easing: MOTION.ease.quad, useNativeDriver: true }),
      Animated.spring(kmPulse, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [distanceKm, paused, kmPulse]);

  // GPS 상태는 문제가 있을 때만 말한다(2026-07-12 사용자 확정): '좋음/보통' 상시 표시는
  // 사용자가 조치할 게 없는 소음이라 제거. 死구간/약함(level 1)일 때만 경고 — 거리계가
  // 왜 멈췄는지 설명하는 신뢰 장치(audit#9)는 유지한다. 권한 회수는 별도 배너.
  const gpsWeakNow = !permLost && gpsLevel === 1;
  // GPS '검색 중'(P1 #49) — fix 이전(level 0)엔 거리가 0인 채 침묵해 고장처럼 보였다.
  // '신호 약함'과 같은 한 줄 필 문법이되, 문제(WARN)가 아니라 준비 상태라 무채로 말한다.
  const gpsSearching = !permLost && gpsLevel === 0;
  // 일시정지 하단 3칸 — 평균 페이스는 상단 히어로(현재 페이스 자리)로 올라가므로 여기선 제외.
  // 일시정지 6칸 하단(사용자 확정 2026-07-12): 심박·칼로리·고도. 케이던스는 완주 리캡 전용.
  const sub = useMemo(() => ([
    { v: bpm > 0 ? String(bpm) : '--', l: hrZone !== 0 ? `Z${hrZone} ${HR_ZONE_LABEL[hrZone]}` : '심박', u: '', c: hrZone !== 0 ? hrColor : undefined },
    { v: calories > 0 ? String(calories) : '--', l: '칼로리', u: 'kcal' },
    { v: elevationM != null ? String(Math.round(elevationM)) : '--', l: '고도', u: 'm' },
  ]), [bpm, hrZone, hrColor, calories, elevationM]);
  // 랩 구간시간(초) → m'ss" (트랙 '지난 랩' 표시용).
  const fmtLapSplit = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`;

  return (
    <View style={[r.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" />

      {/* 목표 달성 축하 토스트 */}
      {met && (
        <Animated.View pointerEvents="none" style={[r.toast, { opacity: toastO, transform: [{ translateY: toastY }] }]} accessibilityLiveRegion="polite" accessibilityRole="text" accessibilityLabel={timeGoal ? `목표 ${goalMin}분 달성! 계속 달려요` : `목표 ${goalKm}킬로미터 달성! 계속 달려요`}>
          <View style={r.toastTick}><Ionicons name="checkmark" size={ri(18)} color={ACCENT} /></View>
          <View style={{ flex: 1 }}>
            <Text style={r.toastA}>{timeGoal ? `목표 ${goalMin}분 달성!` : `목표 ${goalKm}km 달성!`}</Text>
            <Text style={r.toastB}>계속 달려요 — 기록은 신발에 쌓이는 중</Text>
          </View>
        </Animated.View>
      )}

      {/* top — 카운트다운 중엔 좌측이 '취소'(LIVE 상태는 아직 없음), 높이는 우측 신발칩(rs 30)
          이 잡아 러닝 모드와 동일(스왑 시 링 위치 불변). */}
      <View style={r.top}>
        {cd ? (
          <Pressable onPress={() => cdCb.current?.onCancel?.()} hitSlop={8} accessibilityRole="button" accessibilityLabel="카운트다운 취소"
            style={({ pressed }) => [r.cdCancel, pressed && { opacity: 0.8 }]}>
            <Ionicons name="chevron-back" size={ri(16)} color={T2} />
            <Text style={r.cdCancelText}>취소</Text>
          </Pressable>
        ) : (
          <View style={r.live} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={`상태: ${statusLabel ?? (paused ? '일시정지' : '러닝 중')}`}>
            <View style={[r.liveDot, met && { backgroundColor: GOOD }]} />
            <Text style={[r.liveText, met && { color: GOOD }]}>{statusLabel ?? (paused ? '일시정지' : '러닝 중')}</Text>
          </View>
        )}
        <View style={r.topRight}>
          {/* 음성 토글(심사 #10) — 일시정지 화면에만 나타나는 조용한 스피커 아이콘.
              설정은 '다음 런부터'라 러닝 중 끌 방법이 없던 갭을 이 런 한정으로 메운다. */}
          {uiPaused && !cd && !!onToggleVoice && (
            <Pressable onPress={() => { tap(); onToggleVoice(); }} hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={voiceMuted ? '음성 안내 켜기' : '음성 안내 끄기'}
              accessibilityState={{ selected: !voiceMuted }}
              style={({ pressed }) => [r.voiceBtn, pressed && { opacity: 0.8 }]}
              testID="voice-toggle">
              <Ionicons name={voiceMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={ri(16)} color={voiceMuted ? T3 : T1} />
            </Pressable>
          )}
          <View style={r.shoeChip} accessibilityRole="text" accessibilityLabel={`신고 있는 신발 ${shoeLabel}`}><ShoeGlyph color={T3} size={ri(15)} /><Text style={r.shoeText}>{shoeLabel}</Text></View>
        </View>
      </View>

      {/* gps — 약할 때만 등장하는 경고(상시 상태 표시 폐지). 거리 기록이 멈출 수 있음을 설명. */}
      {gpsWeakNow && (
        <View style={r.gpsWeak} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel="GPS 신호 약함, 거리 기록이 잠시 멈출 수 있어요">
          <Ionicons name="cellular" size={ri(13)} color={WARN} />
          <Text style={r.gpsWeakText}>GPS 신호 약함 — 거리 기록이 잠시 멈출 수 있어요</Text>
        </View>
      )}

      {/* gps 검색 중(P1 #49) — 첫 fix 이전(level 0). 시작 직후 거리 0의 침묵을 설명하는
          신뢰 장치. gpsWeak 와 같은 한 줄 필, 색만 무채(문제 아님 — 준비 상태). */}
      {gpsSearching && (
        <View style={[r.gpsWeak, r.gpsSearch]} testID="gps-searching" accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel="GPS 찾는 중, 신호를 잡으면 거리 기록이 시작돼요">
          <Ionicons name="cellular" size={ri(13)} color={T3} />
          <Text style={[r.gpsWeakText, r.gpsSearchText]}>GPS 찾는 중 — 신호를 잡으면 거리를 기록해요</Text>
        </View>
      )}

      {/* 권한 회수 복구 배너 — 위치 권한이 꺼지면 탭해서 설정에서 다시 허용.
          assertive live-region: 스크린리더가 즉시 끼어들어 '거리 기록 멈춤'을 알린다. */}
      {permLost && (
        <Pressable onPress={onOpenSettings} accessibilityRole="button" accessibilityLiveRegion="assertive" accessibilityLabel="위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요." style={r.permBanner}>
          <Ionicons name="alert-circle" size={ri(15)} color={DANGER} />
          <Text style={r.permBannerText}>위치 권한이 꺼져 거리 기록을 멈췄어요. 눌러서 다시 허용하세요.</Text>
        </Pressable>
      )}

      {/* 일시정지 이동 감지 넛지(#11 잔여, 민우님 승인 2026-07-24) — 수동 일시정지 상태로
          걸음이 계속 쌓일 때 1줄. 진동은 App 이 1회만, 배너는 재개까지 상태를 계속 말한다.
          gpsWeak 와 같은 WARN 필 문법(러닝 중 화면 불가침 — 상태 한 줄 원칙). */}
      {uiPaused && pausedMoveNudge && !cd && (
        <View style={r.gpsWeak} testID="pause-move-nudge" accessibilityRole="text" accessibilityLiveRegion="assertive" accessibilityLabel="일시정지 중이에요. 지금 움직임은 기록되지 않아요. 재개를 눌러 이어서 달리세요.">
          <Ionicons name="pause-circle" size={ri(13)} color={WARN} />
          <Text style={r.gpsWeakText}>일시정지 중이에요 — 지금 움직임은 기록되지 않아요</Text>
        </View>
      )}

      {/* 상단 스페이서 — 러닝 중(그리고 일시정지·실내처럼 지도가 없을 때)엔 아래 컨트롤 앞
          flex:1 과 짝을 이뤄 링+지표 블록을 세로 중앙에 둔다. 일시정지 + 지도 있을 땐 지도 패널이
          상단을 차지하므로 이 스페이서를 뺀다. */}
      {(!uiPaused || liveCoords.length === 0) && <View style={{ flex: 1 }} />}

      {/* 일시정지 상단 지도 — 야외(경로 있음)에서만. 카드가 아니라 좌우 풀블리드로 위 공간을
          꽉 채운다(2026-07-12 사용자 확정: 카드 폐지, km 위까지 여백 없이). flex:1 이 상단을
          전부 차지하고 km 히어로가 바로 아래 붙는다. 탭하면 전체화면 인터랙티브 지도(mapFull). */}
      {mapShown && (
        <Pressable
          onPress={() => setMapFull(true)}
          accessibilityRole="button"
          accessibilityLabel="지도 전체화면으로 보기"
          style={[r.mapPanel, { height: Math.max(rs(200), Math.round(winH * 0.5) - insets.top - rs(56)) }]}
          onLayout={e => setMapH(e.nativeEvent.layout.height)}>
          {/* 시트 등장: 컨테이너(레이아웃)는 그대로, 내용물만 위(-H)에서 내려온다(overflow hidden). */}
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: CARD, transform: [{ translateY: mapSlide.interpolate({ inputRange: [0, 1], outputRange: [-(mapH || 800), 0] }) }] }]}>
            <RunLiveMap coords={liveCoords} />
            <View style={r.mapExpandBadge} pointerEvents="none">
              <Ionicons name="expand" size={ri(15)} color={T1} />
            </View>
          </Animated.View>
        </Pressable>
      )}

      {/* ring — 러닝 중에만(사용자 설계: 달릴 땐 링, 일시정지엔 링 없이 지도+하단 지표).
          거리/자유 모드는 거리 히어로, 트랙 모드는 '바퀴 수' 히어로(링=현재 바퀴 진행). */}
      {!uiPaused && (
      <Animated.View style={[r.ringWrap, { transform: [{ scale: ringScale }] }]}>
        {/* 카운트다운 통합(2026-07-16 사용자 확정): 3·2·1 이 러닝 링 '그 자리'에서 돌아
            (1초 linear 로 1/3 씩 채움) GO 와 함께 같은 자리에서 러닝이 시작된다.
            핸드오프 인트로: 카운트다운이 채운 파파야 링이 엔진 인스턴스에서 가득 찬 채
            나타나 현재 진행(0)으로 풀려나간다(from=1 드레인) — 한 링으로 읽힘.
            재개(resume)·일시정지 복귀 재마운트에는 인트로를 걸지 않는다. */}
        <Ring size={ri(RUN_RING_SIZE)} stroke={RUN_RING_STROKE} stops={RUN_RING_STOPS}
          animated from={handoffFrom}
          duration={cd ? 1000 : 900} easing={cd ? Easing.linear : undefined}
          progress={cd ? cdProgress : track ? track.progress : pct}>
          {cd ? (
            <View style={r.cdFace}>
              {cdPhase === 'go' ? (
                <View style={r.cdNudge}>
                  <Animated.Text style={[r.cdGo, { transform: [{ scale: cdGoScale }] }]} accessibilityLiveRegion="assertive" accessibilityLabel="시작">GO</Animated.Text>
                </View>
              ) : (
                <>
                  <View style={r.cdNudge}>
                    <Animated.Text style={[r.cdCount, { opacity: cdNumOpacity, transform: [{ scale: cdNumScale }] }]} accessibilityLiveRegion="assertive" accessibilityLabel={`${cdNum}초 후 시작`}>{cdNum}</Animated.Text>
                  </View>
                  <Text style={r.cdCountLabel}>곧 시작해요</Text>
                </>
              )}
            </View>
          ) : track ? (
            <View style={{ alignItems: 'center' }} accessibilityRole="text" accessibilityLiveRegion="polite"
              accessibilityLabel={`${track.lapCount}바퀴, ${track.lapDistKm.toFixed(2)}킬로미터, 한 바퀴 ${track.lapM}미터 ${track.calibrated ? 'GPS 보정됨' : '예상'}`}>
              <Text style={r.lapHero}>{track.lapCount}</Text>
              <Text style={r.lapHeroUnit}>바퀴</Text>
            </View>
          ) : (
            <Animated.View style={{ alignItems: 'center', transform: [{ scale: kmPulse }] }} accessibilityRole="text" accessibilityLiveRegion="polite"
              accessibilityLabel={`달린 거리 ${distanceKm.toFixed(2)}킬로미터${timeGoal ? (met ? `, 목표 ${goalMin}분 달성` : `, 목표 ${goalMin}분 중 ${Math.floor(elapsedSec / 60)}분 경과`) : goalKm ? (met ? `, 목표 ${goalKm}킬로미터 달성, ${over.toFixed(2)}킬로미터 초과` : `, 목표 ${goalKm}킬로미터까지 ${remain.toFixed(2)}킬로미터 남음`) : ''}`}>
              {/* 링 센터: 큰 거리 숫자 + 'km' 단위만. 목표·퍼센티지 표기는 화면에서 제거하고
                  음성으로만 안내한다(나이키식, 사용자 요청). 링의 채워지는 호가 진행을 시각화.
                  스크린리더 라벨엔 목표/남음을 그대로 두어 접근성은 보존.
                  km 통과 순간 kmPulse 가 숫자를 한 번 부풀렸다 정착시킨다(모션 #4). */}
              {/* 시간 목표(#15-2, 사용자 확정): 링 센터의 주인공 = 경과 시간, 보조 = 목표.
                  거리(km)는 아래 지표 행의 '시간' 자리와 스왑된다. 1시간+ 도 잘리지 않게 자동 축소. */}
              {/* 링 안전 너비 상한 — 링(ri280·stroke16)의 안쪽 현(弦) 안에 숫자가 들어오게
                  maxWidth 를 준다. 짧은 '0.00'(≈197)은 그대로 최대 크기, 넓은 '00:00'(≈258)·
                  긴 시간('1:02:33')·40km+ 거리('42.19')만 자동 축소돼 링에 닿지 않는다.
                  (너비 상한이 없으면 adjustsFontSizeToFit 이 줄일 기준이 없어 꽉 차 링을 침범.) */}
              <Text style={[r.bigDist, { maxWidth: ri(214) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {timeGoal ? timeLabel : distanceKm.toFixed(2)}
              </Text>
              {/* 단위는 absolute — 센터 계산에서 제외해 '숫자'가 링의 정중앙에 온다. */}
              <Text style={[r.goal, r.goalBelow]}>{timeGoal ? `목표 ${goalMin}분` : 'km'}</Text>
            </Animated.View>
          )}
        </Ring>
        {/* 카운트다운 목표·야외 칩 — 링 '바로 아래' 절대 배치(레이아웃 높이 불변 → 스왑 시
            링 위치 그대로). GO 순간 페이드아웃하며 지표들에게 자리를 넘긴다(사용자 확정). */}
        {cd && (
          <Animated.View pointerEvents="none" style={[r.cdChips, { opacity: cdChipFade }]}>
            {goalKm > 0 ? (
              <View style={r.cdChip} accessibilityRole="text" accessibilityLabel={`목표 ${goalKm.toFixed(1)} 킬로미터`}>
                <Ionicons name="locate-outline" size={ri(14)} color={T3} />
                <Text style={r.cdChipText}>목표 <Text style={r.cdChipB}>{goalKm.toFixed(1)} km</Text></Text>
              </View>
            ) : goalMin > 0 ? (
              <View style={r.cdChip} accessibilityRole="text" accessibilityLabel={`목표 ${goalMin}분`}>
                <Ionicons name="time-outline" size={ri(14)} color={T3} />
                <Text style={r.cdChipText}>목표 <Text style={r.cdChipB}>{goalMin}분</Text></Text>
              </View>
            ) : null}
            {/* 야외/실내 칩 제거(심사 #12, 2026-07-22) — outdoor prop 이 미배선이라 트랙·실내에서도
                항상 '야외 러닝'으로 표기되던 오표기. 실내 모드가 생기기 전까지 칩 자체를 없앤다. */}
          </Animated.View>
        )}
      </Animated.View>
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
      <Animated.View pointerEvents={cd ? 'none' : 'auto'}
        style={[r.heroMetrics, uiPaused ? r.heroMetricsPaused : r.heroMetricsRun, { opacity: uiIn, transform: [{ translateY: uiRise }] }]}>
        <View style={r.hm} accessibilityRole="text" accessibilityLabel={uiPaused || timeGoal ? `거리 ${distanceKm.toFixed(2)}킬로미터` : `시간 ${timeLabel}`}><Text style={[r.hmV, uiPaused && r.hmVPaused]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{uiPaused || timeGoal ? distanceKm.toFixed(2) : timeLabel}</Text><Text style={r.hmL}>{uiPaused || timeGoal ? '거리 km' : '시간'}</Text></View>
        <View style={[r.hm, r.hmDivider]} accessibilityRole="text" accessibilityLabel={uiPaused ? `시간 ${timeLabel}` : hrZone !== 0 ? `심박 ${bpm}, 존 ${hrZone} ${HR_ZONE_LABEL[hrZone]}` : bpm > 0 ? `심박 ${bpm}` : '심박 측정 안 됨'}><Text style={[r.hmV, uiPaused && r.hmVPaused, !uiPaused && hrZone !== 0 && { color: hrColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{uiPaused ? timeLabel : bpm > 0 ? String(bpm) : '--'}</Text><Text style={[r.hmL, !uiPaused && hrZone !== 0 && { color: hrColor, fontWeight: '600' }, !uiPaused && zoneDeviation && targetZone >= 2 && { color: zoneDeviation === 'down' ? WARN : ACCENT, fontWeight: '700' }]}>{uiPaused ? '시간' : (!uiPaused && zoneDeviation && targetZone >= 2) ? (zoneDeviation === 'down' ? `↓ 존 ${targetZone}로` : `↑ 존 ${targetZone}로`) : hrZone !== 0 ? `Z${hrZone} ${HR_ZONE_LABEL[hrZone]}` : '심박'}</Text></View>
        <View style={[r.hm, r.hmDivider]} accessibilityRole="text" accessibilityLabel={`${uiPaused ? '평균 페이스' : (track ? '랩 페이스' : '현재 페이스')} ${uiPaused ? avgPaceLabel : paceLabel}`}><Text style={[r.hmV, uiPaused && r.hmVPaused]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{uiPaused ? avgPaceLabel : paceLabel}</Text><Text style={r.hmL}>{uiPaused ? '평균 페이스' : (track ? '랩 페이스' : '현재 페이스')}</Text></View>
      </Animated.View>

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
              <Text style={[r.smV, (m as any).c && { color: (m as any).c }]}>{m.v}{m.u ? <Text style={r.smU}> {m.u}</Text> : null}</Text>
              <Text style={[r.smL, (m as any).c && { color: (m as any).c, fontWeight: '600' as const }]}>{m.l}</Text>
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
      {/* 하단 스페이서 — 러닝 중 + 일시정지-야외(지도 반높이 아래 그리드를 위로 올리고
          남는 공간을 여기서 흡수해 컨트롤을 바닥에 고정). 일시정지-실내는 상단 스페이서 담당. */}
      {(!uiPaused || liveCoords.length > 0) && <View style={{ flex: 1 }} />}

      {/* controls — 카운트다운 중엔 자리(높이)만 지키고 안 보임 → GO 스왑 후 지표와 함께 라이즈 */}
      <Animated.View pointerEvents={cd ? 'none' : 'auto'}
        style={[r.controls, { opacity: uiIn, transform: [{ translateY: uiRise }] }]}>
        {!paused ? (
          <View style={{ alignItems: 'center', gap: rv(8) }}>
            <Pressable onPress={pauseRun} accessibilityRole="button" accessibilityLabel="일시정지" style={({ pressed }) => [r.cPrimary, pressed && { opacity: 0.85 }]}>
              <Ionicons name="pause" size={ri(36)} color={T1} />
              <GlassEdge glints={false} fade={false} radius={rs(44)} />
            </Pressable>
            <Text style={r.ctrlHint}>일시정지</Text>
          </View>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: rv(8) }}>
              {/* 홀드 진행 링: 길게 누르는 동안 DANGER 호가 채워져 '얼마나 더 눌러야
                  종료되는지'를 시각으로 보여준다(실수 종료 방지). */}
              <View style={r.cStopWrap}>
                <Svg width={STOP_D} height={STOP_D} style={StyleSheet.absoluteFill} pointerEvents="none">
                  <AnimatedCircle cx={STOP_D / 2} cy={STOP_D / 2} r={STOP_R} stroke={DANGER} strokeWidth={STOP_STROKE} fill="none"
                    strokeLinecap="round" strokeDasharray={STOP_CIRC} strokeDashoffset={holdOffset}
                    transform={`rotate(-90 ${STOP_D / 2} ${STOP_D / 2})`} />
                </Svg>
                <Pressable
                  onPressIn={startHold} onPressOut={cancelHold}
                  onLongPress={confirmStop} delayLongPress={HOLD_MS}
                  accessibilityRole="button" accessibilityLabel="길게 눌러 종료"
                  accessibilityHint="0.6초 동안 길게 누르면 러닝을 종료합니다"
                  style={({ pressed }) => [r.cStop, pressed && { backgroundColor: withAlpha(DANGER, 0.18) }]}>
                  <Ionicons name="stop" size={ri(26)} color={DANGER} />
                  <GlassEdge glints={false} fade={false} radius={rs(38)} />
                </Pressable>
              </View>
              <Text style={r.ctrlHint}>길게 눌러 종료</Text>
            </View>
            <View style={{ alignItems: 'center', gap: rv(8) }}>
              <Pressable onPress={resumeRun} accessibilityRole="button" accessibilityLabel="재개" style={({ pressed }) => [r.cResume, pressed && { opacity: 0.85 }]}>
                <Ionicons name="play" size={ri(32)} color={T1} />
                <GlassEdge glints={false} fade={false} radius={rs(38)} />
              </Pressable>
              <Text style={r.ctrlHint}>재개</Text>
            </View>
          </>
        )}
      </Animated.View>

      {/* 완주 세리머니(A안) — 종료 확정 후 링 완성 + 빛 번짐, 끝나면 실제 종료(onStop). */}
      {ceremony && <FinishCeremony distanceKm={distanceKm} onDone={() => onStop?.()} />}

      {/* 수동 재개 3·2·1 카운트다운(심사 #11) — 딤 스크림 위 큰 숫자, 탭하면 취소(일시정지 유지). */}
      {resumeCd > 0 && (
        <Pressable style={r.resumeCdWrap} onPress={() => { tap(); clearResumeCd(); }}
          accessibilityRole="button" accessibilityLabel={`${resumeCd}초 후 재개, 탭하면 취소`}
          testID="resume-countdown">
          <Text style={r.resumeCdNum} accessibilityLiveRegion="assertive">{resumeCd}</Text>
          <Text style={r.resumeCdHint}>곧 다시 달려요 — 탭하면 취소</Text>
        </Pressable>
      )}

      {/* 전체화면 인터랙티브 지도 — 일시정지 지도 패널을 탭하면 열린다. 팬·줌 가능, 닫기 버튼.
          화면 좌우 패딩·상하 인셋을 상쇄해 진짜 전체화면. 재개하면 자동으로 닫힘(mapFull 리셋). */}
      {mapFull && (
        <View style={{ position: 'absolute', top: -(insets.top + 8), left: -GUTTER, right: -GUTTER, bottom: -(insets.bottom + 16), backgroundColor: BG }}>
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
  screen: { flex: 1, backgroundColor: BG, paddingHorizontal: GUTTER },
  // 일시정지 상단 지도 패널(위 절반) — 둥근 카드, 탭하면 전체화면. flex:1 로 상단을 채운다.
  // 풀블리드 지도(2026-07-12 사용자 확정): 카드(라운드·헤어라인·좌우 여백) 폐지 —
  // screen 의 paddingHorizontal(GUTTER 20)을 같은 값의 음수 마진으로 상쇄해 화면 좌우 끝까지,
  // flex:1 로 상단 여백 전부를 채우고 아래(km 히어로)와도 여백 없이 맞닿는다.
  // 컨테이너는 투명 — 회색(CARD)은 내려오는 시트(내용물)에 실어, 배경까지 지도와 함께
  // 내려온다(2026-07-12 실기기 피드백: 회색이 먼저 '띡' 깔리면 전환이 둘로 쪼개져 보임).
  // 지도 높이 = 화면 절반까지(2026-07-12 사용자 확정: '사진은 반까지만') — 렌더에서 winH 로 계산.
  mapPanel: { marginHorizontal: -GUTTER, marginTop: rv(10), marginBottom: 0, overflow: 'hidden' },
  // 패널 우하단 '전체화면' 힌트 배지.
  mapExpandBadge: { position: 'absolute', right: 12, bottom: 12, width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: withAlpha(BLACK, 0.55), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: withAlpha(T1, 0.2) },
  // 전체화면 지도 하단 중앙 버튼 행 — 구석 대신 가운데, 위로 올려 잘 눌리게.
  mapBtnRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: rv(20), zIndex: 20, elevation: 8 },
  // 큰 원형 아이콘 버튼(라벨 없음). zIndex/elevation 으로 네이티브 지도 위에서 확실히 탭.
  mapBtn: { width: rs(60), height: rs(60), borderRadius: rs(30), backgroundColor: withAlpha(BLACK, 0.65), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: withAlpha(T1, 0.3), zIndex: 20, elevation: 8 },

  // 목표 달성 토스트 — 오렌지 판 대신 어두운 유리 막(투명 통일). 축하의 오렌지는 체크
  // 아이콘(포인트 컬러=강조 요소에만)이 담당한다.
  toast: { position: 'absolute', left: 18, right: 18, top: 50, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: rv(12), paddingVertical: rv(12), paddingHorizontal: rs(16), borderRadius: rs(16), borderCurve: 'continuous', backgroundColor: withAlpha(CARD, 0.94), borderWidth: 1, borderColor: withAlpha(T1, 0.16) },
  toastTick: { width: rs(34), height: rs(34), borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.2), alignItems: 'center', justifyContent: 'center' },
  toastA: { color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: -0.2 },
  toastB: { color: withAlpha(T1, 0.88), fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500', marginTop: rv(2) },

  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  liveDot: { width: rs(8), height: rs(8), borderRadius: RADIUS.pill, backgroundColor: ACCENT },
  liveText: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', letterSpacing: 0.2 },
  shoeChip: { flexDirection: 'row', alignItems: 'center', gap: rv(8), backgroundColor: CARD, borderRadius: RADIUS.pill, paddingHorizontal: rs(12), height: rs(30), borderWidth: 1, borderColor: SEP },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: rv(8) },
  // 음성 토글(심사 #10) — 신발 칩과 같은 문법의 작은 원형 유리 버튼.
  voiceBtn: { width: rs(30), height: rs(30), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: SEP },
  // 수동 재개 카운트다운(심사 #11) — 풀스크린 딤 + 큰 숫자(시작 카운트다운과 같은 NUM 문법).
  resumeCdWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(BG, 0.88), alignItems: 'center', justifyContent: 'center', zIndex: 30, gap: rv(10) },
  resumeCdNum: { color: T1, fontFamily: NUM, fontSize: rf(96), fontWeight: '600', fontVariant: ['tabular-nums'], includeFontPadding: false },
  resumeCdHint: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  shoeText: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600' },

  // GPS 약함 경고(조건부) — 상시 상태 표시 폐지(2026-07-12), 문제 있을 때만 조용한 WARN.
  gpsWeak: { flexDirection: 'row', alignItems: 'center', gap: rv(6), marginTop: rv(12), alignSelf: 'center', paddingHorizontal: rs(12), height: rs(30), borderRadius: RADIUS.pill, backgroundColor: withAlpha(WARN, 0.12) },
  gpsWeakText: { color: WARN, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  // '검색 중' 변주(P1 #49) — 같은 필 문법, 색만 무채(WARN 은 문제 전용 위계 유지).
  gpsSearch: { backgroundColor: withAlpha(T1, 0.08) },
  gpsSearchText: { color: T3 },

  permBanner: { flexDirection: 'row', alignItems: 'center', gap: rv(8), marginTop: rv(12), paddingVertical: rv(10), paddingHorizontal: rs(12), borderRadius: rs(12), borderWidth: StyleSheet.hairlineWidth, borderColor: DANGER, backgroundColor: withAlpha(DANGER, 0.14) },
  permBannerText: { flex: 1, color: T1, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', lineHeight: rf(17) },

  ringWrap: { alignItems: 'center', marginTop: rv(26) },
  // ── 카운트다운 통합(2026-07-16) — 구 RunCountdownScreen 의 타이포·칩 문법 이식 ──
  // 취소 필: 우측 신발칩과 같은 rs(30) 높이(상단 행 높이 불변 → 스왑 시 링 위치 그대로).
  cdCancel: { flexDirection: 'row', alignItems: 'center', gap: rv(4), height: rs(30), paddingLeft: rs(8), paddingRight: rs(12), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.05), borderWidth: 1, borderColor: SEP },
  cdCancelText: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  cdFace: { alignItems: 'center', justifyContent: 'center' },
  // 숫자만 살짝 아래로(rv 8) — Jost 어센더 보정(lineHeight 1.22×) 탓에 링 중심보다 높게
  // 앉는 것 교정. 라벨('곧 시작합니다')은 제자리(사용자 피드백 2026-07-16: 라벨까지 내리면
  // 과함 → 분리). GO 는 숫자와 같은 슬롯이라 함께 내려 1초 간격 위치 점프가 없다.
  cdNudge: { transform: [{ translateY: rv(8) }] },
  // 카운트 숫자·GO = NUM(Jost), 러닝 링 거리 숫자와 동일 규율. lineHeight ≈ 1.22×(어센더).
  cdCount: { color: T1, fontFamily: NUM, fontSize: rf(150), fontWeight: '500', letterSpacing: -2, lineHeight: rf(183), includeFontPadding: false, fontVariant: ['tabular-nums'] },
  // 라벨은 숫자 내림(cdNudge +8)과 반대로 살짝 올림(-6) — 숫자·라벨 간 호흡(사용자 미세조정).
  cdCountLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(2), transform: [{ translateY: rv(-6) }] },
  cdGo: { color: ACCENT, fontFamily: NUM, fontSize: rf(104), fontWeight: '700', letterSpacing: -1, lineHeight: rf(127), includeFontPadding: false },
  // 목표·야외 칩 — 링 아래 절대 배치(레이아웃 참여 X). 좌우로 링보다 넓게 펼쳐 중앙 정렬.
  cdChips: { position: 'absolute', top: '100%', left: rs(-70), right: rs(-70), marginTop: rv(16), flexDirection: 'row', justifyContent: 'center', gap: rv(8) },
  cdChip: { flexDirection: 'row', alignItems: 'center', gap: rv(8), height: rs(32), paddingHorizontal: rs(14), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.04), borderWidth: 1, borderColor: SEP },
  cdChipText: { color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500' },
  cdChipB: { color: T1, fontFamily: DISPLAY, fontWeight: '600' },
  // 일시정지: 링을 살짝 위로 당기고(marginTop↓) 아래 시각 여백을 조금 회수(marginBottom-)해
  // 서브 지표가 들어설 공간을 낸다. 스케일이 0.92로 완만하므로 마진도 완만하게(겹침 방지).
  ringWrapPaused: { marginTop: rv(8), marginBottom: rv(-14) },
  // 링 센터 보조(단위 km/목표 N분) — 20pt(사용자 확대 확정 2026-07-12: 기존 title 은 옹졸).
  goal: { color: withAlpha(T1, 0.8), fontFamily: FONT, fontSize: rf(20), fontWeight: '700', letterSpacing: 0.6, marginTop: rv(10) },
  // 살짝 올림(-6) — 큰 숫자(Jost lineHeight 여유) 밑에서 단위가 처져 보이는 것 교정(사용자 미세조정).
  goalBelow: { position: 'absolute', top: '100%', transform: [{ translateY: rv(-6) }] },
  goalMet: { flexDirection: 'row', alignItems: 'center', gap: rv(4), marginTop: rv(14) },
  goalMetText: { color: GOOD, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700', letterSpacing: 0.6 },
  // Jost(NUM)는 Pretendard 보다 세로 메트릭(어센더)이 커서 lineHeight 를 fontSize 에 붙이면
  // 숫자 위가 라인박스에 잘린다 → lineHeight 를 넉넉히(≈1.22×) 줘 어센더를 담는다. 자간은
  // Jost 기본 사이드베어링이 좁지 않아 -4 면 0 끼리 붙어 보인다 → -1 로 완화(숫자 사이 숨).
  bigDist: { color: T1, fontFamily: NUM, fontSize: rf(104), fontWeight: '500', letterSpacing: -1, lineHeight: rf(127), includeFontPadding: false, fontVariant: ['tabular-nums'] },
  bigUnit: { color: withAlpha(T1, 0.62), fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', letterSpacing: 0.8, marginTop: rv(16) },
  // 일시정지 하단 헤드 — 링 없이 거리 히어로 + 목표를, 지도 위·하단 지표 위에 얹는다.
  pausedGoal: { color: withAlpha(T1, 0.62), fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '700', letterSpacing: 0.8, marginTop: rv(8) },
  // 트랙 링 센터 — 바퀴수 하나만 히어로, 그 밑 작은 '바퀴'.
  // 트랙 랩 히어로도 NUM — 같은 링 센터의 거리 히어로(bigDist)와 모드 전환 시 폰트 일치.
  lapHero: { color: T1, fontFamily: NUM, fontSize: rf(96), fontWeight: '500', letterSpacing: -1, lineHeight: rf(117), includeFontPadding: false, fontVariant: ['tabular-nums'] },
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
  // 가로 라인 전부 제거(2026-07-12 사용자 확정: 러닝 중 중간 라인 + 일시정지 행 구분선) —
  // 분리는 여백이 담당(미니멀). 셀 사이 세로 디바이더(hmDivider)만 유지.
  heroMetrics: { flexDirection: 'row', marginTop: rv(30), paddingTop: rv(22), paddingBottom: rv(6) },
  heroMetricsRun: {},
  // 일시정지: 헤어라인 위 여백(marginTop 16) = 아래 여백(paddingTop 16) — 균등(사용자 확정).
  // 일시정지 6지표(히어로 3+서브 3)를 살짝 아래로(14→22, 사용자 미세조정) — 지도와의 호흡.
  heroMetricsPaused: { marginTop: rv(22), paddingTop: rv(20), paddingBottom: rv(8) },
  hm: { flex: 1, alignItems: 'center' },
  hmDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: CARD_BORDER },
  hmV: { color: T1, fontFamily: DISPLAY, fontSize: rf(37), fontWeight: '500', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  // 일시정지 6칸(2026-07-12 사용자: '6개를 키우고 올려서 잘 보이게') — 값 30pt 균일.
  hmVPaused: { fontSize: rf(30), letterSpacing: -0.7 },
  hmL: { color: withAlpha(T1, 0.45), fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: "600", letterSpacing: 0.4, marginTop: rv(8) },

  // 일시정지 하단 3칸(케이던스·칼로리·고도) — 상단 히어로 행과 같은 3열 그리드(6칸처럼).
  subMetrics: { flexDirection: 'row', paddingTop: rv(20), paddingBottom: rv(16) },
  sm: { flex: 1, alignItems: 'center' },
  smV: { color: T1, fontFamily: DISPLAY, fontSize: rf(30), fontWeight: '500', letterSpacing: -0.7, fontVariant: ['tabular-nums'] },
  smU: { color: withAlpha(T1, 0.45), fontFamily: FONT, fontSize: TYPE.caption.fontSize },
  smL: { color: withAlpha(T1, 0.45), fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: "600", letterSpacing: 0.4, marginTop: rv(8) },

  // (mapWrap·positionDot 스타일 삭제 — 미사용 잔재. RunLiveMap 이 자체 마커 보유)
  // 트랙 랩 기록 바 — 큰 '랩 기록' 필 + 작은 되돌리기. 유리 문법(홈 CTA 계열).
  // 랩 기록 = 주 동작(오렌지 유리 필, 넓게) + 우측 현재 바퀴수. 되돌리기(-1)는 작은 보조.
  lapBar: { flexDirection: 'row', alignItems: 'center', gap: rv(10), marginTop: rv(18) },
  // 선택/강조 칩 한 벌(감사 #56): 채움 withAlpha(T1,0.14) · 보더 withAlpha(T1,0.4).
  lapBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), height: rs(58), borderRadius: rs(18), borderCurve: 'continuous', backgroundColor: withAlpha(T1, 0.14), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(T1, 0.4) },
  lapBtnText: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2 },
  lapBtnCount: { position: 'absolute', right: 18, color: ACCENT_2, fontFamily: DISPLAY, fontSize: TYPE.body.fontSize, fontWeight: '700', fontVariant: ['tabular-nums'] },
  lapUndo: { width: rs(52), height: rs(52), borderRadius: rs(16), borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: SEP },

  controls: { flexDirection: 'row', justifyContent: 'center', gap: rv(48), paddingBottom: rv(8) },
  // 러닝 컨트롤 — 오렌지 필 대신 투명 유리(홈 CTA 와 같은 문법). 종료(cStop)만 DANGER
  // 색을 유지해 '위험한 동작'의 색 언어를 지킨다.
  // 유리 원 + GlassEdge 균일 헤어라인 — 다른 카드/버튼과 동일 문법(RN 보더 폐지
  // 확정의 러닝 컨트롤 적용, 2026-07-11 사용자 확정: 색은 글리프에만 — 종료의
  // 빨간 테두리도 흰 유리 림으로). 홀드 링(DANGER)은 진행 표시로 유지.
  cPrimary: { width: rs(88), height: rs(88), borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center' },
  cResume: { width: rs(76), height: rs(76), borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center' },
  cStopWrap: { width: rs(76), height: rs(76), alignItems: 'center', justifyContent: 'center' },
  cStop: { width: rs(76), height: rs(76), borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.1), alignItems: 'center', justifyContent: 'center' },
  ctrlHint: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '500' },
});
