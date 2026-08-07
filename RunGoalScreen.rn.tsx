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

import React, { useMemo, useState } from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {
  View, Pressable, StyleSheet, StatusBar, LayoutAnimation,
} from 'react-native';
import {Text, FONT_SCALE_CAP_HERO} from './lib/text';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · amber→WARN · red→DANGER
// · text→T1–T4 · hair→SEP · 그라데이션→GRAD_TOP/GRAD_BOT. 폰트 UI/DP → FONT/DISPLAY.
// (시각 동등: 다크+오렌지 유지)
import {
  BG, ACCENT, T1, T2, T3, SEP, CARD_BORDER,
  FONT, DISPLAY, NUM, RADIUS, GUTTER, withAlpha, TYPE, HERO, LEADING, MOTION, TOUCH_TARGET,
  ICON,
} from './theme';
// lib/haptics 배선: '러닝 시작' CTA(런 시작) → tap.
import { tap } from './lib/haptics';
import { loadTargetZone, saveTargetZone, DEFAULT_TARGET_ZONE, type TargetZone } from './lib/settings';
import { estimateMaxHR, zoneBoundaries } from './lib/analytics/hrZones';
import { useEffect } from 'react';
import { HR_ZONE_COLORS, GOOD } from './theme';
// CTA 는 앱 전역 단일 Button 프리미티브(그라데이션 GRAD_TOP/BOT·글로우·radius 토큰).
// 모드 탭 스트립은 SegmentedControl 단일 프리미티브(md — 주 탭).
import { Button, SegmentedControl, SwipeBack, BottomSheet, useReduceMotion } from './primitives';
// 탭 구성 재확정(민우님 2026-07-24): 거리·시간·스피드·트랙 4탭 복원 + '자유'는 거리 탭의
// 첫 프리셋(val=0)으로. 자유런 전용 탭(2026-07-22안)은 하루 써보고 철회 — 자유는 목표
// 모드가 아니라 '거리 목표 없음'이라 거리 탭 안이 문법상 맞다.
import SpeedPlanPanel from './SpeedPlanPanel';
import { buildPacePlan } from './lib/pacePlan';
// 추정치 개인화(심사 P2 #74, Truth only) — 일률 5분/km·64kcal/km 대신 최근 이력의
// 거리가중 평균 페이스·km당 칼로리로 예상. 이력 없으면 기존 기본값 폴백(회귀 0).
import { estimateForGoal, estimateForDuration, buildPaceProfile, type EstimateRunLike } from './lib/goalEstimate';
import { HEALTH_STORE_NAME, LIVE_HR_SUPPORTED } from './lib/health';

// runs 기본값 — 렌더마다 새 []를 만들면 useMemo 의존이 매번 갈려 추정이 재계산되므로
// 모듈 상수 한 개로 고정한다(미배선 시에도 참조 동일성 유지).
const NO_RUNS: EstimateRunLike[] = [];

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
export type RunGoal = {
  km: number;
  durationMin: number;
  pacePlan: number[];
  track?: { lapM: number } | null;
  targetZone?: number;
  /**
   * 실내(트레드밀) 여부. 목표(무엇을)와 환경(어디서)은 서로 다른 축이라 탭이 아니라
   * 별도 전환으로 둔다(2026-07-27 민우님 B안 확정). true 면 GPS 를 켜지 않고
   * 만보계 거리를 정본으로 쓴다.
   */
  indoor?: boolean;
};
/** 트랙 한 바퀴 예상 거리 선택지(m) — 야외 400(공인)·트랙 300·실내 200 + 커스텀. */
const LAP_PRESETS = [200, 300, 400] as const;
/** 거리 키패드 입력 상한(km) — 울트라 대응(민우님 2026-07-24): 50K·100K·100마일(161km)을
 *  덮는 200. 프리셋 칩 밖의 값은 전부 키패드 전용(빠른 선택=칩, 정밀=히어로 탭 키패드). */
