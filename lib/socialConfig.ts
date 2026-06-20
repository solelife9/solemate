// ─── 소셜 로그인(카카오·네이버) 설정 키 ─────────────────────────────────────────
// ⚠️ 이 저장소는 공개(public)이므로 실제 키를 커밋하지 않는다.
// 이 파일은 '빈 값'으로 커밋되고, 로컬에서 실제 키를 채운 뒤
//   git update-index --skip-worktree lib/socialConfig.ts
// 로 표시해 로컬 변경이 커밋되지 않게 한다(Google webClientId.generated 와 동일 패턴).
// 값이 비어 있으면 해당 provider 는 정직하게 비활성(버튼 누르면 '준비 안 됨' 안내).
//
// 카카오 네이티브 앱 키는 AndroidManifest 의 redirect scheme(kakao<KEY>)에도 필요하다 →
// 그쪽은 ~/.gradle/gradle.properties 의 KAKAO_NATIVE_APP_KEY 로 주입(레포 밖, build.gradle).

export const KAKAO_NATIVE_APP_KEY = '';
export const NAVER_CLIENT_ID = '';
export const NAVER_CLIENT_SECRET = '';
export const NAVER_APP_NAME = 'Keego';

/**
 * 소셜 토큰(카카오·네이버)을 검증해 Firebase 커스텀 토큰을 발급하는 백엔드.
 * Render 백엔드를 버리고 Firebase Cloud Functions(functions/index.js `api`)로 이전했다.
 * 함수 이름이 `api` 라 클라이언트의 `${SOCIAL_BACKEND}/api/auth/kakao` 호출이
 * 함수 URL + express 라우트(/auth/kakao)와 맞물린다. region: asia-northeast3(서울).
 */
export const SOCIAL_BACKEND = 'https://asia-northeast3-keego-620b8.cloudfunctions.net';
