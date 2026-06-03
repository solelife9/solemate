// ============================================================================
// lib/googleWebClientId.ts — 웹 OAuth 클라이언트 id 취득(평문 하드코딩 금지) (Slice 5)
//
// Google 네이티브 로그인이 firebase 와 맞물리려면 GoogleSignin.configure 에
// webClientId(= 안드로이드 google-services 플러그인이 생성하는 R.string.
// default_web_client_id, 곧 google-services.json 의 oauth_client client_type==3)가
// 필요하다. 그 값을 소스에 직접 박지 않고, 생성 파일(googleWebClientId.generated)에서
// 읽어온다. 값이 없으면(웹 클라이언트 미등록) null 을 돌려 호출부가 로그인을 정직하게
// 비활성 처리하게 한다.
// ============================================================================

import {GOOGLE_WEB_CLIENT_ID} from './googleWebClientId.generated';

/**
 * 설정된 웹 OAuth 클라이언트 id 를 돌려준다. 비어 있으면 null(미구성).
 * 공백만 있는 값도 미구성으로 본다.
 */
export function getGoogleWebClientId(): string | null {
  const id = (GOOGLE_WEB_CLIENT_ID || '').trim();
  return id.length > 0 ? id : null;
}
