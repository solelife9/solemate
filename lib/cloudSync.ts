// ============================================================================
// lib/cloudSync.ts — Firebase 클라우드 동기 순수 로직 (Slice 5)
//
// 신발·런·설정(BackupPayload)을 계정 클라우드(Firestore)와 양방향 동기할 때의
// 순수 병합/마이그레이션/인증상태 로직을 모은다. firebase SDK 자체(@react-native-
// firebase/auth·firestore)는 이 모듈 밖의 포트(인터페이스) 뒤에 두고, 여기서는
// 네이티브 의존성 0 의 순수 함수만 다뤄 단위테스트로 검증한다(firebase import 금지).
//
// 계약(수용 테스트 @slice-5):
//   nextAuthState        — 로그인 상태머신(signedOut↔signingIn↔signedIn/error)
//   mergeCloudData       — 로컬+원격을 id 합집합으로 병합, 어느 쪽도 레코드 유실 금지
//                          (충돌 시 최신 우선). iron law: 데이터 파괴 금지.
//   migrateDeviceToAccount — 최초 로그인 시 기기(device_id) 데이터를 계정으로 무손실 이관
// ============================================================================

import type { BackupPayload } from './backup';

export type AuthState = 'signedOut' | 'signingIn' | 'signedIn' | 'error';
export type AuthEvent = 'signInStart' | 'signInSuccess' | 'signInError' | 'signOut';

/**
 * 인증 상태머신: 현재 상태 + 이벤트 → 다음 상태.
 *   signedOut + signInStart   → signingIn
 *   signingIn + signInSuccess → signedIn
 *   signingIn + signInError   → error
 *   *         + signOut       → signedOut (어디서든 로그아웃)
 * 그 밖의 정의되지 않은(부정) 전이는 현재 상태를 그대로 유지해 상태를 깨지 않는다.
 */
export function nextAuthState(current: AuthState, event: AuthEvent): AuthState {
  // 로그아웃은 어떤 상태에서든 즉시 signedOut.
  if (event === 'signOut') {
    return 'signedOut';
  }
  switch (current) {
    case 'signedOut':
      if (event === 'signInStart') return 'signingIn';
      break;
    case 'signingIn':
      if (event === 'signInSuccess') return 'signedIn';
      if (event === 'signInError') return 'error';
      break;
    // signedIn·error 에서 들어오는 signInStart/Success/Error 는 정의되지 않은 전이.
    default:
      break;
  }
  // 부정 전이: 현재 상태 유지(상태 파괴 금지).
  return current;
}

/**
 * 레코드에 updatedAt(epoch ms)을 스탬프해 *새* 객체로 돌려준다. 모든 신발/런 mutation
 * (App.tsx addRun/editRun/addShoe/updateShoeMaxKm/retireShoe 등)이 이 한 경로로 스탬프해,
 * 아래 recordUpdatedAt 가 읽는 '최신 우선' 머지가 실데이터에서 작동하게 한다.
 *   · 불변   — 원본을 변형하지 않는다(spread 로 새 객체 생성).
 *   · 비파괴 — 기존 필드를 모두 보존하고 updatedAt 만 갱신한다.
 * now 는 테스트 결정성을 위해 주입 가능하며, 생략하면 현재 시각(Date.now)을 쓴다.
 */
export function stampUpdatedAt<T extends object>(
  record: T,
  now: number = Date.now(),
): T & { updatedAt: number } {
  return { ...record, updatedAt: now };
}

/**
 * 레코드를 soft-delete 묘비(tombstone)로 만든다 — 하드삭제 대신 `deleted:true` 를 박고
 * updatedAt 을 갱신해, mergeRecords 의 '최신 우선' 머지가 삭제를 *최신 사실*로 보고 존중하게
 * 한다(부활 방지). stampUpdatedAt 과 같은 규약:
 *   · 불변   — 원본을 변형하지 않고 새 객체를 돌려준다.
 *   · 비파괴 — 기존 필드를 모두 보존한 채 deleted/updatedAt 만 더한다(원본 데이터 유지 →
 *              undo/머지 진단에 쓸 수 있다).
 * now 는 테스트 결정성을 위해 주입 가능하며, 생략하면 현재 시각을 쓴다.
 */
