// ============================================================================
// InjuryRiskScreen.rn.tsx — 부상위험 상세 풀스크린 셸 (홈 신호등 카드 → 탭)
// 순수 프레젠테이션 InjuryRiskDetail(신발 마모 × 훈련 부하 융합 + 코칭)을 뒤로가기
// 헤더가 달린 전체화면으로 감싼다. 데이터 생성 0 — App 이 runs/활성 신발만 주입한다.
// 다른 오버레이(ShoeArchiveScreen/HallOfShoes)와 동일한 셸 패턴(SafeArea + nav).
// ============================================================================
import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, T1, FONT} from './theme';
import InjuryRiskDetail from './InjuryRiskDetail';
import type {LoadRun} from './lib/trainingLoad';

export default function InjuryRiskScreen({
  runs = [],
  shoe,
  todayISO,
  onBack,
}: {
  /** 전체 런 — 훈련 부하(ACWR) 계산용. App 의 raw runs(run_date/km/duration) 호환. */
  runs?: LoadRun[];
  /** 활성(히어로) 신발의 used·max(km). 없으면 부하만으로 판정. */
  shoe?: {used?: number; max?: number};
  todayISO?: string;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, {paddingTop: insets.top}]} testID="injury-risk-screen">
      <View style={s.nav}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}>
          <Ionicons name="chevron-back" size={20} color={T1} />
        </Pressable>
        <Text style={s.title}>부상위험</Text>
        <View style={{width: 36}} />
      </View>
      <View style={s.body}>
        <InjuryRiskDetail runs={runs} shoe={shoe} todayISO={todayISO} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  nav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10},
  iconBtn: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
  title: {color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '700', letterSpacing: -0.3},
  body: {flex: 1, paddingHorizontal: 14, paddingBottom: 10},
});
