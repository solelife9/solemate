// ============================================================================
// HomeShoeCard.tsx — 홈 '오늘의 신발' 링 게이지 카드(디자인 핸드오프 이식).
// 신발 수명 소진율을 큰 링으로 보여주고(색은 ringColor 로 파랑→초록→노랑→빨강 연속),
// 한 탭으로 러닝 시작. 데이터는 UI 신발 형태(used/max) — 홈 캐러셀이 쓰던 값 그대로.
// SF 심볼 대신 Ionicons 로 크로스플랫폼. 색·타이포는 theme 토큰(링 색만 ringColor).
// ============================================================================
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Rect, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { T1, T3, FONT, DISPLAY, RADIUS, withAlpha } from './theme';
import { wearTier } from './lib/shoe';
import { ringColor } from './lib/ringColor';
import { findShoeClass, typeLabel } from './data/shoeClass';
import { displayNum, type Unit } from './lib/units';

const RING = 172;
const RING_R = 76;
const RING_C = 2 * Math.PI * RING_R;

type UiShoe = { id?: string; brand: string; model: string; used: number; max: number };

export function HomeShoeCard({
  shoe, unit = 'km', idx = 0, tappable, onOpenShoe, onStart,
}: {
  shoe: UiShoe; unit?: Unit; idx?: number; tappable?: boolean;
  onOpenShoe?: () => void; onStart?: () => void;
}) {
  const pctExact = shoe.max > 0 ? (shoe.used / shoe.max) * 100 : 0;
  const pct = Math.round(pctExact);
  const rc = ringColor(pctExact);
  const tier = wearTier(pctExact);
  const remainKm = Math.max(0, shoe.max - shoe.used);
  const cat = typeLabel(findShoeClass(shoe.brand, shoe.model)?.type) || '러닝화';
  const gradId = `ringGrad-${shoe.id ?? idx}`;
  const edgeId = `cardEdge-${shoe.id ?? idx}`;
  const dash = RING_C * (1 - Math.min(pct, 100) / 100);
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <View style={st.card} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {/* 유리 헤어라인 — iOS 아이콘 버튼 엣지 라이팅: 좌상(0,0)→우하(1,1) 대각 그라데이션.
          양 끝(좌상·우하) 밝고 가운데(우상·좌하 코너가 걸리는 t=0.5) 흐림 → 대칭 stop. */}
      {size.width > 0 && (
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <SvgGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={withAlpha(T1, 0.55)} />
              <Stop offset="0.5" stopColor={withAlpha(T1, 0.04)} />
              <Stop offset="1" stopColor={withAlpha(T1, 0.55)} />
            </SvgGradient>
          </Defs>
          <Rect
            x={0.75} y={0.75} width={size.width - 1.5} height={size.height - 1.5}
            rx={33} ry={33} fill="none" stroke={`url(#${edgeId})`} strokeWidth={1.5}
          />
        </Svg>
      )}
      {/* 정보영역(탭 → 상세). 러닝 시작 버튼은 이 Pressable '밖'의 형제라, 텍스트 기반 테스트가
          '러닝 시작'을 눌러도 상세로 새지 않는다(중첩 매칭 방지 — 옛 히어로와 동일 규약). */}
      <Pressable onPress={onOpenShoe} disabled={!tappable} accessibilityRole="button" accessibilityLabel={`${shoe.brand} ${shoe.model} 상세 보기`}>
      {/* 상단: 브랜드·카테고리 + 모델 / 컨디션 칩 */}
      <View style={st.top}>
        <View style={{ flexShrink: 1 }}>
          <Text style={st.brand}>{shoe.brand} · {cat}</Text>
          <Text style={st.model} numberOfLines={1}>{shoe.model}</Text>
        </View>
        <View style={[st.condChip, { borderColor: withAlpha(rc.solid, 0.4) }]} testID={`home-cond-${tier.key}`}>
          <View style={[st.condDot, { backgroundColor: rc.to }]} />
          <Text style={st.condLabel}>{tier.label}</Text>
        </View>
      </View>

      {/* 링 게이지 */}
      <View style={st.ringWrap}>
        <Svg width={RING} height={RING}>
          <Defs>
            <SvgGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={rc.from} />
              <Stop offset="1" stopColor={rc.to} />
            </SvgGradient>
          </Defs>
          <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={withAlpha(T1, 0.08)} strokeWidth={13} fill="none" />
          <Circle
            cx={RING / 2} cy={RING / 2} r={RING_R}
            stroke={`url(#${gradId})`} strokeWidth={13} fill="none" strokeLinecap="round"
            strokeDasharray={RING_C} strokeDashoffset={dash}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <View style={st.ringCenter}>
          <Text style={st.ringSub}>수명 소진율</Text>
          <View style={st.ringRow}>
            <Text style={st.ringPct}>{pct}</Text>
            <Text style={st.ringUnit}>%</Text>
          </View>
        </View>
      </View>

      {/* 사용 / 남은 거리 */}
      <View style={st.kmRow}>
        <Text style={st.kmLabel}>사용 <Text style={st.kmStrong}>{displayNum(shoe.used, unit)}/{displayNum(shoe.max, unit)}{unit}</Text></Text>
        <View style={st.kmSep} />
        <Text style={[st.kmLabel, { color: remainKm > 0 ? T1 : rc.solid }]}>
          {remainKm > 0 ? `${displayNum(remainKm, unit)}${unit} 남음` : '수명 초과'}
        </Text>
      </View>
      </Pressable>

      {/* 러닝 시작 — 정보 Pressable 의 형제(중첩 아님). */}
      <Pressable
        style={({ pressed }) => [st.runBtn, pressed && { transform: [{ scale: 0.98 }] }]}
        onPress={onStart}
        accessibilityRole="button" accessibilityLabel="러닝 시작"
      >
        <Ionicons name="play" size={15} color={T1} />
        <Text style={st.runLabel}>러닝 시작</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  // 유리 패널: 밝은 회색 표면. 테두리는 균일선이 아니라 위 SVG 대각 그라데이션(iOS 엣지 라이팅).
  card: { borderRadius: 34, padding: 22, overflow: 'hidden', backgroundColor: withAlpha(T1, 0.11) },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  brand: { fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, color: withAlpha(T1, 0.55) },
  model: { fontFamily: FONT, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: T1, marginTop: 4 },
  condChip: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: withAlpha(T1, 0.06), borderWidth: 1 },
  condDot: { width: 7, height: 7, borderRadius: 999 },
  condLabel: { fontFamily: FONT, fontSize: 13, fontWeight: '600', color: T1 },
  ringWrap: { width: RING, height: RING, alignSelf: 'center', marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringSub: { fontFamily: FONT, fontSize: 12, fontWeight: '600', color: withAlpha(T1, 0.55) },
  ringRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
  ringPct: { fontFamily: DISPLAY, fontSize: 58, fontWeight: '700', letterSpacing: -3, lineHeight: 60, color: T1 },
  ringUnit: { fontFamily: DISPLAY, fontSize: 20, fontWeight: '700', color: withAlpha(T1, 0.7), marginTop: 6 },
  kmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 18 },
  kmLabel: { fontFamily: FONT, fontSize: 13, fontWeight: '600', color: T3 },
  kmStrong: { color: T1 },
  kmSep: { width: 3, height: 3, borderRadius: 999, backgroundColor: withAlpha(T1, 0.28) },
  runBtn: { height: 54, borderRadius: RADIUS.btn, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: withAlpha(T1, 0.1), borderWidth: 1, borderColor: withAlpha(T1, 0.18) },
  runLabel: { fontFamily: FONT, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: T1 },
});
