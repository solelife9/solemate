// ============================================================================
// SpeedPlanPanel.tsx — 스피드 러닝 '페이스 플랜' 입력(평균 페이스 히어로 + 거리 칩 + 전략 + km별 접힘)
// 재구성(민우님 목업 승인 2026-07-25 — "같은 값, 입력은 하나"):
//   · 평균 페이스 = 히어로(다른 탭과 같은 큰 숫자 문법 — NUM·tabular) + 좌우 − + 스테퍼
//   · 히어로 아래 자동 요약 한 줄("5km · 예상 30'00\"") — 거리 × 평균 페이스
//   · 거리 = 거리 탭과 같은 칩 행(3·5·10·하프) — 스테퍼 행 폐기
//   · 전략 세그(일정/네거티브) + 힌트 캡션 유지
//   · km별 미세조정(고급) = 접힌 줄("km별 목표 조정 ›") 안에 기존 칩+± 스테퍼 그대로
// 내부 상태를 관리하고 onChange(km, plan)으로 현재 목표를 부모(RunGoalScreen)에 올린다
// — 데이터 계약은 그대로, 표현만 재구성. 라이브 코칭은 RunActiveScreen 이 plan 을 쓴다.
// ============================================================================
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {rf, rs, ri, rv} from './lib/responsive';
import {View, Pressable, ScrollView, StyleSheet, LayoutAnimation} from 'react-native';
import {Text, FONT_SCALE_CAP_HERO} from './lib/text';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  ACCENT, T1, T2, T3, SEP, CARD, CARD_HI, FONT, NUM, RADIUS, GLASS, TYPE, HERO,
  LEADING, MOTION, TOUCH_TARGET, withAlpha,
  ICON,
} from './theme';
import {SegmentedControl, SwipeBackExclude, Stepper, GlassEdge, useReduceMotion, Tap} from './primitives';
import {buildPacePlan, clampPace, fmtPaceSec, PaceStrategy} from './lib/pacePlan';

const KM_MIN = 1, KM_MAX = 42;
const clampKm = (k: number) => Math.max(KM_MIN, Math.min(KM_MAX, Math.round(k)));
// 거리 프리셋 — 거리 탭과 같은 칩 문법(기존 스피드 탭의 1~42km 범위 안). 하프=21.1
// (0.1 그리드 규약) — buildPacePlan 은 마지막 부분 구간(0.1km)을 한 칸으로 올려 담는다.
const DIST_PRESETS = [
  {label: '3km', v: 3}, {label: '5km', v: 5}, {label: '10km', v: 10}, {label: '하프', v: 21.1},
] as const;

