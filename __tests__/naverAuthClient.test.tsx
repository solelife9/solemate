// lib/naverAuth.ts — 클라이언트가 서버 audience 검증에 필요한 값을 실제로 보내는지.
// 서버(functions/naverAuth.js)는 refreshToken 이 없으면 로그인을 거부하므로, 여기서
// 빠지면 네이버 로그인이 통째로 죽는다. 계약을 테스트로 못 박는다.
import NaverLogin from '@react-native-seoul/naver-login';
import {resolveNaverFirebaseToken} from '../lib/naverAuth';

const mockLogin = NaverLogin.login as jest.Mock;

function okLogin(extra: Record<string, unknown> = {}) {
  return {
    successResponse: {accessToken: 'at', refreshToken: 'rt', ...extra},
    failureResponse: undefined,
  };
}

describe('resolveNaverFirebaseToken', () => {
  beforeEach(() => {
    mockLogin.mockResolvedValue(okLogin());
    (global as unknown as {fetch: jest.Mock}).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({firebaseToken: 'fb-token'}),
    }));
  });

  it('accessToken 과 refreshToken 을 함께 보낸다', async () => {
    const token = await resolveNaverFirebaseToken();
    expect(token).toBe('fb-token');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({accessToken: 'at', refreshToken: 'rt'});
  });

  it('refreshToken 이 없으면 서버를 부르지 않고 끊는다(서버가 어차피 거부한다)', async () => {
    mockLogin.mockResolvedValue({
      successResponse: {accessToken: 'at'},
      failureResponse: undefined,
    });
    await expect(resolveNaverFirebaseToken()).rejects.toThrow(/토큰/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('로그인 취소는 취소 메시지로 전달한다', async () => {
    mockLogin.mockResolvedValue({
      successResponse: undefined,
      failureResponse: {message: '사용자가 취소했습니다', isCancel: true},
    });
    await expect(resolveNaverFirebaseToken()).rejects.toThrow('사용자가 취소했습니다');
  });

  it('서버가 거부하면(401·503) 그 응답을 에러로 올린다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      text: async () => '허용되지 않은 네이버 앱 토큰입니다.',
    });
    await expect(resolveNaverFirebaseToken()).rejects.toThrow(/네이버 로그인 서버 오류/);
  });
});
