// ============================================================================
// lib/restToFirestoreMigration.ts — REST→Firestore 일회성 데이터 이관 (Phase 5b · Stage 0)
// ============================================================================
// 신발/런 정본을 Render REST 에서 Firestore 로 옮기는 전환의 첫 단계(데이터 유실 가드).
// 이후 Stage 3 가 REST 부팅을 제거해도 안전하려면, 그 전에 "REST 에만 있던 데이터가
// Firestore 에도 반드시 존재"함을 보장해야 한다. 이 모듈이 부팅 1회에 그것을 명시적으로
// 수행한다: Firestore 가 비어 있고 REST 에 데이터가 있으면 REST 페이로드를 Firestore 에
// 시드(push)한다.
//
// 멱등·비차단 계약(storageMigration 패턴과 동일):
//   · 멱등    — 완료 플래그(또는 Firestore 가 이미 비어있지 않음)면 no-op.
//   · 비파괴  — Firestore 가 이미 데이터를 가지면 절대 덮어쓰지 않는다(시드 안 함).
//   · 비차단  — REST 도달 불가/실패 시 throw 하지 않고 플래그도 올리지 않는다(다음 부팅 재시도).
//
// 전환용(transitional) 코드다 — Render 가 은퇴하면 이 모듈과 REST 의존은 함께 제거한다.
// 순수 결정(decideRestSeed)과 I/O 오케스트레이션(migrateRestToFirestore)을 분리해
// 주입(DI)으로 firebase/네트워크 없이 단위테스트한다.
// ============================================================================
import type {BackupPayload} from './backup';

/** 완료 플래그 AsyncStorage 키(앱이 read/write 주입). */
export const REST_MIGRATION_KEY = 'rest_to_firestore_migrated_v1';

/** payload 가 비었는가(신발·런 둘 다 없음). null/누락/비배열도 빈 것으로 본다. */
export function isEmptyPayload(p: BackupPayload | null | undefined): boolean {
  if (!p) return true;
  const shoes = Array.isArray(p.shoes) ? p.shoes : [];
  const runs = Array.isArray(p.runs) ? p.runs : [];
  return shoes.length === 0 && runs.length === 0;
}

export interface RestSeedDecision {
  shouldSeed: boolean;
}

/**
 * 순수 결정: Firestore(remote)가 비었고 REST(rest)에 데이터가 있을 때만 시드한다.
 * remote 가 이미 데이터를 가지면(비파괴) 절대 시드하지 않는다.
 */
export function decideRestSeed(
  remote: BackupPayload | null,
  rest: BackupPayload | null,
): RestSeedDecision {
  return {shouldSeed: isEmptyPayload(remote) && !isEmptyPayload(rest)};
}

export interface RestMigrationDeps {
  /** 완료 플래그 읽기(true 면 이미 이관됨). */
  isDone: () => Promise<boolean>;
  /** 완료 플래그 쓰기. */
  markDone: () => Promise<void>;
  /** Firestore 현재 백업(cloudPort.pull). 없으면 null. */
  pullRemote: () => Promise<BackupPayload | null>;
  /**
   * REST 데이터 로드(apiAuth→apiGetShoes/apiGetRuns). **도달 불가/실패 시 null** 을
   * 돌려준다(빈 페이로드와 구분 — null 은 재시도, 빈 페이로드는 '진짜 비어있음'으로 완료).
   */
  loadRest: () => Promise<BackupPayload | null>;
  /** Firestore 에 시드(cloudPort.push). */
  pushRemote: (data: BackupPayload) => Promise<void>;
  /** 선택: 시드한 데이터를 로컬 화면에도 반영(보통 initUser 가 이미 함 → 생략 가능). */
  applyLocal?: (data: BackupPayload) => void;
}

export type RestMigrationReason =
  | 'already-done'
  | 'firestore-already-has-data'
  | 'rest-unreachable'
  | 'no-rest-data'
  | 'seeded'
  | 'error';

export interface RestMigrationResult {
  migrated: boolean;
  reason: RestMigrationReason;
}

/**
 * 부팅 1회 호출. Firestore 가 비어 있고 REST 에 데이터가 있으면 REST→Firestore 시드.
 * 어느 분기든 throw 하지 않는다. 완료 플래그는 '확정적으로 끝난' 경우에만 올린다:
 *   · firestore-already-has-data / no-rest-data / seeded → 완료(플래그 set)
 *   · rest-unreachable / error → 미완료(플래그 미set, 다음 부팅 재시도)
 */
export async function migrateRestToFirestore(
  deps: RestMigrationDeps,
): Promise<RestMigrationResult> {
  try {
    if (await deps.isDone()) return {migrated: false, reason: 'already-done'};

    const remote = await deps.pullRemote();
    if (!isEmptyPayload(remote)) {
      // Firestore 가 이미 정본을 가짐 — 시드 불필요(비파괴). 이관 완료로 표시.
      await deps.markDone();
      return {migrated: false, reason: 'firestore-already-has-data'};
    }

    const rest = await deps.loadRest();
    if (rest === null) {
      // REST 도달 불가(오프라인/다운) — 플래그를 올리지 않고 다음 부팅에 재시도.
      return {migrated: false, reason: 'rest-unreachable'};
    }
    if (isEmptyPayload(rest)) {
      // REST 도 비어 있음(진짜 신규 사용자) — 이관할 것 없음. 완료로 표시(재시도 불필요).
      await deps.markDone();
      return {migrated: false, reason: 'no-rest-data'};
    }

    await deps.pushRemote(rest);
    deps.applyLocal?.(rest);
    await deps.markDone();
    return {migrated: true, reason: 'seeded'};
  } catch (e) {
    // 비차단: 플래그 미set → 다음 부팅 재시도.
    console.log('migrateRestToFirestore skipped', e);
    return {migrated: false, reason: 'error'};
  }
}
