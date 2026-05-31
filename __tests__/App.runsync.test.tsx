/**
 * App.tsx run-persistence integration (audit#2/#3).
 *
 * Proves the App actually wires the unsynced-run queue to a real re-sync on
 * startup, with observable outcomes (not internal state):
 *
 *   1) Re-sync on launch: a run left in the AsyncStorage pending queue from a
 *      previous (offline) session is POSTed to /api/runs once the user is
 *      authenticated, and is then removed from the queue. No run is stranded.
 *   2) Network-failure durability (iron law): if the runs POST fails during the
 *      flush, the queued run is KEPT in AsyncStorage for a later retry — the
 *      route/run is never lost.
 *
 * The pending queue is seeded into the mocked AsyncStorage before mount, then
 * we assert against the recorded fetch calls + the post-mount queue contents.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {PENDING_RUNS_KEY, loadPendingRuns, PendingRun} from '../lib/runPersistence';

type RecordedCall = {method: string; url: string; body: any};

const QUEUED: PendingRun = {
  localId: 'run_offline_1',
  shoe_id: 'shoe-1',
  km: 4.2,
  run_date: '2026-05-31',
  memo: '오프라인 러닝',
  source: 'gps',
  duration: 1320,
  cadence: 168,
  route: '[{"lat":37.5,"lon":127.0},{"lat":37.51,"lon":127.02}]',
  location: '서울',
  heart_rate: 0,
  run_time: '07:15',
  queuedAt: 1_700_000_000_000,
};

// Backend mock recording every call. runsPostOk toggles whether POST /api/runs
// succeeds, so we can drive both the synced and the failed-sync paths.
function mockBackend(opts: {runsPostOk: boolean}): RecordedCall[] {
  const calls: RecordedCall[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let body: any;
    try {
      body = init && init.body ? JSON.parse(init.body) : undefined;
    } catch (e) {
      body = undefined;
    }
    calls.push({method, url: u, body});

    if (u.includes('/api/runs') && method === 'POST') {
      if (!opts.runsPostOk) {
        return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({})});
      }
      return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({id: 'server-99'})});
    }
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'test-user'};
    else if (u.includes('/api/shoes') || u.includes('/api/runs')) payload = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    });
  });
  return calls;
}

// Mount App and let the auth → flush effect chain settle.
async function mountAndSettle() {
  await act(async () => {
    ReactTestRenderer.create(<App />);
  });
  // initUser → setUserId → flush effect → postRun all resolve over several
  // microtask turns; flush a few extra ticks so the queue write completes.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

test('a queued run is re-synced to /api/runs on launch and removed from the queue', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(PENDING_RUNS_KEY, JSON.stringify([QUEUED]));
  const calls = mockBackend({runsPostOk: true});

  await mountAndSettle();

  // The queued run was POSTed with its preserved distance + route.
  const runPost = calls.find(c => c.method === 'POST' && c.url.includes('/api/runs'));
  expect(runPost).toBeDefined();
  expect(runPost!.body.km).toBe(4.2);
  expect(runPost!.body.route).toContain('37.5');
  expect(runPost!.body.user_id).toBe('test-user');

  // After a successful sync the queue is empty — the run is no longer pending.
  expect(await loadPendingRuns()).toEqual([]);
});

test('a failed runs POST on launch keeps the run queued for retry (iron law)', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(PENDING_RUNS_KEY, JSON.stringify([QUEUED]));
  mockBackend({runsPostOk: false});

  await mountAndSettle();

  // The POST failed, so the run must remain in the queue — never dropped.
  const queue = await loadPendingRuns();
  expect(queue).toHaveLength(1);
  expect(queue[0].localId).toBe('run_offline_1');
  expect(queue[0].km).toBe(4.2);
});
