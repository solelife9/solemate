// ============================================================================
// SpeedPlanPanel.tsx — 스피드 러닝 '페이스 플랜' 입력(거리 + 평균 페이스 + 전략 + km별 미세조정)
// 거리(정수 km)와 평균 목표 페이스를 정하고 전략(일정/네거티브)으로 km별 목표 페이스를
// 자동 생성한다. km 칩을 탭해 ±5초로 직접 미세조정하면 전략이 custom 으로 바뀐다.
// 내부 상태를 관리하고 onChange(km, plan)으로 현재 목표를 부모(RunGoalScreen)에 올린다.
// 라이브 코칭은 RunActiveScreen 이 plan 으로 현재 km 목표 대비 빠름/느림을 보여준다.
// ============================================================================
import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Pressable, ScrollView, StyleSheet} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {ACCENT, CARD, CARD_HI, T1, T2, T3, T4, SEP, FONT, RADIUS, withAlpha} from './theme';
import {SegmentedControl} from './primitives';
import {buildPacePlan, clampPace, fmtPaceSec, PaceStrategy} from './lib/pacePlan';

const KM_MIN = 1, KM_MAX = 42;
const clampKm = (k: number) => Math.max(KM_MIN, Math.min(KM_MAX, Math.round(k)));

function Stepper({value, onDec, onInc, decLabel, incLabel}: {
  value: string; onDec: () => void; onInc: () => void; decLabel: string; incLabel: string;
}) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={onDec} hitSlop={8} accessibilityRole="button" accessibilityLabel={decLabel} style={({pressed}) => [s.stepBtn, pressed && s.stepBtnOn]}>
        <Ionicons name="remove" size={20} color={T1} />
      </Pressable>
      <Text style={s.stepVal}>{value}</Text>
      <Pressable onPress={onInc} hitSlop={8} accessibilityRole="button" accessibilityLabel={incLabel} style={({pressed}) => [s.stepBtn, pressed && s.stepBtnOn]}>
        <Ionicons name="add" size={20} color={T1} />
      </Pressable>
    </View>
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

  const segValue = strategy === 'custom' ? undefined : strategy;

  return (
    <View style={s.wrap} testID="speed-plan-panel">
      {/* 거리 */}
      <View style={s.row}>
        <Text style={s.rowLabel}>거리</Text>
        <Stepper
          value={`${km} km`}
          onDec={() => setKm(k => clampKm(k - 1))} onInc={() => setKm(k => clampKm(k + 1))}
          decLabel="거리 1킬로미터 줄이기" incLabel="거리 1킬로미터 늘리기"
        />
      </View>
      {/* 평균 페이스 */}
      <View style={s.row}>
        <Text style={s.rowLabel}>평균 페이스</Text>
        <Stepper
          value={`${fmtPaceSec(avgSec)} /km`}
          onDec={() => setAvgSec(v => clampPace(v - 5))} onInc={() => setAvgSec(v => clampPace(v + 5))}
          decLabel="평균 페이스 5초 빠르게" incLabel="평균 페이스 5초 느리게"
        />
      </View>
      {/* 전략 */}
      <SegmentedControl
        style={s.seg}
        variant="accentTint"
        items={[{key: 'even', label: '일정'}, {key: 'negative', label: '네거티브(점점 빠르게)'}]}
        value={segValue as any}
        onChange={(k) => setStrategy(k as PaceStrategy)}
      />
      <Text style={s.hint}>
        {strategy === 'custom' ? 'km을 직접 조정했어요 · 전략을 누르면 다시 자동 생성' : strategy === 'negative' ? '초반은 여유 있게, 후반에 속도를 올려요' : '전 구간 같은 페이스로 일정하게'}
      </Text>

      {/* km별 목표 칩 — 탭해서 선택 후 ±5초 미세조정 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {plan.map((p, i) => {
          const on = i === selIdx;
          return (
            <Pressable key={i} onPress={() => setSelIdx(i)} accessibilityRole="button"
              accessibilityState={{selected: on}} accessibilityLabel={`${i + 1}킬로미터 목표 ${fmtPaceSec(p)}`}
              testID={`plan-km-${i + 1}`} style={[s.kmChip, on && s.kmChipOn]}>
              <Text style={[s.kmChipNum, on && s.kmChipNumOn]}>{i + 1}km</Text>
              <Text style={[s.kmChipPace, on && s.kmChipPaceOn]}>{fmtPaceSec(p)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 선택 구간 미세조정 */}
      <View style={[s.row, s.tuneRow]}>
        <Text style={s.rowLabel}>{selIdx + 1}km 목표</Text>
        <Stepper
          value={`${fmtPaceSec(plan[selIdx])} /km`}
          onDec={() => editSeg(selIdx, -5)} onInc={() => editSeg(selIdx, +5)}
          decLabel={`${selIdx + 1}킬로미터 목표 5초 빠르게`} incLabel={`${selIdx + 1}킬로미터 목표 5초 느리게`}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {width: '100%', gap: 12},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  tuneRow: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingHorizontal: 16, paddingVertical: 12},
  rowLabel: {color: T2, fontFamily: FONT, fontSize: 14, fontWeight: '600'},
  stepper: {flexDirection: 'row', alignItems: 'center', gap: 14},
  stepBtn: {width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD_HI, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  stepBtnOn: {backgroundColor: withAlpha(ACCENT, 0.16)},
  stepVal: {color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '700', minWidth: 92, textAlign: 'center'},
  seg: {marginTop: 2},
  hint: {color: T3, fontFamily: FONT, fontSize: 12, lineHeight: 17, marginTop: -4},
  chips: {gap: 8, paddingVertical: 2, paddingRight: 4},
  kmChip: {minWidth: 58, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderRadius: RADIUS.md, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  kmChipOn: {backgroundColor: withAlpha(ACCENT, 0.14), borderColor: withAlpha(ACCENT, 0.5)},
  kmChipNum: {color: T4, fontFamily: FONT, fontSize: 11, fontWeight: '700'},
  kmChipNumOn: {color: ACCENT},
  kmChipPace: {color: T1, fontFamily: FONT, fontSize: 14, fontWeight: '700', marginTop: 2},
  kmChipPaceOn: {color: ACCENT},
});
