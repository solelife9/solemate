// ============================================================================
// lib/appleAuth.ts — Apple 네이티브 로그인 → firebase OAuth 자격증명 리졸버
//
// expo-apple-authentication 으로 'Sign in with Apple' 을 수행하고, 받은 identityToken
// 을 firebase 의 AppleAuthProvider.credential 로 감싸 firebaseCloudPort 가
// signInWithCredential 에 넘길 수 있는 자격증명으로 돌려준다(googleAuth 와 동일 패턴).
//
// 보안(replay 방지): 무작위 raw nonce 를 만들어 SHA-256 해시를 Apple 에 보내고, raw nonce
// 를 firebase 자격증명에 넘긴다. firebase 가 identityToken 안의 해시와 raw nonce 를 대조한다.
//
// 책임 경계: 이 모듈만 expo-apple-authentication/expo-crypto 네이티브에 의존한다.
// firebaseCloudPort 는 이 리졸버를 주입받아 'apple' 로그인을 활성화한다(미주입 시 비활성).
// 자격증명 획득 실패(미지원 기기/사용자 취소/토큰 없음)는 정직한 한국어 에러로 던진다.
// ============================================================================

import {Platform} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {AppleAuthProvider} from '@react-native-firebase/auth';

/** AppleAuthProvider.credential 이 만들어내는 firebase 자격증명 타입(직접 의존 회피). */
type AppleAuthCredential = ReturnType<typeof AppleAuthProvider.credential>;

/** 무작위 raw nonce(영숫자) 생성. crypto 난수 바이트를 문자셋으로 매핑한다. */
async function generateRawNonce(length = 32): Promise<string> {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._';
  const bytes = await Crypto.getRandomBytesAsync(length);
  let nonce = '';
  for (let i = 0; i < bytes.length; i++) {
    nonce += charset[bytes[i] % charset.length];
  }
  return nonce;
}

/**
 * 네이티브 Apple 로그인을 수행하고 firebase 용 OAuth 자격증명을 돌려준다.
 *   isAvailableAsync → (raw nonce, SHA-256 hashed nonce) → signInAsync(hashed)
 *   → identityToken → AppleAuthProvider.credential(identityToken, rawNonce)
 * 실패 경로(iOS 외/미지원/취소/토큰 없음)는 정직한 한국어 에러로 reject 한다.
 * firebaseCloudPort.options.resolveAppleCredential 로 주입해 'apple' 로그인을 활성화.
 */
export async function resolveAppleCredential(): Promise<AppleAuthCredential> {
  // Sign in with Apple 은 iOS 13+ 전용. 안드로이드/웹에서는 호출되지 않도록 막는다.
  if (Platform.OS !== 'ios') {
    throw new Error('Apple 로그인은 iOS에서만 지원됩니다.');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('이 기기에서는 Apple 로그인을 사용할 수 없습니다.');
  }

  const rawNonce = await generateRawNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let response;
  try {
    response = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e: any) {
    const code = e?.code;
    const msg = String(e?.message || '');
    // 사용자가 시트를 닫음(취소) — expo 는 ERR_REQUEST_CANCELED 코드로 던진다.
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      throw new Error('Apple 로그인이 취소되었습니다.');
    }
    // unknown/failed — Apple 인증 자체가 실패. 시뮬레이터/기기에 Apple ID 가 로그인돼 있지
    // 않으면 ASAuthorizationError.unknown("...failed for an unknown reason")으로 떨어지는데,
    // 원문은 사용자에게 무의미하다 → 가장 흔한 원인을 짚는 안내로 바꾼다(code/메시지 양쪽 매칭).
    if (
      code === 'ERR_REQUEST_UNKNOWN' ||
      code === 'ERR_REQUEST_FAILED' ||
      /unknown reason|authorization attempt failed/i.test(msg)
    ) {
      throw new Error(
        'Apple 로그인에 실패했어요. 기기 설정에서 Apple ID로 로그인되어 있는지 확인한 뒤 다시 시도해 주세요.',
      );
    }
    throw e;
  }

  const identityToken = response?.identityToken ?? null;
  if (!identityToken) {
    throw new Error('Apple 로그인에서 인증 토큰(identityToken)을 받지 못했습니다.');
  }

  return AppleAuthProvider.credential(identityToken, rawNonce);
}