const KM_INPUT_MAX = 200;
// 눈금 룰러 폐기(재구성 2026-07-25 민우님 목업 확정): 같은 값(거리)을 받는 세 번째 중복
// 입력이었다 — 빠른 선택은 칩, 정밀 입력은 히어로 탭 키패드가 담당(기능 손실 0).
// CFG 의 룰러 전용 필드(major/minor/px)도 함께 폐기.
const CFG: Record<'km' | 'min', { min: number; max: number; step: number; unit: string; def: number; presets: { label: string; v: number }[] }> = {
  // max 42.2: 풀코스(42.195km)가 42 상한에 막히던 문제(민우님 2026-07-24). 하프=21.1 과
  // 같은 0.1 그리드 반올림 규약으로 풀=42.2 — 링/음성 목표용 오차 +5m 는 무시 가능.
  km:  { min: 0, max: 42.2, step: 0.1, unit: 'km', def: 5,  presets: [{ label: '자유', v: 0 }, { label: '3km', v: 3 }, { label: '5km', v: 5 }, { label: '10km', v: 10 }, { label: '하프', v: 21.1 }, { label: '풀', v: 42.2 }] },
  min: { min: 0, max: 180, step: 1, unit: '분', def: 30, presets: [{ label: '20분', v: 20 }, { label: '30분', v: 30 }, { label: '45분', v: 45 }, { label: '60분', v: 60 }] },
};