/** 총 예상 시간(초) → 표기. 1시간 미만 = M'SS"(페이스와 같은 문법), 이상 = H:MM:SS. */
export function fmtDurSec(total: number): string {
  const t = Math.max(0, Math.round(Number.isFinite(total) ? total : 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}'${String(sec).padStart(2, '0')}"`;
}
const fmtKmLabel = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// 스텝퍼는 앱 공용 프리미티브(primitives.Stepper) — 중앙 표시만 children 으로 주입.
function PaceStepper({value, onDec, onInc, decLabel, incLabel}: {
  value: string; onDec: () => void; onInc: () => void; decLabel: string; incLabel: string;
}) {
  return (
    <Stepper size={ri(ICON.hero)} onMinus={onDec} onPlus={onInc} minusLabel={decLabel} plusLabel={incLabel} style={{gap: rv(0)}}>
      <Text style={s.stepVal}>{value}</Text>
    </Stepper>
  );
}

export default function SpeedPlanPanel({
  initialKm = 5,
  initialAvgSec = 360,
  onChange,
}: {
  initialKm?: number;
  initialAvgSec?: number;
  /** 현재 목표(거리 km, km별 페이스 배열)를 부모로 올린다. */
  onChange?: (km: number, plan: number[]) => void;
}) {
  const [km, setKm] = useState(clampKm(initialKm));
  const [avgSec, setAvgSec] = useState(clampPace(initialAvgSec));
  const [strategy, setStrategy] = useState<PaceStrategy>('negative');
  const [plan, setPlan] = useState<number[]>(() => buildPacePlan(clampKm(initialKm), clampPace(initialAvgSec), 'negative'));
  const [selIdx, setSelIdx] = useState(0);
  // km별 미세조정(고급) 접힘 — 기본 닫힘. 펼치면 기존 km 칩 + ± 스테퍼 그대로.
  const [tuneOpen, setTuneOpen] = useState(false);
  const reduceMotion = useReduceMotion();
  // custom(직접 조정) 이전의 자동 전략 — 거리 변경 시 복귀할 곳.
  const lastAuto = useRef<Exclude<PaceStrategy, 'custom'>>('negative');

  // 거리/평균/전략이 바뀌면(직접수정 custom 이 아닐 때) km별 플랜을 다시 생성한다.
  useEffect(() => {
    if (strategy === 'custom') return;
    setPlan(buildPacePlan(km, avgSec, strategy));
  }, [km, avgSec, strategy]);

  // 선택 인덱스가 플랜 길이를 넘지 않게 보정.
  useEffect(() => { if (selIdx > plan.length - 1) setSelIdx(Math.max(0, plan.length - 1)); }, [plan.length, selIdx]);

  // 현재 목표를 부모로 — km/plan 변화마다.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { onChangeRef.current?.(km, plan); }, [km, plan]);

  // km칸 직접 미세조정 → 전략 custom 전환 + 해당 구간만 ±5초.
  const editSeg = (i: number, deltaSec: number) => {
    setStrategy('custom');
    setPlan(prev => prev.map((p, j) => (j === i ? clampPace(p + deltaSec) : p)));
  };

  // 히어로 ±5초 — 평균 페이스. custom 중엔 useEffect 가 재생성을 건너뛰므로, 직접 조정한
  // 모양을 보존한 채 전 구간을 함께 밀어(±d) 히어로와 플랜이 어긋나지 않게 한다.
  const bumpAvg = (d: number) => {
    setAvgSec(v => clampPace(v + d));
    if (strategy === 'custom') setPlan(prev => prev.map(p => clampPace(p + d)));
  };

  // 거리 칩 — custom 상태에서 거리가 바뀌면 플랜 길이가 거리와 어긋난다(구 스테퍼 시절의
  // 잠복 버그) → 마지막 자동 전략으로 복귀해 새 거리로 재생성한다(근본수정).
  const pickDist = (v: number) => {
    setKm(v);
    if (strategy === 'custom') setStrategy(lastAuto.current);
  };

  const toggleTune = () => {
    // 접힘/펼침 레이아웃 전환 — 시스템 '동작 줄이기' 존중(DESIGN §6.7).
    if (!reduceMotion) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(MOTION.dur.base, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
    }
    setTuneOpen(o => !o);
  };

  // 예상 완주 시간 — 목업 문법 그대로 '거리 × 평균 페이스'. custom(km별 직접 조정) 땐
  // 평균이 플랜과 어긋나므로 플랜을 실제 구간 길이(마지막 부분 구간 포함)로 가중 합산(Truth only).
  const totalSec = useMemo(() => {
    if (strategy !== 'custom') return km * avgSec;
    return plan.reduce((acc, p, i) => acc + p * Math.max(0, Math.min(1, km - i)), 0);
  }, [strategy, km, avgSec, plan]);

  const segValue = strategy === 'custom' ? undefined : strategy;

  return (
    <View style={s.wrap} testID="speed-plan-panel">
      {/* 히어로 — 평균 페이스(다른 탭과 같은 큰 숫자 문법). − + 가 히어로 좌우. */}
      <View style={s.heroRow}>
        <Pressable
          testID="goal-pace-minus" onPress={() => bumpAvg(-5)} hitSlop={8}
          accessibilityRole="button" accessibilityLabel="평균 페이스 5초 빠르게"
          style={({pressed}) => [s.heroBtn, pressed && s.heroBtnPressed]}>
          <Ionicons name="remove" size={ri(ICON.nav)} color={T1} />
        </Pressable>
        <View style={s.heroVal} accessible accessibilityLiveRegion="polite"
          accessibilityLabel={`평균 페이스 ${fmtPaceSec(avgSec)} 매 킬로미터`}>
          <Text style={s.heroNum} maxFontSizeMultiplier={FONT_SCALE_CAP_HERO}>{fmtPaceSec(avgSec)}</Text>
          <Text style={s.heroUnit}>/km</Text>
        </View>
        <Pressable
          testID="goal-pace-plus" onPress={() => bumpAvg(+5)} hitSlop={8}
          accessibilityRole="button" accessibilityLabel="평균 페이스 5초 느리게"
          style={({pressed}) => [s.heroBtn, pressed && s.heroBtnPressed]}>
          <Ionicons name="add" size={ri(ICON.nav)} color={T1} />
        </Pressable>
      </View>
      {/* 자동 요약 — 거리 × 평균 페이스. */}
      <Text style={s.summary} testID="goal-speed-summary">
        {`${fmtKmLabel(km)}km · 예상 ${fmtDurSec(totalSec)}`}
      </Text>

      {/* 거리 — 거리 탭과 같은 칩 행(스테퍼 행 폐기). */}
      <View style={s.distChips}>
        {DIST_PRESETS.map(p => {
          const on = Math.abs(p.v - km) < 0.05;
          return (
            <Tap key={p.label} onPress={() => pickDist(p.v)} hitSlop={6}
              style={[s.preset, on && s.presetOn]} accessibilityRole="button"
              accessibilityState={{selected: on}} accessibilityLabel={`${p.label} 목표 선택`}>
              <Text style={[s.presetText, on && s.presetTextOn]}>{p.label}</Text>
            </Tap>
          );
        })}
      </View>

      {/* 전략 */}
      {/* 전략 = 목표 화면 안의 하위 설정(모드 주 탭보다 한 단계 아래 위계) → sm.
          긴 라벨('네거티브(점점 빠르게)')도 sm 글자(14)가 안전하다(필 수렴 2026-07-25). */}
      <SegmentedControl
        style={s.seg}
        size="sm"
        items={[{key: 'even', label: '일정'}, {key: 'negative', label: '네거티브(점점 빠르게)'}]}
        value={segValue as any}
        onChange={(k) => { lastAuto.current = k as Exclude<PaceStrategy, 'custom'>; setStrategy(k as PaceStrategy); }}
      />
      <Text style={s.hint}>
        {strategy === 'custom' ? 'km을 직접 조정했어요 · 전략을 누르면 다시 자동 생성' : strategy === 'negative' ? '초반은 여유 있게, 후반에 속도를 올려요' : '전 구간 같은 페이스로 일정하게'}
      </Text>

      {/* km별 미세조정(고급) — 접힌 줄. 펼치면 기존 km 칩 + ± 스테퍼 그대로. */}
      <Tap
        testID="goal-perkm-row" onPress={toggleTune} style={s.foldRow}
        accessibilityRole="button" accessibilityState={{expanded: tuneOpen}}
        accessibilityLabel="km별 목표 조정" accessibilityHint="눌러서 펼치기 또는 접기">
        <Text style={s.foldLabel}>km별 목표 조정</Text>
        <Text style={[s.foldChevron, tuneOpen && s.foldChevronOpen]}>›</Text>
      </Tap>
      {tuneOpen && (
        <>
          {/* km별 목표 칩 — 탭해서 선택 후 ±5초 미세조정. SwipeBackExclude: 가로 칩
              스크롤이 왼쪽 엣지와 겹쳐 엣지 스와이프 백에 오인되는 것 방지. */}
          <SwipeBackExclude>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {plan.map((p, i) => {
              const on = i === selIdx;
              return (
                <Tap key={i} onPress={() => setSelIdx(i)} accessibilityRole="button"
                  accessibilityState={{selected: on}} accessibilityLabel={`${i + 1}킬로미터 목표 ${fmtPaceSec(p)}`}
                  testID={`plan-km-${i + 1}`} style={[s.kmChip, on && s.kmChipOn]}>
                  <Text style={[s.kmChipNum, on && s.kmChipNumOn]}>{i + 1}km</Text>
                  <Text style={[s.kmChipPace, on && s.kmChipPaceOn]}>{fmtPaceSec(p)}</Text>
                </Tap>
              );
            })}
          </ScrollView>
          </SwipeBackExclude>

          {/* 선택 구간 미세조정 */}
          <View style={[s.row, s.tuneRow]}>
            <GlassEdge glints={false} radius={RADIUS.lg} />
            <Text style={s.rowLabel}>{selIdx + 1}km 목표</Text>
            <PaceStepper
              value={`${fmtPaceSec(plan[selIdx])} /km`}
              onDec={() => editSeg(selIdx, -5)} onInc={() => editSeg(selIdx, +5)}
              decLabel={`${selIdx + 1}킬로미터 목표 5초 빠르게`} incLabel={`${selIdx + 1}킬로미터 목표 5초 느리게`}
            />
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {width: '100%', gap: rv(12)},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},

  // 히어로 — 평균 페이스 큰 숫자(NUM·tabular, 거리 탭 bigVal 과 같은 규율의 축소판)
  // 좌우에 − + 버튼(공용 Stepper 버튼 문법: size²·RADIUS.input·CARD_HI, 44pt 터치 타깃).
  heroRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(4)},
  heroBtn: {width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: RADIUS.input, borderCurve: 'continuous', backgroundColor: CARD_HI, alignItems: 'center', justifyContent: 'center'},
  heroBtnPressed: {backgroundColor: CARD},
  heroVal: {flexDirection: 'row', alignItems: 'baseline'},
  heroNum: {color: T1, fontFamily: NUM, fontSize: HERO.heroLg, fontWeight: '500', letterSpacing: -1, lineHeight: Math.round(HERO.heroLg * LEADING.display), includeFontPadding: false, fontVariant: ['tabular-nums']},
  heroUnit: {color: T2, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600', marginLeft: rs(6)},
  // 자동 요약 — 거리 탭 estimate 와 같은 위계(T3 캡션).
  summary: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'], marginTop: rv(-4)},

  // 거리 칩 — RunGoalScreen 프리셋 칩과 동일 문법(선택 칩 한 벌, 감사 #56).
  distChips: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: rv(8)},
  preset: {minHeight: rs(36), paddingHorizontal: rs(16), borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(T1, 0.04), borderWidth: 1, borderColor: SEP},
  presetOn: {backgroundColor: withAlpha(T1, 0.14), borderColor: withAlpha(T1, 0.4)},
  presetText: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '600'},
  presetTextOn: {color: ACCENT},

  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  // 불투명 CARD 판 → 반투명 유리(GLASS.fill) — GlassEdge 와 재질 일치(검수 잔여, 2026-07-17).
  tuneRow: {backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingHorizontal: rs(16), paddingVertical: rv(12)},
  rowLabel: {color: T2, fontFamily: FONT, fontSize: rf(15), fontWeight: '600'},
  stepVal: {color: T1, fontFamily: FONT, fontSize: rf(18), fontWeight: '700', minWidth: rs(92), textAlign: 'center', fontVariant: ['tabular-nums']},
  seg: {marginTop: rv(2)},
  hint: {color: T3, fontFamily: FONT, fontSize: rf(13), lineHeight: rf(17), marginTop: rv(-4)},

  // km별 미세조정 접힘 행 — 터치 타깃 44pt(HIG).
  foldRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH_TARGET, paddingHorizontal: rs(2)},
  foldLabel: {color: T2, fontFamily: FONT, fontSize: rf(15), fontWeight: '600'},
  foldChevron: {color: T3, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '600'},
  foldChevronOpen: {transform: [{rotate: '90deg'}]},

  chips: {gap: rv(8), paddingVertical: rv(2), paddingRight: rs(4)},
  // 선택 칩 한 벌(감사 #56): 유리 문법 — 불투명 CARD 베이스 폐지, 투명 위 흰 알파 채움.
  // 채움 withAlpha(T1,0.14) · 보더 withAlpha(T1,0.4) — RunGoal 프리셋/랩 칩과 동일.
  kmChip: {minWidth: rs(58), alignItems: 'center', paddingVertical: rv(8), paddingHorizontal: rs(12), borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: withAlpha(T1, 0.04), borderWidth: 1, borderColor: SEP},
  kmChipOn: {backgroundColor: withAlpha(T1, 0.14), borderColor: withAlpha(T1, 0.4)},
  kmChipNum: {color: T3, fontFamily: FONT, fontSize: rf(12), fontWeight: '700'},
  kmChipNumOn: {color: ACCENT},
  kmChipPace: {color: T1, fontFamily: FONT, fontSize: rf(15), fontWeight: '700', marginTop: rv(2), fontVariant: ['tabular-nums']},
  kmChipPaceOn: {color: ACCENT},
});
