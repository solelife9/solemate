/**
 * App.tsx cold-backend boot + first-run integration tests (audit#9/#10).
 *
 * Drives the real App through a cold/slow/failed backend and the first-run
 * flows, asserting on OBSERVABLE outcomes — what the user sees on screen and
 * what is persisted — not internal state:
 *
 *   1) Loading → SKELETON (not a spinner): while the auth/shoes/runs fetch is
 *      still in flight the app shows a content-shaped skeleton, never the Home
 *      content.
 *   2) Error → RETRY CARD (keep-going tone): when the boot fetch FAILS the app
 *      shows a retry card (with a working 다시 시도 button), distinct from an
 *      empty-but-successful load. Retrying after the backend recovers reaches
 *      the real UI.
 *   3) Empty-new is DISTINCT from error: a successful load of an empty account
 *      shows the first-run UI (onboarding), never the error retry card.
 *   4) Permission priming: a first-time runner is shown a Korean rationale Alert
 *      BEFORE the OS permission dialog; only after 계속 does the live run start
 *      (and the priming is remembered so it never nags again).
 *   5) First-run onboarding: a brand-new (no shoes) user sees the shoe→run→wear
 *      intro once; starting it routes into shoe registration and the intro is
 *      not shown again.
 *
 * The default test fixture (jest.setup.after.js) is a returning, already-primed
 * & onboarded user — these tests remove the relevant keys to opt into first-run.
 *
 * @format
 */

import React from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {seedBootCache} from './helpers/bootSeed';
import App from '../App';

type Resp = {ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string>};
const ok = (body: any): Resp => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
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

const has = (root: ReactTestRenderer.ReactTestInstance, testID: string) =>
  root.findAll(n => n.props && n.props.testID === testID).length > 0;

