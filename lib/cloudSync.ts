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

// ── id/updatedAt 추출 (레코드는 unknown 이므로 방어적으로 읽는다) ───────────────

/** 레코드에서 비교용 id 를 뽑는다. 없으면 null(→ 합치되 dedupe 하지 않음). */
function recordId(rec: unknown): string | null {
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
 *   · 양쪽에 같은 id(충돌)  → updatedAt 큰(최신) 쪽 채택. 동률/없음이면 local 우선.
 *   · id 가 없는 레코드     → dedupe 불가하므로 전부 그대로 뒤에 보존.
 * local 의 순서를 먼저 유지하고, remote 에만 있는 신규 id 를 그 뒤로 덧붙인다.
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
      // remote 충돌: 더 최신(updatedAt 큰)일 때만 교체. 동률이면 local 유지.
      const existing = byId.get(id);
      if (recordUpdatedAt(rec) > recordUpdatedAt(existing)) {
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