export function markDeleted<T extends object>(
  record: T,
  now: number = Date.now(),
): T & { deleted: true; updatedAt: number } {
  return { ...record, deleted: true, updatedAt: now };
}

/** 레코드가 tombstone(soft-delete)인지. deleted===true 일 때만 참(방어적). */
export function isDeleted(rec: unknown): boolean {
  return !!(
    rec &&
    typeof rec === 'object' &&
    (rec as { deleted?: unknown }).deleted === true
  );
}

/**
 * 살아있는(삭제되지 않은) 레코드만 남긴다 — UI 렌더/집계(거리·수명 계산)가 tombstone 을
 * 제외하도록 하는 단일 필터. 머지 결과는 tombstone 을 보존하지만(삭제 전파), 화면/통계는
 * 이 필터를 통과한 live 레코드만 본다.
 */
export function liveRecords<T>(list: readonly T[]): T[] {
  return list.filter((r) => !isDeleted(r));
}

/**
 * 레코드 목록을 live 와 tombstone 으로 분리한다. 머지 결과를 받을 때 live 는 화면 상태로,
 * tombstone 은 묘비 저장소로 보내 (a) 화면엔 안 보이고 (b) 다음 동기에서도 삭제가 계속
 * 전파되게 한다. 입력 순서를 각 묶음 안에서 유지한다.
 */
export function partitionTombstones<T>(list: readonly T[]): { live: T[]; tombstones: T[] } {
  const live: T[] = [];
  const tombstones: T[] = [];
  for (const r of list) {
    if (isDeleted(r)) tombstones.push(r);
    else live.push(r);
  }
  return { live, tombstones };
}

// ── id/updatedAt 추출 (레코드는 unknown 이므로 방어적으로 읽는다) ───────────────

