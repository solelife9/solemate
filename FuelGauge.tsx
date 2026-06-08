// ============================================================================
// FuelGauge.tsx — 신발 수명 "연료게이지" (신발 상세 헤더용)
// ShoesScreen.rn.tsx 의 ShoeDetail 상단 Ring 블록을 이 가로 게이지로 교체한다.
// 키고의 시그니처: 0km부터 교체 구간(빨강)까지 한 줄, 흰 마커가 실효 마모 위치.
//
// props 는 ShoeDetail 이 이미 계산하는 값으로 채운다:
//   usedKm/maxKm        : shoe.used / shoe.max (마모 비율)
//   remainKm            : Math.max(0, shoe.max - shoe.used) (표시단위로 환산해 전달해도 됨)
//   effectiveWearPct    : wearView.wearPct (0~1, 실효 마모) — 없으면 usedKm/maxKm 사용
//   replacePct          : SHOE_REPLACE_PCT/100 (교체 임계, 예 0.9) — zone 경계 위치
//   condition           : '양호' | '주의' | '교체'
// 의존성 추가 없음(View/Text/StyleSheet + theme 토큰).
// ============================================================================

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {ACCENT, GOOD, WARN, DANGER, T1, T2, T3, FONT, DISPLAY, withAlpha} from './theme';

type Props = {
  remainLabel: string;          // 예 "382" (이미 단위 환산된 숫자 문자열)
  unit: string;                 // 'km' | 'mi'
  fillPct: number;              // 0~1 — 마커/채움 위치(실효 마모 권장)
  replacePct?: number;          // 0~1 — 교체 임계 경계(기본 0.9)
  condition: '양호' | '주의' | '교체';
  wearLabel?: string;           // 예 "실효 마모 24%"
};

const condColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : GOOD);
const condText  = (c: string) => (c === '교체' ? '교체 권장' : c === '주의' ? '주의' : '최상의 컨디션');

export function FuelGauge({remainLabel, unit, fillPct, replacePct = 0.9, condition, wearLabel}: Props) {
  const p = Math.max(0, Math.min(1, fillPct));
  const cc = condColor(condition);
  return (
    <View style={g.wrap}>
      <View style={g.top}>
        <View>
          <Text style={g.label}>남은 수명</Text>
          <View style={g.remRow}>
            <Text style={g.rem}>{remainLabel}</Text>
            <Text style={g.remU}>{unit}</Text>
          </View>
        </View>
        <View style={g.cond}>
          <View style={[g.dot, {backgroundColor: cc}]} />
          <Text style={g.condTxt}>{condText(condition)}</Text>
        </View>
      </View>

      {/* 트랙: 좌(녹) → 교체임계(주황) → 끝(빨강) 그라데이션을 단색 스텝으로 근사 */}
      <View style={g.track}>
        <View style={[g.seg, {flex: replacePct, backgroundColor: withAlpha(GOOD, 0.16)}]} />
        <View style={[g.seg, {flex: 1 - replacePct, backgroundColor: withAlpha(DANGER, 0.22)}]} />
        {/* 채움 */}
        <View style={[g.fill, {width: `${p * 100}%`}]} />
        {/* 교체 임계 경계선 */}
        <View style={[g.zone, {left: `${replacePct * 100}%`}]} />
        {/* 현재 위치 마커 */}
        <View style={[g.marker, {left: `${p * 100}%`}]} />
      </View>

      <View style={g.scale}>
        <Text style={g.scaleTxt}>0{unit}</Text>
        {!!wearLabel && <Text style={g.scaleTxt}>{wearLabel}</Text>}
        <Text style={[g.scaleTxt, {color: DANGER}]}>교체</Text>
      </View>
    </View>
  );
}

const g = StyleSheet.create({
  wrap: {marginTop: 22},
  top: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
  label: {color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.2},
  remRow: {flexDirection: 'row', alignItems: 'flex-end', marginTop: 4},
  rem: {color: T1, fontFamily: DISPLAY, fontSize: 40, fontWeight: '600', letterSpacing: -1.4, lineHeight: 38},
  remU: {color: T2, fontFamily: FONT, fontSize: 16, fontWeight: '500', marginLeft: 3, marginBottom: 4},
  cond: {flexDirection: 'row', alignItems: 'center', gap: 7},
  dot: {width: 7, height: 7, borderRadius: 999},
  condTxt: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500'},
  track: {flexDirection: 'row', height: 14, borderRadius: 999, overflow: 'hidden', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.04)'},
  seg: {height: '100%'},
  fill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: ACCENT},
  zone: {position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.18)'},
  marker: {position: 'absolute', top: '50%', width: 18, height: 18, borderRadius: 999, backgroundColor: '#fff',
    borderWidth: 3, borderColor: ACCENT, marginTop: -9, marginLeft: -9},
  scale: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 10},
  scaleTxt: {color: T3, fontFamily: DISPLAY, fontSize: 10.5, opacity: 0.8},
});
