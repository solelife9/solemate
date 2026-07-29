// ─── lib/naverAuth.ts — 네이버 네이티브 로그인 → Firebase 커스텀 토큰 리졸버 ──────
// @react-native-seoul/naver-login 으로 네이티브 네이버 로그인 → accessToken 획득 →
// 백엔드(/api/auth/naver)가 토큰을 검증하고 발급한 Firebase 커스텀 토큰을 돌려준다.
// 키 미설정(socialConfig 빈 값) 시 정직한 에러로 비활성. jest 는 네이티브 모듈을 목 처리.

import NaverLogin from '@react-native-seoul/naver-login';
import {NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_APP_NAME, SOCIAL_BACKEND} from './socialConfig';

let initialized = false;
function ensureInit(): void {
  if (initialized) return;
  NaverLogin.initialize({
    appName: NAVER_APP_NAME,
    consumerKey: NAVER_CLIENT_ID,
    consumerSecret: NAVER_CLIENT_SECRET,
    serviceUrlSchemeIOS: 'keego',
    disableNaverAppAuthIOS: true,
  });
  initialized = true;
}

/** 네이버 로그인 → 백엔드 검증 → Firebase 커스텀 토큰(string) 반환. */
export async function resolveNaverFirebaseToken(): Promise<string> {
  if (!NAVER_CLIENT_ID) {
    throw new Error('네이버 로그인이 아직 설정되지 않았습니다.');
  }
  ensureInit();
  const {successResponse, failureResponse} = await NaverLogin.login();
  if (!successResponse) {
    throw new Error((failureResponse && failureResponse.message) || '네이버 로그인이 취소되었습니다.');
  }
  const accessToken = successResponse.accessToken;
  if (!accessToken) throw new Error('네이버 액세스 토큰을 받지 못했습니다.');
  // 서버는 refreshToken 을 우리 앱 자격으로 교환해 이 토큰이 *우리 앱*에서 발급된 것인지
  // 검증한다(네이버엔 토큰→발급앱 조회 API 가 없다 — functions/naverAuth.js 참조).
  // 없으면 서버가 검증할 방법이 없으므로 여기서 먼저 정직하게 끊는다.
  const refreshToken = successResponse.refreshToken;
  if (!refreshToken) throw new Error('네이버 로그인 토큰이 불완전합니다. 다시 시도해 주세요.');

  const r = await fetch(`${SOCIAL_BACKEND}/api/auth/naver`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    // accessToken 은 구 서버 호환용으로만 함께 보낸다(신 서버는 쓰지 않는다).
    body: JSON.stringify({accessToken, refreshToken}),
  });
  if (!r || !r.ok) {
    const t = await (r ? r.text() : Promise.resolve('')).catch(() => '');
    throw new Error(`네이버 로그인 서버 오류: ${String(t).slice(0, 100)}`);
  }
  const data = await r.json();
  if (!data || !data.firebaseToken) throw new Error('Firebase 토큰을 받지 못했습니다.');
  return data.firebaseToken;
}
