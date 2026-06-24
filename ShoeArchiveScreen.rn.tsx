// ============================================================================
// ShoeArchiveScreen.rn.tsx — 신발 보관함 (마이 탭 → 명예의 전당 아래 진입)
// 보관(retired) 처리했지만 명예의 전당(키프세이크)에는 등재되지 않은 신발을 모아 보여주고,
// 여기서 '복원'하면 다시 활성 목록·러닝 시작에 쓸 수 있다(복원 진입점 = 갭 해소). 목록은
// App 이 retired·비키프세이크로 필터링해 주입한다(표시 전용 — 데이터 생성 0). 색/폰트는
// theme 토큰만. retired 플래그 토글은 onRestore(=App.retireShoe(id,false))에 위임한다.
// ============================================================================
import React from 'react';
import {View, Text, ScrollView, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, CARD_HI, ACCENT, T1, T2, T3, SEP, FONT, RADIUS, withAlpha, Shoe} from './theme';
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
  return (
    <View style={[s.screen, {paddingTop: insets.top}]} testID="shoe-archive-screen">
      <View style={s.nav}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}>
          <Ionicons name="chevron-back" size={20} color={T1} />
        </Pressable>
        <Text style={s.title}>보관함</Text>
        <View style={{width: 36}} />
      </View>
      <ScrollView contentContainerStyle={{paddingHorizontal: 18, paddingBottom: 28, gap: 12, paddingTop: 6}} showsVerticalScrollIndicator={false}>
        <Text style={s.sub}>러닝 목록에서 숨긴 신발이에요. 복원하면 다시 러닝에 사용할 수 있어요.</Text>
        {shoes.length === 0 ? (
          <View style={s.empty} testID="shoe-archive-empty">
            <Ionicons name="archive-outline" size={36} color={T3} />
            <Text style={s.emptyText}>보관한 신발이 없어요.</Text>
            <Text style={s.emptySub}>신발 상세에서 '보관 처리'하면 여기에 모여요.</Text>
          </View>
        ) : (
          shoes.map((sh) => (
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
                <Ionicons name="arrow-undo-outline" size={15} color={ACCENT} />
                <Text style={s.restoreText}>복원</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG},
  nav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10},
  iconBtn: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center'},
  title: {color: T1, fontFamily: FONT, fontSize: 18, fontWeight: '700', letterSpacing: -0.3},
  sub: {color: T3, fontFamily: FONT, fontSize: 13, lineHeight: 18, paddingHorizontal: 4, marginBottom: 2},
  card: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: RADIUS.lg, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP},
  brand: {color: T3, fontFamily: FONT, fontSize: 12, fontWeight: '600', letterSpacing: 0.4},
  model: {color: T1, fontFamily: FONT, fontSize: 17, fontWeight: '700', letterSpacing: -0.2, marginTop: 1},
  meta: {color: T2, fontFamily: FONT, fontSize: 13, fontWeight: '500', marginTop: 4},
  restoreBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 36, borderRadius: RADIUS.pill, backgroundColor: withAlpha(ACCENT, 0.14)},
  restoreText: {color: ACCENT, fontFamily: FONT, fontSize: 14, fontWeight: '700'},
  empty: {alignItems: 'center', gap: 8, paddingVertical: 56, backgroundColor: CARD_HI, borderRadius: RADIUS.lg, marginTop: 4},
  emptyText: {color: T2, fontFamily: FONT, fontSize: 15, fontWeight: '600'},
  emptySub: {color: T3, fontFamily: FONT, fontSize: 13},
});
