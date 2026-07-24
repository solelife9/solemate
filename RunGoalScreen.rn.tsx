// ============================================================================
// RunGoalScreen.rn.tsx — 러닝 목표(키로수) 설정 · 목업 그대로 (standalone)
// `Keego Run Goal.html` 을 RN 으로 1:1. 외부 의존 없음(색·폰트·아이콘·그라데이션
// 전부 파일 내장). 의존성은 react-native-svg 뿐.
//
// 드롭인:  <RunGoalScreen onStart={(km)=>{}} onBack={()=>{}} />
//   - 파라미터 없이도 목업 기본 상태(거리 5.0km)로 바로 렌더됨.
//   - onStart(goalKm): goalKm=0 이면 자유 러닝.
//
// 폰트: 숫자=Barlow, 본문=Pretendard 패밀리명을 참조(프로젝트에 번들돼 있으면 그대로,
//       없으면 시스템 폰트로 폴백 — 레이아웃은 동일).
// ============================================================================

import React, { useMemo, useRef, useState, useCallback } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {
  View, Pressable, ScrollView, StyleSheet, Modal, LayoutChangeEvent,
  NativeSyntheticEvent, NativeScrollEvent, StatusBar,
} from 'react-native';
import {Text} from './lib/text';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · amber→WARN · red→DANGER
// · text→T1–T4 · hair→SEP · 그라데이션→GRAD_TOP/GRAD_BOT. 폰트 UI/DP → FONT/DISPLAY.
// (시각 동등: 다크+오렌지 유지)
import {
  BG, CARD, ACCENT, T1, T2, T3, T4, SEP, CARD_BORDER,
  FONT, DISPLAY, NUM, RADIUS, GUTTER, SCRIM, withAlpha, TYPE, HERO,
} from './theme';
// lib/haptics 배선: '러닝 시작' CTA(런 시작) → tap.
import { tap } from './lib/haptics';
import { loadTargetZone, saveTargetZone, DEFAULT_TARGET_ZONE, type TargetZone } from './lib/settings';
import { estimateMaxHR, zoneBoundaries } from './lib/analytics/hrZones';
import { useEffect } from 'react';
import { HR_ZONE_COLORS, GOOD } from './theme';
// CTA 는 앱 전역 단일 Button 프리미티브(그라데이션 GRAD_TOP/BOT·글로우·radius 토큰).
// 모드 탭 스트립은 SegmentedControl 단일 프리미티브(accentTint variant).
import { Button, SegmentedControl, SwipeBack, SwipeBackExclude } from './primitives';
// 탭 구성 재확정(민우님 2026-07-24): 거리·시간·스피드·트랙 4탭 복원 + '자유'는 거리 탭의
// 첫 프리셋(val=0)으로. 자유런 전용 탭(2026-07-22안)은 하루 써보고 철회 — 자유는 목표
// 모드가 아니라 '거리 목표 없음'이라 거리 탭 안이 문법상 맞다.
import SpeedPlanPanel from './SpeedPlanPanel';
import { buildPacePlan } from './lib/pacePlan';

