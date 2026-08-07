// ============================================================================
// lib/social/blockList.ts — 차단한 러너 목록 (순수·DI)
// ============================================================================
// **왜 있는가.** 2026-08-03 에 공개 프로필과 월간 랭킹을 열었다. 그 순간부터 이 앱에는
// 다른 사람이 만든 콘텐츠(닉네임·러닝화 이름·칭호)가 화면에 뜬다. App Store 심사지침
// 1.2 는 사용자 생성 콘텐츠가 있는 앱에 **신고 수단과 차단 수단**을 함께 요구한다.
// 신고는 `lib/social/report.ts`, 차단이 여기다.
//
// **차단은 로컬이다.** 서버에 차단 관계를 저장하지 않는다 —
//   · 목적이 "내 화면에서 안 보이게"이지 상대를 제재하는 게 아니다(제재는 신고 몫).
//   · 서버에 두면 "누가 누구를 차단했는가"라는 **새로운 민감 정보**가 생긴다.
//     그건 이 기능이 필요로 하지 않는 데이터고, 안 만드는 게 낫다.
//   · 차단 목록은 계정 백업에 실려 기기를 바꿔도 따라간다(USER_KEYS 등록).
//
// **계약:** 항상 resolve · throw 금지. 저장 실패는 조용히 삼키되 메모리 상태는 유지한다 —
// 차단을 눌렀는데 화면이 안 바뀌면 사용자는 기능이 고장 났다고 읽는다.
// ============================================================================

/**
 * 차단한 러너 한 명. **닉네임을 함께 저장한다** — uid 만 두면 해제 화면에
 * `k4Jd9…` 같은 문자열이 뜬다. 사용자가 "누구를 차단했는지" 알 수 없으면 해제 기능은
 * 있으나 마나다. 이름은 차단 시점의 표시용 사본이고, 판정은 언제나 uid 로 한다.
 */
export interface BlockedRunner {
  uid: string;
  /** 차단 시점의 닉네임(표시 전용). 없으면 화면이 '러너'로 대체한다. */
  name?: string;
}

/** AsyncStorage 키. **계정별 데이터**라 `lib/accountScope.USER_KEYS` 에 등록돼 있다. */
export const BLOCKED_UIDS_KEY = 'blocked_uids_v1';

/** 차단 상한. 무한히 커지면 백업 문서(1MiB)를 갉아먹는다. 넘으면 가장 오래된 것부터 밀어낸다. */
export const MAX_BLOCKED = 500;

export interface BlockStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * 저장된 문자열을 목록으로 정규화한다(손상·타입 오염에 관대).
 * **구버전 형식(문자열 배열)도 그대로 읽는다** — 형식을 바꿨다고 이미 차단한 사람이
 * 다시 보이면 그건 사용자가 한 판단을 앱이 되돌리는 것이다.
 */
export function parseBlocked(raw: string | null): BlockedRunner[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: BlockedRunner[] = [];
    const seen = new Set<string>();
    for (const x of v) {
      let uid = '';
      let name: string | undefined;
      if (typeof x === 'string') {
        uid = x.trim();                                  // 구버전
      } else if (x && typeof x === 'object') {
        uid = typeof (x as any).uid === 'string' ? (x as any).uid.trim() : '';
        const n = typeof (x as any).name === 'string' ? (x as any).name.trim() : '';
        if (n) name = n.slice(0, 40);                    // 표시용이라 길이만 제한
      }
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      out.push(name ? {uid, name} : {uid});
    }
    return out.slice(-MAX_BLOCKED);
  } catch {
    return [];
  }
}

/**
 * 차단 목록에 더한다(순수). 이미 있으면 **이름만 갱신**하고 순서는 흔들지 않는다
 * (닉네임을 바꾼 사람을 다시 차단해도 목록에서 자리가 튀지 않는다).
 */
export function withBlocked(list: readonly BlockedRunner[], uid: string, name?: string): BlockedRunner[] {
  const id = String(uid || '').trim();
  if (!id) return [...list];
  const nm = typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : undefined;
  const at = list.findIndex(x => x.uid === id);
  if (at >= 0) {
    if (!nm || list[at].name === nm) return [...list];
    const copy = [...list];
    copy[at] = {uid: id, name: nm};
    return copy;
  }
  const next = [...list, nm ? {uid: id, name: nm} : {uid: id}];
  // 상한을 넘으면 **오래된 것부터** 버린다(최근 차단이 더 중요하다).
  return next.length > MAX_BLOCKED ? next.slice(next.length - MAX_BLOCKED) : next;
}

/** 차단 목록에서 뺀다(순수). */
export function withoutBlocked(list: readonly BlockedRunner[], uid: string): BlockedRunner[] {
  const id = String(uid || '').trim();
  return list.filter(x => x.uid !== id);
}

/** 판정용 uid 집합. 화면은 이걸로 거른다. */
export function blockedUidSet(list: readonly BlockedRunner[]): Set<string> {
  return new Set(list.map(x => x.uid));
}

/**
 * 차단된 러너를 목록에서 걷어낸다(순수).
 * 랭킹·프로필 어디서든 같은 함수를 쓴다 — 한 화면만 거르면 다른 화면에서 튀어나온다.
 */
export function filterBlocked<T extends {uid?: unknown}>(
  rows: readonly T[],
  blocked: readonly BlockedRunner[],
): T[] {
  if (!blocked.length) return [...rows];
  const set = blockedUidSet(blocked);
  return rows.filter(r => {
    const uid = typeof r?.uid === 'string' ? r.uid : '';
    return !uid || !set.has(uid);
  });
}

/** 저장소에서 차단 목록을 읽는다. 실패는 빈 목록(차단이 사라지는 쪽이 아니라 안전한 기본값). */
export async function loadBlocked(storage: BlockStorage): Promise<BlockedRunner[]> {
  try {
    return parseBlocked(await storage.getItem(BLOCKED_UIDS_KEY));
  } catch {
    return [];
  }
}

/** 차단하고 새 목록을 돌려준다. 저장 실패해도 **새 목록은 그대로 반환**한다(화면은 즉시 반영). */
export async function blockUid(
  storage: BlockStorage, list: readonly BlockedRunner[], uid: string, name?: string,
): Promise<BlockedRunner[]> {
  const next = withBlocked(list, uid, name);
  try {
    await storage.setItem(BLOCKED_UIDS_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패는 조용히 — 다음 차단·앱 재시작에서 다시 시도된다 */
  }
  return next;
}

/** 차단을 푼다. 규약은 위와 같다. */
export async function unblockUid(
  storage: BlockStorage, list: readonly BlockedRunner[], uid: string,
): Promise<BlockedRunner[]> {
  const next = withoutBlocked(list, uid);
  try {
    await storage.setItem(BLOCKED_UIDS_KEY, JSON.stringify(next));
  } catch {
    /* 위와 같다 */
  }
  return next;
}
