// ─── net — 얇은 네트워크 유틸 ───────────────────────────────────────────────────
// 구 lib/api.ts(Render REST 클라이언트)에서 살아남은 유일한 범용 유틸. Render 백엔드는
// 2026-07-17 완전 은퇴(부팅·동기 전부 Firestore 정본, 일회성 이관도 종료) — REST 클라이언트
// 전체를 삭제하고 타임아웃 fetch 만 여기로 옮겼다(역지오코딩 등 외부 호출용).

/** 기본 네트워크 타임아웃(ms). 느린/죽은 원격에서 무한 대기(부팅 행·저장 멈춤)를 막는다. */
export const API_TIMEOUT_MS = 8000;

/**
 * fetch + 타임아웃/중단. timeoutMs(기본 8s) 안에 응답이 없으면 AbortController 로 끊어
 * reject 한다 → 호출부 catch 가 즉시 재시도 카드/큐로 분기(무한 스피너 방지). 성공 시
 * 타이머는 즉시 해제(test 의 fetch 목은 동기 resolve 라 타임아웃 미발화).
 */
export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, {...(init || {}), signal: ctrl.signal});
  } finally {
    clearTimeout(id);
  }
}