// ── SVG 아이콘(자체 그림 — vector-icons 의존 제거) ───────────────────────────
function Icon({ name, size = 22, color = T2, fill }: { name: string; size?: number; color?: string; fill?: string }) {
  const sw = 2;
  const p: Record<string, React.ReactNode> = {
    back: <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    forward: <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    play: <Path d="M7 5v14l11-7z" fill={fill || color} />,
    // 인피니티(자유런) — 구 손그림 패스는 확대 시 모양이 무너져(2026-07-23 실기기 제보)
    // 검증된 레머니스케이트 패스(Tabler infinity)로 교체.
    infinite: <Path d="M9.828 9.172a4 4 0 1 0 0 5.656A10 10 0 0 0 12 12a10 10 0 0 1 2.172-2.828a4 4 0 1 1 0 5.656A10 10 0 0 1 12 12a10 10 0 0 0-2.172 2.828" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    // 트랙(운동장) — 스타디움 형태의 이중 타원(바깥 트랙 + 안쪽 레인).
    track: <><Path d="M8 6h8a6 6 0 0 1 0 12H8a6 6 0 0 1 0-12z" stroke={color} strokeWidth={sw} fill="none" /><Path d="M9 9h7a3 3 0 0 1 0 6H9a3 3 0 0 1 0-6z" stroke={color} strokeWidth={sw - 0.4} fill="none" opacity={0.5} /></>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24">{p[name]}</Svg>;
}


type Mode = 'km' | 'min' | 'speed' | 'track';
/** 러닝 목표 — 거리(km, 0=자유)/시간(분)/스피드(km별 페이스 플랜)/트랙(운동장 랩). 0/빈배열/null은 미설정.
 *  track: 트랙 모드 = 한 바퀴 예상 거리(m)만 정한다. 실제 랩거리는 런 중 첫 랩 GPS로 자동 보정
 *  (snapLapDistance) — 이 값은 기본값·실내(GPS✗) 폴백. km/durationMin 은 트랙에선 0(자유). */
export type RunGoal = { km: number; durationMin: number; pacePlan: number[]; track?: { lapM: number } | null; targetZone?: number };
/** 트랙 한 바퀴 예상 거리 선택지(m) — 야외 400(공인)·트랙 300·실내 200 + 커스텀. */
const LAP_PRESETS = [200, 300, 400] as const;
/** 거리 키패드 입력 상한(km) — 울트라 대응(민우님 2026-07-24): 50K·100K·100마일(161km)을
 *  덮는 200. 룰러는 풀(42.2)까지만(200km 룰러는 스크롤 불가 수준) — 그 이상은 키패드 전용. */
const KM_INPUT_MAX = 200;
const CFG: Record<'km' | 'min', { min: number; max: number; step: number; major: number; minor: number; px: number; unit: string; def: number; presets: { label: string; v: number }[] }> = {
  // max 42.2: 풀코스(42.195km)가 42 상한에 막히던 문제(민우님 2026-07-24). 하프=21.1 과
  // 같은 0.1 그리드 반올림 규약으로 풀=42.2 — 링/음성 목표용 오차 +5m 는 무시 가능.
  km:  { min: 0, max: 42.2, step: 0.1, major: 1, minor: 0.2, px: 64, unit: 'km', def: 5,  presets: [{ label: '자유', v: 0 }, { label: '3km', v: 3 }, { label: '5km', v: 5 }, { label: '10km', v: 10 }, { label: '하프', v: 21.1 }, { label: '풀', v: 42.2 }] },
  min: { min: 0, max: 180, step: 1, major: 10, minor: 1, px: 6.2, unit: '분', def: 30, presets: [{ label: '20분', v: 20 }, { label: '30분', v: 30 }, { label: '45분', v: 45 }, { label: '60분', v: 60 }] },
};

export default function RunGoalScreen({
  onBack, onStart, age = 0, restHR = 0,
}: {
  // 신발은 홈 히어로에서 이미 선택해 넘어온다 — 이 화면은 '목표'에만 집중한다(2026-07-19
  // 민우: 홈에서 신발 고르고 러닝시작 눌렀는데 여기 또 신발 행이 있어 화면이 복잡했다.
  // 마지막 교정은 뒤로가기로. 신발 관련 prop·행·전환 시트 제거).
  onBack?: () => void; onStart?: (goal: RunGoal) => void;
  /** 심박 가이드 bpm 범위 표시용(#7). 0이면 범위 숨기고 존 이름만. */
  age?: number; restHR?: number;
}) {
  // safe-area 실측(검수 MED, 2026-07-16): 상단 rv(54)·하단 rv(30) 하드코딩은 노치/홈바
  // 기기별 편차를 못 담는다(다이내믹 아일랜드 밑에 nav 가 살짝 파고들던 것) — insets 로.
  const insets = useSafeAreaInsets();
  // 기본 = 거리 탭 · '자유'(val=0) 프리셋(민우님 2026-07-24) — 열자마자 CTA 한 번이면
  // 자유 러닝(퀵스타트 유지), 거리 목표는 칩 한 번(3/5/10/하프) 또는 룰러로.
  const [mode, setMode] = useState<Mode>('km');
  const [val, setVal] = useState<number>(0);
  const [vpW, setVpW] = useState(0);
  const rulerRef = useRef<ScrollView>(null);
  const programmatic = useRef(false);
  const cfg = mode === 'km' || mode === 'min' ? CFG[mode] : null;
  // 스피드 모드의 현재 목표(거리 km + km별 페이스 플랜) — SpeedPlanPanel 이 onChange 로 올린다.
  const [speedGoal, setSpeedGoal] = useState<{ km: number; plan: number[] }>(() => ({ km: 5, plan: buildPacePlan(5, 360, 'negative') }));
  // 트랙 모드: 한 바퀴 예상 거리(m). 기본 400(야외 공인). 커스텀은 하단 키패드로 입력.
  // 이 값은 '가정'일 뿐 — 야외선 첫 랩 GPS 가 실제 랩거리로 자동 보정한다(실내 폴백값).
  const [lapM, setLapM] = useState<number>(400);
  const [lapCustom, setLapCustom] = useState(false); // 커스텀 칩 선택 여부(표준 3개 밖의 값)

  const ticks = useMemo(() => {
    if (!cfg) return [] as { v: number; major: boolean }[];
    const out: { v: number; major: boolean }[] = [];
    const steps = Math.round((cfg.max - cfg.min) / cfg.minor);
    for (let i = 0; i <= steps; i++) {
      const v = +(cfg.min + i * cfg.minor).toFixed(4);
      out.push({ v, major: Math.abs(v % cfg.major) < 1e-6 });
    }
    return out;
  }, [cfg]);

  const fmt = (v: number) => (mode === 'km' ? v.toFixed(1) : String(Math.round(v)));
  const estimate = useMemo(() => {
    if (!cfg) return ''; // 스피드·트랙은 자체 표시 — estimate 미사용
    if (val <= 0) return mode === 'km' ? '목표 없이 달려요 — 기록은 전부 남아요' : '목표를 정해주세요';
    return mode === 'km'
      ? `예상 시간 약 ${Math.round(val * 5)}분 · 약 ${Math.round(val * 64)} kcal`
      : `예상 거리 약 ${(val / 5).toFixed(1)}km · 약 ${Math.round(val * 12.8)} kcal`;
  }, [mode, val, cfg]);

  const scrollToVal = useCallback((v: number, animated: boolean) => {
    if (!cfg) return;
    programmatic.current = true;
    rulerRef.current?.scrollTo({ x: v * cfg.px, animated });
    setTimeout(() => { programmatic.current = false; }, animated ? 380 : 60);
  }, [cfg]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmatic.current || !cfg) return;
    let v = e.nativeEvent.contentOffset.x / cfg.px;
    v = Math.max(cfg.min, Math.min(cfg.max, v));
    v = Math.round(v / cfg.step) * cfg.step;
    v = +v.toFixed(cfg.step < 1 ? 1 : 0);
    setVal(prev => (Math.abs(prev - v) > 1e-9 ? v : prev));
  }, [cfg]);

  const onRulerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && w !== vpW) { setVpW(w); requestAnimationFrame(() => scrollToVal(val, false)); }
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    // 거리/시간 모드만 룰러를 쓴다. 대상 모드의 cfg(px)로 직접 스크롤한다 — scrollToVal 은
    // 클로저의 '이전' mode/cfg 를 보므로(setMode 비동기) px 가 어긋나 룰러가 엉뚱한 위치
    // (예: 30분인데 180)로 클램프됐다. 스피드는 SpeedPlanPanel, 트랙은 칩을 쓴다.
    if (m === 'km' || m === 'min') {
      // 거리 탭 재진입 기본은 '자유'(0) — 첫 진입과 동일한 퀵스타트 문법. 시간은 기존 30분.
      const c = CFG[m]; const d = m === 'km' ? 0 : c.def;
      setVal(d);
      programmatic.current = true;
      requestAnimationFrame(() => {
        rulerRef.current?.scrollTo({ x: d * c.px, animated: false });
        setTimeout(() => { programmatic.current = false; }, 60);
      });
    }
  };
  const pickPreset = (v: number) => { setVal(v); scrollToVal(v, true); };

  // ── 큰 숫자 직접 입력(2026-07-04) — 탭 → 키패드만(사용자 확정) ──────────────
  // 큰 숫자를 탭하면 하단 키패드 시트로 하프(21.1) 같은 정확한 값을 입력한다.
  // 룰러와 같은 값(val)에 물려 확인 즉시 룰러가 따라온다. 세로 스와이프·햅틱 틱은
  // 사용자 결정으로 제거(좌우 룰러 + 탭 입력이면 충분).
  const [kpOpen, setKpOpen] = useState(false);
  const [kpBuf, setKpBuf] = useState('');
  const clampToCfg = (m: 'km' | 'min', v: number) => {
    const c = CFG[m];
    // 거리는 키패드 상한(울트라 200km)까지 — 룰러 상한(42.2)과 분리. 시간은 기존 그대로.
    const hi = m === 'km' ? KM_INPUT_MAX : c.max;
    const clamped = Math.max(c.min, Math.min(hi, v));
    const stepped = Math.round(clamped / c.step) * c.step;
    return +stepped.toFixed(c.step < 1 ? 1 : 0);
  };
  const kpPress = (k: string) => {
    if (k === '⌫') { setKpBuf(b => b.slice(0, -1)); return; }
    setKpBuf(b => {
      if (k === '.' && (mode === 'min' || mode === 'track' || b.includes('.'))) return b;
      if (b.replace('.', '').length >= 4) return b; // '42.0'·'180'·'1000' 상한
      return b + k;
    });
  };
  const kpConfirm = () => {
    // 트랙 커스텀 랩거리(m, 정수). 50~1000m 클램프. 표준값 입력 시 프리셋 칩으로 되돌린다.
    if (mode === 'track') {
      if (kpBuf) {
        const clamped = Math.max(50, Math.min(1000, Math.round(parseFloat(kpBuf) || 0)));
        setLapM(clamped);
        setLapCustom(!LAP_PRESETS.includes(clamped as (typeof LAP_PRESETS)[number]));
      }
      setKpOpen(false);
      return;
    }
    if (kpBuf) {
      const m = mode === 'min' ? 'min' : 'km';
      const v = clampToCfg(m, parseFloat(kpBuf) || 0);
      setVal(v); scrollToVal(v, true);
    }
    setKpOpen(false);
  };
  const half = vpW / 2;
  // 런 시작: 햅틱(tap) → onStart(RunGoal). 거리/시간/스피드(km별 페이스 플랜)로 분기.
  // 심박 가이드(#7) — 목표 존(0=끄기·2·3·4). 저장값 로드, 변경 시 저장(persist). 목표 유형과 직교.
  const [targetZone, setTargetZone] = useState<TargetZone>(DEFAULT_TARGET_ZONE);
  useEffect(() => { void loadTargetZone().then(setTargetZone); }, []);
  const pickZone = (z: TargetZone) => { tap(); setTargetZone(z); void saveTargetZone(z); };

  const startRun = () => {
    tap();
    const base: RunGoal =
      mode === 'km' ? { km: val, durationMin: 0, pacePlan: [] } // val 0 = 자유 러닝
        : mode === 'min' ? { km: 0, durationMin: val, pacePlan: [] }
          : mode === 'track' ? { km: 0, durationMin: 0, pacePlan: [], track: { lapM } }
            : { km: speedGoal.km, durationMin: 0, pacePlan: speedGoal.plan };
    onStart?.({ ...base, targetZone });
  };
  const ZONE_OPTS: { z: TargetZone; label: string }[] = [
    { z: 0, label: '끄기' }, { z: 2, label: 'Z2 이지' }, { z: 3, label: 'Z3 템포' }, { z: 4, label: 'Z4 역치' },
  ];

  return (
    // 엣지 스와이프 백 — 러닝 '전' 화면이라 잃을 입력이 없고 뒤로 버튼과 동일 동작.
    // 가장자리 24pt 에서만 캡처하므로 중앙의 눈금 룰러 가로 드래그와 충돌하지 않는다.
    <SwipeBack onBack={onBack}>
    <View style={[s.screen, { paddingTop: insets.top + rv(8) }]}>
      <StatusBar barStyle="light-content" />
      {/* nav */}
      <View style={s.nav}>
        <Pressable onPress={onBack} hitSlop={8} style={s.navIc} accessibilityRole="button" accessibilityLabel="뒤로"><Icon name="back" size={ri(24)} color={T2} /></Pressable>
        <Text style={s.navTitle}>러닝 목표</Text>
        <View style={s.navIc} />
      </View>

      {/* segmented — 모드 탭 스트립(SegmentedControl accentTint). 거리·시간·스피드·트랙
          (민우님 2026-07-24 재확정). '자유'는 거리 탭의 첫 프리셋(기본 선택)이 담당한다. */}
      <SegmentedControl
        style={s.seg}
        variant="accentTint"
        items={[{ key: 'km', label: '거리' }, { key: 'min', label: '시간' }, { key: 'speed', label: '스피드' }, { key: 'track', label: '트랙' }]}
        value={mode}
        onChange={(k) => pickMode(k as Mode)}
        labelFor={(it) => `${it.label} 목표`}
      />

      {/* center */}
      <View style={s.center}>
        {mode === 'track' ? (
          // 트랙 모드 — 거리 모드와 같은 위계(큰 숫자 = 선택한 한 바퀴). 칩이 유일한 컨트롤.
          // 야외선 첫 랩 GPS 가 이 값을 실제 랩거리로 자동 보정, 실내(GPS✗)에선 이 값이 확정.
          <View style={s.trackWrap}>
            <Text style={s.trackLbl}>한 바퀴</Text>
            <View style={s.bigRow}>
              <Text style={s.bigVal}>{lapM}</Text>
              <Text style={s.bigUnit}>m</Text>
            </View>
            <Text style={s.estimate}>야외에선 첫 바퀴를 GPS로 자동 보정해요</Text>
            <View style={s.lapChips}>
              {LAP_PRESETS.map(m => {
                const on = !lapCustom && lapM === m;
                return (
                  <Pressable key={m} onPress={() => { tap(); setLapM(m); setLapCustom(false); }}
                    style={[s.lapChip, on && s.lapChipOn]}
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    accessibilityLabel={`한 바퀴 ${m}미터${m === 400 ? ', 야외 공인 트랙' : m === 200 ? ', 실내 트랙' : ''}`}>
                    <Text style={[s.lapChipVal, on && s.lapChipValOn]}>{m}</Text>
                    <Text style={[s.lapChipUnit, on && s.lapChipValOn]}>m</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => { tap(); setKpBuf(''); setKpOpen(true); }}
                style={[s.lapChip, lapCustom && s.lapChipOn]}
                accessibilityRole="button" accessibilityState={{ selected: lapCustom }}
                accessibilityLabel={lapCustom ? `커스텀 한 바퀴 ${lapM}미터, 눌러서 변경` : '커스텀 한 바퀴 거리 직접 입력'}>
                <Text style={[s.lapChipVal, lapCustom && s.lapChipValOn]}>{lapCustom ? String(lapM) : '커스텀'}</Text>
                {lapCustom ? <Text style={[s.lapChipUnit, s.lapChipValOn]}>m</Text> : null}
              </Pressable>
            </View>
          </View>
        ) : mode === 'speed' ? (
          <SpeedPlanPanel onChange={(km, plan) => setSpeedGoal({ km, plan })} />
        ) : (
          <>
            <Pressable
              onPress={() => { setKpBuf(''); setKpOpen(true); }}
              style={s.bigRow}
              testID="goal-bignum"
              accessibilityRole="adjustable"
              accessibilityLiveRegion="polite"
              accessibilityLabel={mode === 'km' && val === 0 ? '자유 러닝, 목표 없음' : `목표 ${fmt(val)} ${cfg!.unit}`}
              accessibilityHint="눌러서 직접 입력"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                const m = mode === 'min' ? 'min' : 'km';
                const d = e.nativeEvent.actionName === 'increment' ? CFG[m].step : -CFG[m].step;
                const v = clampToCfg(m, val + d);
                setVal(v); scrollToVal(v, false);
              }}>
              {mode === 'km' && val === 0 ? (
                // '자유' 상태 — 숫자 대신 낱말(0.0km 는 고장처럼 읽힌다). 탭·룰러·칩으로
                // 거리를 잡는 순간 숫자 히어로로 복귀한다.
                <Text style={s.bigFree}>자유</Text>
              ) : (
                <>
                  <Text style={s.bigVal}>{fmt(val)}</Text>
                  <Text style={s.bigUnit}>{cfg!.unit}</Text>
                </>
              )}
            </Pressable>
            <Text style={s.estimate}>{estimate}</Text>

            {/* SwipeBackExclude: 룰러가 전폭이라 왼쪽 엣지 존(24pt)과 겹친다 — km 를
                줄이려고 룰러 왼쪽을 잡고 오른쪽으로 밀면 엣지 스와이프 백으로 오인돼
                화면이 뒤로 튕기던 버그 방지(룰러 위 터치 동안 SwipeBack 양보). */}
            <SwipeBackExclude>
            <View style={s.rulerWrap} onLayout={onRulerLayout}>
              <ScrollView
                ref={rulerRef} horizontal showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16} onScroll={onScroll} decelerationRate="fast"
                snapToInterval={cfg!.step * cfg!.px}
                contentContainerStyle={{ paddingHorizontal: half }}>
                <View style={{ width: cfg!.max * cfg!.px, height: rs(78) }}>
                  {ticks.map((t, i) => (
                    <View key={i} pointerEvents="none" style={[s.tick, t.major ? s.tickMajor : s.tickMinor, { left: t.v * cfg!.px - 1 }]} />
                  ))}
                  {ticks.filter(t => t.major).map((t, i) => (
                    <Text key={`l${i}`} pointerEvents="none" style={[s.tickLabel, { left: t.v * cfg!.px - 14 }]}>{Math.round(t.v)}</Text>
                  ))}
                </View>
              </ScrollView>
              <View pointerEvents="none" style={s.pointer} />
            </View>
            </SwipeBackExclude>

            <View style={s.presets}>
              {cfg!.presets.map(p => {
                const on = Math.abs(p.v - val) < (mode === 'km' ? 0.05 : 0.5);
                return (
                  <Pressable key={p.label} onPress={() => pickPreset(p.v)} hitSlop={6} style={[s.preset, on && s.presetOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p.v === 0 ? '자유 러닝 선택' : `${p.label} 목표 선택`}>
                    <Text style={[s.presetText, on && s.presetTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* 심박 가이드(#7) — 거리/시간/스피드 목표와 직교로 조합하는 강도 레일(탭 아닌 행).
          기본 끄기. 선택 시 러닝 중 목표 존 이탈을 색·화살표·음성으로 코칭한다. */}
      <View style={s.zoneRow} accessibilityRole="radiogroup" accessibilityLabel="심박 가이드">
        <Text style={s.zoneLabel}>심박 가이드</Text>
        <View style={s.zoneChips}>
          {ZONE_OPTS.map(o => {
            const on = targetZone === o.z;
            const col = o.z !== 0 ? HR_ZONE_COLORS[o.z as 2 | 3 | 4] : GOOD;
            return (
              <Pressable key={o.z} onPress={() => pickZone(o.z)} accessibilityRole="radio" hitSlop={6}
                accessibilityState={{ selected: on }} accessibilityLabel={`심박 가이드 ${o.label}`}
                style={[s.zoneChip, on && { backgroundColor: withAlpha(col, 0.16), borderColor: withAlpha(col, 0.5) }]}>
                <Text style={[s.zoneChipTxt, on && { color: col }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {targetZone >= 2 && (() => {
          const b = zoneBoundaries(estimateMaxHR(age), restHR || undefined);
          const hi = targetZone < 5 ? b[(targetZone + 1) as 3 | 4 | 5] - 1 : estimateMaxHR(age);
          const lo = b[targetZone as 2 | 3 | 4];
          const desc = targetZone === 2 ? '지방 연소·기초 지구력' : targetZone === 3 ? '유산소 능력 향상' : '젖산 역치·레이스 페이스';
          return (
            <Text style={s.zoneHint}>{lo > 0 ? `${lo}–${hi} bpm · ` : ''}{desc}{age <= 0 ? ' · 마이 탭에서 나이 설정 시 bpm 표시' : ''}</Text>
          );
        })()}
      </View>

      {/* footer — 신발은 홈에서 선택해 넘어오므로 여기선 목표 입력(키패드)과 시작만.
          신발 행/전환 시트는 제거(2026-07-19 민우 — 화면 단순화, 마지막 교정은 뒤로가기). */}
      <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, rv(14)) + rv(8) }]}>
        {/* 목표 직접 입력 키패드(2026-07-04) — 큰 숫자 탭으로 연다. 하단 시트
            하단 시트 규약(SCRIM 탭 = 닫기). 확인 시 cfg 범위로 클램프 + 룰러 동기. */}
        <Modal visible={kpOpen} transparent animationType="slide" onRequestClose={() => setKpOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: SCRIM }} onPress={() => setKpOpen(false)} accessibilityRole="button" accessibilityLabel="입력 닫기" />
          <View style={s.pickerSheet}>
            <View style={s.kpValRow} accessibilityRole="text" accessibilityLiveRegion="polite"
              accessibilityLabel={`입력 ${kpBuf || (mode === 'track' ? String(lapM) : fmt(val))} ${mode === 'track' ? '미터' : (cfg?.unit ?? 'km')}`}>
              <Text style={[s.kpVal, !kpBuf && s.kpValGhost]} testID="kp-value">{kpBuf || (mode === 'track' ? String(lapM) : fmt(val))}</Text>
              <Text style={s.kpUnit}>{mode === 'track' ? 'm' : (cfg?.unit ?? 'km')}</Text>
            </View>
            <View style={s.kpGrid}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => {
                const dot = k === '.';
                const off = dot && (mode === 'min' || mode === 'track'); // 시간·트랙 모드는 정수만
                return (
                  <Pressable key={k} disabled={off} onPress={() => kpPress(k)}
                    accessibilityRole="button"
                    accessibilityLabel={k === '⌫' ? '지우기' : k === '.' ? '소수점' : k}
                    testID={`kp-${k === '⌫' ? 'del' : k === '.' ? 'dot' : k}`}
                    style={({ pressed }) => [s.kpKey, off && { opacity: 0.25 }, pressed && { opacity: 0.7 }]}>
                    <Text style={s.kpKeyTxt}>{k}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button label="확인" onPress={kpConfirm} haptic={false} style={s.kpOk} testID="kp-ok" />
          </View>
        </Modal>

        <Button
          label="러닝 시작"
          onPress={startRun}
          // startRun 이 직접 tap() 을 울리므로 공용 버튼 햅틱은 끈다(중복 방지).
          haptic={false}
          iconNode={<Icon name="play" size={ri(22)} color={T1} fill={T1} />}
          style={s.cta}
        />
      </View>
    </View>
    </SwipeBack>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG }, // 상단 여백은 insets.top 실측(렌더에서 주입)
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, height: rs(44) },
  navIc: { width: rs(36), height: rs(36), alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '600', letterSpacing: -0.2 },

  // 컨테이너 표면(배경/보더/반경/패딩)은 SegmentedControl accentTint variant 가 책임진다.
  // 화면 고유 레이아웃(좌우·상단 여백)만 남긴다(과거 segBtn/On·segText/On 제거).
  seg: { marginHorizontal: GUTTER, marginTop: rv(14) },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
  // baseline 정렬(2026-07-17 사용자 지적 "km·분·m 라인이 숫자보다 밑"): Jost 숫자의
  // 줄상자(lineHeight 1.22×)가 글자보다 커서 flex-end+수동 마진은 단위가 밑선 아래로
  // 처졌다 — 글자 밑선끼리 맞춘다(거리·시간·트랙 공용).
  bigRow: { flexDirection: 'row', alignItems: 'baseline' },
  // 큰 숫자 = NUM(Jost) — 러닝 중 bigDist 와 동일 규율(2026-07-16 통일: 목표→러닝 전환 시
  // 같은 숫자의 폰트 점프 해소). Jost 는 어센더가 커서 lineHeight 를 1.22 배로 띄운다.
  bigVal: { color: T1, fontFamily: NUM, fontSize: rf(104), fontWeight: '500', letterSpacing: -1, lineHeight: rf(127), includeFontPadding: false, fontVariant: ['tabular-nums'] },
  bigUnit: { color: T2, fontFamily: FONT, fontSize: TYPE.title1.fontSize, fontWeight: '600', marginLeft: rs(8) },
  estimate: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(14) },

  rulerWrap: { width: '100%', height: rs(78), marginTop: rv(30), position: 'relative' },
  tick: { position: 'absolute', bottom: 26, width: 2, borderRadius: rs(2) },
  tickMinor: { height: rs(14), backgroundColor: withAlpha(T1, 0.18) },
  tickMajor: { height: rs(26), backgroundColor: withAlpha(T1, 0.38) },
  tickLabel: { position: 'absolute', bottom: 2, width: rs(28), textAlign: 'center', color: T3, fontFamily: DISPLAY, fontSize: TYPE.caption.fontSize, fontWeight: '500', fontVariant: ['tabular-nums'] },
  pointer: { position: 'absolute', left: '50%', marginLeft: -1.5, top: 2, bottom: 24, width: rs(3), borderRadius: rs(3), backgroundColor: ACCENT },

  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: rv(8), marginTop: rv(26) },
  preset: { height: rs(36), paddingHorizontal: rs(16), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T1, 0.04), borderWidth: 1, borderColor: SEP },
  // 선택 칩 한 벌(감사 #56): 채움 withAlpha(T1,0.14) · 보더 withAlpha(T1,0.4) — 앱 공통.
  presetOn: { backgroundColor: withAlpha(T1, 0.14), borderColor: withAlpha(T1, 0.4) },
  presetText: { color: T2, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  presetTextOn: { color: ACCENT },

  // 트랙 모드 — 거리 모드와 같은 큰 숫자 위계(bigRow/bigVal/bigUnit/estimate 재사용) + 랩거리 칩.
  trackWrap: { alignItems: 'center', paddingHorizontal: rs(14) },
  trackLbl: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: rv(4) },
  lapChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: rv(8), marginTop: rv(36) },
  lapChip: { minWidth: rs(60), height: rs(50), paddingHorizontal: rs(16), borderRadius: RADIUS.md, borderCurve: 'continuous', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T1, 0.03), borderWidth: 1, borderColor: SEP },
  lapChipOn: { backgroundColor: withAlpha(T1, 0.14), borderColor: withAlpha(T1, 0.4) },
  lapChipVal: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.4 },
  lapChipValOn: { color: ACCENT },
  lapChipUnit: { color: T4, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600', marginTop: rv(1) },

  // '자유' 상태 히어로 — 숫자(bigVal 104) 자리에 낱말. 높이 점프가 없게 lineHeight 동일.
  bigFree: { color: T1, fontFamily: DISPLAY, fontSize: rf(64), fontWeight: '700', letterSpacing: -1.5, lineHeight: rf(127), includeFontPadding: false },

  // 심박 가이드 행(#7) — 라벨 + 칩. 신발 행 위, 조용한 강도 레일.
  zoneRow: { paddingHorizontal: GUTTER, paddingTop: rv(2), paddingBottom: rv(10) },
  zoneLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 0.3, marginBottom: rv(8) },
  zoneChips: { flexDirection: 'row', gap: rv(8), flexWrap: 'wrap' },
  zoneChip: { paddingHorizontal: rs(14), paddingVertical: rv(8), borderRadius: RADIUS.pill, borderCurve: 'continuous', backgroundColor: withAlpha(T1, 0.06), borderWidth: 1, borderColor: 'transparent' },
  zoneChipTxt: { color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '700' },
  zoneHint: { color: T3, fontFamily: FONT, fontSize: rf(12), marginTop: rv(8), letterSpacing: 0.2 },
  foot: { paddingHorizontal: GUTTER, paddingTop: rv(4) }, // 하단 여백은 insets.bottom 실측
  // 목표 직접 입력 키패드 시트(하단) — History 기간 피커와 같은 문법(SCRIM + 하단 카드).
  pickerSheet: { backgroundColor: CARD, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderCurve: 'continuous', paddingHorizontal: rs(18), paddingTop: rv(18), paddingBottom: rv(34), gap: rv(10) },
  // 목표 직접 입력 키패드 — 시트 규약은 pickerSheet 재사용, 키만 추가.
  kpValRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: rv(6), marginBottom: rv(6), minHeight: rs(44) },
  kpVal: { color: T1, fontFamily: DISPLAY, fontSize: HERO.hero, fontWeight: '600', letterSpacing: -1 },
  kpValGhost: { color: T4 },
  kpUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600' },
  kpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rv(8) },
  kpKey: { width: '31.5%', flexGrow: 1, alignItems: 'center', paddingVertical: rv(12), borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: CARD_BORDER },
  kpKeyTxt: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '600' },
  kpOk: { marginTop: rv(6) },

  // CTA 는 단일 Button 프리미티브(그라데이션·글로우·radius 토큰). 화면 고유 레이아웃
  // (상단 여백·높이)만 style 로 넘기고 모양/그라데이션/광택은 Button 이 책임진다.
  cta: { marginTop: rv(14), height: rs(60) },
});
