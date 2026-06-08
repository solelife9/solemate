// ============================================================================
// RunSplits.tsx — 기록 상세 "구간" 스플릿 (Nike Run Club 스타일)
// HistoryScreen.rn.tsx 의 RunDetail 에서 통계 그리드(statGrid) 아래에 렌더한다.
// km · 평균 페이스 · 고도 열, 막대는 빠를수록 길게(가장 빠른 구간만 ACCENT).
//
// 데이터: per-km 스플릿이 필요하다. App.addRun 이 저장하는 GPS 경로(route_<id>)를
// 누적거리 기준으로 1km 단위로 끊어 [{km, paceSec, elevM}] 를 만든다(lib helper 권장).
// 경로가 없으면(수동 입력 런) 이 섹션은 통째로 숨긴다(splits.length < 2 → null).
//
// 의존성 추가 없음(View/Text/StyleSheet + theme 토큰).
// ============================================================================

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {ACCENT, T1, T2, T3, FONT, DISPLAY} from './theme';

export type Split = {km: number; paceSec: number; elevM: number};

const fmtPace = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`;

export function RunSplits({splits}: {splits: Split[]}) {
  if (!splits || splits.length < 2) return null;
  const paces = splits.map(s => s.paceSec);
  const fast = Math.min(...paces);
  const slow = Math.max(...paces);
  const span = Math.max(1, slow - fast);
  // 빠를수록 길게(72%~100%) — 차이를 은은하게.
  const widthOf = (s: number) => 72 + ((slow - s) / span) * 28;

  return (
    <View style={r.wrap}>
      <Text style={r.title}>구간</Text>
      <View style={r.head}>
        <Text style={[r.hcell, r.km]}>km</Text>
        <View style={{flex: 1}} />
        <Text style={[r.hcell, r.pace]}>평균 페이스</Text>
        <Text style={[r.hcell, r.elev]}>고도</Text>
      </View>
      {splits.map((sp, i) => {
        const best = sp.paceSec === fast;
        const ev = sp.elevM > 0 ? `+${sp.elevM}m` : `${sp.elevM}m`;
        return (
          <View key={i} style={[r.row, i > 0 && r.rowSep]}>
            <Text style={r.km}>{sp.km}</Text>
            <View style={r.barWrap}>
              <View style={[r.bar, best && r.barBest, {width: `${widthOf(sp.paceSec)}%`}]} />
            </View>
            <Text style={[r.pace, best && r.paceBest]}>{fmtPace(sp.paceSec)}</Text>
            <Text style={r.elev}>{ev}</Text>
          </View>
        );
      })}
    </View>
  );
}

const r = StyleSheet.create({
  wrap: {marginTop: 24},
  title: {color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, paddingHorizontal: 2, marginBottom: 8},
  head: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2, paddingBottom: 8},
  hcell: {color: T3, fontFamily: FONT, fontSize: 10.5, fontWeight: '600', opacity: 0.8},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 2},
  rowSep: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.045)'},
  km: {width: 34, fontFamily: DISPLAY, fontSize: 17, fontWeight: '600', color: T1},
  barWrap: {flex: 1, height: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden'},
  bar: {height: '100%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.30)'},
  barBest: {backgroundColor: ACCENT},
  pace: {width: 60, textAlign: 'right', fontFamily: DISPLAY, fontSize: 14, fontWeight: '500', color: T1},
  paceBest: {color: ACCENT},
  elev: {width: 46, textAlign: 'right', fontFamily: DISPLAY, fontSize: 13, fontWeight: '500', color: T3},
});
