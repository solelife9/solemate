// cacheOwner.test.ts — 계정 전환 오염 차단 (2026-07-31 AUDIT 1)
//
// 실증된 결함: 로컬 캐시(cache_shoes_v1/cache_runs_v1)에 소유자 표시가 없었고,
// 로그아웃은 신발·런 상태도 캐시도 비우지 않는다(탈퇴 경로만 비운다). initUser 는
// 마운트 때 한 번만 돌므로, 한 기기에서 A 로그아웃 → B 로그인 시 **메모리에 남은 A 의
// 기록이 B 계정으로 병합돼 클라우드에 올라갔다.** 앱 재시작도 필요 없다.
//
// 여기서 고정하는 것:
//  1) 표시가 없으면 'unowned' — 기존 사용자를 막지 않는다(첫 성공 동기에서 주인이 된다).
//  2) 다른 계정이면 'other' — 호출부가 동기를 통째로 건너뛴다.
//  3) 저장소 오류는 'unowned' — 오류 때문에 정상 사용자의 백업을 막지 않는다.
//  4) claim 은 멱등이고 실패해도 던지지 않는다.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {checkCacheOwner, claimCacheOwner, CACHE_OWNER_KEY} from '../../lib/cacheOwner';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('checkCacheOwner', () => {
  test('표시가 없으면 unowned — 기존 사용자를 막지 않는다', async () => {
    await expect(checkCacheOwner('uid_a')).resolves.toBe('unowned');
  });

  test('내 uid 가 주인이면 mine', async () => {
    await claimCacheOwner('uid_a');
    await expect(checkCacheOwner('uid_a')).resolves.toBe('mine');
  });

  test('다른 계정 것이면 other — 이게 오염을 막는 지점이다', async () => {
    await claimCacheOwner('uid_a');
    await expect(checkCacheOwner('uid_b')).resolves.toBe('other');
  });

  test('미로그인은 other — 동기할 대상이 없다', async () => {
    await expect(checkCacheOwner(null)).resolves.toBe('other');
    await expect(checkCacheOwner(undefined)).resolves.toBe('other');
    await expect(checkCacheOwner('')).resolves.toBe('other');
  });

  test('저장소 읽기 실패는 unowned — 오류가 정상 사용자의 백업을 막지 않는다', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('boom'));
    await expect(checkCacheOwner('uid_a')).resolves.toBe('unowned');
    spy.mockRestore();
  });
});

describe('claimCacheOwner', () => {
  test('주인을 기록하고, 다시 불러도 같은 값(멱등)', async () => {
    await claimCacheOwner('uid_a');
    await claimCacheOwner('uid_a');
    await expect(AsyncStorage.getItem(CACHE_OWNER_KEY)).resolves.toBe('uid_a');
  });

  test('계정이 바뀌면 주인도 바뀐다(정상 전환 뒤 재등록 경로)', async () => {
    await claimCacheOwner('uid_a');
    await claimCacheOwner('uid_b');
    await expect(checkCacheOwner('uid_b')).resolves.toBe('mine');
  });

  test('uid 가 없으면 아무것도 쓰지 않는다', async () => {
    await claimCacheOwner(null);
    await expect(AsyncStorage.getItem(CACHE_OWNER_KEY)).resolves.toBeNull();
  });

  test('쓰기 실패해도 던지지 않는다', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('boom'));
    await expect(claimCacheOwner('uid_a')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('App 동기 경로에 가드가 실제로 걸려 있는가(정적)', () => {
  const app = require('fs').readFileSync(require('path').join(__dirname, '../../App.tsx'), 'utf8');

  test('runCloudSync 가 checkCacheOwner 결과로 early-return 한다', () => {
    expect(app).toMatch(/import\s*\{[^}]*checkCacheOwner[^}]*\}\s*from\s*'\.\/lib\/cacheOwner'/);
    const gate = app.indexOf("ownership==='other'");
    const sync = app.indexOf('port.syncMerge(syncPayload');
    expect(gate).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(-1);
    // 가드가 실제 업로드보다 앞에 있어야 의미가 있다.
    expect(gate).toBeLessThan(sync);
  });

  test('동기 성공 후 주인을 등록한다', () => {
    expect(app).toMatch(/claimCacheOwner\(authUser\.uid\)/);
  });
});
