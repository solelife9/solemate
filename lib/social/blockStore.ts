// ============================================================================
// lib/social/blockStore.ts — 차단 목록의 런타임 상태(구독 가능한 얇은 층)
// ============================================================================
// `blockList.ts` 는 순수 로직이다. 여기는 그 위에 **앱이 도는 동안의 상태 한 벌**을 둔다.
//
// **왜 필요한가.** 차단은 두 화면에 동시에 걸린다 —
//   · 남의 프로필에서 "차단"을 누르고
//   · 그 즉시 **랭킹 목록에서 그 사람이 사라져야** 한다.
// 두 화면이 각자 저장소를 읽으면, 프로필에서 차단해도 이미 마운트된 랭킹은 모른다
// ("차단했는데 목록에 그대로 있다" = 기능이 고장 난 것으로 읽힌다).
//
// 화면 사이를 잇는 방법은 둘이다 — 공통 부모(App.tsx)로 콜백을 올리거나, 여기처럼
// **모듈 하나를 두 화면이 함께 보는 것**이다. 후자를 골랐다: 차단은 전역 사실이고,
// 라우터가 없는 이 앱에서 화면 간 상태를 부모로 끌어올리면 App.tsx 가 또 커진다.
//
// 계약: throw 금지 · 저장 실패에도 메모리 상태는 갱신(화면이 즉시 반응해야 한다).
// 계정 전환 시에는 `resetBlockedCache()` 로 비운다 — A 의 차단이 B 화면에 남으면 사고다.
// ============================================================================
import {loadBlocked, blockUid, unblockUid, type BlockStorage, type BlockedRunner} from './blockList';

type Listener = (blocked: BlockedRunner[]) => void;

let current: BlockedRunner[] = [];
let loaded = false;
const listeners = new Set<Listener>();

function emit(): void {
  const snapshot = current;
  // 구독자 하나가 던져도 나머지에게 전파는 계속돼야 한다.
  listeners.forEach(fn => { try { fn(snapshot); } catch { /* 구독자 사고는 격리 */ } });
}

/** 지금 차단 목록(동기). 아직 안 읽었으면 빈 배열 — 렌더를 막지 않는다. */
export function blockedSnapshot(): BlockedRunner[] {
  return current;
}

/** 변경 구독. 반환값을 호출하면 해제된다(useEffect cleanup 에 그대로 넣는다). */
export function subscribeBlocked(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * 저장소에서 한 번 읽어 상태를 채운다. 여러 화면이 각자 불러도 **실제 읽기는 한 번**이다
 * (`force` 로 강제 재읽기 — 계정 전환 후 등).
 */
export async function ensureBlockedLoaded(storage: BlockStorage, force = false): Promise<BlockedRunner[]> {
  if (loaded && !force) return current;
  current = await loadBlocked(storage);
  loaded = true;
  emit();
  return current;
}

/** 차단하고 전파한다. */
export async function block(storage: BlockStorage, uid: string, name?: string): Promise<BlockedRunner[]> {
  current = await blockUid(storage, current, uid, name);
  loaded = true;
  emit();
  return current;
}

/** 차단 해제하고 전파한다. */
export async function unblock(storage: BlockStorage, uid: string): Promise<BlockedRunner[]> {
  current = await unblockUid(storage, current, uid);
  loaded = true;
  emit();
  return current;
}

/**
 * 메모리 상태를 비운다(계정 전환·로그아웃·테스트).
 * **저장소는 건드리지 않는다** — 계정별 저장소 분리는 `lib/accountScope` 몫이고,
 * 여기서 지우면 그 계정의 차단 목록이 실제로 사라진다(사용자 데이터 파괴).
 */
export function resetBlockedCache(): void {
  current = [];
  loaded = false;
  emit();
}
