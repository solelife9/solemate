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
  wipeAccountStorage,
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

// ============================================================================
// 저장소 키 전수 대조 (2026-08-07 감사)
//
// 왜 이게 필요한가: 기존 테스트는 **USER_KEYS 에 적힌 키가 user key 로 판정되는지**만
// 봤다. 즉 목록에 적힌 것만 검사하므로, **빠뜨린 키는 구조적으로 잡히지 않는다.**
// 실제로 5개가 조용히 빠져 있었고 그중 둘은 결과가 무거웠다:
//   · social_visibility_v1  → A 의 공개 동의를 B 가 상속(동의 없는 개인정보 공개)
//   · recordSync_cursor_v1  → B 의 델타 조회가 0건("내 기록이 다 사라졌다")
//
// 그래서 방향을 뒤집는다: **소스에 실제로 존재하는 저장소 키를 긁어와** 목록과 대조하고,
// 어느 쪽에도 없는 키가 생기면 사람이 의도적으로 분류하게 만든다.
//
// 이 테스트가 빨개졌다면 새 키를 하나 만들었다는 뜻이다. 자문할 것 하나 —
// **이 값이 남의 계정에 그대로 보이면 무슨 일이 나는가.** 답이 '아무 일 없음'일 때만
// UNSCOPED_OK 에 넣는다. 그 외에는 USER_KEYS 로 간다.
// ============================================================================
describe('저장소 키 전수 대조 — 빠뜨린 계정 키가 없다', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const repoRoot = path.join(__dirname, '..', '..');

  /**
   * 계정에 딸리지 **않는** 것이 확실한 키. DEVICE_KEYS 와 다른 점: 저쪽은 "옮기면 안 되는"
   * 안전핀이고, 이쪽은 "옮길 필요 없다"는 판단 기록이다. 근거를 한 줄씩 남긴다.
   */
  const UNSCOPED_OK = new Set<string>([
    'keego.shoeCatalogRemote.v1',  // 전역 신발 카탈로그 캐시 — 옮기면 매번 다시 받는다
    'keego.raceCatalogRemote.v1',  // 전역 대회 카탈로그 캐시 — 〃
    'clock_offset_ms_v1',          // 이 기기의 시계가 서버보다 얼마나 틀어졌나(기기 특성)
    'loc_perm_primed',             // 위치 권한 사전 안내를 봤는지 — OS 권한 자체가 기기 단위다
    'hr_curve_open_v1',            // 기록 화면 심박 그래프 펼침 상태(표시 취향, 무해)
    'sharecard_prefs_v3',          // 공유 카드 스타일 취향(표시 기본값, 무해)
  ]);

  /** 소스에서 문자열 리터럴로 등장하는 AsyncStorage 키 후보를 긁는다. */
  const collectKeys = (): Set<string> => {
    const found = new Set<string>();
    const skip = new Set(['node_modules', '__tests__', 'android', 'ios', 'docs', '.git', 'coverage']);
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        if (skip.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        // AsyncStorage.<op>('키'…) 와 = '키' 형태의 상수 선언 양쪽을 본다.
        const re = /AsyncStorage\.\w+\(\s*'([^']+)'|(?:KEY|key)\s*=\s*'([^']+)'/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          const k = m[1] || m[2];
          if (!k || k.includes('/') || k.includes(' ')) continue;
          // `…KEY = '…'` 패턴은 저장소 키가 아닌 것도 잡는다 — 예: KAKAO_NATIVE_APP_KEY.
          // 긴 16진 문자열은 자격증명이지 저장소 키가 아니다(저장소 키는 사람이 읽는 이름).
          if (/^[0-9a-f]{24,}$/i.test(k)) continue;
          found.add(k);
        }
      }
    };
    walk(repoRoot);
    return found;
  };

  test('소스의 모든 저장소 키가 분류돼 있다', () => {
    const classified = (k: string) =>
      USER_KEYS.includes(k) ||
      DEVICE_KEYS.includes(k) ||
      UNSCOPED_OK.has(k) ||
      USER_KEY_PREFIXES.some(p => k.startsWith(p)) ||
      k.startsWith(ARCHIVE_PREFIX);

    const unclassified = [...collectKeys()].filter(k => !classified(k)).sort();
    expect(unclassified).toEqual([]);
  });

  // 값이 무거운 키는 이름으로 한 번 더 못 박는다 — 위 수집 정규식이 놓쳐도 여기서 잡힌다.
  test('동의·동기 커서는 반드시 계정 키다', () => {
    for (const k of [
      'social_visibility_v1',
      'social_published_sig_v1',
      'leaderboard_published_v1',
      'recordSync_cursor_v1',
      'recordSync_pushed_v1',
      'watch_runs_seen_v1',
      'detail_delete_pending_v1',
    ]) {
      expect(isUserKey(k)).toBe(true);
    }
  });
});

