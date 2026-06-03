// ============================================================================
// lib/googleAuth.ts — Google 네이티브 로그인 → firebase OAuth 자격증명 리졸버 (Slice 5)
//
// @react-native-google-signin/google-signin 으로 사용자를 네이티브 Google 계정으로
// 로그인시키고, 받은 idToken 을 firebase 의 GoogleAuthProvider.credential 로 감싸
// firebaseCloudPort 가 signInWithCredential 에 넘길 수 있는 자격증명으로 돌려준다.
//
// 책임 경계: 이 모듈만 google-signin 네이티브에 의존한다. firebaseCloudPort 는 이
// 리졸버를 주입받아(백엔드-순수 유지) 'google' 로그인을 활성화한다(미주입 시 비활성).
// 자격증명 획득 실패(PlayServices 없음/사용자 취소/토큰 없음)는 정직한 한국어 에러로
// 던져 ProfileScreen 이 그대로 안내한다.
//
// jest 는 jest.setup.js 에서 google-signin 과 firebase/auth 의 GoogleAuthProvider 를
// 메모리 가짜로 목 처리해 네이티브 없이 행동(press→signIn→idToken→credential)을 검증한다.
// ============================================================================

import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {GoogleAuthProvider} from '@react-native-firebase/auth';

import {getGoogleWebClientId} from './googleWebClientId';

/** GoogleAuthProvider.credential 이 만들어내는 firebase 자격증명 타입(직접 의존 회피). */
type GoogleAuthCredential = ReturnType<typeof GoogleAuthProvider.credential>;

// configure 는 한 번만(멱등). webClientId 가 있으면 idToken 발급용으로 넘기고, 없으면
// 빈 옵션으로 구성한다(이 경우 signIn 은 idToken=null 을 돌려 아래에서 정직히 막힌다).
let configured = false;

/**
 * GoogleSignin 을 멱등하게 구성한다. webClientId 는 generated 소스에서 취득(하드코딩 0).
 */
export function configureGoogleSignin(): void {
  if (configured) {
    return;
  }
  const webClientId = getGoogleWebClientId();
  GoogleSignin.configure(webClientId ? {webClientId} : {});
  configured = true;
}

/** 테스트 전용: configure 멱등 플래그를 리셋한다. */
export function __resetGoogleSigninForTest(): void {
  configured = false;
}

/**
 * 네이티브 Google 로그인을 수행하고 firebase 용 OAuth 자격증명을 돌려준다.
 *   hasPlayServices() → signIn() → idToken → GoogleAuthProvider.credential(idToken)
 * 실패 경로(PlayServices 없음 / 취소 / idToken 없음)는 정직한 한국어 에러로 reject 한다.
 * firebaseCloudPort.options.resolveGoogleCredential 로 주입해 'google' 로그인을 활성화.
 */
export async function resolveGoogleCredential(): Promise<GoogleAuthCredential> {
  configureGoogleSignin();

  // Play 서비스가 없으면(에뮬레이터/구형 기기) idToken 을 받을 수 없다 — 명확히 막는다.
  try {
    await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  } catch (e: any) {
    if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play 서비스를 사용할 수 없어 로그인할 수 없습니다.');
    }
    throw e;
  }

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (e: any) {
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error('Google 로그인이 취소되었습니다.');
    }
    throw e;
  }

  // v13+ 의 태그드 유니온 응답: 취소는 throw 가 아니라 {type:'cancelled'} 로 온다.
  if (!response || response.type === 'cancelled') {
    throw new Error('Google 로그인이 취소되었습니다.');
  }

  const idToken = response.data?.idToken ?? null;
  if (!idToken) {
    throw new Error('Google 로그인에서 인증 토큰(idToken)을 받지 못했습니다.');
  }

  return GoogleAuthProvider.credential(idToken);
}
