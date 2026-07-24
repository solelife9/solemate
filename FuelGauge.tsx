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
import { rf, rs, rv } from './lib/responsive';
import {View, StyleSheet} from 'react-native';
import {Text} from './lib/text';
import {T1, T2, T3, FONT, DISPLAY, withAlpha, RADIUS, BAR} from './theme';
import {wearTier} from './lib/shoe';
import {WEAR_TONE_COLOR} from './primitives';

type Props = {
  remainLabel: string;          // 예 "382" (이미 단위 환산된 숫자 문자열)
  unit: string;                 // 'km' | 'mi'
  fillPct: number;              // 0~1 — 마커/채움 위치(실효 마모 권장)
  replacePct?: number;          // 0~1 — 교체 임계 경계(기본 0.9). 목업 마커 예시는 0.75 위치
  usedLabel?: string;           // 사용 거리(바 좌측 라벨)
  maxLabel?: string;            // 총 수명(바 우측 라벨)
  replaceLabel?: string;        // 예 "교체 500km"
  editSlot?: React.ReactNode;   // '잔여 수명' 우측 편집 어포던스(선택)
};

// usedLabel 은 배터리 방향 통일로 미사용(Props 호환 위해 타입엔 유지 — 호출부 무수정).
// (구 condition 3단계 prop 은 2026-07-11 제거 — 색은 wearTier 4단계 단일 소스.)
export function FuelGauge({remainLabel, unit, fillPct, maxLabel, replaceLabel, editSlot}: Props) {
  const p = Math.max(0, Math.min(1, fillPct));
  const tier = wearTier(p * 100);
  // 컨디션색 = primitives.WEAR_TONE_COLOR 단일 소스(2026-07-19 색통일 램프 — 최상=파랑
  // …교체권장=빨강). 과거 이 파일의 사본은 램프가 한 단계 밀려 '교체고려'가 흰색
  // (='최상'과 동일)으로 그려지는 P0 사고가 있었다(2026-07-24 심사). 사본 금지.
  const cc = WEAR_TONE_COLOR[tier.tone];
  // VoiceOver: 게이지를 progressbar 하나로 읽어준다(잔여 % + 교체까지 거리).
  const remainPct = Math.round((1 - p) * 100);
  return (
    <View style={g.wrap}>
      <View style={g.labelRow}>
        <Text style={g.label}>잔여 수명</Text>
        {editSlot}
      </View>
      {/* 교체까지 남은 거리(문장) — 목업 09 lead. 숫자만 굵게. */}
      <Text style={g.lead}>교체까지 약 <Text style={g.leadBold}>{remainLabel}{unit}</Text> 남았어요</Text>
      {/* 수명 바 = 남은 수명 게이지(배터리 방향 — 홈 링·락커 바와 통일, 사용자 결정).
          새 신발 = 가득 참, 닳을수록 비워진다. 색은 4단계 컨디션색(최상=파랑…교체권장=빨강)
          — 홈 링·신발 탭 점과 같은 램프(구 '최상=흰' 특례 폐지: 색통일 c139934 정합). */}
      <View
        style={[g.track, {marginTop: rv(14)}]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`잔여 수명 ${remainPct}%, 교체까지 약 ${remainLabel}${unit}`}
        accessibilityValue={{min: 0, max: 100, now: remainPct}}>
        <View style={[g.fill, {width: `${(1 - p) * 100}%`, backgroundColor: cc}]} />
      </View>
      {/* 남은 수명 % 복원(2026-07-05 사용자 결정) — 락커 카드와 같은 라벨 한 벌
          ('남은 수명 % · 총 Nkm')로 두 화면의 문법을 통일한다. */}
      <View style={g.scale}>
        <Text style={g.scaleTxt}>남은 수명 {remainPct}%</Text>
        <Text style={g.scaleTxt}>총 {maxLabel ?? replaceLabel ?? ''}{maxLabel ? unit : ''}</Text>
      </View>
    </View>
  );
}

// 구 마커/존/큰숫자 디자인의 잔여 스타일(top·remRow·rem·remU·cond·dot·condTxt·seg·zone·marker)은
// 렌더에서 안 쓰여 삭제(심사 #18, 2026-07-22).
const g = StyleSheet.create({
  wrap: {marginTop: rv(0)},
  labelRow: {flexDirection: 'row', alignItems: 'center', gap: rv(8)},
  label: {color: T3, fontFamily: FONT, fontSize: rf(14), fontWeight: '600', letterSpacing: 0.2},
  lead: {color: T2, fontFamily: FONT, fontSize: rf(17), fontWeight: '500', letterSpacing: -0.2, marginTop: rv(8), lineHeight: rf(23)},
  leadBold: {color: T1, fontFamily: DISPLAY, fontWeight: '700'},
  track: {flexDirection: 'row', height: rs(BAR.gauge), borderRadius: RADIUS.pill, overflow: 'hidden', marginTop: rv(16), backgroundColor: withAlpha(T1, 0.04)},
  fill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: RADIUS.pill},
  scale: {flexDirection: 'row', justifyContent: 'space-between', marginTop: rv(10)},
  scaleTxt: {color: T3, fontFamily: DISPLAY, fontSize: rf(12), opacity: 0.8},
});

export default FuelGauge;
