// ============================================================================
// PaceCurveChart.tsx — 거리축 페이스 곡선 (RunDetail, P0-4 · 가독 개선 2026-07-04)
// per-km 스플릿(또는 고운 페이스 시계열)을 거리(x) × 페이스(y) 곡선으로 그린다.
// 표(RunSplits)가 '정확한 숫자'라면 이 그래프는 '한눈에 보는 추세'다.
//
// 가독 개선(사용자 피드백 '보기 어렵다'):
//  · 평균 페이스 기준선 — 러너가 진짜 궁금한 건 "평균 대비 어디서 빨랐나". 기준선이
//    생기면 곡선의 위/아래가 곧바로 의미가 된다(위 = 평균보다 빠름).
//  · y축 라벨 — 위(빠름)/아래(느림) 경계 페이스를 표기해 세로축 눈금을 만든다.
//  · 스케일 여유 — min-max 꽉 채움은 몇 초 차이도 절벽처럼 보이게 한다. 상하 8% 패딩.
//  · 스무딩 — 고운 시계열(25m 표본)은 GPS 잔떨림로 지그재그가 된다. 이동평균 +
//    미드포인트 베지어로 '추세'만 남긴다(표가 정확값 담당이므로 정보 손실 아님).
//  · 점 노이즈 제거 — 구간마다 찍히던 점을 없애고 최고(가장 빠른) 지점 하나만 마커.
// 순수 프레젠테이션(react-native-svg). 2구간 미만이면 자동 숨김.
// ============================================================================
import React, {useState} from 'react';
import {View, Text, StyleSheet, Dimensions} from 'react-native';
import Svg, {Path, Circle, Line, Defs, LinearGradient, Stop} from 'react-native-svg';
import {ACCENT, CARD, T1, T3, FONT, RADIUS, SEP, withAlpha} from './theme';
import {Split} from './RunSplits';
import {Unit} from './lib/units';

const fmtPace = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, '0')}"`;
const H = 148; // svg 높이(px) — 기준선·라벨이 들어갈 숨통 포함

// 이동평균(중앙 창) — 표본이 많은 고운 시계열의 잔떨림만 누른다. 짧은 배열은 그대로.
function smooth(vals: number[], win: number): number[] {
  if (vals.length <= win) return vals;
  const half = Math.floor(win / 2);
  return vals.map((_, i) => {
    const s = Math.max(0, i - half);
    const e = Math.min(vals.length - 1, i + half);
    let sum = 0;
    for (let j = s; j <= e; j++) sum += vals[j];
    return sum / (e - s + 1);
  });
}

