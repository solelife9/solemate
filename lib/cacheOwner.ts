// ─── lib/cacheOwner — 로컬 캐시의 소유 계정 표시 (2026-07-31 AUDIT 1) ──────────
//
// 왜 필요한가(실증된 결함): 부팅 캐시(cache_shoes_v1 / cache_runs_v1)에는 **그 데이터가
// 누구 것인지 표시가 없었다.** 그리고
//   · `initUser()` 는 마운트 때 딱 한 번 돌고(App.tsx: useEffect(...,[])) 캐시를 그대로 읽는다.
//   · 로그아웃은 화면/세션만 정리하고 신발·런 상태도 캐시도 비우지 않는다
//     (탈퇴 경로만 AsyncStorage.clear() 를 한다).
// 그래서 한 기기에서 A 가 로그아웃하고 B 가 로그인하면, 메모리에 남은 **A 의 신발·러닝이
// B 의 계정으로 병합돼 클라우드에 올라간다.** B 는 남의 기록을 보게 되고, A 의 기록은
// B 의 계정에 영구히 섞인다. 앱 재시작도 필요 없다.
//
// 이 모듈은 그 사고를 막는 최소 장치다: 캐시에 **소유자 uid 를 적어두고**, 동기 직전에
// "지금 로그인한 사람이 이 캐시의 주인인가"를 묻는다. 주인이 아니면 동기를 건너뛴다.
//
// 설계 원칙 — **아무것도 지우지 않는다.** 캐시를 비우는 쪽이 간단하지만, 오프라인에서
// 쌓아둔 미동기 기록이 로그아웃 한 번에 날아간다(Iron Law: 사용자 데이터 파괴 금지).
// 그래서 '차단'만 하고 '삭제'는 하지 않는다. 계정별 캐시 분리(완전 격리)는 저장소 구조를
// 바꾸는 큰 작업이라 별도 승인 대상으로 남긴다 — docs/audit/01-security.md 참조.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** 캐시 소유자 uid 를 담는 키. 값이 없으면 '아직 주인이 정해지지 않음'. */
export const CACHE_OWNER_KEY = 'cache_owner_uid';

/** 소유자 판정 결과. */
export type CacheOwnership =
  | 'unowned'   // 표시가 없다 — 첫 로그인이거나 이 장치를 처음 쓰는 계정. 동기 허용(그리고 주인 등록).
  | 'mine'      // 지금 로그인한 계정이 주인. 동기 허용.
  | 'other';    // 다른 계정 것이다. **동기 차단.**

/**
 * 지금 로그인한 uid 가 로컬 캐시의 주인인지 묻는다.
 * 읽기 실패는 'unowned' 로 본다 — 저장소 오류 때문에 정상 사용자의 동기를 막지 않는다
 * (이 장치는 그 사용자 것일 가능성이 압도적이고, 막으면 데이터가 클라우드로 못 간다).
 */
export async function checkCacheOwner(uid: string | null | undefined): Promise<CacheOwnership> {
  if (!uid) return 'other'; // 로그인하지 않았으면 동기할 대상이 없다
  try {
    const owner = await AsyncStorage.getItem(CACHE_OWNER_KEY);
    if (!owner) return 'unowned';
    return owner === uid ? 'mine' : 'other';
  } catch {
    return 'unowned';
  }
}

/**
 * 이 장치의 캐시 주인을 지금 로그인한 계정으로 기록한다(멱등).
 * 실패는 삼킨다 — 표시를 못 남겨도 앱은 그대로 동작해야 한다(다음 기회에 다시 시도).
 */
export async function claimCacheOwner(uid: string | null | undefined): Promise<void> {
  if (!uid) return;
  try {
    await AsyncStorage.setItem(CACHE_OWNER_KEY, uid);
  } catch {
    /* 다음 동기에서 다시 시도 */
  }
}
