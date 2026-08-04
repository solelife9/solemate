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

/** 이용약관 + 제2부 위치기반서비스 이용약관 URL(GitHub Pages — solelife9/keego-legal). */
export const TERMS_URL = 'https://solelife9.github.io/keego-legal/terms.html';

/**
 * 계정·데이터 삭제 안내 URL. Play 는 **앱 밖에서도** 삭제를 요청할 수 있는 공개 경로를
 * 요구한다(앱을 이미 지운 사용자도 요청할 수 있어야 한다 — 2026-07-26 출시 심사 TOP30 #24).
 * 앱 내 탈퇴 경로(마이 → 설정 → 회원 탈퇴)와 이메일 요청 절차, 삭제 범위를 함께 안내한다.
 * 스토어 등록 정보의 '데이터 삭제 요청 URL' 에 같은 주소를 넣는다.
 */
export const DELETE_ACCOUNT_URL = 'https://solelife9.github.io/keego-legal/delete-account.html';

/** 지원(문의) 이메일 — 앱스토어 심사(ASC) 지원 연락처 + 앱 내 '문의하기'. */
export const SUPPORT_EMAIL = 'keego.support@gmail.com';

/**
 * 고객 지원 페이지 URL.
 *
 * **왜 이메일만으로는 안 되는가:** App Store Connect 의 `Support URL` 은 버전 제출의
 * **필수 입력값**이고 `mailto:` 가 아니라 웹 페이지여야 한다. Play 도 스토어 등록정보에
 * 지원 웹사이트를 요구한다. 즉 이 상수가 가리키는 페이지가 없으면 **제출 폼을 채울 수
 * 없어 심사에 올릴 수조차 없다**(2026-08-04 출시 운영 감사 L-01).
 *
 * 원본은 `docs/support.html`. 내용을 고치면 공개 저장소 keego-legal 에도 같은 파일을
 * 푸시해야 한다(PRIVACY_URL·TERMS_URL 과 동일한 규약).
 */
export const SUPPORT_URL = 'https://solelife9.github.io/keego-legal/support.html';
