// ─── api — Keego 백엔드 REST 클라이언트(얇은 격리) ─────────────────────────────
// App.tsx 에 흩어져 있던 fetch(API+...) 호출을 한 곳으로 모은다. URL·메서드·헤더·바디
// 보일러플레이트를 캡슐화하고, App 은 이 좁은 함수들만 호출한다. fetch 호출 형태(주소/
// 메서드/바디)는 기존과 바이트 동일하게 유지하므로 jest 의 fetch 목 기반 App 테스트가
// 그대로 green 이다(행동 보존 리팩터).
//
// BackendShoe / BackendRun 은 types.d.ts 의 전역 ambient 인터페이스(import 불필요).

export const API = 'https://solelife-backend.onrender.com';

const JSON_HEADERS = {'Content-Type': 'application/json'};

/** 기본 네트워크 타임아웃(ms). 콜드/다운 백엔드에서 무한 대기(부팅 행·저장 멈춤)를 막는다. */
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

/** 디바이스 id 로 익명 인증 → { user_id } 파싱 반환. */
export async function apiAuth(deviceId: string): Promise<any> {
  const r = await fetchWithTimeout(API + '/api/auth', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({device_id: deviceId}),
  });
  return r.json();
}

/** 사용자 신발 목록(파싱 반환). */
export async function apiGetShoes(userId: string): Promise<any> {
  const r = await fetchWithTimeout(API + '/api/shoes?user_id=' + userId);
  return r.json();
}

/** 사용자 런 목록(파싱 반환). */
export async function apiGetRuns(userId: string): Promise<any> {
  const r = await fetchWithTimeout(API + '/api/runs?user_id=' + userId);
  return r.json();
}

/**
 * 신발 추가(POST) → 생성된 신발 파싱 반환. 실패(!ok/무응답)는 상태코드 + 본문 일부를
 * 담은 Error 로 throw 한다(원인을 삼키지 않음 — 호출부 Alert 안내/진단용).
 */
export async function apiAddShoe(
  userId: string | null,
  fields: {name: string; maxKm: number; startKm: number; date: string},
): Promise<any> {
  const r = await fetchWithTimeout(API + '/api/shoes', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      user_id: userId,
      name: fields.name,
      max_km: fields.maxKm,
      start_km: fields.startKm,
      purchase_date: fields.date,
    }),
  });
  if (!r || !r.ok) {
    const body = await (r ? r.text() : Promise.resolve('')).catch(() => '');
    throw new Error(`서버 ${r ? r.status : '응답없음'} ${String(body).slice(0, 100)}`.trim());
  }
  return r.json();
}

/** 신발 부분 수정(PATCH) — 이름/수명(max_km)/보관(retired) 등 임의 필드. */
export async function apiPatchShoe(
  userId: string | null,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await fetchWithTimeout(API + '/api/shoes/' + id, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({user_id: userId, ...fields}),
  });
}

/** 신발 삭제(DELETE). */
export async function apiDeleteShoe(userId: string | null, id: string): Promise<void> {
  await fetchWithTimeout(API + '/api/shoes/' + id, {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({user_id: userId}),
  });
}

/**
 * 런 추가(POST) — PendingRun 페이로드를 그대로 전송하고 생성된 런을 파싱 반환.
 * 실패(!ok/무응답)는 throw 해 호출부(동기화 큐)가 재시도 대상으로 남기게 한다.
 */
export async function apiAddRun(userId: string | null, p: any): Promise<any> {
  const r = await fetchWithTimeout(API + '/api/runs', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      user_id: userId,
      localId: p.localId,
      shoe_id: p.shoe_id,
      km: p.km,
      run_date: p.run_date,
      memo: p.memo,
      source: p.source,
      duration: p.duration,
      cadence: p.cadence,
      route: p.route,
      location: p.location,
      heart_rate: p.heart_rate,
    }),
  });
  if (!r || !r.ok) throw new Error('run POST failed');
  return r.json();
}

/** 런 부분 수정(PATCH) — 신발/거리/날짜/시간 등 임의 필드. */
export async function apiPatchRun(
  userId: string | null,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await fetchWithTimeout(API + '/api/runs/' + id, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({user_id: userId, ...fields}),
  });
}

/** 런 삭제(DELETE). */
export async function apiDeleteRun(userId: string | null, id: string): Promise<void> {
  await fetchWithTimeout(API + '/api/runs/' + id, {
    method: 'DELETE',
    headers: JSON_HEADERS,
    body: JSON.stringify({user_id: userId}),
  });
}
