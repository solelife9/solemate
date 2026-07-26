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
import {View, Pressable, StyleSheet, Platform, ActivityIndicator} from 'react-native';
import {Text} from './lib/text';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {Button, KeegoWordmark, KakaoMark, NaverMark} from './primitives';
import {reportIssue} from './lib/crashlytics';
import {
  BG, ACCENT, BLACK, DANGER, T1, T2, T3, FONT, RADIUS,
  KAKAO_YELLOW, KAKAO_LABEL, NAVER_GREEN, NAVER_LABEL, TYPE,
  GUTTER, MOTION,
  ICON,
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
      reportIssue(`auth: login (${provider})`, e);
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
        {/* 가치 3행(심사 #9, 2026-07-22) — 하드 게이트가 태그라인 한 줄로만 서 있던 것 보강.
            왜 로그인해야 하는지(무엇을 얻는지)를 게이트 화면이 스스로 판다. 무채·조용히. */}
        <View style={st.valueRows}>
          {([
            {icon: 'footsteps-outline', text: '러닝화 수명을 추적해 교체 시점을 미리 알려드려요'},
            {icon: 'analytics-outline', text: '거리·페이스·심박 — 폰만으로 정밀하게 기록해요'},
            {icon: 'cloud-done-outline', text: '기록은 클라우드에 안전하게, 기기를 바꿔도 그대로'},
          ] as const).map(row => (
            <View key={row.icon} style={st.valueRow} accessible accessibilityLabel={row.text}>
              <Ionicons name={row.icon} size={ri(ICON.inline)} color={T3} />
              <Text style={st.valueText}>{row.text}</Text>
            </View>
          ))}
        </View>
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
          style={({pressed}) => [st.btn, st.btnKakao, pressed && st.pressed]}>
          {busy === 'kakao'
            ? <ActivityIndicator color={KAKAO_LABEL} />
            : <>
                <KakaoMark size={ri(ICON.action)} color={KAKAO_LABEL} />
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
          style={({pressed}) => [st.btn, st.btnNaver, pressed && st.pressed]}>
          {busy === 'naver'
            ? <ActivityIndicator color={NAVER_LABEL} />
            : <>
                <NaverMark size={ri(ICON.tag)} color={NAVER_LABEL} />
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
              <Ionicons name="logo-google" size={ri(ICON.inline)} color={signingIn ? T3 : T1} />
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
            style={({pressed}) => [st.btn, st.btnApple, pressed && st.pressed]}>
            {/* Sign in with Apple 공식 스펙(HIG·심사 4.8): 다크 배경 위 = 흰 버튼 +
                검정 로고/라벨, 문구는 공식 한국어 "Apple로 계속하기". 커스텀 회색 버튼은
                리젝 리스크(2026-07-24 심사 P0 #9). */}
            {busy === 'apple'
              ? <ActivityIndicator color={BLACK} />
              : <>
                  <Ionicons name="logo-apple" size={ri(ICON.action)} color={BLACK} />
                  <Text style={[st.btnTxt, {color: BLACK}]}>Apple로 계속하기</Text>
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
  // 루트 거터만 GUTTER 로 토큰화(중앙 정렬 히어로 등 내부 정렬은 유지).
  screen: {flex: 1, backgroundColor: BG, paddingHorizontal: GUTTER, justifyContent: 'space-between'},
  // 누름 표준(MOTION.press) — 사설 opacity 0.85 폐지, 전역 Button 프리미티브와 동일 감각.
  pressed: {opacity: MOTION.press.opacity, transform: [{scale: MOTION.press.scale}]},
  hero: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: rv(14)},
  tagline: {fontFamily: FONT, fontSize: TYPE.body.fontSize, color: T3},
  // 가치 3행(심사 #9) — 태그라인 아래 좌정렬 스택. 게이트의 설득은 조용하게(무채 T3).
  valueRows: {gap: rv(10), marginTop: rv(18), alignSelf: 'center'},
  valueRow: {flexDirection: 'row', alignItems: 'center', gap: rv(8)},
  valueText: {fontFamily: FONT, fontSize: TYPE.label.fontSize, color: T3, letterSpacing: -0.1},
  actions: {gap: rv(12)},
  lead: {fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600', color: T2, textAlign: 'center', marginBottom: rv(4)},
  btn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rv(8), minHeight: rs(50), borderRadius: RADIUS.btn, borderCurve: 'continuous'},
  btnGoogle: {minHeight: rs(50)},
  googleIconBox: {width: ri(20), height: ri(24), alignItems: 'center', justifyContent: 'center'},
  // Apple 공식: 다크 UI 위에서는 흰 버튼(검정 로고/라벨)이 스펙 — 회색 커스텀 폐지.
  btnApple: {backgroundColor: ACCENT},
  btnKakao: {backgroundColor: KAKAO_YELLOW},
  btnNaver: {backgroundColor: NAVER_GREEN},
  btnTxt: {color: T1, fontFamily: FONT, fontSize: TYPE.body.fontSize, fontWeight: '600'},
  error: {fontFamily: FONT, fontSize: TYPE.label.fontSize, color: DANGER, textAlign: 'center', marginTop: rv(4)},
  footnote: {fontFamily: FONT, fontSize: TYPE.caption.fontSize, lineHeight: rf(17), color: T3, textAlign: 'center', marginTop: rv(8)},
});
