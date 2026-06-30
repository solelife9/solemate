// ─── lib/kakaoAuth.ts — 카카오 네이티브 로그인 → Firebase 커스텀 토큰 리졸버 ──────
// @react-native-seoul/kakao-login 으로 네이티브 카카오 로그인 → accessToken 획득 →
// 백엔드(/api/auth/kakao)가 토큰을 검증하고 발급한 Firebase 커스텀 토큰을 돌려준다.
// firebaseCloudPort 가 이 리졸버를 주입받아 signInWithCustomToken 으로 로그인한다.
// 키 미설정(socialConfig 빈 값) 시 정직한 에러로 비활성. jest 는 네이티브 모듈을 목 처리.

import {login as kakaoLogin} from '@react-native-seoul/kakao-login';
import {KAKAO_NATIVE_APP_KEY, SOCIAL_BACKEND} from './socialConfig';

// 네이티브 초기화는 KakaoSdk 가 android string resource `kakao_app_key` 에서 자동 수행한다
// (RNKakaoLoginsModule 의 init 블록). 그 키는 build.gradle 의 resValue 로 gradle 속성
// (KAKAO_NATIVE_APP_KEY, ~/.gradle/gradle.properties)에서 주입 — 공개 레포에 노출 안 함.
// socialConfig 의 키는 '설정됨' 게이트 용도.

/** 카카오 로그인 → 백엔드 검증 → Firebase 커스텀 토큰(string) 반환. */
export async function resolveKakaoFirebaseToken(): Promise<string> {
  if (!KAKAO_NATIVE_APP_KEY) {
    throw new Error('카카오 로그인이 아직 설정되지 않았습니다.');
  }
  let token;
  try {
    token = await kakaoLogin();
  } catch (e: any) {
    // 사용자 취소는 친절한 한국어로(구글·네이버와 톤 통일). 그 외 에러는 원본 보존.
    const msg = String((e && (e.message || e.code)) || '');
    if (/cancel|취소|E_CANCELLED/i.test(msg)) {
      throw new Error('카카오 로그인이 취소되었습니다.');
    }
    throw e instanceof Error ? e : new Error(`카카오 로그인 실패: ${msg.slice(0, 80)}`);
  }
  const accessToken = token && token.accessToken;
  if (!accessToken) throw new Error('카카오 액세스 토큰을 받지 못했습니다.');

  const r = await fetch(`${SOCIAL_BACKEND}/api/auth/kakao`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({accessToken}),
  });
  if (!r || !r.ok) {
    const t = await (r ? r.text() : Promise.resolve('')).catch(() => '');
    throw new Error(`카카오 로그인 서버 오류: ${String(t).slice(0, 100)}`);
  }
  const data = await r.json();
  if (!data || !data.firebaseToken) throw new Error('Firebase 토큰을 받지 못했습니다.');
  return data.firebaseToken;
}
