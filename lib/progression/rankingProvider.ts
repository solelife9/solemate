// ============================================================================
// lib/progression/rankingProvider.ts — Keego 랭킹 provider 배선 (Slice E)
// ============================================================================
// remoteRanking(순수·DI)에 실제 의존성을 묶는 합성 모듈: 백엔드 베이스 URL(lib/api.API)
// + Firebase ID 토큰(firebaseCloudPort.getFirebaseIdToken). UI 는 keegoRankingProvider 만
// 가져다 쓰면 백엔드 Hall of Fame 에 연결된다(인터페이스=RankingProvider, 로컬 stub 과 동일).
//
// 이 모듈은 firebase 에 의존하므로(비순수) 엔진/순수 모듈에서 import 하지 않는다 —
// 화면(또는 앱 부트)에서만 가져다 쓴다. remoteRanking.ts 는 firebase-free 로 테스트된다.
// ============================================================================
import {API} from '../api';
import {getFirebaseIdToken} from '../firebaseCloudPort';
import {createRemoteRankingProvider} from './remoteRanking';
import {RankingProvider} from './types';

/** 백엔드(/api/v1)에 연결된 라이브 RankingProvider. UI 가 직접 소비한다. */
export const keegoRankingProvider: RankingProvider = createRemoteRankingProvider({
  baseUrl: API,
  getToken: getFirebaseIdToken,
});

/** 인증 헤더(로그인 안 됨 → null). */
async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getFirebaseIdToken();
  if (!token) return null;
  return {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
}

/**
 * 이 기기의 로컬(device) 계정을 인증된 Firebase UID 에 연결하고 서버측 재계산을 트리거한다.
 * 리더보드에 본인이 나타나려면(서버가 검증된 shoes/runs 로 점수를 재계산하려면) 1회 필요.
 * 멱등(이미 연결됐으면 백엔드가 그대로 처리). 실패는 false 반환(throw 없음 — 호출부 안전).
 *
 * @param deviceUserId 기존 /api/auth 로 받은 device 기반 user_id.
 */
export async function ensureBackendSynced(deviceUserId: string): Promise<boolean> {
  try {
    const headers = await authHeaders();
    if (!headers || !deviceUserId) return false;
    const linkRes = await fetch(`${API}/api/v1/users/me/link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({deviceUserId}),
    });
    if (!linkRes || !linkRes.ok) return false;
    // link 가 이미 내부적으로 재계산하지만, 명시적으로 한 번 더 보장(멱등).
    const recalcRes = await fetch(`${API}/api/v1/stats/recalculate`, {
      method: 'POST',
      headers,
    });
    return !!(recalcRes && recalcRes.ok);
  } catch {
    return false;
  }
}

/** 내 백엔드 프로필(랭크/타이틀/총거리 등). 미로그인/실패 → null. */
export async function fetchMyProfile(): Promise<any | null> {
  try {
    const headers = await authHeaders();
    if (!headers) return null;
    const res = await fetch(`${API}/api/v1/users/me`, {headers});
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
