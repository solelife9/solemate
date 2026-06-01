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

// ── 1) Loading → skeleton ────────────────────────────────────────────────────
test('cold backend: while the boot fetch is in flight the app shows a SKELETON, not Home', async () => {
  // A fetch that never resolves keeps initUser pending → boot stays 'loading'.
  (globalThis.fetch as jest.Mock).mockImplementation(() => new Promise<Resp>(() => {}));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;

  // The skeleton is shown (content-shaped placeholder), and it is NOT a spinner
  // and NOT the Home content or the error card.
  expect(has(root, 'boot-skeleton')).toBe(true);
  expect(has(root, 'boot-error')).toBe(false);
  expect(textOf(root)).not.toContain('이번 주');

  act(() => renderer.unmount());
});

// ── 2) Error → retry card (keep-going), distinct from empty ──────────────────
test('cold backend: a FAILED boot fetch shows a retry card, and 다시 시도 recovers once the backend is up', async () => {
  // First attempt: every request rejects (cold/offline backend).
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.reject(new Error('cold backend')));

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const root = renderer.root;

  // Retry card (NOT skeleton, NOT Home) with a keep-going message + retry button.
  expect(has(root, 'boot-error')).toBe(true);
  expect(has(root, 'boot-skeleton')).toBe(false);
  expect(textOf(root)).toContain('다시 시도');

  // Backend recovers: a healthy account with one shoe + one run.
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/auth')) return Promise.resolve(ok({user_id: 'u1'}));
    if (u.includes('/api/shoes')) return Promise.resolve(ok([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]));
    if (u.includes('/api/runs')) return Promise.resolve(ok([{id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-31', duration: 1800}]));
    return Promise.resolve(ok({}));
  });

  // Press the retry button → initUser re-runs and reaches the real UI.
  pressTestID(root, 'boot-retry');
  await flush();

  expect(has(root, 'boot-error')).toBe(false);
  expect(has(root, 'boot-skeleton')).toBe(false);
  // Home is now rendered (weekly-stats label is Home-only content).
  expect(textOf(root)).toContain('이번 주');

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
    await act(async () => {
      cont.onPress();
    });
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

// ── 5) First-run onboarding ──────────────────────────────────────────────────
test('first-run onboarding introduces shoe→run→wear and routes into shoe registration, then is not shown again', async () => {
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

  // The intro explains the core value: running deducts the shoe's lifespan.
  expect(has(root, 'onboarding')).toBe(true);
  expect(textOf(root)).toContain('수명');

  // Starting it persists the onboarded flag and routes into shoe registration.
  pressTestID(root, 'onboarding-start');
  await flush();

  expect(await AsyncStorage.getItem('onboarded')).toBe('1');
  expect(has(root, 'onboarding')).toBe(false);
  // We are now on the add-shoe screen (its header/CTA copy is shoe-registration).
  expect(textOf(root)).toContain('신발');

  act(() => renderer.unmount());
});
