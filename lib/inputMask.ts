// ─── Input masking & form validation (JS-only, no native pickers) ───────────
// 수동 기록/신발 등록 폼의 텍스트 입력을 위한 순수 함수들. 네이티브 date/time 피커를
// 쓰지 않고(JS-only) 숫자만 받아 자동으로 콜론/하이픈을 끼워 넣는 마스킹과, 제출 시
// 필드 아래 인라인 헬퍼텍스트로 보여줄 검증 메시지를 만든다. 모두 순수 함수라 단위·
// 행동 테스트가 쉽다.

/**
 * 시간 입력 마스크 — 숫자만 받아 'MM:SS'로 만든다.
 * 마지막 두 자리를 초로 보고 그 앞에 콜론을 끼운다(최대 4자리 = 99:59까지).
 *   "5" → "5"   "530" → "5:30"   "3000" → "30:00"   "12:34" → "12:34"
 * 2자리 이하(분만 입력 중)는 콜론을 넣지 않아 자연스러운 타이핑을 허용한다.
 */
export function maskDuration(text: string): string {
  const d = (text || '').replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, d.length - 2)}:${d.slice(d.length - 2)}`;
}

/**
 * 날짜 입력 마스크 — 숫자만 받아 'YYYY-MM-DD'로 만든다.
 * 4자리(연)·2자리(월)·2자리(일) 경계마다 하이픈을 끼운다(최대 8자리).
 *   "2026" → "2026"   "202606" → "2026-06"   "20260601" → "2026-06-01"
 */
export function maskDate(text: string): string {
  const d = (text || '').replace(/\D/g, '').slice(0, 8);
  const parts = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean);
  return parts.join('-');
}

/**
 * 'YYYY-MM-DD'가 형식·달력상 모두 유효한지. 형식뿐 아니라 실제 존재하는 날짜인지도
 * 본다(2026-13-40 거부, 2026-02-29 같은 비윤년 2/29도 거부).
 */
export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map((p) => parseInt(p, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// 수동 기록/편집 폼 검증 — 필드별 인라인 에러 메시지(빈 객체면 통과).
export type RunFormErrors = { shoe?: string; dist?: string; date?: string };

/**
 * 제출 시 한 번에 검증한다(Alert 대신 필드 아래 빨강 헬퍼텍스트로 표시). 거리 0/음수/
 * 비정상값을 인라인으로 차단하고, 날짜는 마스킹된 'YYYY-MM-DD'가 달력상 유효해야 한다.
 */
export function validateRunForm(input: { shoeId?: string; dist: string; date: string }): RunFormErrors {
  const errors: RunFormErrors = {};
  if (!input.shoeId) errors.shoe = '신발을 선택하세요';
  const km = parseFloat(input.dist);
  if (!Number.isFinite(km) || km <= 0) errors.dist = '거리를 0보다 크게 입력하세요';
  if (!isValidYmd(input.date)) errors.date = '날짜를 YYYY-MM-DD 형식으로 정확히 입력하세요';
  return errors;
}

/**
 * 신발 등록 — 교체 권장 거리(max) 검증. 0/음수/비정상값을 인라인으로 차단한다.
 * 통과면 undefined, 아니면 빨강 헬퍼텍스트로 보여줄 메시지.
 */
export function validateMaxKm(max: number): string | undefined {
  if (!Number.isFinite(max) || max <= 0) return '교체 권장 거리를 0보다 크게 입력하세요';
  return undefined;
}
