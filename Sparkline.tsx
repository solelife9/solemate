// ============================================================================
// Sparkline.tsx — 얇은 추세선(축·라벨 없는 미니 라인차트).
// 체력 트렌드 카드의 CTL(체력) 추이처럼 '숫자 옆 한눈 추세'에 쓴다. 순수 프레젠테이션
// (react-native-svg). 폭은 onLayout 으로 측정(첫 프레임은 폴백). 2점 미만이면 숨김.
// ============================================================================
import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export function Sparkline({
  data, height = 40, color, fillOpacity = 0.16, strokeWidth = 2, testID,
}: {
  data: number[]; height?: number; color: string; fillOpacity?: number; strokeWidth?: number; testID?: string;
}) {
  const [w, setW] = useState(0);
  const vals = (Array.isArray(data) ? data : []).filter((n) => Number.isFinite(n));
  if (vals.length < 2) return null;
  const width = w || 240; // onLayout 전 폴백
  const padY = strokeWidth + 1;
  const plotH = Math.max(1, height - padY * 2);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = vals.length;
  const X = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * width);
  const Y = (v: number) => padY + (1 - (v - min) / span) * plotH; // 큰 값이 위로
  const pts = vals.map((v, i) => ({ x: X(i), y: Y(v) }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const baseY = (height - 0.5).toFixed(1);
  const area = `${line} L${pts[n - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} testID={testID}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={fillOpacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0.01} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#sparkFill)" />
        <Path d={line} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