function pressTestID(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  const node = root.find(n => n.props && n.props.testID === testID);
  act(() => {
    node.props.onPress();
  });
}

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    n => n.props && typeof n.props.onPress === 'function' && textOf(n).includes(label),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains text: ${label}`);
  act(() => {
    hits[0].props.onPress();
  });
}

async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// 진짜 스토리지 격리: 글로벌 beforeEach(jest.setup.after.js)의 clearAllMockStorages 는
// "기록된 mock 호출"만 비우고 인메모리 store(setItem 값)는 비우지 않는다. 그래서 한 테스트가
// 쓴 키(예: 셀러브레이션 베이스라인 celebration_seen_v1)가 다음 테스트로 샌다(빈 baseline →
// 첫-런 업적 오버레이가 엉뚱한 테스트에서 떠 화면을 가림). 이 파일은 부팅 분기에 민감하므로
// 매 테스트 전에 store 를 실제로 비우고, 이 suite 이 가정하는 '복귀 사용자' 픽스처를 다시 깐다.
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('onboarded', '1');
  await AsyncStorage.setItem('loc_perm_primed', '1');
});

// ── 1) Local-first boot never blocks on the network ──────────────────────────
// [설계 변경] Firestore 정본·로컬-퍼스트 부팅으로 전환되며 initUser 는 더 이상 REST
// fetch 를 await 하지 않는다 — 부팅 데이터는 로컬 캐시(loadBootCache)에서 즉시 읽고
// 곧바로 bootState='ready' 가 된다(App.tsx:592-609, "로컬 캐시로 즉시 'ready'").
// 따라서 'fetch in-flight 동안 스켈레톤에 머문다'는 전제는 폐지됐다: 네트워크가 영원히
// 멈춰 있어도 부팅은 멈추지 않고 ready 로 진행한다. 새 동작(네트워크 무관 즉시 ready)을
// 검증한다.
test('local-first boot: a slow/silent backend does NOT block boot — app reaches ready (no stuck skeleton)', async () => {
  // 백엔드가 빈 OK 를 주든 말든 부팅은 로컬 캐시에서 진행한다(REST 를 await 하지 않음).
  // (never-resolving fetch 대신 빈 OK 를 쓴다 — 영원히 펜딩인 promise 가 후속 테스트로
  // 새는 것을 막고, '네트워크 무관 즉시 ready' 의도는 동일하게 검증한다.)
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.resolve(ok([])));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // 부팅은 스켈레톤에 갇히지 않고 ready 로 진행한다. 기본 픽스처는 onboarded·빈 캐시라
  // 홈(러너 인사)로 떨어진다. 에러 카드는 절대 뜨지 않는다(REST 무관).
  expect(has(root, 'boot-skeleton')).toBe(false);
  expect(has(root, 'boot-error')).toBe(false);
  expect(textOf(root)).toContain('러너님');

  act(() => renderer.unmount());
});

// ── 2) A failed backend never shows a boot-error card (local-first) ──────────
// [설계 변경] initUser 가 REST 를 호출하지 않으므로 fetch 실패는 부팅을 막지 못하고
// bootState 는 'error' 로 가지 않는다(App.tsx:592-609; 'error' 진입점이 코드엔 남아
// 있으나 더는 도달 불가). 재시도 카드 전제는 폐지됐다 — 백엔드가 다운이어도 캐시(없으면
// 빈 상태)로 부팅한다. 새 동작(에러 카드 없이 부팅 완료)을 검증한다.
test('local-first boot: a FAILED backend never shows a retry card — boot completes from local state', async () => {
  // Every request rejects (cold/offline backend) — must not surface a boot error.
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('cold backend')));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // 재시도 카드/스켈레톤이 아니라 부팅이 완료된다(기본 픽스처 onboarded·빈 캐시 → 홈).
  expect(has(root, 'boot-error')).toBe(false);
  expect(has(root, 'boot-skeleton')).toBe(false);
  expect(textOf(root)).toContain('러너님');

  act(() => renderer.unmount());
});

// ── 2.5) 로컬-퍼스트 폴백: 오프라인이라도 캐시가 있으면 재시도 카드 대신 부팅 ──────────
test('offline boot: 마지막 성공 데이터 캐시가 있으면 fetch 실패해도 재시도 카드 대신 그 데이터로 부팅', async () => {
  // 직전 성공 부팅이 남긴 캐시(신발/런).
  await AsyncStorage.setItem(
    'cache_shoes_v1',
    JSON.stringify([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]),
  );
  await AsyncStorage.setItem(
    'cache_runs_v1',
    JSON.stringify([{id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-31', duration: 1800}]),
  );
  // 백엔드는 콜드/다운(모든 요청 reject).
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('cold backend')));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // 재시도 카드/스켈레톤이 아니라 홈이 캐시 데이터로 렌더된다.
  expect(has(root, 'boot-error')).toBe(false);
  expect(has(root, 'boot-skeleton')).toBe(false);
  expect(textOf(root)).toContain('오늘은 어떤 신발로');
  expect(textOf(root)).toContain('Pegasus');

  act(() => renderer.unmount());
});

test('empty-new account is DISTINCT from a boot error: an empty successful load shows onboarding, never the retry card', async () => {
  // Brand-new user: not onboarded, and the backend returns an empty (but OK) set.
  await AsyncStorage.removeItem('onboarded');
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    return Promise.resolve(ok([])); // shoes + runs both empty
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // No error card (empty ≠ failure) and no skeleton (load completed).
  expect(has(root, 'boot-error')).toBe(false);
  expect(has(root, 'boot-skeleton')).toBe(false);
  // The empty-new user is greeted by onboarding, not an error.
  expect(has(root, 'onboarding')).toBe(true);

  act(() => renderer.unmount());
});

// ── 4) Permission priming before the OS dialog ───────────────────────────────
test('first-time runner is shown a location-permission rationale BEFORE the OS dialog; 계속 then starts the run', async () => {
  await AsyncStorage.removeItem('loc_perm_primed'); // opt into first-run priming
  // Firestore 정본·로컬-퍼스트 부팅: 홈 히어로(→ '러닝 시작')에 띄울 신발은 REST 가 아니라
  // 부팅 캐시에서 읽힌다. 신발을 캐시에 시드해 홈이 러닝 시작 버튼을 렌더하게 한다.
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}], []);
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    if (u.includes('/api/shoes')) return Promise.resolve(ok([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]));
    return Promise.resolve(ok([]));
  });
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await flush();
    const root = renderer.root;

    pressByText(root, '러닝 시작'); // Home → goal
    await flush();
    pressByText(root, '러닝 시작'); // goal → (priming gate)
    await flush();

    // The OS permission has NOT been requested yet — priming comes first.
    expect(
      (Location.requestForegroundPermissionsAsync as jest.Mock).mock.calls.length,
    ).toBe(0);
    // A Korean rationale Alert was shown explaining WHY location is needed.
    const priming = alertSpy.mock.calls.find(c => String(c[0]).includes('위치 권한 안내'));
    expect(priming).toBeTruthy();
    expect(String(priming![1])).toContain('GPS');

    // Tap 계속 → the run now starts and the OS authorization is requested.
    const cont = (priming![2] as any[]).find(b => b.text === '계속');
    expect(cont).toBeTruthy();
    // '계속' → enterRun → 카운트다운(준비·3·2·1·GO) → 라이브 런. OS 위치 권한은
    // 카운트다운이 아니라 런 화면에서 요청하므로, 카운트다운이 fake 타이머 하에서
    // mount 되도록 onPress 전에 fake 를 켜고 advance 해 런까지 진입시킨다.
    const fakeAlready = typeof (setTimeout as any).clock === 'object';
    if (!fakeAlready) jest.useFakeTimers();
    await act(async () => {
      cont.onPress(); // enterRun → 카운트다운 mount
    });
    await act(async () => {
      jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런(OS 권한 요청)
    });
    if (!fakeAlready) jest.useRealTimers();
    await flush();

    expect(
      (Location.requestForegroundPermissionsAsync as jest.Mock).mock.calls.length,
    ).toBeGreaterThan(0);
    // Priming is remembered so it never nags on the next run.
    expect(await AsyncStorage.getItem('loc_perm_primed')).toBe('1');

    act(() => renderer.unmount());
  } finally {
    alertSpy.mockRestore();
  }
});

// ── 5) First-run onboarding (cinematic 6-screen flow) ────────────────────────
test('first-run onboarding introduces the shoe-lifespan value, advances on 시작하기, and once skipped is never shown again', async () => {
  await AsyncStorage.removeItem('onboarded');
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    return Promise.resolve(ok([])); // no shoes yet → first run
  });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // The cinematic welcome explains the core value: tracking shoe lifespan.
  expect(has(root, 'onboarding')).toBe(true);
  expect(textOf(root)).toContain('수명');

  // 시작하기 advances within the onboarding flow (does NOT finish it yet).
  pressTestID(root, 'onboarding-start');
  await flush();
  expect(has(root, 'onboarding')).toBe(true);
  expect(await AsyncStorage.getItem('onboarded')).toBeNull();

  // Skipping completes onboarding: the flag persists and the app routes to home.
  pressTestID(root, 'onboarding-skip');
  await flush();

  expect(await AsyncStorage.getItem('onboarded')).toBe('1');
  expect(has(root, 'onboarding')).toBe(false);
  // Home is now shown (its content mentions 신발: "오늘은 어떤 신발로 ...").
  expect(textOf(root)).toContain('신발');

  act(() => renderer.unmount());
});
