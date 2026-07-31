// ============================================================================
// accountScope — 계정별 로컬 데이터 격리 (AUDIT 1 S-1 잔여)
//
// 이 모듈의 계약은 두 줄이다:
//   1) 계정이 바뀌면 이전 계정 데이터가 화면에서 **사라진다**
//   2) 그런데 **없어지지는 않는다** — 다시 로그인하면 그대로 돌아온다
// 아래 테스트는 그 둘을 각각, 그리고 함께(왕복) 검증한다.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isUserKey,
  archiveKeyFor,
  parseArchiveKey,
  switchAccountStorage,
  reconcileAccountStorage,
  USER_KEYS,
  USER_KEY_PREFIXES,
  DEVICE_KEYS,
  ARCHIVE_PREFIX,
} from '../../lib/accountScope';
import {CACHE_OWNER_KEY} from '../../lib/cacheOwner';

const A = 'uid-A';
const B = 'uid-B';

/** A 가 쓰던 기기 상태를 만든다 — 신발·런·경로·설정·기기키까지. */
async function seedDeviceAs(user: string) {
  await AsyncStorage.setMany({
    cache_shoes_v1: JSON.stringify([{id: 's1', name: `${user} 페가수스`}]),
    cache_runs_v1: JSON.stringify([{id: 'r1', km: 10, owner: user}]),
    route_r1: JSON.stringify([{lat: 37.5, lon: 127.0}]),
    splits_r1: JSON.stringify([1, 2, 3]),
    body_weight_kg: user === A ? '65' : '80',
    settings_unit: 'km',
    onboarded: '1',
    device_id: 'sl_device_fixed',
    storage_schema_version: '1',
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('isUserKey — 목록 판정', () => {
  test('사용자 키는 전부 true', () => {
    for (const k of USER_KEYS) expect(isUserKey(k)).toBe(true);
    for (const p of USER_KEY_PREFIXES) expect(isUserKey(p + 'abc123')).toBe(true);
  });

  test('기기 키는 전부 false — 전환해도 살아남아야 한다', () => {
    for (const k of DEVICE_KEYS) expect(isUserKey(k)).toBe(false);
  });

  test('소유자 표시(cache_owner_uid)는 절대 옮기지 않는다 — 옮기면 판정이 무너진다', () => {
    expect(isUserKey(CACHE_OWNER_KEY)).toBe(false);
  });

  test('전역 카탈로그 캐시는 옮기지 않는다 — 옮기면 매번 다시 받아 읽기가 는다', () => {
    expect(isUserKey('keego.shoeCatalogRemote.v1')).toBe(false);
    expect(isUserKey('keego.raceCatalogRemote.v1')).toBe(false);
  });

  test('보관함 키 자신은 옮기지 않는다(중첩 방지)', () => {
    expect(isUserKey(archiveKeyFor(A, 'cache_shoes_v1'))).toBe(false);
  });

  test('모르는 키는 공용으로 남긴다(빠뜨리는 실수는 안전하다)', () => {
    expect(isUserKey('무언가_새로운_키')).toBe(false);
    expect(isUserKey('')).toBe(false);
  });
});

describe('archiveKeyFor / parseArchiveKey 왕복', () => {
  test('만든 키를 그대로 되돌린다', () => {
    for (const k of ['cache_runs_v1', 'route_r1', 'settings_unit']) {
      expect(parseArchiveKey(archiveKeyFor(A, k))).toEqual({uid: A, key: k});
    }
  });
  test('보관함이 아닌 키는 null', () => {
    expect(parseArchiveKey('cache_runs_v1')).toBeNull();
    expect(parseArchiveKey(ARCHIVE_PREFIX)).toBeNull();
  });
});

describe('switchAccountStorage — A → B', () => {
  test('B 는 A 의 데이터를 보지 못한다', async () => {
    await seedDeviceAs(A);
    await switchAccountStorage(A, B);

    for (const k of ['cache_shoes_v1', 'cache_runs_v1', 'route_r1', 'splits_r1', 'onboarded']) {
      expect(await AsyncStorage.getItem(k)).toBeNull();
    }
  });

  test('기기 키는 그대로 살아남는다', async () => {
    await seedDeviceAs(A);
    await switchAccountStorage(A, B);
    expect(await AsyncStorage.getItem('device_id')).toBe('sl_device_fixed');
    expect(await AsyncStorage.getItem('storage_schema_version')).toBe('1');
  });

  test('A 의 데이터는 사라지지 않는다 — 보관함에 그대로 있다', async () => {
    await seedDeviceAs(A);
    await switchAccountStorage(A, B);

    const shoes = await AsyncStorage.getItem(archiveKeyFor(A, 'cache_shoes_v1'));
    expect(shoes).toContain('uid-A 페가수스');
    expect(await AsyncStorage.getItem(archiveKeyFor(A, 'route_r1'))).toContain('37.5');
  });

  test('B 로 갔다가 A 로 돌아오면 A 의 데이터가 그대로 복원된다(왕복 무손실)', async () => {
    await seedDeviceAs(A);
    const before = await AsyncStorage.getMany([
      'cache_shoes_v1',
      'cache_runs_v1',
      'route_r1',
      'splits_r1',
      'body_weight_kg',
    ]);

    await switchAccountStorage(A, B);
    // B 가 자기 데이터를 만든다
    await AsyncStorage.setItem('cache_shoes_v1', JSON.stringify([{id: 's9', name: 'B 신발'}]));
    await AsyncStorage.setItem('body_weight_kg', '80');
    await switchAccountStorage(B, A);

    const after = await AsyncStorage.getMany(Object.keys(before));
    expect(after).toEqual(before); // 한 글자도 달라지지 않는다
  });

  test('A 로 돌아와도 B 의 데이터는 보관함에 남는다(양쪽 다 보존)', async () => {
    await seedDeviceAs(A);
    await switchAccountStorage(A, B);
    await AsyncStorage.setItem('cache_shoes_v1', JSON.stringify([{id: 's9', name: 'B 신발'}]));
    await switchAccountStorage(B, A);

    expect(await AsyncStorage.getItem(archiveKeyFor(B, 'cache_shoes_v1'))).toContain('B 신발');
  });

  test('새 계정은 빈 상태로 시작한다(복원할 것이 없다)', async () => {
    await seedDeviceAs(A);
    const {archived, restored} = await switchAccountStorage(A, B);
    expect(archived).toBeGreaterThan(0);
    expect(restored).toBe(0);
  });

  test('이전 보관함은 최신 상태로 갈아치운다 — 지운 데이터가 되살아나지 않는다', async () => {
    await seedDeviceAs(A);
    await switchAccountStorage(A, B); // A 보관(런 r1 포함)
    await switchAccountStorage(B, A); // A 복원

    // A 가 런을 지웠다
    await AsyncStorage.removeItem('route_r1');
    await AsyncStorage.setItem('cache_runs_v1', JSON.stringify([]));

    await switchAccountStorage(A, B); // 다시 보관 — 옛 보관함이 남아 있으면 안 된다
    expect(await AsyncStorage.getItem(archiveKeyFor(A, 'route_r1'))).toBeNull();

    await switchAccountStorage(B, A); // 복원했을 때도 되살아나면 안 된다
    expect(await AsyncStorage.getItem('route_r1')).toBeNull();
    expect(await AsyncStorage.getItem('cache_runs_v1')).toBe('[]');
  });

  test('같은 계정이면 보관하지 않는다', async () => {
    await seedDeviceAs(A);
    const {archived} = await switchAccountStorage(A, A);
    expect(archived).toBe(0);
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toContain('uid-A');
  });
});

describe('reconcileAccountStorage — 부팅 시 정합', () => {
  test('소유자 표시가 없으면 지금 데이터를 이 계정 것으로 인정한다(업그레이드 경로)', async () => {
    await seedDeviceAs(A);
    expect(await reconcileAccountStorage(A)).toBe('adopted');
    // 기존 사용자의 데이터가 사라지면 안 된다 — 이게 이 분기의 존재 이유다.
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toContain('uid-A');
    expect(await AsyncStorage.getItem(CACHE_OWNER_KEY)).toBe(A);
  });

  test('같은 계정이면 아무것도 하지 않는다', async () => {
    await seedDeviceAs(A);
    await AsyncStorage.setItem(CACHE_OWNER_KEY, A);
    expect(await reconcileAccountStorage(A)).toBe('same');
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toContain('uid-A');
  });

  test('계정이 바뀌면 갈아끼우고 소유자를 갱신한다', async () => {
    await seedDeviceAs(A);
    await AsyncStorage.setItem(CACHE_OWNER_KEY, A);

    expect(await reconcileAccountStorage(B)).toBe('switched');
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toBeNull();
    expect(await AsyncStorage.getItem(CACHE_OWNER_KEY)).toBe(B);
    expect(await AsyncStorage.getItem(archiveKeyFor(A, 'cache_shoes_v1'))).toContain('uid-A');
  });

  test('전환은 멱등하다 — 두 번 불러도 결과가 같다', async () => {
    await seedDeviceAs(A);
    await AsyncStorage.setItem(CACHE_OWNER_KEY, A);
    await reconcileAccountStorage(B);
    const snapshot = await AsyncStorage.getMany(await AsyncStorage.getAllKeys());

    await reconcileAccountStorage(B);
    expect(await AsyncStorage.getMany(await AsyncStorage.getAllKeys())).toEqual(snapshot);
  });

  test('A→B→A 왕복 뒤 A 의 신발이 화면에 돌아온다(사용자 관점 계약)', async () => {
    await seedDeviceAs(A);
    await reconcileAccountStorage(A); // adopted
    await reconcileAccountStorage(B); // switched — B 는 빈 화면
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toBeNull();

    await reconcileAccountStorage(A); // switched back
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toContain('uid-A 페가수스');
    expect(await AsyncStorage.getItem('splits_r1')).toBe('[1,2,3]');
  });
});
