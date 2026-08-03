/**
 * 계정 전환 시 화면 격리 — AUDIT 1 S-1 잔여분의 **사용자 관점 계약**.
 *
 * accountScope 단위 테스트는 저장소가 옳게 갈아끼워지는지를 본다. 여기서는 그 배선이
 * 실제로 앱 부팅에 연결돼 있는지를 본다 — 즉 **B 가 앱을 열었을 때 A 의 신발이
 * 화면에 없는지**. 배선이 빠지면 저장소 로직이 아무리 옳아도 사고는 그대로다.
 *
 * 이 경로는 __KEEGO_ENABLE_ACCOUNT_SCOPE__ 로만 켠다(기본 우회 — 다른 App 스위트 무영향).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {archiveKeyFor} from '../lib/accountScope';
import {CACHE_OWNER_KEY} from '../lib/cacheOwner';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

const A_SHOE = 'A의페가수스';

async function seedAccountA() {
  await AsyncStorage.setMany({
    [CACHE_OWNER_KEY]: 'uid-A',
    cache_shoes_v1: JSON.stringify([
      {id: 's1', name: A_SHOE, max_km: 700, start_km: 0, updatedAt: 1},
    ]),
    cache_runs_v1: JSON.stringify([{id: 'r1', distance_km: 10, updatedAt: 1}]),
    route_r1: JSON.stringify([{lat: 37.5, lon: 127.0}]),
    onboarded: '1',
    // 축하 오버레이가 홈을 덮으면 화면 텍스트 단언이 흐려진다. A 는 이미 다 본 사용자로 둔다.
    // (이 키도 계정별 데이터다 — 이 테스트가 그걸 처음 드러냈다.)
    celebration_seen_v1: JSON.stringify({
      ach: ['first_run', 'first_shoe', 'run_milestone'],
      tier: 'platinum',
    }),
  });
}

async function renderApp() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // 정합(비동기) → initUser → ready 까지 흘려보낸다.
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime?.(50);
    });
  }
  return renderer;
}

describe('계정 전환 화면 격리', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (globalThis as any).__KEEGO_ENABLE_ACCOUNT_SCOPE__ = true;
    (globalThis as any).__KEEGO_DEV_SEED__ = false;
  });
  afterEach(() => {
    delete (globalThis as any).__KEEGO_ENABLE_ACCOUNT_SCOPE__;
    delete (globalThis as any).__KEEGO_DEV_SEED__;
    delete (globalThis as any).__KEEGO_AUTH_USER__;
  });

  test('B 로 로그인하면 A 의 신발이 화면에 없다', async () => {
    await seedAccountA();
    (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'uid-B'};

    const renderer = await renderApp();
    const screen = textOf(renderer.toJSON());

    expect(screen).not.toContain(A_SHOE);
    renderer.unmount();
  });

  test('그래도 A 의 데이터는 사라지지 않는다 — 보관함에 그대로 있다', async () => {
    await seedAccountA();
    (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'uid-B'};

    const renderer = await renderApp();
    renderer.unmount();

    expect(await AsyncStorage.getItem(archiveKeyFor('uid-A', 'cache_shoes_v1'))).toContain(A_SHOE);
    expect(await AsyncStorage.getItem(archiveKeyFor('uid-A', 'route_r1'))).toContain('37.5');
    expect(await AsyncStorage.getItem(CACHE_OWNER_KEY)).toBe('uid-B');
  });

  // 아래 두 건은 **저장소로** 단언한다. 데이터가 복원되면 첫 업적 축하 오버레이가 홈을
  // 덮어 화면 텍스트가 흐려지는데(축하는 이 기능과 무관한 별개 흐름이다), 거기에 맞춰
  // 업적 키를 추측해 두면 업적이 하나 추가될 때마다 이 테스트가 깨진다.
  // 부팅 배선이 실제로 화면까지 간다는 것은 위 첫 번째 테스트가 지킨다.
  test('A 로 다시 로그인하면 A 의 데이터가 제자리로 돌아온다', async () => {
    await seedAccountA();

    (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'uid-B'};
    (await renderApp()).unmount();
    expect(await AsyncStorage.getItem('cache_shoes_v1')).toBeNull(); // B 는 빈 상태였다

    (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'uid-A'};
    (await renderApp()).unmount();

    expect(await AsyncStorage.getItem('cache_shoes_v1')).toContain(A_SHOE);
    expect(await AsyncStorage.getItem('route_r1')).toContain('37.5');
    expect(await AsyncStorage.getItem(CACHE_OWNER_KEY)).toBe('uid-A');
    // 보관함에서 꺼내 왔으므로 A 의 보관함은 비어 있어야 한다(중복 보관 없음).
    expect(await AsyncStorage.getItem(archiveKeyFor('uid-A', 'cache_shoes_v1'))).toBeNull();
  });

  test('같은 계정으로 다시 열면 옮기지 않는다(불필요한 전환 없음)', async () => {
    await seedAccountA();
    (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'uid-A'};

    (await renderApp()).unmount();

    expect(await AsyncStorage.getItem('cache_shoes_v1')).toContain(A_SHOE);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some(k => k.startsWith('acct_'))).toBe(false);
  });
});

// ── 로그인 제공자 표시값 ──────────────────────────────────────────────────────
// `cloud_account` 는 계정 격리 대상(USER_KEYS)이다. 그래서 로그인 직후 도는
// reconcileAccountStorage 가 그 값을 **옛 계정 서랍으로 치우고 새 서랍에서 꺼내온다.**
// 로그인 화면이 먼저 쓰면 그 정합에 덮여, 실기기에서 **카카오·구글로 로그인했는데
// "네이버 계정"으로 표시**됐다(2026-08-03). 쓰는 곳을 정합 뒤 한 곳으로 모은 계약을 못 박는다.
describe('로그인 제공자 표시값은 정합에 덮이지 않는다', () => {
  // 이 경로는 플래그로만 켠다(위 describe 와 같은 관례 — beforeEach 는 상속되지 않는다).
  beforeEach(async () => {
    await AsyncStorage.clear();
    (globalThis as any).__KEEGO_ENABLE_ACCOUNT_SCOPE__ = true;
    (globalThis as any).__KEEGO_DEV_SEED__ = false;
  });
  afterEach(() => {
    delete (globalThis as any).__KEEGO_ENABLE_ACCOUNT_SCOPE__;
    delete (globalThis as any).__KEEGO_DEV_SEED__;
    delete (globalThis as any).__KEEGO_AUTH_USER__;
    delete (globalThis as any).__KEEGO_PENDING_PROVIDER__;
  });

  test('옛 계정 서랍에 남아 있던 제공자가 새 로그인을 덮지 않는다', async () => {
    // A 계정이 '네이버'로 로그인해 둔 상태를 만든다.
    await seedAccountA();
    await AsyncStorage.setItem('cloud_account',
      JSON.stringify({provider: 'naver', uid: 'uid-A', email: null, displayName: null}));

    // B 로 로그인 — App 이 정합 뒤에 'kakao' 를 적는다.
    (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'uid-B'};
    (globalThis as any).__KEEGO_PENDING_PROVIDER__ = 'kakao';
    const renderer = await renderApp();
    renderer.unmount();

    const saved = JSON.parse((await AsyncStorage.getItem('cloud_account')) ?? 'null');
    expect(saved?.provider).toBe('kakao');
    expect(saved?.uid).toBe('uid-B');
    delete (globalThis as any).__KEEGO_PENDING_PROVIDER__;
  });

  test('A 의 제공자는 A 서랍에 보존된다 — 돌아가면 그대로다', async () => {
    await seedAccountA();
    await AsyncStorage.setItem('cloud_account',
      JSON.stringify({provider: 'naver', uid: 'uid-A', email: null, displayName: null}));

    (globalThis as any).__KEEGO_AUTH_USER__ = {uid: 'uid-B'};
    (await renderApp()).unmount();

    expect(await AsyncStorage.getItem(archiveKeyFor('uid-A', 'cloud_account'))).toContain('naver');
  });
});
