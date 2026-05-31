/**
 * App.tsx addRun local-first + sync reconciliation integration (audit#3).
 *
 * A finished run must be durable BEFORE the network is touched, and the sync
 * must never duplicate, strand, or leak storage. These tests drive the real App
 * to the run-review screen (via the snapshot-recovery path, which deterministically
 * seeds a known distance + route without needing live GPS) and then press 저장하기
 * to invoke addRun. Assertions are on OBSERVABLE outcomes — the AsyncStorage queue,
 * the route_/time_ keys, and the recorded POSTs:
 *
 *   1) Local-first ordering: at the instant the run is POSTed it is ALREADY in the
 *      pending queue (enqueue precedes the network). An implementation that POSTed
 *      first would leave the queue empty while the POST is in flight → this fails.
 *   2) Successful sync: the run leaves the queue and storage is re-keyed to the
 *      server id with NO leftover `route_<localId>` / `time_<localId>` dead keys
 *      (the leak the code critic found).
 *   3) Failed sync (iron law): the run + its route stay queued for a later retry.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {SNAPSHOT_KEY, RunSnapshot, loadPendingRuns} from '../lib/runPersistence';

const SNAP: RunSnapshot = {
  dist: 3.2,
  elapsed: 900,
  pts: [
    {lat: 37.5, lon: 127.0},
    {lat: 37.503, lon: 127.0},
    {lat: 37.506, lon: 127.0},
  ],
  pausedMs: 0,
  t0: 1_700_000_000_000,
  shoe: {id: 's1', name: 'Nike Pegasus'},
  goalKm: 5,
  cadence: 172,
  location: '서울',
  savedAt: 1_700_000_900_000,
};

type Mode = {kind: 'ok'} | {kind: 'fail'} | {kind: 'hang'; queueAtPost: Promise<any[]>[]};

function mockBackend(mode: Mode) {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    if (u.includes('/api/runs') && method === 'POST') {
      if (mode.kind === 'hang') {
        // Snapshot the queue at the exact moment the POST is issued — proves the
        // run was enqueued BEFORE the network call.
        mode.queueAtPost.push(loadPendingRuns());
        return new Promise(() => {}); // never resolves — reconcile never runs
      }
      if (mode.kind === 'fail') {
        return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({})});
      }
      return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({id: 'server-99'})});
    }
    let payload: any = {};
    if (u.includes('/api/auth')) payload = {user_id: 'u1'};
    else if (u.includes('/api/shoes') || u.includes('/api/runs')) payload = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    });
  });
}

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

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

async function tick(n = 6) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// Seed a recoverable snapshot, mount, choose 복구 → land on the run-review
// screen with a known distance + route. Returns the renderer/root.
async function recoverToReview() {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(5);
  const call = alertSpy.mock.calls.find(c => String(c[0]).includes('미완료 런'));
  if (!call) throw new Error('recover Alert was not shown');
  const recover = (call[2] as any[]).find(b => b.text === '복구');
  await act(async () => {
    recover.onPress();
  });
  return renderer;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

test('local-first: the finished run is in the pending queue at the instant it is POSTed (enqueue precedes network)', async () => {
  const queueAtPost: Promise<any[]>[] = [];
  mockBackend({kind: 'hang', queueAtPost});

  const renderer = await recoverToReview();
  await act(async () => {
    pressByText(renderer.root, '저장하기');
  });
  await tick();

  expect(queueAtPost.length).toBe(1);
  const queued = await queueAtPost[0];
  expect(queued).toHaveLength(1); // run was durably queued BEFORE the POST
  expect(queued[0].km).toBe(3.2);
  expect(queued[0].route).toContain('37.5'); // route persisted locally first

  act(() => renderer.unmount());
});

test('successful sync removes the run from the queue and leaves NO dead route_/time_<localId> keys (leak fix)', async () => {
  mockBackend({kind: 'ok'});

  const renderer = await recoverToReview();
  await act(async () => {
    pressByText(renderer.root, '저장하기');
  });
  await tick(8);

  // Queue drained — the run synced.
  expect(await loadPendingRuns()).toEqual([]);

  const keys = await AsyncStorage.getAllKeys();
  // The run was re-keyed to the server id...
  expect(keys).toContain('route_server-99');
  expect(keys).toContain('time_server-99');
  // ...and the original localId keys were removed (no permanent dead-blob leak).
  expect(keys.filter(k => /^route_run_/.test(k))).toEqual([]);
  expect(keys.filter(k => /^time_run_/.test(k))).toEqual([]);

  act(() => renderer.unmount());
});

test('failed sync keeps the run AND its route queued for retry (iron law: no data loss)', async () => {
  mockBackend({kind: 'fail'});

  const renderer = await recoverToReview();
  await act(async () => {
    pressByText(renderer.root, '저장하기');
  });
  await tick(8);

  const queue = await loadPendingRuns();
  expect(queue).toHaveLength(1);
  expect(queue[0].km).toBe(3.2);
  expect(queue[0].route).toContain('37.5'); // route never dropped on POST failure

  act(() => renderer.unmount());
});