// ============================================================================
// wipeAccountStorage — 탈퇴는 내 것만 지운다 (2026-08-07 감사)
//
// 탈퇴 경로가 AsyncStorage.clear() 를 부르고 있었다. 그건 보관함까지 통째로 날려서,
// 가족이 한 폰을 쓰다 A 가 탈퇴하면 **B 의 미동기 로컬 기록이 함께 사라진다.**
// B 는 탈퇴한 적이 없고, 클라우드에 아직 올라가지 않았다면 되돌릴 방법이 없다.
// ============================================================================
describe('wipeAccountStorage — 탈퇴 범위', () => {
  test('떠나는 계정의 데이터와 보관함은 지우고, 다른 계정 보관함은 남긴다', async () => {
    await AsyncStorage.setMany({
      // 지금 화면에 떠 있는 A 의 데이터
      cache_shoes_v1: JSON.stringify([{id: 's1'}]),
      cache_runs_v1: JSON.stringify([{id: 'r1'}]),
      device_id: 'sl_device_fixed',
      // A 자신의 보관함(예전 전환 잔재) — 함께 지워야 한다
      [archiveKeyFor(A, 'cache_runs_v1')]: JSON.stringify([{id: 'old'}]),
      // B 의 보관함 — **남아야 한다**
      [archiveKeyFor(B, 'cache_runs_v1')]: JSON.stringify([{id: 'b-run'}]),
      [archiveKeyFor(B, 'medals_v1')]: JSON.stringify([{id: 'b-medal'}]),
    });

    await wipeAccountStorage(A);

    // A 의 것은 전부 사라진다.
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toBeNull();
    expect(await AsyncStorage.getItem('cache_runs_v1')).toBeNull();
    expect(await AsyncStorage.getItem(archiveKeyFor(A, 'cache_runs_v1'))).toBeNull();

    // B 의 보관함은 그대로다 — 이게 이 함수의 존재 이유다.
    expect(await AsyncStorage.getItem(archiveKeyFor(B, 'cache_runs_v1'))).toBe(
      JSON.stringify([{id: 'b-run'}]),
    );
    expect(await AsyncStorage.getItem(archiveKeyFor(B, 'medals_v1'))).toBe(
      JSON.stringify([{id: 'b-medal'}]),
    );
  });

  test('B 로 로그인하면 남아 있던 기록이 실제로 돌아온다(사용자 관점 계약)', async () => {
    await AsyncStorage.setMany({
      cache_runs_v1: JSON.stringify([{id: 'a-run'}]),
      cache_owner_uid: A,
      [archiveKeyFor(B, 'cache_runs_v1')]: JSON.stringify([{id: 'b-run'}]),
    });

    await wipeAccountStorage(A);
    await reconcileAccountStorage(B);

    expect(JSON.parse((await AsyncStorage.getItem('cache_runs_v1')) as string)).toEqual([
      {id: 'b-run'},
    ]);
  });

  test('uid 를 모르면 보관함은 하나도 건드리지 않는다(안전한 쪽)', async () => {
    await AsyncStorage.setMany({
      cache_runs_v1: 'x',
      [archiveKeyFor(A, 'cache_runs_v1')]: 'a',
      [archiveKeyFor(B, 'cache_runs_v1')]: 'b',
    });

    await wipeAccountStorage('');

    expect(await AsyncStorage.getItem('cache_runs_v1')).toBeNull();
    expect(await AsyncStorage.getItem(archiveKeyFor(A, 'cache_runs_v1'))).toBe('a');
    expect(await AsyncStorage.getItem(archiveKeyFor(B, 'cache_runs_v1'))).toBe('b');
  });
});
