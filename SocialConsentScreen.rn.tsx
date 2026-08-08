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
// ── 그런데 카드만으로는 부족하다 ────────────────────────────────────────────
// 카드는 "여기 보이는 것이 전부"라고 말하지만, 사용자는 **카드에 뭐가 없는지를 스스로
// 유추**해야 한다. 없는 걸 알아채는 건 어렵다. 그리고 동의는 "무엇에 동의하는지 구체적으로
// 알렸는가"가 핵심이라, 나중에 문제가 생기면 "카드를 봤으니 알았을 것"보다 **명시적 고지**가
// 훨씬 강한 방어다(스토어 심사·방통위도 마찬가지).
//
// 그래서 둘을 나눠 맡긴다:
//   · **공개되는 것** → 카드가 실물로 보여준다(목록으로 또 쓰면 중복이다)
//   · **공개되지 않는 것** → 문자로 못 박는다(유추가 필요 없게)
//
// 거절('나만 보기')을 작고 흐리게 숨기지 않는다. 그렇게 하면 동의가 아니라 유도다.
// ============================================================================
import React from 'react';
import {View, StyleSheet, ScrollView} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {rf, rs, rv} from './lib/responsive';
import {BG, T1, T2, T3, FONT, GUTTER, TYPE} from './theme';
import {Button, Tap} from './primitives';
import SocialProfileCard from './SocialProfileCard';
import type {PublicProfile} from './lib/publicProfile';

/**
 * 공개되지 않는 것 — **문자로 못 박는다.**
 * 경로를 맨 위에 두는 이유: 러닝 앱에서 사람들이 진짜 걱정하는 게 이거고,
 * 이걸 먼저 해소해야 나머지를 편하게 켠다.
 */
/**
 * 동의 화면에서 보여줄 신발 수 — 세로를 아껴 아래 '공개되지 않아요' 목록까지 한눈에
 * 들어오게 한다. 스크롤해야만 보이는 고지는 고지로서 약하다.
 * 잘린 만큼은 카드가 "최대 N켤레까지 보여요"로 정직하게 알린다.
 */
const CONSENT_MAX_SHOES = 2;

const NOT_PUBLIC: readonly {label: string; why?: string}[] = [
  {label: '달린 경로 지도', why: '집 위치가 드러나요'},
  {label: '몸무게 · 나이 · 성별 · 심박'},
  {label: '러닝별 메모 · 사진 · 날짜'},
];

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
          footnote="여기 보이는 것이 전부입니다."
          maxShoes={CONSENT_MAX_SHOES}
          testID="consent-preview-card"
        />

        {/* 공개되지 않는 것 — 카드가 못 하는 일(없는 것의 명시)을 여기서 한다. */}
        <View style={s.notList} testID="consent-private-list">
          <Text style={s.notHead}>공개되지 않아요</Text>
          {NOT_PUBLIC.map(item => (
            <View key={item.label} style={s.notRow}>
              <Text style={s.notMark}>✕</Text>
              <Text style={s.notText}>
                {item.label}
                {item.why ? <Text style={s.notWhy}>{`  ${item.why}`}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Button label="이대로 공개하기" size="hero" onPress={onAccept} testID="social-consent-accept" />
        <Tap
          onPress={onDecline}
          style={s.ghost}
          accessibilityRole="button"
          accessibilityLabel="나만 보기"
          testID="social-consent-decline">
          <Text style={s.ghostTxt}>나만 보기</Text>
        </Tap>
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
  notList: {marginTop: rv(18)},
  notHead: {
    color: T3, fontFamily: FONT, fontSize: rf(10), fontWeight: '700', letterSpacing: 1.2,
    marginBottom: rv(8),
  },
  notRow: {flexDirection: 'row', alignItems: 'flex-start', gap: rs(8), paddingVertical: rv(4)},
  notMark: {color: T3, fontFamily: FONT, fontSize: rf(11), lineHeight: rf(17), width: rs(11)},
  notText: {flex: 1, color: T2, fontFamily: FONT, fontSize: rf(12.5), lineHeight: rf(17)},
  notWhy: {color: T3, fontSize: rf(11)},

  footer: {gap: rv(6), paddingTop: rv(10)},
  ghost: {minHeight: rs(46), alignItems: 'center', justifyContent: 'center'},
  ghostTxt: {color: T3, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  fine: {color: T3, fontFamily: FONT, fontSize: rf(10.5), lineHeight: rf(14), textAlign: 'center'},
});
