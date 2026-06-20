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
import {View, Text, Pressable, StyleSheet, Platform, ActivityIndicator} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {Button} from './primitives';
import {
  BG, CARD_HI, ACCENT, T1, T2, T3, FONT, DISPLAY, RADIUS, withAlpha,
  KAKAO_YELLOW, KAKAO_LABEL, NAVER_GREEN, NAVER_LABEL,
} from './theme';
import type {CloudPort, CloudProvider, CloudUser} from './lib/cloudPort';

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
      onSignedIn(user);
    } catch (e: any) {
      setError(e?.message || '로그인에 실패했어요. 잠시 후 다시 시도해주세요.');
      setBusy(null);
    }
  };

  const signingIn = busy !== null;

  return (
    <View style={[st.screen, {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24}]}>
      {/* 브랜드 히어로 */}
      <View style={st.hero}>
        <View style={st.logoBadge}>
          <Text style={st.logoK}>K</Text>
        </View>
        <Text style={st.wordmark}>Keego</Text>
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
          iconNode={<Ionicons name="logo-google" size={17} color={signingIn ? T3 : T1} />}
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
                  <Ionicons name="logo-apple" size={18} color={T1} />
                  <Text style={st.btnTxt}>Apple로 계속</Text>
                </>}
          </Pressable>
        )}

        {error && (
          <Text testID="login-error" style={st.error}>{error}</Text>
        )}

        <Text style={st.footnote}>
          로그인하면 신발·러닝 기록·설정이 계정에 안전하게 보관되고 기기를 바꿔도 그대로 이어집니다.
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, paddingHorizontal: 28, justifyContent: 'space-between'},
  hero: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14},
  logoBadge: {
    width: 84, height: 84, borderRadius: 22, backgroundColor: withAlpha(ACCENT, 0.14),
    alignItems: 'center', justifyContent: 'center',
  },
  logoK: {fontFamily: DISPLAY, fontSize: 48, fontWeight: '800', color: ACCENT, marginTop: -2},
  wordmark: {fontFamily: DISPLAY, fontSize: 34, fontWeight: '800', color: T1, letterSpacing: 0.5},
  tagline: {fontFamily: FONT, fontSize: 15, color: T3},
  actions: {gap: 12},
  lead: {fontFamily: FONT, fontSize: 14, fontWeight: '600', color: T2, textAlign: 'center', marginBottom: 4},
  btn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: RADIUS.btn},
  btnGoogle: {height: 50},
  btnApple: {backgroundColor: CARD_HI},
  btnKakao: {backgroundColor: KAKAO_YELLOW},
  btnNaver: {backgroundColor: NAVER_GREEN},
  brandMark: {fontFamily: DISPLAY, fontSize: 17, fontWeight: '800'},
  btnTxt: {color: T1, fontFamily: FONT, fontSize: 15, fontWeight: '600'},
  error: {fontFamily: FONT, fontSize: 13, color: '#FF5A45', textAlign: 'center', marginTop: 4},
  footnote: {fontFamily: FONT, fontSize: 12, lineHeight: 17, color: T3, textAlign: 'center', marginTop: 8},
});
