// ============================================================================
// FitnessCard.tsx — 심폐 체력(VO2max) 카드.
// 애널리틱스 다이어트(2026-07-05): '오늘 컨디션(TSB)'·'체력 추이(CTL 그래프)'는 홈
// 부상위험과 중복되거나 일반 러너가 못 읽어(만든 사람도 이해 못 함) 제거했다. 러너가
// '알아보고 원하는' 성취 지표 — VO2max 하나만, 큰 숫자 + 등급 + 이해되는 한 줄로.
// (가민 'VO2max'·애플 '심폐 체력'과 같은 개념. 타임 있는 노력 런 없으면 숨긴다.)
// ============================================================================
import React, { useMemo } from 'react';
import { rf, rs, rv } from './lib/responsive';
import { View, Text, StyleSheet } from 'react-native';
import { CARD, CARD_BORDER, ACCENT, T1, T3, T4, FONT, DISPLAY, RADIUS } from './theme';
import { fitnessSummary } from './lib/analytics/fitness';

export function FitnessCard({ runs = [], todayISO, style }: { runs?: any[]; todayISO: string; style?: any }) {
  const fitness = useMemo(
    () => fitnessSummary(
      (Array.isArray(runs) ? runs : []).map((r) => ({
        km: (r?.km ?? r?.dist),
        durationS: (r?.duration ?? r?.durationS),
        runDate: String(r?.run_date || r?.runDate || ''),
      })),
      todayISO,
    ),
    // runs 식별(길이+마지막 키)로 캐시 무효화 — 매 렌더 깊은 비교 회피.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs.length, runs[runs.length - 1]?.id, todayISO],
  );

  // 타임 있는 노력 런이 하나도 없으면 VDOT 가 안 서므로 숨긴다.
  if (fitness.vo2max <= 0) return null;

  return (
    <View
      style={[st.card, style]}
      accessible
      accessibilityLabel={`심폐 체력. VO2max ${fitness.vo2max.toFixed(1)}, ${fitness.vo2maxLabel}`}
    >
      <Text style={st.title}>심폐 체력</Text>
      {/* VO2max — 최근 6주 최고 노력 기준(이지런 과소추정 보정). */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: rv(10) }}>
        <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: rf(40), fontWeight: '700', letterSpacing: -0.5, lineHeight: rf(42) }}>{fitness.vo2max.toFixed(1)}</Text>
        <View style={{ marginLeft: rs(10), paddingBottom: rv(5) }}>
          <Text style={{ color: T3, fontFamily: FONT, fontSize: rf(13), fontWeight: '500' }}>VO₂max</Text>
          <Text style={{ color: ACCENT, fontFamily: FONT, fontSize: rf(14), fontWeight: '700', marginTop: rv(2) }}>{fitness.vo2maxLabel}</Text>
        </View>
      </View>
      {/* 이해되는 한 줄 — 이 숫자가 뭔지·어떻게 오르는지(만든 사람도 헷갈리지 않게). */}
      <Text style={st.caption}>심장이 산소를 나르는 힘. 꾸준히 뛸수록 올라가요.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, paddingHorizontal: rs(20), paddingTop: rv(14), paddingBottom: rv(18) },
  title: { color: T3, fontFamily: FONT, fontSize: rf(14), fontWeight: '600' },
  caption: { color: T4, fontFamily: FONT, fontSize: rf(13), lineHeight: rf(18), marginTop: rv(12) },
});
