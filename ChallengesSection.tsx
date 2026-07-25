// ============================================================================
// ChallengesSection.tsx — 주간 목표 스테퍼(홈 '주간 목표' 바텀시트 본문)
//
// 개편(2026-07-25 민우님 홈 B안 확정): 마이 탭 '주간 목표 카드'(구 SmartChallengeCard)는
// 폐지 — 주간 목표의 수정 경로가 홈 '이번 주 러닝' 카드 히어로 탭 → 바텀시트로 이관됐다.
// 이 파일은 그 시트가 재사용하는 스테퍼 UI 만 보존한다(구 카드·진행 링·스마트 추천
// 렌더는 죽은 코드라 제거 — 스마트 추천 산식 자체는 lib/progression/challengesExt 유지).
// 값의 단일 진실원은 App 의 settings.goalWeeklyKm(changeGoal) — 여기는 표시+위임 전용.
// ============================================================================
import React from 'react';
import {ri, rv} from './lib/responsive';
import {View, StyleSheet} from 'react-native';
import {Text} from './lib/text';
import {T1, T2, T3, FONT, DISPLAY, TYPE, NUMERIC} from './theme';
import {Stepper} from './primitives';
import {DEFAULT_SETTINGS} from './lib/settings';
import type {Unit} from './lib/units';

// 주간 목표 거리 스텝(km) — 구 카드 스테퍼의 보폭 그대로(±1km).
export const GOAL_KM_STEP = 1;

// 주간 목표 스테퍼 — 현재값 큰 숫자(NUMERIC.lg) + ±. 0 = '목표 없음' 상태:
// 1km 에서 −를 누르면 목표 없음이 되고, 목표 없음에서 ＋를 누르면 기본 목표
// (DEFAULT_SETTINGS.goalWeeklyKm)에서 다시 시작한다(0→1부터 수십 번 탭 강요 금지).
export function WeeklyGoalStepper({
  valueKm,
  unit = 'km',
  onChange,
}: {
  /** 현재 주간 목표(km). 0 = 목표 없음. */
  valueKm: number;
  unit?: Unit;
  /** 변경 위임 — App 의 changeGoal(단일 진실원)로 배선한다. */
  onChange: (km: number) => void;
}) {
  const dec = () => onChange(Math.max(0, valueKm - GOAL_KM_STEP));
  const inc = () => onChange(valueKm > 0 ? valueKm + GOAL_KM_STEP : DEFAULT_SETTINGS.goalWeeklyKm);
  return (
    <View style={s.wrap} testID="weekly-goal-stepper">
      <Stepper
        size={ri(44)}
        minusLabel="목표 거리 줄이기"
        plusLabel="목표 거리 늘리기"
        onMinus={dec}
        onPlus={inc}>
        <View style={s.center} accessible accessibilityLabel={valueKm > 0 ? `주간 목표 ${valueKm}${unit}` : '주간 목표 없음'}>
          {valueKm > 0 ? (
            <Text style={s.val} testID="weekly-goal-value">
              {valueKm}
              <Text style={s.unit}> {unit}</Text>
            </Text>
          ) : (
            <Text style={s.none} testID="weekly-goal-none">목표 없음</Text>
          )}
        </View>
      </Stepper>
    </View>
  );
}

export default WeeklyGoalStepper;

const s = StyleSheet.create({
  wrap: {paddingVertical: rv(8)},
  center: {flex: 1, alignItems: 'center'},
  // 값 = NUMERIC.lg(숫자 단일 램프) · Jost · tabular-nums — 시트 히어로 숫자.
  val: {color: T1, fontFamily: DISPLAY, ...NUMERIC.lg, fontVariant: ['tabular-nums']},
  unit: {color: T3, fontFamily: FONT, ...TYPE.label, fontWeight: '600'},
  // 목표 없음 — 숫자 자리의 조용한 상태 워드(강조 아님).
  none: {color: T2, fontFamily: FONT, ...TYPE.heading, fontWeight: '600'},
});
