// ============================================================================
// ShoeArchiveScreen.rn.tsx — 신발 보관함 (마이 탭 → 명예의 전당 아래 진입)
// 보관(retired) 처리했지만 명예의 전당(키프세이크)에는 등재되지 않은 신발을 모아 보여주고,
// 여기서 '복원'하면 다시 활성 목록·러닝 시작에 쓸 수 있다(복원 진입점 = 갭 해소). 목록은
// App 이 retired·비키프세이크로 필터링해 주입한다(표시 전용 — 데이터 생성 0). 색/폰트는
// theme 토큰만. retired 플래그 토글은 onRestore(=App.retireShoe(id,false))에 위임한다.
// ============================================================================
import React from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {View, Text, ScrollView, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, CARD_HI, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY, RADIUS, withAlpha, Shoe, TYPE} from './theme';
import {SwipeBack} from './primitives';
import {Unit} from './lib/units';

export default function ShoeArchiveScreen({
  shoes = [],
  unit = 'km',
  onRestore,
  onBack,
}: {
  /** 보관(retired·비키프세이크) 신발 — App 이 필터링해 주입한다. */
  shoes?: Shoe[];
  unit?: Unit;
  /** 복원 위임 — App 이 retired=false 토글 + 동기. 없으면 복원 버튼 비활성. */
  onRestore?: (id: string) => void;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const totalUsed = Math.round(shoes.reduce((a, sh) => a + (Number(sh.used) || 0), 0));
  return (
    // 엣지 스와이프 백 — 왼쪽 가장자리 우측 드래그로 복귀(iOS pop 제스처 대응).
    <SwipeBack onBack={onBack}>
    <View style={[s.screen, {paddingTop: insets.top}]} testID="shoe-archive-screen">
      <View style={s.nav}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}>
          <Ionicons name="chevron-back" size={ri(20)} color={T1} />
        </Pressable>
        <Text style={s.title}>보관함</Text>
        <View style={{width: rs(36)}} />
      </View>
      <ScrollView
        contentContainerStyle={{paddingHorizontal: rs(18), paddingBottom: rv(28), gap: rv(12), paddingTop: rv(6)}}
        showsVerticalScrollIndicator={false}>
        {shoes.length === 0 ? (
          // 빈 상태 — 중앙 히어로를 폐지하고 상단 시작 + 안내 콘텐츠로 채운다
          // (기기 피드백 2026-07-09: "허전하고 화면 중앙에 동떨어져 있다").
          // 보관함이 '무엇이고 어떻게 쓰는지'가 빈 화면의 콘텐츠가 된다.
          <View style={s.empty} testID="shoe-archive-empty">
            <View style={s.emptyBadge}>
              <Ionicons name="archive-outline" size={ri(30)} color={T2} />
            </View>
            <Text style={s.emptyText}>보관한 신발이 없어요</Text>
            <Text style={s.emptySub}>당장 안 신는 신발을 러닝 목록에서 잠시 치워두는 곳이에요.</Text>
            <View style={s.emptyDivider} />
            <View style={s.emptyRow}>
              <Ionicons name="footsteps-outline" size={ri(17)} color={T3} style={s.emptyRowIcon} />
              <Text style={s.emptyRowText}>신발 상세에서 <Text style={s.emptyRowStrong}>보관 처리</Text>하면 여기로 옮겨져요.</Text>
            </View>
            <View style={s.emptyRow}>
              <Ionicons name="shield-checkmark-outline" size={ri(17)} color={T3} style={s.emptyRowIcon} />
              <Text style={s.emptyRowText}>보관해도 누적 거리와 러닝 기록은 그대로 남아요.</Text>
            </View>
            <View style={s.emptyRow}>
              <Ionicons name="arrow-undo-outline" size={ri(17)} color={T3} style={s.emptyRowIcon} />
              <Text style={s.emptyRowText}><Text style={s.emptyRowStrong}>복원</Text>하면 언제든 다시 러닝에 쓸 수 있어요.</Text>
            </View>
          </View>
        ) : (
          <>
            {/* 요약 스탯 헤더 — 상단정렬 + 공백을 보관 수·누적 거리로 채운다. */}
            <View style={s.statStrip}>
              <View style={s.stat}><Text style={s.statV}>{shoes.length}</Text><Text style={s.statL}>보관</Text></View>
              <View style={s.statDiv} />
              <View style={s.stat}><Text style={s.statV}>{totalUsed}<Text style={s.statU}> {unit}</Text></Text><Text style={s.statL}>누적 거리</Text></View>
            </View>
            <Text style={s.sub}>러닝 목록에서 숨긴 신발이에요. 복원하면 다시 러닝에 사용할 수 있어요.</Text>
            {shoes.map((sh) => (
            <View key={sh.id} style={s.card} testID={`archive-shoe-${sh.id}`}>
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={s.brand} numberOfLines={1}>{sh.brand}</Text>
                <Text style={s.model} numberOfLines={1}>{sh.model}</Text>
                <Text style={s.meta}>{sh.used} / {sh.max}{unit} 사용</Text>
              </View>
              <Pressable
                onPress={() => sh.id && onRestore?.(sh.id)}
                disabled={!sh.id || !onRestore}
                accessibilityRole="button"
                accessibilityLabel={`${sh.brand} ${sh.model} 복원`}
                hitSlop={6}
                testID={`archive-restore-${sh.id}`}
                style={({pressed}) => [s.restoreBtn, pressed && {opacity: 0.7}]}>
                <Ionicons name="arrow-undo-outline" size={ri(15)} color={ACCENT} />
                <Text style={s.restoreText}>복원</Text>
              </Pressable>
            </View>
          ))}
          </>
        )}
      </ScrollView>
    </View>
    </SwipeBack>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  nav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(14), paddingTop: rv(6), paddingBottom: rv(10)},
  iconBtn: {width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center'},
  title: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.3},
  sub: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(18), paddingHorizontal: rs(4), marginBottom: rv(2)},

  // 요약 스탯 헤더(상단정렬 시 공백 채움)
  statStrip: {flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingVertical: rv(16)},
  stat: {flex: 1, alignItems: 'center', gap: rv(4)},
  statV: {color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  statU: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  statL: {color: T3, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600', letterSpacing: 0.3},
  statDiv: {width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: SEP, marginVertical: rv(4)},
  card: {flexDirection: 'row', alignItems: 'center', gap: rv(12), backgroundColor: CARD, borderRadius: RADIUS.lg, borderCurve: 'continuous', padding: rs(16), borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  brand: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 0.4},
  model: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2, marginTop: rv(1)},
  meta: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(4)},
  restoreBtn: {flexDirection: 'row', alignItems: 'center', gap: rv(5), paddingHorizontal: rs(14), height: rs(36), borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.14)},
  restoreText: {color: ACCENT, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  // 빈 상태 — 상단 시작 콘텐츠 카드(중앙 히어로 폐지). 아이콘 배지 + 제목 + 설명 +
  // 사용법 3행으로 세로를 채운다.
  empty: {alignItems: 'center', gap: rv(8), paddingVertical: rv(28), paddingHorizontal: rs(20), backgroundColor: CARD_HI, borderRadius: RADIUS.lg, borderCurve: 'continuous', marginTop: rv(4)},
  emptyBadge: {width: rs(64), height: rs(64), borderRadius: RADIUS.pill, backgroundColor: withAlpha(T1, 0.06), alignItems: 'center', justifyContent: 'center', marginBottom: rv(6)},
  emptyText: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.3},
  emptySub: {color: T3, fontFamily: FONT, fontSize: TYPE.label.fontSize, lineHeight: rf(20), textAlign: 'center'},
  emptyDivider: {alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: SEP, marginVertical: rv(14)},
  emptyRow: {flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'stretch', gap: rv(10), paddingVertical: rv(7)},
  emptyRowIcon: {marginTop: rv(1)},
  emptyRowText: {flex: 1, color: T2, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '500', lineHeight: rf(21), letterSpacing: -0.2},
  emptyRowStrong: {color: T1, fontWeight: '700'},
});
