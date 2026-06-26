// ============================================================================
// LocationPrimeScreen.rn.tsx — 위치 권한 설명(priming) 풀스크린 (P0-5)
// 첫 GPS 런 직전, OS 권한 다이얼로그가 뜨기 전에 '왜 위치가 필요한지 + 어떤 선택을
// 해야 하는지'를 브랜디드 화면으로 안내한다(바로 OS Alert 대신). 핵심 가이드는
// "'앱 사용 중에 허용'만으로도 화면을 꺼/주머니에 넣어도 거리가 멈추지 않는다"
// (이전 거리 동결 버그의 교훈) + 프라이버시 안심. 순수 프레젠테이션.
// '계속' → onContinue(권한 안내 완료 영속 + 런 진입), '나중에' → onCancel.
// ============================================================================
import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BG, CARD, ACCENT, GOOD, T1, T2, T3, FONT, RADIUS, SEP, withAlpha} from './theme';

function Row({icon, color, title, body}: {icon: string; color: string; title: string; body: string}) {
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, {backgroundColor: withAlpha(color, 0.14)}]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{flex: 1}}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowBody}>{body}</Text>
      </View>
    </View>
  );
}

export default function LocationPrimeScreen({
  onContinue,
  onCancel,
}: {
  onContinue?: () => void;
  onCancel?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]} testID="location-prime-screen">
      <View style={s.body}>
        <View style={s.hero}>
          <Ionicons name="navigate-circle" size={44} color={ACCENT} />
        </View>
        <Text style={s.title}>정확한 러닝 측정을 위해</Text>
        <Text style={s.lead}>다음 화면에서 위치 권한을 물어봐요. 잠깐만 읽어주세요.</Text>

        <View style={s.card}>
          <Row icon="walk" color={ACCENT} title="‘앱 사용 중에 허용’을 선택하세요"
            body="화면을 꺼도, 폰을 주머니에 넣어도 거리가 멈추지 않고 끝까지 기록돼요." />
          <View style={s.sep} />
          <Row icon="speedometer" color={GOOD} title="거리·페이스·코스를 정확히"
            body="GPS로 실제 달린 경로와 구간 페이스를 측정해요." />
          <View style={s.sep} />
          <Row icon="lock-closed" color={T2} title="위치는 러닝 기록에만"
            body="위치 데이터는 내 러닝 기록을 위해서만 쓰이고 기기에 저장돼요." />
        </View>
      </View>

      <View style={s.footer}>
        <Pressable onPress={onContinue} accessibilityRole="button" accessibilityLabel="계속" testID="location-prime-continue"
          style={({pressed}) => [s.primary, pressed && {opacity: 0.85}]}>
          <Text style={s.primaryTxt}>계속</Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="나중에" testID="location-prime-cancel"
          style={s.ghost}>
          <Text style={s.ghostTxt}>나중에</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, paddingHorizontal: 22},
  body: {flex: 1, justifyContent: 'center'},
  hero: {alignSelf: 'center', width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(ACCENT, 0.12), marginBottom: 18},
  title: {color: T1, fontFamily: FONT, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center'},
  lead: {color: T3, fontFamily: FONT, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 22},
  card: {backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: SEP, paddingHorizontal: 16, paddingVertical: 4},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 15},
  rowIcon: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 1},
  rowTitle: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '700', letterSpacing: -0.2},
  rowBody: {color: T2, fontFamily: FONT, fontSize: 13, lineHeight: 18, marginTop: 3, fontWeight: '400'},
  sep: {height: StyleSheet.hairlineWidth, backgroundColor: SEP, marginLeft: 49},
  footer: {gap: 6},
  primary: {height: 54, borderRadius: RADIUS.lg, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center'},
  primaryTxt: {color: '#000', fontFamily: FONT, fontSize: 16, fontWeight: '800'},
  ghost: {height: 46, alignItems: 'center', justifyContent: 'center'},
  ghostTxt: {color: T3, fontFamily: FONT, fontSize: 14, fontWeight: '600'},
});
