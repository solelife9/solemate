/**
 * lib/storageMigration 단위 테스트 — 부팅 1회 스키마 마이그레이션(audit a1).
 *
 * 관찰 가능한 계약을 검증한다(iron law: 사용자 데이터 파괴 금지):
 *   1) seedUpdatedAt — 누락 레코드에만 updatedAt 시드, 기존값 보존(멱등), 비객체 무변경.
 *   2) migrateStorageSchema — 버전 < 목표면 캐시에 updatedAt 시드 + 버전 상향(1회),
 *      재실행 시 no-op(멱등), 기존 필드 비파괴, 손상 데이터면 스킵+버전 미상향(부팅 비차단).
 *
 * @format
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  seedUpdatedAt,
  migrateStorageSchema,
  STORAGE_SCHEMA_VERSION_KEY,
  CURRENT_STORAGE_SCHEMA_VERSION,
} from '../../lib/storageMigration';

const SHOES_KEY = 'cache_shoes_v1';
const RUNS_KEY = 'cache_runs_v1';
const NOW = 1_700_000_000_000;

// 모킹된 AsyncStorage 는 테스트 간 누수하므로(clearAllMockStorages 의 알려진 quirk) 매
// 테스트마다 명시적으로 비워 격리한다 — 버전 키가 남으면 마이그레이션이 조기 no-op 된다.
beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('seedUpdatedAt (순수)', () => {
  test('updatedAt 이 없는 레코드에만 now 를 시드하고 기존 필드를 모두 보존한다', () => {
    const out = seedUpdatedAt([{id: 'a', name: 'Nike', max_km: 600}], NOW) as any[];
    expect(out[0]).toEqual({id: 'a', name: 'Nike', max_km: 600, updatedAt: NOW});
  });

  test('멱등: 이미 updatedAt 이 있으면 값을 덮지 않고 원본 그대로 둔다', () => {
    const rec = {id: 'a', updatedAt: 42};
    const out = seedUpdatedAt([rec], NOW) as any[];
    expect(out[0].updatedAt).toBe(42); // 덮어쓰지 않음
    expect(out[0]).toBe(rec); // 손대지 않았으므로 동일 참조
  });

  test('ISO 문자열 updatedAt 도 유효한 값으로 보고 시드하지 않는다', () => {
    const out = seedUpdatedAt([{id: 'a', updatedAt: '2024-01-01T00:00:00Z'}], NOW) as any[];
    expect(out[0].updatedAt).toBe('2024-01-01T00:00:00Z');
  });

  test('비객체 항목(문자열/숫자/null)은 건드리지 않고 그대로 통과시킨다(비파괴)', () => {
    const out = seedUpdatedAt(['x', 5, null], NOW);
    expect(out).toEqual(['x', 5, null]);
  });

  test('배열이 아닌 입력은 빈 배열로 안전 처리', () => {
    expect(seedUpdatedAt(null as any, NOW)).toEqual([]);
    expect(seedUpdatedAt(undefined as any, NOW)).toEqual([]);
  });
});

describe('migrateStorageSchema', () => {
  test('버전 키 부재 시 캐시 신발/런에 updatedAt 을 시드하고 버전을 올린다(1회)', async () => {
    await AsyncStorage.setItem(SHOES_KEY, JSON.stringify([{id: 's1', name: 'Nike', max_km: 600}]));
    await AsyncStorage.setItem(RUNS_KEY, JSON.stringify([{id: 'r1', km: 5}]));

    const res = await migrateStorageSchema(NOW);
    expect(res.migrated).toBe(true);
    expect(res.from).toBe(0);
    expect(res.to).toBe(CURRENT_STORAGE_SCHEMA_VERSION);

    const shoes = JSON.parse((await AsyncStorage.getItem(SHOES_KEY))!);
    const runs = JSON.parse((await AsyncStorage.getItem(RUNS_KEY))!);
    expect(shoes[0].updatedAt).toBe(NOW);
    expect(runs[0].updatedAt).toBe(NOW);
    // 비파괴: 기존 필드 그대로.
    expect(shoes[0]).toMatchObject({id: 's1', name: 'Nike', max_km: 600});
    expect(runs[0]).toMatchObject({id: 'r1', km: 5});
    // 버전 영속.
    expect(await AsyncStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)).toBe(String(CURRENT_STORAGE_SCHEMA_VERSION));
  });

  test('멱등: 재실행은 no-op 이며 이미 시드된 updatedAt 을 새 시각으로 덮지 않는다', async () => {
    await AsyncStorage.setItem(SHOES_KEY, JSON.stringify([{id: 's1', name: 'Nike'}]));
    await migrateStorageSchema(NOW);

    const res2 = await migrateStorageSchema(NOW + 999); // 다른 시각으로 재실행
    expect(res2.migrated).toBe(false);
    expect(res2.from).toBe(CURRENT_STORAGE_SCHEMA_VERSION);

    const shoes = JSON.parse((await AsyncStorage.getItem(SHOES_KEY))!);
    expect(shoes[0].updatedAt).toBe(NOW); // 첫 시드값 유지 — 덮어쓰지 않음
  });

  test('이미 목표 버전이면 데이터를 전혀 건드리지 않는다(no-op)', async () => {
    await AsyncStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(CURRENT_STORAGE_SCHEMA_VERSION));
    await AsyncStorage.setItem(SHOES_KEY, JSON.stringify([{id: 's1'}])); // updatedAt 없음

    const res = await migrateStorageSchema(NOW);
    expect(res.migrated).toBe(false);

    const shoes = JSON.parse((await AsyncStorage.getItem(SHOES_KEY))!);
    expect(shoes[0].updatedAt).toBeUndefined(); // 버전이 이미 최신 → 시드 안 함
  });

  test('손상 캐시(파싱 불가)면 마이그레이션만 스킵하고 버전 미상향·데이터 불변(부팅 비차단)', async () => {
    await AsyncStorage.setItem(SHOES_KEY, '{this is not valid json');

    const res = await migrateStorageSchema(NOW);
    expect(res.skipped).toBe(true);
    expect(res.migrated).toBe(false);

    // 데이터 불변(원본 손상 문자열 그대로) — 절대 덮어쓰지 않는다.
    expect(await AsyncStorage.getItem(SHOES_KEY)).toBe('{this is not valid json');
    // 버전 미상향 → 다음 부팅 재시도 가능.
    expect(await AsyncStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)).toBeNull();
  });

  test('캐시가 비어있는 신규 사용자도 안전: no-op 시드 후 버전만 상향', async () => {
    const res = await migrateStorageSchema(NOW);
    expect(res.migrated).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)).toBe(String(CURRENT_STORAGE_SCHEMA_VERSION));
  });
});
