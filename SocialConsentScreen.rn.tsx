// ============================================================================
// SocialConsentScreen.rn.tsx — 공개 범위 동의 (소셜 1단계)
// ----------------------------------------------------------------------------
// keego 는 동의도 화면도 없이 개인정보가 공개 컬렉션에 쌓이던 사고를 이미 냈다
// (767032e, AUDIT 1). 이 화면이 그 재발을 막는 관문이다 — **여기서 동의를 받기 전에는
// 아무것도 올라가지 않는다**(lib/publicProfile: 'unset' = 비공개).
//
// ── 설계 의도: 말로 설명하지 말고 실물을 보여준다 ────────────────────────────
// 처음엔 "공개돼요 / 공개되지 않아요" 목록 두 개였다. 정보는 정확했지만 기억에 안 남고,
// **왜 켜고 싶은지**가 없었다. 그래서 남들에게 보일 **그 카드를 그대로** 띄운다.
//   · 오해할 여지가 없다 — 공개될 화면이 눈앞에 있다
//   · "여기 보이는 것이 전부입니다" 한 줄이 부정 목록 전체보다 세다(검증 가능한 약속)
//   · 신발과 수명 링이 보이는 순간 이 기능의 재미가 전달된다
//
// 거절('나만 보기')을 작고 흐리게 숨기지 않는다. 그렇게 하면 동의가 아니라 유도다.
// ============================================================================
import React from 'react';
import {View, Pressable, StyleSheet, ScrollView} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {rf, rs, rv} from './lib/responsive';
import {BG, T1, T3, FONT, GUTTER, TYPE} from './theme';
import {Button} from './primitives';
import SocialProfileCard from './SocialProfileCard';
import type {PublicProfile} from './lib/publicProfile';

export default function SocialConsentScreen({
  preview,
  onAccept,
  onDecline,
}: {
  /** 내가 공개하면 남들에게 보일 바로 그 카드. */
  preview: PublicProfile;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[s.screen, {paddingTop: insets.top + rv(8), paddingBottom: insets.bottom + rv(12)}]}
      testID="social-consent-screen">
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}>
        <Text style={s.title}>이렇게 보여요</Text>
        <Text style={s.lead}>다른 러너에게 내 프로필이 이렇게 보입니다.</Text>

        <Text style={s.eyebrow}>내 공개 프로필</Text>
        <SocialProfileCard
          profile={preview}
          footnote="경로·몸무게·메모는 올라가지 않아요. 여기 보이는 것이 전부입니다."
          testID="consent-preview-card"
        />
      </ScrollView>

      <View style={s.footer}>
        <Button label="이대로 공개하기" size="hero" onPress={onAccept} testID="social-consent-accept" />
        <Pressable
          onPress={onDecline}
          style={s.ghost}
          accessibilityRole="button"
          accessibilityLabel="나만 보기"
          testID="social-consent-decline">
          <Text style={s.ghostTxt}>나만 보기</Text>
        </Pressable>
        <Text style={s.fine}>언제든 마이 → 설정에서 바꿀 수 있어요</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, paddingHorizontal: GUTTER},
  scroll: {flex: 1},
  content: {paddingTop: rv(28), paddingBottom: rv(16)},
  title: {color: T1, fontFamily: FONT, fontSize: TYPE.title.fontSize, fontWeight: '700', letterSpacing: -0.5},
  lead: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, lineHeight: rf(20), marginTop: rv(6)},
  eyebrow: {
    color: T3, fontFamily: FONT, fontSize: rf(10), fontWeight: '700', letterSpacing: 1.4,
    textAlign: 'center', marginTop: rv(22), marginBottom: rv(9),
  },
  footer: {gap: rv(6), paddingTop: rv(10)},
  ghost: {minHeight: rs(46), alignItems: 'center', justifyContent: 'center'},
  ghostTxt: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  fine: {color: T3, fontFamily: FONT, fontSize: rf(10.5), lineHeight: rf(14), textAlign: 'center'},
});
