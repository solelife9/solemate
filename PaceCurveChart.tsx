// ============================================================================
// PaceCurveChart.tsx — 거리축 페이스 곡선 (RunDetail, P0-4)
// per-km 스플릿(Split[])을 거리(x) × 페이스(y) 곡선으로 그린다. 빠른 구간일수록 위로
// (낮은 초/km = 위). 표(RunSplits)가 '정확한 숫자'라면 이 그래프는 '한눈에 보는 추세'다.
// 경로엔 타임스탬프가 없어 곡선 해상도는 km 단위(스플릿) — 더 고운 곡선은 향후 페이스
// 시계열 영속이 필요. 순수 프레젠테이션(react-native-svg). 2구간 미만이면 자동 숨김.
// ============================================================================
import React, {useState} from 'react';
import {View, Text, StyleSheet, Dimensions} from 'react-native';
import Svg, {Path, Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
import {ACCENT, CARD, T1, T3, FONT, RADIUS, SEP} from './theme';
import {Split} from './RunSplits';
import {Unit} from './lib/units';

const fmtPace = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`;
const H = 132; // svg 높이(px)

export function PaceCurveChart({splits, unit = 'km', gap}: {splits: Split[]; unit?: Unit; gap?: {km: number; paceSec: number}[]}) {
  const [w, setW] = useState(0);
  if (!splits || splits.length < 2) return null;
  const width = w || Dimensions.get('window').width - 72; // onLayout 전 폴백(테스트/첫 프레임)
  const padT = 12, padB = 8, padX = 6;
  const plotW = Math.max(1, width - padX * 2);
  const plotH = Math.max(1, H - padT - padB);

  // GAP(경사보정) 오버레이 — 2점 이상일 때만. y축 스케일은 두 곡선을 함께 담아야 겹쳐도 안 잘림.
  const gapPts = gap && gap.length >= 2 ? gap : null;
  const paces = splits.map((s) => s.paceSec);
  const minActual = Math.min(...paces); // 헤더 '최고'는 실제 페이스 기준
  const scaleP = gapPts ? [...paces, ...gapPts.map((g) => g.paceSec)] : paces;
  const minP = Math.min(...scaleP);
  const maxP = Math.max(...scaleP);
  const span = maxP - minP || 1;
  const kmMin = splits[0].km;
  const kmMax = splits[splits.length - 1].km;
  const kmSpan = kmMax - kmMin || 1;
  const X = (km: number) => padX + ((km - kmMin) / kmSpan) * plotW;
  const Y = (p: number) => padT + ((p - minP) / span) * plotH; // 빠를수록(낮은 초) 위로
  const pts = splits.map((s) => ({x: X(s.km), y: Y(s.paceSec)}));
  const baseY = (H - padB).toFixed(1);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`;
  const fastestIdx = paces.indexOf(minActual);
  // GAP 라인(점선) — km 범위를 실제 곡선과 공유(같은 런). 범위 밖 점은 클램프 없이 그대로(같은 런이라 안전).
  const gapLine = gapPts
    ? gapPts.map((g, i) => `${i ? 'L' : 'M'}${X(g.km).toFixed(1)} ${Y(g.paceSec).toFixed(1)}`).join(' ')
    : null;

  return (
    <View style={st.wrap} testID="pace-curve">
      <View style={st.head}>
        <Text style={st.title}>구간 페이스 추세</Text>
        <Text style={st.sub}>최고 {fmtPace(minActual)}<Text style={st.subDim}> /{unit}</Text></Text>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Svg width={width} height={H}>
          <Defs>
            <LinearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ACCENT} stopOpacity={0.26} />
              <Stop offset="1" stopColor={ACCENT} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#paceFill)" />
          {gapLine && (
            <Path d={gapLine} stroke={T3} strokeWidth={1.8} fill="none" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" testID="gap-overlay" />
          )}
          <Path d={line} stroke={ACCENT} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === fastestIdx ? 4 : 2.5}
              fill={i === fastestIdx ? ACCENT : CARD}
              stroke={ACCENT}
              strokeWidth={i === fastestIdx ? 0 : 1.5}
            />
          ))}
        </Svg>
      </View>
      <View style={st.axis}>
        <Text style={st.axisTxt}>{kmMin}{unit}</Text>
        {gapPts && (
          <Text style={st.legend} accessibilityLabel="회색 점선은 경사 보정 페이스">
            <Text style={{color: ACCENT}}>—</Text> 실제  <Text style={{color: T3}}>┄</Text> GAP
          </Text>
        )}
        <Text style={st.axisTxt}>{kmMax}{unit}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, padding: 14, marginTop: 12},
  head: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4},
  title: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '700', letterSpacing: -0.2},
  sub: {color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '700'},
  subDim: {color: T3, fontWeight: '500'},
  axis: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2},
  axisTxt: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '600'},
  legend: {color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '600'},
});