/** 레코드에서 비교용 id 를 뽑는다. 없으면 null(→ 합치되 dedupe 하지 않음). */
export function recordId(rec: unknown): string | null {
  if (rec && typeof rec === 'object' && 'id' in rec) {
    const id = (rec as { id?: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return null;
}

/**
 * 레코드의 updatedAt 을 비교 가능한 수치로 환산한다(숫자 타임스탬프 또는 ISO 문자열).
 * 값이 없거나 파싱 불가면 -Infinity → 충돌 시 동률로 떨어져 local(기존) 우선이 된다.
 */
function recordUpdatedAt(rec: unknown): number {
  if (rec && typeof rec === 'object' && 'updatedAt' in rec) {
    const u = (rec as { updatedAt?: unknown }).updatedAt;
    if (typeof u === 'number' && Number.isFinite(u)) return u;
    if (typeof u === 'string') {
      const n = Date.parse(u);
      if (!Number.isNaN(n)) return n;
    }
  }
  return -Infinity;
}

/**
 * 두 레코드 배열을 id 합집합으로 병합한다. iron law: 어느 쪽 레코드도 버리지 않는다.
 *   · 한쪽에만 있는 id      → 그대로 보존
 *   · 양쪽에 같은 id(충돌)  → updatedAt 큰(최신) 쪽 채택. 동률이면 tombstone(삭제) 우선,
 *                            그 외 동률/없음이면 local 우선.
 *   · id 가 없는 레코드     → dedupe 불가하므로 전부 그대로 뒤에 보존.
 * local 의 순서를 먼저 유지하고, remote 에만 있는 신규 id 를 그 뒤로 덧붙인다.
 *
 * tombstone(soft-delete) 존중: 삭제는 `markDeleted` 로 `deleted:true + 갱신된 updatedAt`
 * 묘비가 되므로, 위 '최신 우선' 규칙만으로도 (한 기기서 지운) 묘비가 (다른 기기의 더 오래된)
 * live 레코드를 이긴다 → 합집합 머지가 삭제를 *부활시키지 않는다*. 동률(시계가 같은 ms)일
 * 때만 추가로 tombstone 을 우선해, 경계 케이스에서도 부활을 막는다. 묘비 자체는 결과에 그대로
 * 남아(드롭하지 않음) 다음 동기에서도 삭제가 계속 전파된다 — 화면/집계는 liveRecords 로 거른다.
 */
function mergeRecords(local: unknown[], remote: unknown[]): unknown[] {
  const byId = new Map<string, unknown>();
  const order: string[] = [];
  const noId: unknown[] = [];

  const ingest = (list: unknown[], isLocal: boolean) => {
    for (const rec of list) {
      const id = recordId(rec);
      if (id === null) {
        noId.push(rec);
        continue;
      }
      if (!byId.has(id)) {
        byId.set(id, rec);
        order.push(id);
        continue;
      }
      if (isLocal) {
        // local 자체 내 중복 id: 뒤엣것을 최신으로 본다(드문 케이스).
        byId.set(id, rec);
        continue;
      }
      // remote 충돌: 더 최신(updatedAt 큰)일 때 교체. 동률이면 tombstone(삭제)을 우선해
      // 부활을 막고, 그 밖의 동률은 local 유지.
      const existing = byId.get(id);
      const ru = recordUpdatedAt(rec);
      const eu = recordUpdatedAt(existing);
      if (ru > eu || (ru === eu && isDeleted(rec) && !isDeleted(existing))) {
        byId.set(id, rec);
      }
    }
  };

  ingest(local, true);
  ingest(remote, false);

  return [...order.map((id) => byId.get(id)!), ...noId];
}

/**
 * 로컬 데이터와 원격(계정) 데이터를 병합한다.
 *   · shoes/runs : id 합집합으로 어느 쪽도 유실 없이 합치고, 같은 id 충돌 시 updatedAt
 *                  이 큰(최신) 레코드를 택한다(updatedAt 없으면 local 우선).
 *   · settings   : 얕은 병합으로 양쪽 키를 모두 유지한다. 충돌 키는 local(기기에서 막
 *                  바꾼 값)을 우선한다 — `{...remote, ...local}` 로 records 의 "동률이면
 *                  local 우선" 규칙과 일관되게 맞춘다.
 * remote 가 null(원격 없음)이면 local 을 그대로 반환한다.
 * iron law: 어느 쪽 레코드도 절대 버리지 않는다(데이터 파괴 금지).
 */
export function mergeCloudData(local: BackupPayload, remote: BackupPayload | null): BackupPayload {
  if (remote == null) {
    return local;
  }
  return {
    shoes: mergeRecords(local.shoes, remote.shoes),
    runs: mergeRecords(local.runs, remote.runs),
    settings: { ...remote.settings, ...local.settings },
  };
}

/**
 * 클라우드 머지 결과 중 REST(정본)에 아직 없는 live 레코드만 가려낸다 — 역등록(apiAddShoe/
 * apiAddRun) 대상. REST 정본을 완전하게 만들기 위해, 다른 기기가 클라우드에만 올린 레코드를
 * 우리 REST 백엔드에도 합류시킨다.
 *   · knownIds  — 머지 *적용 전* 로컬 상태의 id 집합(= REST 정본 + 우리 pending). 여기 든 id 는
 *                 이미 우리 백엔드/큐에 있으므로 역등록하지 않는다(중복 POST 금지).
 *   · tombstone — 삭제 레코드는 제외한다. 역등록은 곧 부활이므로(iron law: 삭제 존중).
 *   · id 없는 레코드 — dedupe 불가하므로 보수적으로 제외(무한 재-POST 방지).
 * 멱등성: 역등록 성공 후 호출부가 서버 id 로 reconcile 하면 그 id 가 다음 머지의 knownIds 에
 * 들어와 다시 잡히지 않는다 → 재동기화 시 같은 레코드를 두 번 POST 하지 않는다.
 */
export function recordsToBackRegister<T>(
  merged: readonly T[],
  knownIds: ReadonlySet<string>,
): T[] {
  return liveRecords(merged).filter((r) => {
    const id = recordId(r);
    return id !== null && !knownIds.has(id);
  });
}

/**
 * 최초 로그인 시 기기 로컬 데이터를 계정으로 무손실 이관한다. 원격(계정)이 없으면
 * 기기 데이터를 그대로, 있으면 mergeCloudData 시맨틱(local=기기 우선)으로 양쪽을 모두
 * 보존한다 — 즉 계정에 데이터가 있어도 기기 데이터를 덮어쓰지 않는다.
 */
export function migrateDeviceToAccount(
  local: BackupPayload,
  remote: BackupPayload | null,
): BackupPayload {
  if (remote == null) {
    return local;
  }
  return mergeCloudData(local, remote);
}
