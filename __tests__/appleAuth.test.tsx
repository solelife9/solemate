/**
 * lib/appleAuth — Apple 네이티브 로그인 → firebase 자격증명 리졸버.
 *
 * 검증(행동): expo-apple-authentication/expo-crypto 메모리 목으로 네이티브 없이 결정적으로
 * 테스트한다.
 *  1) 해피패스: isAvailable→signIn(hashed nonce)→identityToken→AppleAuthProvider.credential
 *     (raw nonce 전달).
 *  2) 미지원 기기(isAvailable=false) → 정직한 에러.
 *  3) 사용자 취소(ERR_REQUEST_CANCELED) → '취소' 메시지.
 *  4) unknown/failed(코드 또는 'unknown reason' 메시지) → 'Apple ID 로그인 확인' 안내(원문 대체).
 *  5) identityToken 부재 → 토큰 없음 에러.
 *
 * @format
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import {resolveAppleCredential} from '../lib/appleAuth';

const signInAsync = AppleAuthentication.signInAsync as jest.Mock;
const isAvailableAsync = AppleAuthentication.isAvailableAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  isAvailableAsync.mockResolvedValue(true);
  signInAsync.mockResolvedValue({identityToken: 'apple-identity-token', fullName: null, email: null});
});

test('해피패스: identityToken + raw nonce 로 firebase 자격증명을 만든다', async () => {
  const cred: any = await resolveAppleCredential();
  // 해시된 nonce 를 Apple 에 보낸다(raw 가 아니라 SHA-256).
  expect(signInAsync).toHaveBeenCalledTimes(1);
  const arg = signInAsync.mock.calls[0][0];
  expect(typeof arg.nonce).toBe('string');
  expect(arg.nonce.startsWith('sha256(')).toBe(true); // 목 digest 형식
  // 자격증명에 identityToken 이 실린다(auth 목: token=idToken).
  expect(cred.providerId).toBe('apple.com');
  expect(cred.token).toBe('apple-identity-token');
  // secret(=raw nonce)은 해시 입력이었던 raw 값이어야 한다(해시 안 된 원문).
  expect(cred.secret).not.toContain('sha256(');
  expect(typeof cred.secret).toBe('string');
});

test('미지원 기기 → 정직한 에러', async () => {
  isAvailableAsync.mockResolvedValue(false);
  await expect(resolveAppleCredential()).rejects.toThrow('사용할 수 없습니다');
});

test('사용자 취소(ERR_REQUEST_CANCELED) → 취소 메시지', async () => {
  signInAsync.mockRejectedValue(Object.assign(new Error('canceled'), {code: 'ERR_REQUEST_CANCELED'}));
  await expect(resolveAppleCredential()).rejects.toThrow('취소');
});

test('unknown(코드) → Apple ID 로그인 확인 안내', async () => {
  signInAsync.mockRejectedValue(Object.assign(new Error('x'), {code: 'ERR_REQUEST_UNKNOWN'}));
  await expect(resolveAppleCredential()).rejects.toThrow('Apple ID로 로그인');
});

test("unknown(메시지만) → 안내로 대체(원문 'unknown reason' 노출 안 함)", async () => {
  signInAsync.mockRejectedValue(new Error('The authorization attempt failed for an unknown reason.'));
  await expect(resolveAppleCredential()).rejects.toThrow('Apple ID로 로그인');
  await expect(resolveAppleCredential()).rejects.not.toThrow('unknown reason');
});

test('identityToken 부재 → 토큰 없음 에러', async () => {
  signInAsync.mockResolvedValue({identityToken: null, fullName: null, email: null});
  await expect(resolveAppleCredential()).rejects.toThrow('identityToken');
});
