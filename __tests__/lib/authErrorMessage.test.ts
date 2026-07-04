/**
 * authErrorMessage — 로그인 실패의 사용자 언어 매핑(출시 감사 2026-07-04).
 * 원문(서버 응답·SDK 코드·개발 용어)이 화면에 새지 않는 것이 계약이다.
 * @format
 */
import {authErrorMessage} from '../../lib/authErrorMessage';

test('사용자 취소는 null — 에러로 취급하지 않는다', () => {
  expect(authErrorMessage(new Error('카카오 로그인이 취소되었습니다.'))).toBeNull();
  expect(authErrorMessage(new Error('Google 로그인이 취소되었습니다.'))).toBeNull();
  expect(authErrorMessage({code: 'ERR_REQUEST_CANCELED'})).toBeNull();
  expect(authErrorMessage({code: 'E_CANCELLED'})).toBeNull();
});

test('네트워크 계열은 연결 확인 안내로', () => {
  expect(authErrorMessage(new Error('Network request failed'))).toBe(
    '인터넷 연결을 확인하고 다시 시도해 주세요.',
  );
  expect(authErrorMessage(new Error('timeout of 10000ms exceeded'))).toContain('인터넷');
});

test('서버 오류 원문·개발 용어는 절대 화면 문구에 새지 않는다', () => {
  const leaky = [
    new Error('네이버 로그인 서버 오류: {"error":"invalid_grant","trace":"a1b2c3"}'),
    new Error('Firebase 토큰을 받지 못했습니다.'),
    new Error('카카오 액세스 토큰을 받지 못했습니다.'),
  ];
  for (const e of leaky) {
    const msg = authErrorMessage(e)!;
    expect(msg).toBe('로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
    expect(msg).not.toMatch(/Firebase|토큰|서버 오류|invalid_grant/);
  }
});

test('제공자 미구성은 다른 방법 안내로', () => {
  expect(authErrorMessage(new Error('네이버 로그인이 아직 설정되지 않았습니다.'))).toBe(
    '지금은 이 로그인 방법을 사용할 수 없어요. 다른 방법으로 로그인해 주세요.',
  );
});

test('비정상 입력에도 throw 없이 일반 문구', () => {
  expect(authErrorMessage(null)).toBe('로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
  expect(authErrorMessage(undefined)).toBe('로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
  expect(authErrorMessage('boom')).toBe('로그인에 실패했어요. 잠시 후 다시 시도해 주세요.');
});