// 미드포인트 쿼드라틱 경로 — 꺾은선 대신 부드러운 추세 곡선.
function smoothPath(pts: {x: number; y: number}[]): string {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export function PaceCurveChart({splits, unit = 'km', gap}: {splits: Split[]; unit?: Unit; gap?: {km: number; paceSec: number}[]}) {
  const [w, setW] = useState(0);
  if (!splits || splits.length < 2) return null;
  const width = w || Dimensions.get('window').width - 72; // onLayout 전 폴백(테스트/첫 프레임)
  const padT = 16, padB = 10, padX = 6;
  const plotW = Math.max(1, width - padX * 2);
  const plotH = Math.max(1, H - padT - padB);

  const rawPaces = splits.map((s) => s.paceSec);
  const minActual = Math.min(...rawPaces); // 헤더 '최고'는 실제(비스무딩) 페이스 기준
  // 고운 시계열(>14점)만 스무딩 — per-km 스플릿(수 개)은 원값 유지.
  const paces = rawPaces.length > 14 ? smooth(rawPaces, 5) : rawPaces;
  const avg = rawPaces.reduce((a, b) => a + b, 0) / rawPaces.length;

  // GAP(경사보정) 오버레이 — 2점 이상일 때만. y축 스케일은 두 곡선을 함께 담는다.
  const gapPts = gap && gap.length >= 2 ? gap : null;
  const scaleP = gapPts ? [...paces, ...gapPts.map((g) => g.paceSec)] : paces;
  // 상하 8% 여유(최소 4초) — 꽉 채운 스케일이 만드는 '절벽 착시' 방지.
  const rawSpan = Math.max(...scaleP) - Math.min(...scaleP);
  const pad = Math.max(rawSpan * 0.08, 4);
  const minP = Math.min(...scaleP) - pad;
  const maxP = Math.max(...scaleP) + pad;
  const span = maxP - minP || 1;

  const kmMin = splits[0].km;
  const kmMax = splits[splits.length - 1].km;
  const kmSpan = kmMax - kmMin || 1;
  const X = (km: number) => padX + ((km - kmMin) / kmSpan) * plotW;
  const Y = (p: number) => padT + ((p - minP) / span) * plotH; // 빠를수록(낮은 초) 위로
  const pts = splits.map((s, i) => ({x: X(s.km), y: Y(paces[i])}));
  const baseY = (H - padB).toFixed(1);
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`;
  const fastestIdx = rawPaces.indexOf(minActual);
  const avgY = Y(avg);
  // GAP 라인(점선) — km 범위를 실제 곡선과 공유(같은 런).
  const gapLine = gapPts
    ? smoothPath(gapPts.map((g) => ({x: X(g.km), y: Y(g.paceSec)})))
    : null;

  return (
    <View style={st.wrap} testID="pace-curve">
      <View style={st.head}>
        <Text style={st.title}>구간 페이스 추세</Text>
        <Text style={st.sub}>최고 {fmtPace(minActual)}<Text style={st.subDim}> /{unit}</Text></Text>
      </View>
      {/* y축 안내 — 위가 빠름. 경계 페이스를 표기해 세로축이 '읽히게' 한다. */}
      <View style={st.yLabels} pointerEvents="none">
        <Text style={st.yTxt}>{fmtPace(minP)} 빠름 ↑</Text>
        <Text style={st.yTxt}>{fmtPace(maxP)} 느림 ↓</Text>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Svg width={width} height={H}>
          <Defs>
            <LinearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ACCENT} stopOpacity={0.22} />
              <Stop offset="1" stopColor={ACCENT} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#paceFill)" />
          {/* 평균 페이스 기준선 — 곡선이 이 선 위면 평균보다 빠른 구간. */}
          <Line
            x1={padX} y1={avgY} x2={padX + plotW} y2={avgY}
            stroke={withAlpha(T1, 0.28)} strokeWidth={1} strokeDasharray="3 4"
            testID="avg-line"
          />
          {gapLine && (
            <Path d={gapLine} stroke={T3} strokeWidth={1.8} fill="none" strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" testID="gap-overlay" />
          )}
          <Path d={line} stroke={ACCENT} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {/* 마커는 최고(가장 빠른) 지점 하나만 — 구간별 점은 표(RunSplits)가 담당. */}
          <Circle cx={pts[fastestIdx].x} cy={pts[fastestIdx].y} r={4.5} fill={ACCENT} stroke={CARD} strokeWidth={2} />
        </Svg>
        {/* 평균 라벨 — 기준선 우측 끝에 얹는다(절대배치, 선과 같은 톤). */}
        <Text style={[st.avgTxt, {top: Math.min(Math.max(avgY - 15, 0), H - 16)}]} pointerEvents="none">
          평균 {fmtPace(avg)}
        </Text>
      </View>
      <View style={st.axis}>
        <Text style={st.axisTxt}>{kmMin}{unit}</Text>
        {gapPts && (
          <Text style={st.legend} accessibilityLabel="회색 점선은 경사 보정 페이스">
            <Text style={{color: ACCENT}}>—</Text> 실제  <Text style={{color: T3}}>┄</Text> 경사보정
          </Text>
        )}
        <Text style={st.axisTxt}>{kmMax}{unit}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, padding: 14, marginTop: 12},
  head: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4},
  title: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '700', letterSpacing: -0.2},
  sub: {color: ACCENT, fontFamily: FONT, fontSize: 13, fontWeight: '700'},
  subDim: {color: T3, fontWeight: '500'},
  yLabels: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2},
  yTxt: {color: withAlpha(T1, 0.45), fontFamily: FONT, fontSize: 10, fontWeight: '600'},
  avgTxt: {position: 'absolute', right: 2, color: withAlpha(T1, 0.55), fontFamily: FONT, fontSize: 10, fontWeight: '600'},
  axis: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2},
  axisTxt: {color: T3, fontFamily: FONT, fontSize: 11, fontWeight: '600'},
  legend: {color: T3, fontFamily: FONT, fontSize: 10, fontWeight: '600'},
});
