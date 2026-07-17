// ============================================================================
// lib/legalLinks.ts — 공개 법적 문서 URL (개인정보 처리방침·이용약관)
// ============================================================================
// 스토어 심사·앱 내 동의 문구 양쪽에서 같은 *공개 URL* 을 가리켜야 한다.
// 호스팅 = 전용 공개 저장소 keego-legal 의 GitHub Pages(2026-07-17 분리 — 본 저장소를
// 비공개로 전환하면서 Pages 만 남길 수 없어 법적 문서를 따로 뗐다. 원본은 docs/*.html,
// 내용 갱신 시 keego-legal 에도 같은 파일을 푸시할 것). 두 URL 모두 200 확인됨.
//
// ⚠️ 스토어 등록 정보(Play Data safety / App Privacy)에도 같은 URL 입력.
// ============================================================================

/** 공개 개인정보 처리방침 URL(GitHub Pages — solelife9/keego-legal). */
export const PRIVACY_URL = 'https://solelife9.github.io/keego-legal/privacy.html';

/** 이용약관 URL(GitHub Pages — solelife9/keego-legal). */
export const TERMS_URL = 'https://solelife9.github.io/keego-legal/terms.html';
