// ============================================================================
// lib/authErrorMessage.ts — 로그인 실패를 사용자 언어로 옮기는 단일 매퍼
// ============================================================================
// 배경(2026-07-04 출시 감사): LoginScreen 이 throw 원문(e.message)을 그대로 노출해
// "네이버 로그인 서버 오류: {서버 응답 원문}", "Firebase 토큰을 받지 못했습니다" 같은
// 개발 용어가 첫 화면에 떴다. 원문은 진단용으로 콘솔에만 남기고, 화면에는 사용자가
// 행동할 수 있는 문장만 보여준다. PURE — RN 의존 0, 어떤 입력에도 throw 금지.

/**
 * 로그인 에러 → 화면 문구. **취소는 에러가 아니므로 null**(조용히 원상 복귀).
 * 그 외에는 원인 계열별로 행동 가능한 한 문장.
 */
export function authErrorMessage(e: unknown): string | null {
  const raw = String(
    (e as {message?: unknown; code?: unknown} | null)?.message ??
    (e as {code?: unknown} | null)?.code ??
    '',
  );
  // 사용자가 스스로 닫은 것 — 알림도 사과도 불필요.
  if (/cancel|취소|CANCELED|CANCELLED|E_CANCELLED|ERR_REQUEST_CANCELED/i.test(raw)) return null;
  // 네트워크 계열 — 재시도로 해결 가능함을 알려준다.
  if (/network|네트워크|인터넷|internet|offline|timeout|ECONN|Failed to fetch/i.test(raw)) {
    return '인터넷 연결을 확인하고 다시 시도해 주세요.';
  }
  // Google Play 서비스 없음(안드로이드) — 사용자가 조치 가능한 구체 안내 유지.
  if (/PLAY_SERVICES|Play 서비스/i.test(raw)) {
    return 'Google Play 서비스를 사용할 수 없어요. 업데이트 후 다시 시도해 주세요.';
  }
  // 제공자 미구성(예: 네이버 키 미설정) — 재시도해도 안 되니 다른 길을 안내.
  if (/설정되지 않았/.test(raw)) {
    return '지금은 이 로그인 방법을 사용할 수 없어요. 다른 방법으로 로그인해 주세요.';
  }
  return '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
}
