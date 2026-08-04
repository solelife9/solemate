// lib/naverAuth.ts — 클라이언트가 서버 audience 검증에 필요한 값을 실제로 보내는지.
// 서버(functions/naverAuth.js)는 refreshToken 이 없으면 로그인을 거부하므로, 여기서
// 빠지면 네이버 로그인이 통째로 죽는다. 계약을 테스트로 못 박는다.
import NaverLogin from '@react-native-seoul/naver-login';
import {resolveNaverFirebaseToken} from '../lib/naverAuth';

// ── 소셜 키를 목으로 고정한다(2026-08-04, CI 초록화) ──────────────────────────
// `lib/socialConfig.ts` 는 **skip-worktree** 라 실키가 개발 기기의 워킹 사본에만 있고
// HEAD 는 빈 문자열이다(의도된 설계 — 키를 커밋하지 않는다). 그래서 이 스위트는 여태
// **민우님 노트북에서만 통과**했다. 새 기기에서 clone 하거나 CI 에서 돌리면
// `resolveNaverFirebaseToken` 의 미설정 가드(`lib/naverAuth.ts:24`)에 먼저 걸려
// "네이버 로그인이 아직 설정되지 않았습니다" 로 전부 실패한다(실제로 그렇게 실패했다).
//
// 이 스위트가 검증하는 것은 **토큰 계약**(accessToken+refreshToken 을 함께 보내는가)이지
// 키가 꽂혀 있는가가 아니다. 그러니 키는 목으로 고정하는 게 맞다 — 그래야 어느 기기에서든
// 같은 것을 검증한다. 미설정 동작은 아래에서 **따로** 단언한다(가드가 죽으면 알아야 하므로).
jest.mock('../lib/socialConfig', () => ({
  KAKAO_NATIVE_APP_KEY: 'test-kakao-key',
  NAVER_CLIENT_ID: 'test-naver-id',
  NAVER_CLIENT_SECRET: 'test-naver-secret',
  NAVER_APP_NAME: 'Keego',
  SOCIAL_BACKEND: 'https://example.test',
}));

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

  // 위 목이 가린 동작을 여기서 되살린다 — 키가 없으면 **정직한 에러로 비활성**이어야 한다
  // (`lib/naverAuth.ts:24` 가드). 이 가드가 사라지면 키 없는 빌드가 네이티브 로그인을
  // 띄웠다가 알 수 없는 실패로 끝난다. 목을 씌운 대가를 이 한 건으로 갚는다.
  // 마지막에 두는 이유: 모듈 레지스트리를 갈아끼우므로 뒤 테스트에 영향을 주지 않게.
  it('키가 설정돼 있지 않으면 정직한 에러로 비활성된다', async () => {
    jest.resetModules();
    jest.doMock('../lib/socialConfig', () => ({
      KAKAO_NATIVE_APP_KEY: '',
      NAVER_CLIENT_ID: '',
      NAVER_CLIENT_SECRET: '',
      NAVER_APP_NAME: 'Keego',
      SOCIAL_BACKEND: 'https://example.test',
    }));
    const unconfigured = require('../lib/naverAuth') as typeof import('../lib/naverAuth');
    await expect(unconfigured.resolveNaverFirebaseToken()).rejects.toThrow(/설정되지 않았/);
    jest.resetModules();
  });
});
