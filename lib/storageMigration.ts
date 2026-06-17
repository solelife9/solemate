// ============================================================================
// lib/storageMigration.ts — AsyncStorage 스키마 마이그레이션 (audit a1)
//
// 'storage_schema_version' 키로 로컬 스토리지 스키마 버전을 추적하고, 부팅 시 그 버전이
// 목표보다 낮으면 1회 마이그레이션한다. 현재 마이그레이션(v1): 기존 캐시 신발/런 레코드에
// updatedAt(epoch ms)이 없으면 시드해, cloudSync.mergeRecords 의 '최신 우선' 머지가
// 실데이터에서도 작동하게 한다(이전 빌드의 레코드엔 updatedAt 이 전혀 없어 머지가 무력).
//
// iron law:
//   · 멱등    — 이미 updatedAt 이 있는 레코드는 건드리지 않는다(재실행 안전).
//   · 비파괴  — 기존 필드를 절대 손상/삭제하지 않는다. 손상/비배열 데이터는 그대로 둔다.
//   · 비차단  — 어느 단계가 실패해도 throw 하지 않고 마이그레이션만 스킵+로그한다(버전을
//               올리지 않아 다음 부팅에 재시도). 부팅은 절대 막지 않는다.
//   · 하위호환 — updatedAt 은 선택필드. 부재 시 기존 동작을 그대로 유지한다.
// ============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

/** 로컬 스토리지 스키마 버전을 보관하는 AsyncStorage 키. */
export const STORAGE_SCHEMA_VERSION_KEY = 'storage_schema_version';
/** 현재 목표 스키마 버전. 새 마이그레이션을 추가하면 올린다. */
export const CURRENT_STORAGE_SCHEMA_VERSION = 1;

// 마이그레이션 대상 캐시 키 — App.tsx 의 CACHE_SHOES_KEY/CACHE_RUNS_KEY(로컬-퍼스트 부팅
// 캐시)와 동일하다. 테스트는 keys 인자로 임의 키를 주입할 수 있다.
export const DEFAULT_MIGRATION_KEYS: readonly string[] = ['cache_shoes_v1', 'cache_runs_v1'];

/** 레코드가 이미 쓸만한 updatedAt 을 가졌는지(유한수 또는 파싱 가능한 ISO 문자열). */
function hasUsableUpdatedAt(rec: Record<string, unknown>): boolean {
  const u = rec.updatedAt;
  if (typeof u === 'number' && Number.isFinite(u)) return true;
  if (typeof u === 'string' && !Number.isNaN(Date.parse(u))) return true;
  return false;
}

/**
 * 레코드 배열에 updatedAt(now)을 시드한다. updatedAt 이 없는 *객체* 레코드에만 더하고,
 * 이미 있거나(멱등) 객체가 아닌(비파괴) 항목은 원본 그대로 둔다. 순수함수(I/O 없음) —
 * 단위테스트로 멱등·비파괴를 직접 검증한다.
 */
export function seedUpdatedAt(records: unknown[], now: number): unknown[] {
  if (!Array.isArray(records)) return [];
  return records.map((rec) => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec; // 비파괴
    const r = rec as Record<string, unknown>;
    if (hasUsableUpdatedAt(r)) return rec; // 멱등 — 손대지 않음
    return { ...r, updatedAt: now }; // 비파괴 — 기존 필드 보존, updatedAt 만 추가
  });
}

/** 한 캐시 키의 배열 레코드에 updatedAt 을 시드해 다시 쓴다(미존재/비배열은 무변경). */
async function seedKey(key: string, now: number): Promise<void> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return; // 아직 캐시 없음 — 할 일 없음
  const arr = JSON.parse(raw); // 손상 시 throw → 호출부가 잡아 마이그레이션 스킵(비파괴)
  if (!Array.isArray(arr)) return; // 예상 밖 형태 — 건드리지 않는다(비파괴)
  await AsyncStorage.setItem(key, JSON.stringify(seedUpdatedAt(arr, now)));
}

export interface MigrationResult {
  migrated: boolean; // 이번 부팅에 실제로 마이그레이션을 수행했는가
  from: number; // 마이그레이션 전 스키마 버전(키 부재/손상 → 0)
  to: number; // 마이그레이션 후 버전(스킵/no-op 이면 from 과 동일)
  skipped?: boolean; // 오류로 스킵됐는가(데이터·버전 모두 불변)
}

/**
 * 부팅 시 1회 호출. 저장된 스키마 버전이 목표보다 낮으면 캐시 레코드에 updatedAt 을 시드한
 * 뒤 버전을 올린다. 어느 단계가 실패해도 throw 하지 않고 스킵(+로그)하며 버전을 올리지
 * 않으므로 다음 부팅에 재시도된다 — 부팅을 절대 막지 않는다(비차단).
 *
 * now/keys 는 테스트 결정성·격리를 위해 주입 가능하다.
 */
export async function migrateStorageSchema(
  now: number = Date.now(),
  keys: readonly string[] = DEFAULT_MIGRATION_KEYS,
): Promise<MigrationResult> {
  let from = 0;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SCHEMA_VERSION_KEY);
    const parsed = raw == null ? 0 : Number(raw);
    from = Number.isFinite(parsed) ? parsed : 0;
    if (from >= CURRENT_STORAGE_SCHEMA_VERSION) {
      return { migrated: false, from, to: from }; // 이미 최신 — no-op
    }
    for (const key of keys) {
      await seedKey(key, now);
    }
    // 모든 시드가 성공한 뒤에만 버전을 올린다(부분 실패 시 다음 부팅 재시도·멱등).
    await AsyncStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(CURRENT_STORAGE_SCHEMA_VERSION));
    return { migrated: true, from, to: CURRENT_STORAGE_SCHEMA_VERSION };
  } catch (e) {
    // 비차단: 마이그레이션만 스킵하고 버전을 올리지 않는다(데이터 불변, 다음 부팅 재시도).
    console.log('migrateStorageSchema skipped', e);
    return { migrated: false, from, to: from, skipped: true };
  }
}
