// ============================================================================
// lib/cloudSync.ts — Firebase 클라우드 동기 순수 로직 (Slice 5) [스텁]
//
// 신발·런·설정(BackupPayload)을 계정 클라우드(Firestore)와 양방향 동기할 때의
// 순수 병합/마이그레이션/인증상태 로직을 모은다. firebase SDK 자체(@react-native-
// firebase/auth·firestore)는 이 모듈 밖의 포트(인터페이스) 뒤에 두고, 여기서는
// 네이티브 의존성 0 의 순수 함수만 다뤄 단위테스트로 검증한다.
//
// 계약(수용 테스트 @slice-5 클라우드 동기 — 아직 .skip):
//   nextAuthState        — 로그인 상태머신(signedOut↔signingIn↔signedIn/error)
//   mergeCloudData       — 로컬+원격을 id 합집합으로 병합, 어느 쪽도 레코드 유실 금지
//                          (충돌 시 최신 우선). iron law: 데이터 파괴 금지.
//   migrateDeviceToAccount — 최초 로그인 시 기기(device_id) 데이터를 계정으로 무손실 이관
//
// NOTE: 이 파일은 스텁이다. slice-5-fb-synclogic dev 잡이 본 구현으로 교체하고
//       tests/acceptance/slice-5-cloud.test.ts 의 자기 블록 `.skip` 을 제거한다.
//       그 전까지 describe.skip 으로 막혀 있어 npm test 는 green 을 유지한다.
// ============================================================================

import type { BackupPayload } from './backup';

export type AuthState = 'signedOut' | 'signingIn' | 'signedIn' | 'error';
export type AuthEvent = 'signInStart' | 'signInSuccess' | 'signInError' | 'signOut';

const NOT_IMPL = 'cloudSync 스텁: slice-5-fb-synclogic 에서 구현됩니다';

/** 인증 상태머신: 현재 상태 + 이벤트 → 다음 상태(부정 전이는 현재 유지). */
export function nextAuthState(_current: AuthState, _event: AuthEvent): AuthState {
  throw new Error(NOT_IMPL);
}

/**
 * 로컬 데이터와 원격(계정) 데이터를 병합한다. shoes/runs 는 id 합집합으로 어느 쪽도
 * 유실 없이 합치고, 같은 id 충돌 시 최신(updatedAt 등) 레코드를 택한다. settings 는
 * 얕은 병합. remote 가 null(원격 없음)이면 local 을 그대로 돌려준다.
 */
export function mergeCloudData(_local: BackupPayload, _remote: BackupPayload | null): BackupPayload {
  throw new Error(NOT_IMPL);
}

/**
 * 최초 로그인 시 기기 로컬 데이터를 계정으로 이관한다. 기존 계정 데이터가 있으면
 * 병합하되 양쪽 모두 보존(파괴 금지). 사실상 device 우선 시맨틱의 mergeCloudData.
 */
export function migrateDeviceToAccount(
  _local: BackupPayload,
  _remote: BackupPayload | null,
): BackupPayload {
  throw new Error(NOT_IMPL);
}
