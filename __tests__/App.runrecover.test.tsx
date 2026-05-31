/**
 * App.tsx in-progress run recovery integration (audit#2).
 *
 * A crash mid-run leaves a sanitized snapshot in AsyncStorage. On the next
 * launch the App must surface it as a recover/discard prompt and NOT silently
 * drop the run (iron law: 데이터 유실 금지). These tests assert OBSERVABLE
 * outcomes, not internal state:
 *
 *   1) A persisted resumable snapshot makes the App show the recover Alert with
 *      both a 복구 and a 버리기 choice.
 *   2) Choosing 복구 mounts the run review screen seeded from the snapshot —
 *      the restored distance, elapsed time, goal and cadence are rendered — and
 *      saving from there POSTs a run carrying the restored distance + route
 *      (proving dist/pts/elapsed/cadence were actually restored, not zeroed).
 *   3) Choosing 버리기 clears the snapshot so it can never spuriously resume.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {SNAPSHOT_KEY, RunSnapshot} from '../lib/runPersistence';

// A resumable snapshot: real progress (dist/elapsed/pts) so isResumable() is true.
const SNAP: RunSnapshot = {
  dist: 3.2,
  elapsed: 900, // 15:00
  pts: [
    {lat: 37.5, lon: 127.0},
    {lat: 37.503, lon: 127.0},
    {lat: 37.506, lon: 127.0},
  ],
  pausedMs: 4000,
  t0: 1_700_000_000_000,
  shoe: {id: 's1', name: 'Nike Pegasus'},
  goalKm: 5,
  cadence: 172,
  location: '서울',
  savedAt: 1_700_000_900_000,
};

type RecordedCall = {method: string; url: string; body: any};

// Default-friendly backend that also records POST /api/runs bodies.
function mockBackend(): RecordedCall[] {
  const calls: RecordedCall[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    let body: any;
    try {
      body = init && init.body ? JSON.parse(init.body) : undefined;
    } catch {
      body = undefined;
    }
    calls.push({method, url: u, body});
    if (u.includes('/api/runs') && method === 'POST') {
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
  return calls;
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

function allText(root: ReactTestRenderer.ReactTestInstance): string {
  return root.findAll(n => typeof n.type === 'string').map(textOf).join('|');
}

async function mountAndSettle() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return renderer;
}

// Pull the recover Alert's button list (the [복구]/[버리기] actions).
function recoverButtons(alertSpy: jest.SpyInstance): any[] {
  const call = alertSpy.mock.calls.find(c => String(c[0]).includes('미완료 런'));
  if (!call) throw new Error('recover Alert was not shown');
  return (call[2] as any[]) || [];
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

test('a persisted in-progress snapshot surfaces a recover/discard prompt on launch', async () => {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockBackend();

  await mountAndSettle();

  const btns = recoverButtons(alertSpy);
  expect(btns.map(b => b.text).sort()).toEqual(['버리기', '복구']);
});

test('복구 restores the run (distance/time/goal/cadence) and saving POSTs the restored distance + route', async () => {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const calls = mockBackend();

  const renderer = await mountAndSettle();
  const root = renderer.root;

  // Choose 복구 → the run review (done) screen mounts seeded from the snapshot.
  const recover = recoverButtons(alertSpy).find(b => b.text === '복구');
  await act(async () => {
    recover.onPress();
  });

  // The restored values are rendered (not zeroed): distance 3.20, time 15:00,
  // goal 5km, cadence 172.
  const screen = allText(root);
  expect(screen).toContain('3.20'); // restored dist
  expect(screen).toContain('15:00'); // restored elapsed
  expect(screen).toContain('목표 5km 완료'); // restored goalKm
  expect(screen).toContain('172'); // restored cadence

  // Save the recovered run → it must POST the restored distance and route
  // (proving pts were restored, not lost).
  await act(async () => {
    pressByText(root, '저장하기');
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }

  const runPost = calls.find(c => c.method === 'POST' && c.url.includes('/api/runs'));
  expect(runPost).toBeDefined();
  expect(runPost!.body.km).toBe(3.2);
  expect(runPost!.body.route).toContain('37.5'); // route rebuilt from restored pts
  expect(runPost!.body.duration).toBe(900); // restored elapsed → run duration

  act(() => renderer.unmount());
});

test('버리기 clears the persisted snapshot so it cannot spuriously resume', async () => {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockBackend();

  await mountAndSettle();

  const discard = recoverButtons(alertSpy).find(b => b.text === '버리기');
  await act(async () => {
    discard.onPress();
  });
  await act(async () => {
    await Promise.resolve();
  });

  // The snapshot is gone — a relaunch finds nothing to resume.
  expect(await AsyncStorage.getItem(SNAPSHOT_KEY)).toBeNull();
});
