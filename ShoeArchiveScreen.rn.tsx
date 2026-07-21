// ============================================================================
// ShoeArchiveScreen.rn.tsx — 신발 보관함 (신발 탭 하단 '보관된 신발 N켤레' 행에서 진입
// — 심사 #7, 2026-07-22: 보관 '행동'이 있는 신발 탭에 복원 동선을 함께 둔다. 구 마이탭 행 제거)
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
import {BG, GLASS, ACCENT, T1, T2, T3, SEP, FONT, DISPLAY, RADIUS, withAlpha, Shoe, TYPE} from './theme';
import {SwipeBack, EmptyGhostHeader, GhostStrong, GhostBar, GhostThumb, GhostPill, ShoeGlyph, GlassEdge} from './primitives';
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
          // 빈 상태 = 고스트 카드(사용자 확정 2026-07-09) — 홈 GhostShoeCard 와 같은
          // '채워질 모습을 형태로 말하기' 문법. 점선은 유틸리티(드롭존)로 읽혀 배제 —
          // 실카드와 동일한 콰이어트 글라스에 내용만 실루엣으로 딤 처리한다.
          <View testID="shoe-archive-empty">
            <EmptyGhostHeader
              title={'당장 안 신는 신발은,\n잠시 쉬게 하세요'}
              sub={<>신발 상세에서 <GhostStrong>보관 처리</GhostStrong>하면 러닝 목록에서 빠져요.{'\n'}기록은 그대로 남고, <GhostStrong>복원</GhostStrong>은 언제든.</>}
            />
            {/* 고스트 스택 — 실카드(s.card)와 같은 재질, 아래로 갈수록 사라지며
                화면 세로를 채운다(기기 피드백: 두 장으론 하단이 빈다). */}
            <View style={s.card}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              <GhostThumb><ShoeGlyph size={ri(24)} color={withAlpha(T1, 0.35)} /></GhostThumb>
              <View style={{flex: 1, minWidth: 0}}>
                <GhostBar w="38%" />
                <GhostBar w="62%" dim />
              </View>
              <GhostPill label="복원" />
            </View>
            <View style={[s.card, {opacity: 0.45, marginTop: rv(10)}]}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              <GhostThumb />
              <View style={{flex: 1, minWidth: 0}}>
                <GhostBar w="32%" />
                <GhostBar w="55%" dim />
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* 요약 스탯 헤더 — 상단정렬 + 공백을 보관 수·누적 거리로 채운다. */}
            <View style={s.statStrip}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
              <View style={s.stat}><Text style={s.statV}>{shoes.length}</Text><Text style={s.statL}>보관</Text></View>
              <View style={s.statDiv} />
              <View style={s.stat}><Text style={s.statV}>{totalUsed}<Text style={s.statU}> {unit}</Text></Text><Text style={s.statL}>누적 거리</Text></View>
            </View>
            <Text style={s.sub}>러닝 목록에서 숨긴 신발이에요. 복원하면 다시 러닝에 사용할 수 있어요.</Text>
            {shoes.map((sh) => (
            <View key={sh.id} style={s.card} testID={`archive-shoe-${sh.id}`}>
              <GlassEdge glints={false} radius={RADIUS.lg} />
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
  // 코너 페이드 헤어라인(GlassEdge glints=false) — 균일 RN 보더 폐지(2026-07-10 확정).
  statStrip: {flexDirection: 'row', alignItems: 'center', backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden', paddingVertical: rv(16)},
  stat: {flex: 1, alignItems: 'center', gap: rv(4)},
  statV: {color: T1, fontFamily: DISPLAY, fontSize: TYPE.title.fontSize, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums']},
  statU: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '700'},
  statL: {color: T3, fontFamily: FONT, fontSize: TYPE.micro.fontSize, fontWeight: '600', letterSpacing: 0.3},
  statDiv: {width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: SEP, marginVertical: rv(4)},
  card: {flexDirection: 'row', alignItems: 'center', gap: rv(12), backgroundColor: GLASS.fill, borderRadius: RADIUS.lg, borderCurve: 'continuous', padding: rs(16), overflow: 'hidden'},
  brand: {color: T3, fontFamily: FONT, fontSize: TYPE.caption.fontSize, fontWeight: '600', letterSpacing: 0.4},
  model: {color: T1, fontFamily: FONT, fontSize: TYPE.heading.fontSize, fontWeight: '700', letterSpacing: -0.2, marginTop: rv(1)},
  meta: {color: T2, fontFamily: FONT, fontSize: TYPE.label.fontSize, fontWeight: '500', marginTop: rv(4)},
  restoreBtn: {flexDirection: 'row', alignItems: 'center', gap: rv(4), paddingHorizontal: rs(14), height: rs(36), borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.14)},
  restoreText: {color: ACCENT, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '700'},
  // 빈 상태 = 프리미티브(EmptyGhostHeader/GhostBar 등) — 페이드 스택은 인라인 opacity.
});
