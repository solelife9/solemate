// ============================================================================
// LoginScreen.rn.tsx — 필수 로그인 게이트 (Firebase 인증 진입)
// ============================================================================
// 앱 진입 전 단 한 번 거치는 로그인 화면. cloudPort.signIn(provider) 로 Firebase
// 인증을 수행하고, 성공하면 onSignedIn(user) 으로 게이트를 연다. 데이터(신발/런/
// 설정)는 로그인 후 Firestore(userBackups/{uid})에 보관된다.
//
// 버튼/리졸버 로직은 ProfileScreen 의 클라우드 동기 패널과 동일한 cloudPort 를 쓴다
// (단일 진실원). 이 화면은 표시 + 호출만 담당하고 인증 구현엔 관여하지 않는다.
// ============================================================================
import React, {useState} from 'react';
import { rf, rs, ri, rv } from './lib/responsive';
import {View, Text, Pressable, StyleSheet, Platform, ActivityIndicator} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {Button, KeegoWordmark} from './primitives';
import {
  BG, CARD_HI, DANGER, T1, T2, T3, FONT, DISPLAY, RADIUS,
  KAKAO_YELLOW, KAKAO_LABEL, NAVER_GREEN, NAVER_LABEL, TYPE,
} from './theme';
import type {CloudPort, CloudProvider, CloudUser} from './lib/cloudPort';
import {authErrorMessage} from './lib/authErrorMessage';
import {saveCloudAccount} from './lib/cloudAccount';

interface LoginScreenProps {
  cloudPort: CloudPort;
  /** 로그인 성공 시 호출 — 인증된 사용자를 전달해 게이트를 연다. */
  onSignedIn: (user: CloudUser) => void;
}

export function LoginScreen({cloudPort, onSignedIn}: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<CloudProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: CloudProvider) => {
    if (busy) return;
    setBusy(provider);
    setError(null);
    try {
      const user = await cloudPort.signIn(provider);
      // 로그인 계정+제공자를 영속 — ProfileScreen 이 재시작 후에도 '카카오 계정'처럼
      // 어떤 걸로 로그인했는지 표시하고 로그인 상태를 복원하게(2026-07-05).
      void saveCloudAccount(provider, user);
      onSignedIn(user);
    } catch (e: any) {
      // 원문(서버 응답·SDK 코드)은 진단용 로그로만 — 화면엔 사용자 언어만(출시 감사).
      console.log('login error', provider, e?.message || e);
      const msg = authErrorMessage(e);
      if (msg) setError(msg); // null = 사용자 취소 — 조용히 복귀
      setBusy(null);
    }
  };

  const signingIn = busy !== null;

  return (
    <View style={[st.screen, {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24}]}>
      {/* 브랜드 히어로 — 정본 KeegoWordmark(파파야) 하나만. 일회성 'K' 배지는 폐기
          (앱 어디에도 없는 발명 자산이었고 워드마크도 흰색이라 첫 화면이 오프캐논이었다). */}
      <View style={st.hero}>
        <KeegoWordmark size={TYPE.display.fontSize} />
        <Text style={st.tagline}>러닝화의 수명을 기록하다</Text>
      </View>

      {/* 로그인 버튼 */}
      <View style={st.actions}>
        <Text style={st.lead}>로그인하고 시작하기</Text>

        <Pressable
          testID="login-kakao"
          onPress={() => signIn('kakao')}
          disabled={signingIn}
          accessibilityRole="button"
          accessibilityLabel="카카오로 로그인"
          accessibilityState={{disabled: signingIn}}
          style={({pressed}) => [st.btn, st.btnKakao, pressed && {opacity: 0.85}]}>
          {busy === 'kakao'
            ? <ActivityIndicator color={KAKAO_LABEL} />
            : <>
                <Text style={[st.brandMark, {color: KAKAO_LABEL}]}>K</Text>
                <Text style={[st.btnTxt, {color: KAKAO_LABEL}]}>카카오로 계속</Text>
              </>}
        </Pressable>

        <Pressable
          testID="login-naver"
          onPress={() => signIn('naver')}
          disabled={signingIn}
          accessibilityRole="button"
          accessibilityLabel="네이버로 로그인"
          accessibilityState={{disabled: signingIn}}
          style={({pressed}) => [st.btn, st.btnNaver, pressed && {opacity: 0.85}]}>
          {busy === 'naver'
            ? <ActivityIndicator color={NAVER_LABEL} />
            : <>
                <Text style={[st.brandMark, {color: NAVER_LABEL}]}>N</Text>
                <Text style={[st.btnTxt, {color: NAVER_LABEL}]}>네이버로 계속</Text>
              </>}
        </Pressable>

        <Button
          testID="login-google"
          label={busy === 'google' ? '로그인 중…' : 'Google로 계속'}
          onPress={() => signIn('google')}
          disabled={signingIn}
          iconNode={
            // 고정 박스 중앙 정렬 — 아이콘(Text 글리프)이 라인박스에 아래가 잘리던 것 방지
            // (사용자 실기기 제보 2026-07-16: G 하단 클리핑).
            <View style={st.googleIconBox}>
              <Ionicons name="logo-google" size={ri(17)} color={signingIn ? T3 : T1} />
            </View>
          }
          style={st.btnGoogle}
        />

        {Platform.OS === 'ios' && (
          <Pressable
            testID="login-apple"
            onPress={() => signIn('apple')}
            disabled={signingIn}
            accessibilityRole="button"
            accessibilityLabel="Apple로 로그인"
            accessibilityState={{disabled: signingIn}}
            style={({pressed}) => [st.btn, st.btnApple, pressed && {opacity: 0.85}]}>
            {busy === 'apple'
              ? <ActivityIndicator color={T1} />
              : <>
                  <Ionicons name="logo-apple" size={ri(18)} color={T1} />
                  <Text style={st.btnTxt}>Apple로 계속</Text>
                </>}
          </Pressable>
        )}

        {error && (
          <Text testID="login-error" style={st.error}>{error}</Text>
        )}

        <Text style={st.footnote}>
          로그인하면 신발·러닝 기록·설정이 안전하게 보관되고, 기기를 바꿔도 그대로 이어져요.
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, paddingHorizontal: rs(28), justifyContent: 'space-between'},
  hero: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: rv(14)},
  tagline: {fontFamily: FONT, fontSize: TYPE.body.fontSize, color: T3},
  actions: {gap: rv(12)},
  lead: {fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', color: T2, textAlign: 'center', marginBottom: rv(4)},
  btn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), height: rs(50), borderRadius: RADIUS.btn, borderCurve: 'continuous'},
  btnGoogle: {height: rs(50)},
  googleIconBox: {width: ri(20), height: ri(24), alignItems: 'center', justifyContent: 'center'},
  btnApple: {backgroundColor: CARD_HI},
  btnKakao: {backgroundColor: KAKAO_YELLOW},
  btnNaver: {backgroundColor: NAVER_GREEN},
  brandMark: {fontFamily: DISPLAY, fontSize: TYPE.heading.fontSize, fontWeight: '700'},
  btnTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  error: {fontFamily: FONT, fontSize: TYPE.label.fontSize, color: DANGER, textAlign: 'center', marginTop: rv(4)},
  footnote: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, lineHeight: rf(17), color: T3, textAlign: 'center', marginTop: rv(8)},
});