export default function RunGoalScreen({
  onBack, onStart, age = 0, restHR = 0, runs = NO_RUNS,
}: {
  // 신발은 홈 히어로에서 이미 선택해 넘어온다 — 이 화면은 '목표'에만 집중한다(2026-07-19
  // 민우: 홈에서 신발 고르고 러닝시작 눌렀는데 여기 또 신발 행이 있어 화면이 복잡했다.
  // 마지막 교정은 뒤로가기로. 신발 관련 prop·행·전환 시트 제거).
  onBack?: () => void; onStart?: (goal: RunGoal) => void;
  /** 심박 가이드 bpm 범위 표시용(#7). 0이면 범위 숨기고 존 이름만. */
  age?: number; restHR?: number;
  /** 러닝 이력(추정치 개인화용, 심사 #74). 미전달 = 기본값(5분/km·64kcal/km) 추정. */
  runs?: EstimateRunLike[];
}) {
  // safe-area 실측(검수 MED, 2026-07-16): 상단 rv(54)·하단 rv(30) 하드코딩은 노치/홈바
  // 기기별 편차를 못 담는다(다이내믹 아일랜드 밑에 nav 가 살짝 파고들던 것) — insets 로.
  const insets = useSafeAreaInsets();
  // 기본 = 거리 탭 · '자유'(val=0) 프리셋(민우님 2026-07-24) — 열자마자 CTA 한 번이면
  // 자유 러닝(퀵스타트 유지), 거리 목표는 칩 한 번(3/5/10/하프) 또는 히어로 탭 키패드로.
  const [mode, setMode] = useState<Mode>('km');
  // 야외/실내 — 기본은 야외라 지금까지 쓰던 사람에겐 아무것도 달라지지 않는다.
  const [indoor, setIndoor] = useState(false);
  const [val, setVal] = useState<number>(0);
  const cfg = mode === 'km' || mode === 'min' ? CFG[mode] : null;
  // 스피드 탭 기본 평균 페이스 개인화(2026-07-26) — 거리·시간 탭의 '예상 시간'은 이미
  // lib/goalEstimate 로 개인화돼 있는데, 스피드 탭만 6'00" 고정이라 러너마다 첫 화면부터
  // 손봐야 했다. 최근 이력의 거리가중 평균 페이스를 기본값으로 준다.
  // 이력이 없으면(personalized=false) 종전 기본값 6'00" 을 그대로 쓴다 — goalEstimate 의
  // 폴백(5'00")을 쓰면 신규 사용자의 기본이 조용히 빨라져 버린다.
  const SPEED_DEFAULT_SEC = 360;
  const speedInitialAvgSec = useMemo(() => {
    const p = buildPaceProfile(runs);
    return p.personalized ? Math.round(p.paceSecPerKm) : SPEED_DEFAULT_SEC;
  }, [runs]);
  // 스피드 모드의 현재 목표(거리 km + km별 페이스 플랜) — SpeedPlanPanel 이 onChange 로 올린다.
  const [speedGoal, setSpeedGoal] = useState<{ km: number; plan: number[] }>(() => ({ km: 5, plan: buildPacePlan(5, SPEED_DEFAULT_SEC, 'negative') }));
  // 트랙 모드: 한 바퀴 예상 거리(m). 기본 400(야외 공인). 커스텀은 하단 키패드로 입력.
  // 이 값은 '가정'일 뿐 — 야외선 첫 랩 GPS 가 실제 랩거리로 자동 보정한다(실내 폴백값).
  const [lapM, setLapM] = useState<number>(400);
  const [lapCustom, setLapCustom] = useState(false); // 커스텀 칩 선택 여부(표준 3개 밖의 값)

  const fmt = (v: number) => (mode === 'km' ? v.toFixed(1) : String(Math.round(v)));
  const estimate = useMemo(() => {
    if (!cfg) return ''; // 스피드·트랙은 자체 표시 — estimate 미사용
    // 자유(목표 0) 캡션 — 룰러가 빠진 자리의 안내(정밀 입력 진입점 = 히어로 탭)를 겸한다.
    if (val <= 0) return mode === 'km' ? '목표 없이 달려요 · 숫자를 탭하면 직접 입력' : '목표를 정해주세요';
    // 개인 이력 기반 추정(심사 #74) — 최근 10회 거리가중 평균 페이스·km당 칼로리.
    // 이력 없으면 lib/goalEstimate 가 기존 기본값(5분/km·64kcal/km)으로 폴백한다.
    if (mode === 'km') {
      const e = estimateForGoal(runs, val);
      return `예상 시간 약 ${e.minutes}분 · 약 ${e.kcal} kcal`;
    }
    const e = estimateForDuration(runs, val);
    return `예상 거리 약 ${e.km.toFixed(1)}km · 약 ${e.kcal} kcal`;
  }, [mode, val, cfg, runs]);

  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === 'km' || m === 'min') {
      // 거리 탭 재진입 기본은 '자유'(0) — 첫 진입과 동일한 퀵스타트 문법. 시간은 기존 30분.
      setVal(m === 'km' ? 0 : CFG[m].def);
    }
  };
  const pickPreset = (v: number) => setVal(v);

  // ── 큰 숫자 직접 입력(2026-07-04) — 탭 → 키패드만(사용자 확정) ──────────────
  // 큰 숫자를 탭하면 하단 키패드 시트로 하프(21.1) 같은 정확한 값을 입력한다.
  // 재구성(2026-07-25) 후 정밀 입력의 유일한 진입점 — 빠른 선택은 프리셋 칩.
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
      setVal(clampToCfg(m, parseFloat(kpBuf) || 0));
    }
    setKpOpen(false);
  };
  // 런 시작: 햅틱(tap) → onStart(RunGoal). 거리/시간/스피드(km별 페이스 플랜)로 분기.
  // 심박 가이드(#7) — 목표 존(0=끄기·2·3·4). 저장값 로드, 변경 시 저장(persist). 목표 유형과 직교.
  const [targetZone, setTargetZone] = useState<TargetZone>(DEFAULT_TARGET_ZONE);
  useEffect(() => { void loadTargetZone().then(setTargetZone); }, []);
  const pickZone = (z: TargetZone) => { tap(); setTargetZone(z); void saveTargetZone(z); };
  // 심박 가이드 접힘(재구성 2026-07-25): 상시 4칩+힌트(겹 2)가 접힌 한 줄 요약으로.
  // 설정값은 접혀 있어도 유지·적용된다(targetZone 은 startRun 에 항상 실린다).
  const [zoneOpen, setZoneOpen] = useState(false);
  // 러닝 **중** 실시간 심박이 가능한 플랫폼인가(근거는 lib/health.LIVE_HR_SUPPORTED).
  // 끝난 뒤 심박을 채우는 것은 안드로이드에서도 동작한다 — 그건 **기록**이고 이건
  // **코칭**이다. 둘을 같은 스위치로 묶어 두면 둘 다 거짓말이 된다.
  const liveHrAvailable = LIVE_HR_SUPPORTED;
  const reduceMotion = useReduceMotion();
  const toggleZoneOpen = () => {
    // 접힘/펼침은 레이아웃 전환 — 시스템 '동작 줄이기' 존중(DESIGN §6.7).
    if (!reduceMotion) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(MOTION.dur.base, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
    }
    setZoneOpen(o => !o);
  };

  const startRun = () => {
    tap();
    const base: RunGoal =
      mode === 'km' ? { km: val, durationMin: 0, pacePlan: [], indoor } // val 0 = 자유 러닝
        : mode === 'min' ? { km: 0, durationMin: val, pacePlan: [], indoor }
          : mode === 'track' ? { km: 0, durationMin: 0, pacePlan: [], track: { lapM } }
            : { km: speedGoal.km, durationMin: 0, pacePlan: speedGoal.plan, indoor };
    onStart?.({ ...base, targetZone });
  };
  const ZONE_OPTS: { z: TargetZone; label: string }[] = [
    { z: 0, label: '끄기' }, { z: 2, label: 'Z2 이지' }, { z: 3, label: 'Z3 템포' }, { z: 4, label: 'Z4 역치' },
  ];

  return (
    // 엣지 스와이프 백 — 러닝 '전' 화면이라 잃을 입력이 없고 뒤로 버튼과 동일 동작.
    // (스피드 탭의 km별 칩 가로 스크롤은 SpeedPlanPanel 이 SwipeBackExclude 로 양보시킨다.)
    <SwipeBack onBack={onBack}>
    <View style={[s.screen, { paddingTop: insets.top + rv(8) }]}>
      <StatusBar barStyle="light-content" />
      {/* nav */}
      <View style={s.nav}>
        <Pressable onPress={onBack} hitSlop={8} style={s.navIc} accessibilityRole="button" accessibilityLabel="뒤로"><Icon name="back" size={ri(ICON.nav)} color={T2} /></Pressable>
        <Text style={s.navTitle}>러닝 목표</Text>
        <View style={s.navIc} />
      </View>

      {/* segmented — 모드 탭 스트립(SegmentedControl md). 거리·시간·스피드·트랙
          (민우님 2026-07-24 재확정). '자유'는 거리 탭의 첫 프리셋(기본 선택)이 담당한다. */}
      <SegmentedControl
        style={s.seg}
        items={[{ key: 'km', label: '거리' }, { key: 'min', label: '시간' }, { key: 'speed', label: '스피드' }, { key: 'track', label: '트랙' }]}
        value={mode}
        onChange={(k) => pickMode(k as Mode)}
        labelFor={(it) => `${it.label} 목표`}
      />

      {/* 야외 / 실내 — 목표(무엇을)와 환경(어디서)은 축이 다르므로 탭이 아니라 별도 줄이다
          (2026-07-27 B안). 덕분에 '실내에서 5km' 같은 조합이 자연스럽게 표현된다.
          트랙 탭에서는 숨긴다 — 거기엔 이미 '실내 200m' 랩 선택지가 같은 역할을 한다. */}
      {mode !== 'track' && (
        <SegmentedControl
          style={s.envSeg}
          size="sm"
          items={[{ key: 'outdoor', label: '야외' }, { key: 'indoor', label: '실내' }]}
          value={indoor ? 'indoor' : 'outdoor'}
          onChange={(k) => setIndoor(k === 'indoor')}
          labelFor={(it) => (it.key === 'indoor' ? '실내 러닝 — 걸음으로 거리 측정' : '야외 러닝 — GPS로 거리 측정')}
          testIDFor={(it) => `goal-env-${it.key}`}
        />
      )}
      {mode !== 'track' && indoor && (
        <Text style={s.envHint} testID="goal-indoor-hint">
          걸음으로 거리를 세요 · 지도는 기록되지 않아요
        </Text>
      )}

      {/* center */}
      <View style={s.center}>
        {mode === 'track' ? (
          // 트랙 모드 — 거리 모드와 같은 위계(큰 숫자 = 선택한 한 바퀴). 칩이 유일한 컨트롤.
          // 야외선 첫 랩 GPS 가 이 값을 실제 랩거리로 자동 보정, 실내(GPS✗)에선 이 값이 확정.
          <View style={s.trackWrap}>
            <Text style={s.trackLbl}>한 바퀴</Text>
            <View style={s.bigRow}>
              <Text style={s.bigVal} maxFontSizeMultiplier={FONT_SCALE_CAP_HERO}>{lapM}</Text>
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
          <SpeedPlanPanel initialAvgSec={speedInitialAvgSec} onChange={(km, plan) => setSpeedGoal({ km, plan })} />
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
                setVal(clampToCfg(m, val + d));
              }}>
              {mode === 'km' && val === 0 ? (
                // '자유' 상태 — 숫자 대신 낱말(0.0km 는 고장처럼 읽힌다). 탭·룰러·칩으로
                // 거리를 잡는 순간 숫자 히어로로 복귀한다.
                <Text style={s.bigFree} maxFontSizeMultiplier={FONT_SCALE_CAP_HERO}>자유</Text>
              ) : (
                <>
                  <Text style={s.bigVal} maxFontSizeMultiplier={FONT_SCALE_CAP_HERO}>{fmt(val)}</Text>
                  <Text style={s.bigUnit}>{cfg!.unit}</Text>
                </>
              )}
            </Pressable>
            <Text style={s.estimate}>{estimate}</Text>

            {/* 눈금 룰러는 폐기(재구성 2026-07-25) — 같은 값(거리/시간)의 세 번째 중복
                입력이었다. 빠른 선택=아래 칩, 정밀=위 히어로 탭 키패드(기능 손실 0). */}
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

      {/* 심박 가이드(#7) — 거리/시간/스피드 목표와 직교로 조합하는 강도 레일.
          재구성(2026-07-25): 상시 4칩+힌트 → 접힌 한 줄 요약("심박 가이드 · 현재값 ›").
          탭하면 기존 4칩+힌트가 펼쳐진다. 설정값은 접혀 있어도 유지·적용. */}
      <View style={s.zoneRow}>
        <Pressable
          testID="goal-hr-row"
          onPress={toggleZoneOpen}
          style={s.zoneHead}
          accessibilityRole="button"
          accessibilityState={{ expanded: zoneOpen }}
          accessibilityLabel={`심박 가이드, 현재 ${ZONE_OPTS.find(o => o.z === targetZone)?.label ?? '끄기'}`}
          accessibilityHint="눌러서 설정 펼치기 또는 접기">
          <Text style={s.zoneLabel}>
            {'심박 가이드 · '}
            <Text style={s.zoneSummaryVal}>{ZONE_OPTS.find(o => o.z === targetZone)?.label ?? '끄기'}</Text>
          </Text>
          <Text style={[s.zoneChevron, zoneOpen && s.zoneChevronOpen]}>›</Text>
        </Pressable>
        {zoneOpen && !liveHrAvailable && (
          // 있는 척하지 않는다 — 왜 안 되는지와, 무엇은 되는지를 한 줄로 말한다.
          <Text style={s.zoneHint}>
            이 기기에선 러닝 중 실시간 심박을 받을 수 없어요. 러닝이 끝나면 심박 기록은
            {' '}{HEALTH_STORE_NAME}에서 채워집니다.
          </Text>
        )}
        {zoneOpen && liveHrAvailable && (
          <View accessibilityRole="radiogroup" accessibilityLabel="심박 가이드">
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
        )}
      </View>

      {/* footer — 신발은 홈에서 선택해 넘어오므로 여기선 목표 입력(키패드)과 시작만.
          신발 행/전환 시트는 제거(2026-07-19 민우 — 화면 단순화, 마지막 교정은 뒤로가기). */}
      <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, rv(14)) + rv(8) }]}>
        {/* 목표 직접 입력 키패드(2026-07-04) — 큰 숫자 탭으로 연다. 하단 시트
            하단 시트 규약(SCRIM 탭 = 닫기). 확인 시 cfg 범위로 클램프 + 룰러 동기. */}
        <BottomSheet visible={kpOpen} onClose={() => setKpOpen(false)}>
          <View style={s.pickerSheet}>
            <View style={s.kpValRow} accessibilityRole="text" accessibilityLiveRegion="polite"
              accessibilityLabel={`입력 ${kpBuf || (mode === 'track' ? String(lapM) : fmt(val))} ${mode === 'track' ? '미터' : (cfg?.unit ?? 'km')}`}>
              <Text style={[s.kpVal, !kpBuf && s.kpValGhost]} maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} testID="kp-value">{kpBuf || (mode === 'track' ? String(lapM) : fmt(val))}</Text>
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
        </BottomSheet>

        <Button
          label="러닝 시작"
          onPress={startRun}
          // startRun 이 직접 tap() 을 울리므로 공용 버튼 햅틱은 끈다(중복 방지).
          haptic={false}
          iconNode={<Icon name="play" size={ri(ICON.nav)} color={T1} fill={T1} />}
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

  // 컨테이너 표면(배경/보더/반경/패딩)은 SegmentedControl(필 단일 문법)이 책임진다.
  // 화면 고유 레이아웃(좌우·상단 여백)만 남긴다(과거 segBtn/On·segText/On 제거).
  seg: { marginHorizontal: GUTTER, marginTop: rv(14) },
  // 환경 전환(야외/실내) — 모드 탭보다 한 단 아래 위계라 간격을 좁게 둔다.
  envSeg: { marginHorizontal: GUTTER, marginTop: rv(8) },
  envHint: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, textAlign: 'center', marginTop: rv(6), paddingHorizontal: GUTTER },

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

  // 룰러 폐기(2026-07-25) 후 히어로가 숨 쉬도록 칩 행 간격을 한 단 키운다(30+26 자리).
  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: rv(8), marginTop: rv(36) },
  preset: { minHeight: rs(36), paddingHorizontal: rs(16), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T1, 0.04), borderWidth: 1, borderColor: SEP },
  // 선택 칩 한 벌(감사 #56): 채움 withAlpha(T1,0.14) · 보더 withAlpha(T1,0.4) — 앱 공통.
  presetOn: { backgroundColor: withAlpha(T1, 0.14), borderColor: withAlpha(T1, 0.4) },
  presetText: { color: T2, fontFamily: DISPLAY, fontSize: TYPE.label.fontSize, fontWeight: '600' },
  presetTextOn: { color: ACCENT },

  // 트랙 모드 — 거리 모드와 같은 큰 숫자 위계(bigRow/bigVal/bigUnit/estimate 재사용) + 랩거리 칩.
  trackWrap: { alignItems: 'center', paddingHorizontal: rs(14) },
  trackLbl: { color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: rv(4) },
  lapChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: rv(8), marginTop: rv(36) },
  lapChip: { minWidth: rs(60), minHeight: rs(50), paddingHorizontal: rs(16), borderRadius: RADIUS.md, borderCurve: 'continuous', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T1, 0.03), borderWidth: 1, borderColor: SEP },
  lapChipOn: { backgroundColor: withAlpha(T1, 0.14), borderColor: withAlpha(T1, 0.4) },
  lapChipVal: { color: T3, fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.4 },
  lapChipValOn: { color: ACCENT },
  lapChipUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600', marginTop: rv(1) },

  // '자유' 상태 히어로 — 숫자(bigVal 104) 자리에 낱말. 높이 점프가 없게 lineHeight 동일.
  bigFree: { color: T1, fontFamily: DISPLAY, fontSize: rf(64), fontWeight: '700', letterSpacing: -1.5, lineHeight: rf(127), includeFontPadding: false },

  // 심박 가이드(#7) — 접힌 한 줄(요약+›) 기본, 탭하면 칩+힌트 펼침(2026-07-25 재구성).
  zoneRow: { paddingHorizontal: GUTTER, paddingTop: rv(2), paddingBottom: rv(10) },
  // 접힘 행 — 터치 타깃 44pt(HIG) 확보. 라벨 좌 · 셰브론 우.
  zoneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH_TARGET },
  zoneLabel: { color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600', letterSpacing: 0.3 },
  zoneSummaryVal: { color: T1 },
  zoneChevron: { color: T3, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600' },
  zoneChevronOpen: { transform: [{ rotate: '90deg' }] },
  zoneChips: { flexDirection: 'row', gap: rv(8), flexWrap: 'wrap', marginTop: rv(2) },
  zoneChip: { paddingHorizontal: rs(14), paddingVertical: rv(8), borderRadius: RADIUS.pill, borderCurve: 'continuous', backgroundColor: withAlpha(T1, 0.06), borderWidth: 1, borderColor: 'transparent' },
  zoneChipTxt: { color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '700' },
  zoneHint: { color: T3, fontFamily: FONT, fontSize: rf(12), marginTop: rv(8), letterSpacing: 0.2 },
  foot: { paddingHorizontal: GUTTER, paddingTop: rv(4) }, // 하단 여백은 insets.bottom 실측
  // 목표 직접 입력 키패드 시트(하단) — History 기간 피커와 같은 문법(SCRIM + 하단 카드).
  // 시트 표면(CARD·상단 RADIUS.xl·하단 인셋)은 BottomSheet 프리미티브가 책임진다 — 내용 여백만 남긴다.
  pickerSheet: { paddingHorizontal: rs(18), paddingTop: rv(18), gap: rv(10) },
  // 목표 직접 입력 키패드 — 시트 규약은 pickerSheet 재사용, 키만 추가.
  kpValRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: rv(6), marginBottom: rv(6), minHeight: rs(44) },
  // 방금 탭한 Jost 히어로(bigVal)와 같은 값이 시트에서 Pretendard 로 폰트가 바뀌고
  // 타이핑 중 자릿수 폭이 흔들리던 분열 해소(심사 #27) — NUM+tabular, weight 도 500 정렬.
  kpVal: { color: T1, fontFamily: NUM, fontSize: HERO.hero, fontWeight: '500', letterSpacing: -1, lineHeight: Math.round(HERO.hero * LEADING.display), includeFontPadding: false, fontVariant: ['tabular-nums'] },
  kpValGhost: { color: T3 },
  kpUnit: { color: T3, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600' },
  kpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rv(8) },
  kpKey: { width: '31.5%', flexGrow: 1, alignItems: 'center', paddingVertical: rv(12), borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: CARD_BORDER },
  kpKeyTxt: { color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '600' },
  kpOk: { marginTop: rv(6) },

  // CTA 는 단일 Button 프리미티브(그라데이션·글로우·radius 토큰). 화면 고유 레이아웃
  // (상단 여백·높이)만 style 로 넘기고 모양/그라데이션/광택은 Button 이 책임진다.
  cta: { marginTop: rv(14), height: rs(60) },
});
