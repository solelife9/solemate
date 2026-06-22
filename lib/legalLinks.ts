// ============================================================================
// lib/legalLinks.ts — 공개 법적 문서 URL (개인정보 처리방침·이용약관)
// ============================================================================
// 스토어 심사·앱 내 동의 문구 양쪽에서 같은 *공개 URL* 을 가리켜야 한다. GitHub Pages
// (docs/ 폴더)로 호스팅한다 — 저장소 Settings → Pages 에서 'main /docs' 로 활성화하면
// 아래 URL 이 유효해진다(docs/privacy.html 이 그 소스). 약관 별도 페이지가 생기면 교체.
//
// ⚠️ 출시 전: (1) GitHub Pages 활성화, (2) 이 URL 이 실제로 열리는지 확인, (3) 스토어
//    등록 정보(Play Data safety / App Privacy)에도 같은 URL 입력.
// ============================================================================

/** 공개 개인정보 처리방침 URL(GitHub Pages — docs/privacy.html). */
export const PRIVACY_URL = 'https://solelife9.github.io/solemate/privacy.html';

/** 이용약관 URL. 현재는 개인정보 처리방침 페이지로 통합(별도 약관 페이지 생기면 교체). */
export const TERMS_URL = 'https://solelife9.github.io/solemate/privacy.html';
