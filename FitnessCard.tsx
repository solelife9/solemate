// ============================================================================
// FitnessCard.tsx — 체력 트렌드(VO2max + 오늘 컨디션 + 체력 추이) 카드.
// '지금 내 몸 상태' 개인 대시보드라 홈 화면에 둔다(뛰기 전에 보는 정보). runs 에서
// fitnessSummary 를 자체 계산하고, 타임 있는 노력 런이 없으면(vo2max 0) 숨긴다.
// raw CTL/ATL/TSB 숫자는 일반 사용자가 이해하기 어려워 '오늘 컨디션 + 조언'으로 번역한다.
// ============================================================================
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CARD, CARD_BORDER, ACCENT, GOOD, WARN, BEST, DANGER, T1, T3, FONT, DISPLAY, RADIUS } from './theme';
import { fitnessSummary } from './lib/analytics/fitness';
import { formStatus } from './lib/analytics/load';
import { Sparkline } from './Sparkline';

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

  // 타임 있는 노력 런이 하나도 없으면 VDOT/부하가 안 서므로 숨긴다.
  if (fitness.vo2max <= 0) return null;

  const fs = formStatus(fitness.tsb);
  const dot = fitness.tsb >= 5 ? GOOD : fitness.tsb > -10 ? BEST : fitness.tsb > -25 ? WARN : DANGER;
  const ctl = fitness.pmc.map((p) => p.ctl);
  const trend = (() => {
    if (ctl.length < 3) return null;
    const d = ctl[ctl.length - 1] - ctl[Math.max(0, ctl.length - 1 - 14)];
    return d > 1 ? { w: '상승중 ↗', c: GOOD } : d < -1 ? { w: '하락 ↘', c: WARN } : { w: '유지 →', c: T3 };
  })();

  return (
    <View
      style={[st.card, style]}
      accessible
      accessibilityLabel={`체력 트렌드. VO2max ${fitness.vo2max.toFixed(1)}, ${fitness.vo2maxLabel}. 오늘 컨디션 ${fs.label}`}
    >
      <Text style={st.title}>체력 트렌드</Text>
      {/* VO2max — 최근 6주 최고 노력 기준(이지런 과소추정 보정). 가민 'VO2max'와 동일 개념. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
        <Text style={{ color: T1, fontFamily: DISPLAY, fontSize: 38, fontWeight: '800', letterSpacing: -0.5, lineHeight: 40 }}>{fitness.vo2max.toFixed(1)}</Text>
        <View style={{ marginLeft: 10, paddingBottom: 4 }}>
          <Text style={{ color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' }}>VO₂max</Text>
          <Text style={{ color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '700', marginTop: 2 }}>{fitness.vo2maxLabel}</Text>
        </View>
      </View>
      {/* 오늘 컨디션(폼/TSB) → 몸 상태 + 조언. */}
      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={st.metricL}>오늘 컨디션</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
            <Text style={{ color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '800' }}>{fs.label}</Text>
          </View>
        </View>
        <Text style={{ color: T3, fontFamily: FONT, fontSize: 12, marginTop: 5 }}>{fs.advice}</Text>
      </View>
      {/* 체력 추이 스파크라인 + 방향(14일 전 대비). 3점 이상일 때만. */}
      {trend && (
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <Text style={st.metricL}>체력 추이</Text>
            <Text style={{ color: trend.c, fontFamily: FONT, fontSize: 11, fontWeight: '700' }}>{trend.w}</Text>
          </View>
          <Sparkline data={ctl.slice(-90)} color={ACCENT} height={40} testID="fitness-sparkline" />
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: CARD_BORDER, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 },
  title: { color: T3, fontFamily: FONT, fontSize: 13, fontWeight: '600' },
  metricL: { color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '500' },
});
