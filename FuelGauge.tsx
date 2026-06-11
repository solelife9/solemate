// ============================================================================
// FuelGauge.tsx — 신발 수명 "연료게이지" (신발 상세 헤더용) · Detail Screens v2와 1:1
// ShoeDetail 상단의 원형 Ring 블록을 이 가로 게이지로 교체한다.
// 0km부터 교체 구간(빨강)까지 한 줄, 흰 마커가 실효 마모 위치를 가리킨다.
//
// 수치는 모두 목업(.fuel) 그대로: frem 40/ls-1.4, track h14 r999, marker 18 border3,
// zone 1px white0.18, scale Barlow 10.5 t4(교체=빨강).
// editSlot: 앱의 '수명 수정' 연필을 '남은 수명' 라벨 우측에 끼우는 선택 슬롯(목업엔 없음).
// ============================================================================
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {ACCENT, GOOD, WARN, DANGER, T1, T2, T3, FONT, DISPLAY, withAlpha} from './theme';

type Props = {
  remainLabel: string;          // 예 "382" (이미 단위 환산된 숫자 문자열)
  unit: string;                 // 'km' | 'mi'
  fillPct: number;              // 0~1 — 마커/채움 위치(실효 마모 권장)
  replacePct?: number;          // 0~1 — 교체 임계 경계(기본 0.9). 목업 마커 예시는 0.75 위치
  condition: '양호' | '주의' | '교체';
  wearLabel?: string;           // 예 "실효 마모 24%"
  replaceLabel?: string;        // 예 "교체 500km"
  editSlot?: React.ReactNode;   // '남은 수명' 우측 편집 어포던스(선택)
};

const condColor = (c: string) => (c === '교체' ? DANGER : c === '주의' ? WARN : GOOD);
const condText  = (c: string) => (c === '교체' ? '교체 권장' : c === '주의' ? '주의' : '최상의 컨디션');

export function FuelGauge({remainLabel, unit, fillPct, replacePct = 0.9, condition, wearLabel, replaceLabel, editSlot}: Props) {
  const p = Math.max(0, Math.min(1, fillPct));
  const zone = Math.max(0, Math.min(1, replacePct));
  const cc = condColor(condition);
  return (
    <View style={g.wrap}>
      <View style={g.top}>
        <View>
          <View style={g.labelRow}>
            <Text style={g.label}>남은 수명</Text>
            {editSlot}
          </View>
          <View style={g.remRow}>
            <Text style={g.rem}>{remainLabel}</Text>
            <Text style={g.remU}>{unit}</Text>
          </View>
        </View>
        <View style={g.cond}>
          <View style={[g.dot, {backgroundColor: cc, shadowColor: cc, shadowOpacity: 0.5, shadowRadius: 5}]} />
          <Text style={g.condTxt}>{condText(condition)}</Text>
        </View>
      </View>

      {/* 트랙: 좌(녹) → 교체임계(주황) → 끝(빨강). 목업 그라데이션을 스텝으로 근사 */}
      <View style={g.track}>
        <View style={[g.seg, {flex: 0.6, backgroundColor: withAlpha(GOOD, 0.16)}]} />
        <View style={[g.seg, {flex: 0.15, backgroundColor: withAlpha(WARN, 0.18)}]} />
        <View style={[g.seg, {flex: 0.25, backgroundColor: withAlpha(DANGER, 0.22)}]} />
        <View style={[g.fill, {width: `${p * 100}%`, backgroundColor: condition === '양호' ? withAlpha(T1, 0.85) : cc}]} />
        <View style={[g.zone, {left: `${zone * 100}%`}]} />
        <View style={[g.marker, {left: `${p * 100}%`}]} />
      </View>

      <View style={g.scale}>
        <Text style={g.scaleTxt}>0{unit}</Text>
        {!!wearLabel && <Text style={g.scaleTxt}>{wearLabel}</Text>}
        <Text style={[g.scaleTxt, {color: DANGER}]}>{replaceLabel ?? '교체'}</Text>
      </View>
    </View>
  );
}

const g = StyleSheet.create({
  wrap: {marginTop: 0},
  top: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'},
  labelRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  label: {color: T3, fontFamily: FONT, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.2},
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

export default FuelGauge;
