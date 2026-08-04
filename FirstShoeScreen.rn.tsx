// ============================================================================
// FirstShoeScreen.rn.tsx — "첫 러닝화 등록" 빈 상태 (내 신발 탭)
//
// 빈 화면 = 채워진 락커의 유령. 인사말 + 고스트 카드(홈 히어로와 동일 유리 문법) +
// 철학 한 줄. 구 대시 슬롯·발광 플러스 배지는 폐기(유리 시스템 정합, 2026-07-03).
//
// 2026-07-16 청소: 구 SuccessState(등록 완료 카드)는 배선된 곳이 없고(ShoesScreen 이
// 항상 shoe 없이 렌더) 폐기된 문법 투성이였다(불투명 CARD 위 GlassEdge·초록→빨강
// FuelTrack·MaterialCommunityIcons 글리프·'NIKE Alphafly 3' 하드코딩 폴백) — 전부 삭제.
// 등록 완료 후 동선은 실제 앱 흐름(AddShoe → ShoesScreen 실카드)이 담당한다.
//
// App 연결 예:
//   <FirstShoeScreen onRegister={() => nav('AddShoe')} onTab={(i) => setTab(i)} />
// ============================================================================
import React from 'react';
import { rf, rv } from './lib/responsive';
import {View, StyleSheet, useWindowDimensions} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BG, T1, T3, FONT, TYPE, GUTTER} from './theme';
import {TabBar, ShoeGlyph} from './primitives';
import {GhostShoeCard, EMPTY_SHOE_LINE} from './screens/KeegoHome';

// ShoeGlyph 는 primitives 로 승격(고스트 카드가 화면 간 공유) — 기존 import 경로 호환 re-export.
export {ShoeGlyph};

// (날짜 줄 제거 2026-08-04, UX 감사 ⑯ — 같은 빈 상태인데 홈은 날짜가 없고 여기만 있어
//  두 탭의 인사 문법이 갈렸다. 홈은 신발이 있든 없든 날짜를 쓰지 않으므로 이쪽을 맞춘다.
//  todayKo/WEEKDAYS_KO 도 소비처가 사라져 함께 삭제 — 남겨 두면 '쓰는 데가 있다'는 거짓 신호다.)

// ── 진입점 ────────────────────────────────────────────────────────────────────
export type FirstShoeProps = {
  userName?: string;                 // 인사말 이름("OO님,") — 없으면 이름 생략
  onRegister?: () => void;           // CTA → 등록 폼
  onTab?: (i: number) => void;       // 하단 탭
};

export default function FirstShoeScreen({onRegister, onTab, userName}: FirstShoeProps) {
  const insets = useSafeAreaInsets();
  const {width: winW} = useWindowDimensions();
  const greetName = (userName ?? '').trim();
  return (
    <View style={[s.screen, {paddingTop: insets.top}]}>
      <View style={s.greetWrap}>
        <Text style={s.greeting}>
          {greetName ? `${greetName}님,\n` : ''}첫 러닝화를 등록해볼까요?
        </Text>
      </View>

      <View style={s.stage}>
        <GhostShoeCard width={Math.min(Math.round(winW * 0.82), 380)} onPress={onRegister} />
        {/* 문구는 screens/KeegoHome 단일 소스 — 홈 빈 상태와 같은 문장이어야 한다(UX 감사 ⑥). */}
        <Text style={s.philosophy}>{EMPTY_SHOE_LINE}</Text>
      </View>
      <TabBar active={1} onTab={(i) => onTab?.(i)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},

  greetWrap: {paddingHorizontal: GUTTER, paddingTop: rv(18), paddingBottom: rv(20)},
  greeting: {color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.4, lineHeight: rf(31)},
  // 스테이지 — 고스트 카드 + 철학 한 줄. 절대 탭 독에 가리지 않게 하단 여백 확보.
  // 히어로형 화면 — 고스트 카드 하나 + 여백이 비율(홈과 동일 결, 스택 없음 — 사용자 확정 07-10).
  stage: {flex: 1, gap: rv(24), paddingHorizontal: GUTTER, paddingTop: rv(6), paddingBottom: rv(96), alignItems: 'center'},
  philosophy: {textAlign: 'center', color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(24)},
});
