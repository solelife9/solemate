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
import {
  View, Text, Pressable, ScrollView, StyleSheet, Modal,
  LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent, StatusBar,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
// 색·폰트는 전역 디자인 토큰(theme.ts)만 참조한다 — 사설 색객체(const C) 폐기.
// 매핑: bg→BG · surface→CARD · accent→ACCENT · sage→GOOD · amber→WARN · red→DANGER
// · text→T1–T4 · hair→SEP · 그라데이션→GRAD_TOP/GRAD_BOT. 폰트 UI/DP → FONT/DISPLAY.
// (시각 동등: 다크+오렌지 유지)
import {
  BG, CARD, HERO_BG, ACCENT, GOOD, WARN, DANGER, T1, T2, T3, T4, SEP, CARD_BORDER,
  FONT, DISPLAY, RADIUS, SCRIM, withAlpha, type Shoe,
} from './theme';
// lib/haptics 배선: '러닝 시작' CTA(런 시작) → tap.
import { tap } from './lib/haptics';
// CTA 는 앱 전역 단일 Button 프리미티브(그라데이션 GRAD_TOP/BOT·글로우·radius 토큰).
// 모드 탭 스트립은 SegmentedControl 단일 프리미티브(accentTint variant).
import { Button, SegmentedControl, SwipeBack, SwipeBackExclude, ShoeGlyph } from './primitives';
import { wearTier } from './lib/shoe';
import { ringColor } from './lib/ringColor';
import SpeedPlanPanel from './SpeedPlanPanel';
import { buildPacePlan } from './lib/pacePlan';

// ── SVG 아이콘(자체 그림 — vector-icons 의존 제거) ───────────────────────────
function Icon({ name, size = 22, color = T2, fill }: { name: string; size?: number; color?: string; fill?: string }) {
  const sw = 2;
  const p: Record<string, React.ReactNode> = {
    back: <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    forward: <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    play: <Path d="M7 5v14l11-7z" fill={fill || color} />,
    infinite: <Path d="M6 12c0-2.2 1.6-4 3.7-4 1.6 0 2.6 1 3.3 2 .7 1 1.7 2 3.3 2 2.1 0 3.7-1.8 3.7-4s-1.6-4-3.7-4c-1.6 0-2.6 1-3.3 2-.7 1-1.7 2-3.3 2-2.1 0-3.7-1.8-3.7-4" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    // 트랙(운동장) — 스타디움 형태의 이중 타원(바깥 트랙 + 안쪽 레인).
    track: <><Path d="M8 6h8a6 6 0 0 1 0 12H8a6 6 0 0 1 0-12z" stroke={color} strokeWidth={sw} fill="none" /><Path d="M9 9h7a3 3 0 0 1 0 6H9a3 3 0 0 1 0-6z" stroke={color} strokeWidth={sw - 0.4} fill="none" opacity={0.5} /></>,
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24">{p[name]}</Svg>;
}


type Mode = 'km' | 'min' | 'speed' | 'track';
/** 러닝 목표 — 거리(km)/시간(분)/스피드(km별 페이스 플랜)/트랙(운동장 랩). 0/빈배열/null은 미설정.
 *  track: 트랙 모드 = 한 바퀴 예상 거리(m)만 정한다. 실제 랩거리는 런 중 첫 랩 GPS로 자동 보정
 *  (snapLapDistance) — 이 값은 기본값·실내(GPS✗) 폴백. km/durationMin 은 트랙에선 0(자유). */
export type RunGoal = { km: number; durationMin: number; pacePlan: number[]; track?: { lapM: number } | null };
/** 트랙 한 바퀴 예상 거리 선택지(m) — 야외 400(공인)·트랙 300·실내 200 + 커스텀. */
const LAP_PRESETS = [200, 300, 400] as const;
const CFG: Record<'km' | 'min', { min: number; max: number; step: number; major: number; minor: number; px: number; unit: string; def: number; presets: { label: string; v: number }[] }> = {
  km:  { min: 0, max: 42, step: 0.1, major: 1, minor: 0.2, px: 64, unit: 'km', def: 5,  presets: [{ label: '3km', v: 3 }, { label: '5km', v: 5 }, { label: '10km', v: 10 }, { label: '하프', v: 21.1 }] },
  min: { min: 0, max: 180, step: 1, major: 10, minor: 1, px: 6.2, unit: '분', def: 30, presets: [{ label: '20분', v: 20 }, { label: '30분', v: 30 }, { label: '45분', v: 45 }, { label: '60분', v: 60 }] },
};

export default function RunGoalScreen({
  shoeBrand = 'NIKE', shoeLabel = 'Alphafly 3', shoeCondition = '양호', remainKm = 382,
  shoes, selectedShoeId, onChangeShoe,
  onBack, onStart,
}: {
  shoeBrand?: string; shoeLabel?: string; shoeCondition?: '양호' | '주의' | '교체'; remainKm?: number;
  /** 활성 신발 목록 — 주어지고 2켤레 이상이면 신발 행 탭으로 여기서 바로 바꿀 수 있다
      (런 시작 = 선택 확정 지점이므로 이 화면이 마지막 교정 기회). 미주입이면 표시 전용. */
  shoes?: Shoe[];
  selectedShoeId?: string | null;
  onChangeShoe?: (id: string) => void;
  onBack?: () => void; onStart?: (goal: RunGoal) => void;
}) {
  const [mode, setMode] = useState<Mode>('km');
  // 신발 전환 시트 — 신발 행(하단) 탭으로 연다.
  const [shoePickerOpen, setShoePickerOpen] = useState(false);
  const switchable = !!onChangeShoe && !!shoes && shoes.filter(sh => sh.id).length > 1;
  const [val, setVal] = useState<number>(CFG.km.def);
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
    if (!cfg) return ''; // 스피드 모드는 SpeedPlanPanel 이 자체 표시 — estimate 미사용
    if (val <= 0) return '목표를 정해주세요';
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
    // (예: 30분인데 180)로 클램프됐다. 스피드 모드는 룰러 대신 SpeedPlanPanel 을 쓴다.
    if (m === 'km' || m === 'min') {
      const c = CFG[m]; const d = c.def;
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
    const clamped = Math.max(c.min, Math.min(c.max, v));
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
  // 신발 상태 — 홈 히어로와 동일한 4단계 wearTier(사용률%)가 단일 진실원(2026-07-04).
  // 이전엔 3단계 condition('양호'…)을 그대로 보여 홈은 '최상'인데 여기선 '양호'로
  // 어긋났다. 선택 신발의 used/max 로 홈과 같은 라벨·색을 파생하고, 신발 목록이 없는
  // standalone 렌더에서만 legacy condition 으로 폴백한다.
  const selShoe = (shoes ?? []).find(sh => sh.id === selectedShoeId);
  const selPct = selShoe && selShoe.max > 0 ? (selShoe.used / selShoe.max) * 100 : null;
  const selTier = selPct != null ? wearTier(selPct) : null;
  const condLabel = selTier ? selTier.label : shoeCondition;
  // 점 색 = 홈 히어로와 동일한 연속 색(ringColor.to — 새 신발일수록 파랑). 이산 톤
  // (GOOD 초록)을 쓰면 홈 '최상' 파란 점과 어긋난다(사용자 지적 2026-07-04).
  const condColor = selPct != null
    ? ringColor(selPct).to
    : shoeCondition === '교체' ? DANGER : shoeCondition === '주의' ? WARN : GOOD;
  const half = vpW / 2;
  // 런 시작: 햅틱(tap) → onStart(RunGoal). 거리/시간/스피드(km별 페이스 플랜)로 분기.
  const startRun = () => {
    tap();
    const goal: RunGoal =
      mode === 'km' ? { km: val, durationMin: 0, pacePlan: [] }
        : mode === 'min' ? { km: 0, durationMin: val, pacePlan: [] }
          : mode === 'track' ? { km: 0, durationMin: 0, pacePlan: [], track: { lapM } }
            : { km: speedGoal.km, durationMin: 0, pacePlan: speedGoal.plan };
    onStart?.(goal);
  };

  return (
    // 엣지 스와이프 백 — 러닝 '전' 화면이라 잃을 입력이 없고 뒤로 버튼과 동일 동작.
    // 가장자리 24pt 에서만 캡처하므로 중앙의 눈금 룰러 가로 드래그와 충돌하지 않는다.
    <SwipeBack onBack={onBack}>
    <View style={s.screen}>
      <StatusBar barStyle="light-content" />
      {/* nav */}
      <View style={s.nav}>
        <Pressable onPress={onBack} hitSlop={8} style={s.navIc} accessibilityRole="button" accessibilityLabel="뒤로"><Icon name="back" size={24} color={T2} /></Pressable>
        <Text style={s.navTitle}>러닝 목표</Text>
        <View style={s.navIc} />
      </View>

      {/* segmented — 모드 탭 스트립(SegmentedControl accentTint) */}
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
          // 트랙 모드 — 한 바퀴 예상 거리(m)를 칩으로 고른다. 야외선 첫 랩 GPS 가 이 값을
          // 실제 랩거리로 자동 보정하므로 '예상치'로 충분하고, 실내(GPS✗)에선 이 값이 확정.
          <View style={s.trackWrap}>
            <View style={s.trackGlyph}><Icon name="track" size={40} color={ACCENT} /></View>
            <Text style={s.trackTitle}>트랙에서 달리기</Text>
            <Text style={s.trackSub}>한 바퀴 거리를 정해요{'\n'}야외에선 첫 바퀴를 GPS로 자동 보정해요</Text>
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
              accessibilityLabel={`목표 ${fmt(val)} ${cfg!.unit}`}
              accessibilityHint="눌러서 직접 입력"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                const m = mode === 'min' ? 'min' : 'km';
                const d = e.nativeEvent.actionName === 'increment' ? CFG[m].step : -CFG[m].step;
                const v = clampToCfg(m, val + d);
                setVal(v); scrollToVal(v, false);
              }}>
              <Text style={s.bigVal}>{fmt(val)}</Text>
              <Text style={s.bigUnit}>{cfg!.unit}</Text>
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
                <View style={{ width: cfg!.max * cfg!.px, height: 78 }}>
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
                  <Pressable key={p.label} onPress={() => pickPreset(p.v)} style={[s.preset, on && s.presetOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${p.label} 목표 선택`}>
                    <Text style={[s.presetText, on && s.presetTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* footer — 신발 행: 2켤레 이상이면 탭해서 여기서 바로 신발을 바꾼다(마지막 교정 기회).
          1켤레거나 미배선이면 표시 전용(화살표도 숨김 — 죽은 어포던스 금지). */}
      <View style={s.foot}>
        <Pressable
          style={s.shoeSel}
          onPress={switchable ? () => setShoePickerOpen(true) : undefined}
          accessibilityRole="button"
          accessibilityLabel={`신발 선택: ${shoeBrand} ${shoeLabel}, 상태 ${condLabel}${remainKm != null ? `, 남은 수명 ${Math.round(remainKm)}킬로미터` : ''}${switchable ? ', 탭하면 다른 신발로 변경' : ''}`}>
          <View style={s.shoeThumb}><ShoeGlyph color={T2} size={24} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.shoeBrand}>{shoeBrand}</Text>
            <Text style={s.shoeModel} numberOfLines={1}>{shoeLabel}</Text>
            <View style={s.shoeCond}>
              <View style={[s.shoeDot, { backgroundColor: condColor }]} />
              <Text style={s.shoeCondText}>{condLabel}{remainKm != null ? ` · 남은 수명 ${Math.round(remainKm)}km` : ''}</Text>
            </View>
          </View>
          {switchable && <Icon name="forward" size={20} color={T4} />}
        </Pressable>

        {/* 목표 직접 입력 키패드(2026-07-04) — 큰 숫자 탭으로 연다. 신발 시트와 동일한
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

        {/* 신발 전환 시트 */}
        <Modal visible={shoePickerOpen} transparent animationType="slide" onRequestClose={() => setShoePickerOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: SCRIM }} onPress={() => setShoePickerOpen(false)} accessibilityRole="button" accessibilityLabel="신발 선택 닫기" />
          <View style={s.pickerSheet}>
            <Text style={s.pickerTitle}>오늘 신을 신발</Text>
            {(shoes ?? []).filter(sh => sh.id).map(sh => {
              const on = sh.id === selectedShoeId;
              const remain = Math.max(0, sh.max - sh.used);
              return (
                <Pressable
                  key={sh.id}
                  onPress={() => { onChangeShoe?.(sh.id as string); setShoePickerOpen(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${sh.brand} ${sh.model}로 변경`}
                  testID={`goal-shoe-${sh.id}`}
                  style={({ pressed }) => [s.pickerRow, on && s.pickerRowOn, pressed && { opacity: 0.8 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.pickerBrand}>{sh.brand}</Text>
                    <Text style={s.pickerModel} numberOfLines={1}>{sh.model}</Text>
                  </View>
                  <View style={s.pickerMeta}>
                    <View style={[s.shoeDot, { backgroundColor: ringColor(sh.max > 0 ? (sh.used / sh.max) * 100 : 0).to }]} />
                    <Text style={s.pickerRemain}>{Math.round(remain)}km 남음</Text>
                  </View>
                  {on ? <Text style={s.pickerCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Modal>

        <Button
          label="러닝 시작"
          onPress={startRun}
          // startRun 이 직접 tap() 을 울리므로 공용 버튼 햅틱은 끈다(중복 방지).
          haptic={false}
          iconNode={<Icon name="play" size={22} color={T1} fill={T1} />}
          style={s.cta}
        />
      </View>
    </View>
    </SwipeBack>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, paddingTop: 54 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 44 },
  navIc: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: T1, fontFamily: DISPLAY, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },

  // 컨테이너 표면(배경/보더/반경/패딩)은 SegmentedControl accentTint variant 가 책임진다.
  // 화면 고유 레이아웃(좌우·상단 여백)만 남긴다(과거 segBtn/On·segText/On 제거).
  seg: { marginHorizontal: 22, marginTop: 14 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end' },
  bigVal: { color: T1, fontFamily: DISPLAY, fontSize: 104, fontWeight: '600', letterSpacing: -3, lineHeight: 104, includeFontPadding: false },
  bigUnit: { color: T2, fontFamily: FONT, fontSize: 26, fontWeight: '600', marginLeft: 8, marginBottom: 12 },
  estimate: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 14 },

  rulerWrap: { width: '100%', height: 78, marginTop: 30, position: 'relative' },
  tick: { position: 'absolute', bottom: 26, width: 2, borderRadius: 2 },
  tickMinor: { height: 14, backgroundColor: withAlpha(T1, 0.18) },
  tickMajor: { height: 26, backgroundColor: withAlpha(T1, 0.38) },
  tickLabel: { position: 'absolute', bottom: 2, width: 28, textAlign: 'center', color: T3, fontFamily: DISPLAY, fontSize: 12, fontWeight: '500' },
  pointer: { position: 'absolute', left: '50%', marginLeft: -1.5, top: 2, bottom: 24, width: 3, borderRadius: 3, backgroundColor: ACCENT },

  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 26 },
  preset: { height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T1, 0.04), borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  presetOn: { backgroundColor: withAlpha(ACCENT, 0.14), borderColor: withAlpha(ACCENT, 0.4) },
  presetText: { color: T2, fontFamily: DISPLAY, fontSize: 13, fontWeight: '600' },
  presetTextOn: { color: ACCENT },

  // 트랙 모드 — 자유 모드와 같은 중앙 정렬 문법 + 랩거리 칩.
  trackWrap: { alignItems: 'center', paddingHorizontal: 14 },
  trackGlyph: { width: 88, height: 88, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.1), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.26), marginBottom: 22 },
  trackTitle: { color: T1, fontFamily: DISPLAY, fontSize: 24, fontWeight: '600', letterSpacing: -0.4, marginBottom: 10 },
  trackSub: { color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center', maxWidth: 280, marginBottom: 26 },
  lapChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  lapChip: { minWidth: 74, height: 60, paddingHorizontal: 16, borderRadius: RADIUS.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2, backgroundColor: withAlpha(T1, 0.04), borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  lapChipOn: { backgroundColor: withAlpha(ACCENT, 0.14), borderColor: withAlpha(ACCENT, 0.45) },
  lapChipVal: { color: T2, fontFamily: DISPLAY, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  lapChipValOn: { color: ACCENT },
  lapChipUnit: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600' },

  free: { alignItems: 'center', paddingHorizontal: 14 },
  freeGlyph: { width: 88, height: 88, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.1), borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ACCENT, 0.26), marginBottom: 22 },
  freeTitle: { color: T1, fontFamily: DISPLAY, fontSize: 24, fontWeight: '600', letterSpacing: -0.4, marginBottom: 10 },
  freeSub: { color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center', maxWidth: 250 },

  foot: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 30 },
  shoeSel: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: RADIUS.lg, borderCurve: 'continuous', backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER },
  // 신발 전환 시트(하단) — History 기간 피커와 같은 문법(SCRIM + 하단 카드).
  pickerSheet: { backgroundColor: CARD, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderCurve: 'continuous', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 10 },
  // 목표 직접 입력 키패드 — 시트 규약은 pickerSheet 재사용, 키만 추가.
  kpValRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 6, minHeight: 44 },
  kpVal: { color: T1, fontFamily: DISPLAY, fontSize: 40, fontWeight: '600', letterSpacing: -1 },
  kpValGhost: { color: T4 },
  kpUnit: { color: T3, fontFamily: FONT, fontSize: 16, fontWeight: '600' },
  kpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpKey: { width: '31.5%', flexGrow: 1, alignItems: 'center', paddingVertical: 13, borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: CARD_BORDER },
  kpKeyTxt: { color: T1, fontFamily: DISPLAY, fontSize: 21, fontWeight: '600' },
  kpOk: { marginTop: 6 },
  pickerTitle: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginBottom: 4 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: RADIUS.lg, borderCurve: 'continuous', backgroundColor: withAlpha(T1, 0.04), borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER },
  pickerRowOn: { backgroundColor: withAlpha(T1, 0.09), borderColor: withAlpha(T1, 0.2) },
  pickerBrand: { color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  pickerModel: { color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginTop: 1 },
  pickerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerRemain: { color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500' },
  pickerCheck: { color: T1, fontFamily: FONT, fontSize: 16, fontWeight: '700', marginLeft: 2 },
  shoeThumb: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: HERO_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP },
  shoeBrand: { color: T3, fontFamily: DISPLAY, fontSize: 10, fontWeight: '600', letterSpacing: 1.4 },
  shoeModel: { color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, marginTop: 2 },
  shoeCond: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  shoeDot: { width: 6, height: 6, borderRadius: 999 },
  shoeCondText: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },

  // CTA 는 단일 Button 프리미티브(그라데이션·글로우·radius 토큰). 화면 고유 레이아웃
  // (상단 여백·높이)만 style 로 넘기고 모양/그라데이션/광택은 Button 이 책임진다.
  cta: { marginTop: 14, height: 60 },
});
