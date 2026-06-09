/**
 * App.tsx live-run snapshot lifecycle integration (audit#2).
 *
 * While a run is live the engine must persist a crash-recovery snapshot on its
 * ~3s interval, and it must CLEAR that snapshot the moment the run is saved or
 * discarded — otherwise a stale snapshot would spuriously offer to "resume" a
 * run the user already finished. These tests drive the real App through
 * home → goal → live run, inject GPS fixes, advance the snapshot interval with
 * fake timers, and assert OBSERVABLE storage outcomes (the snapshot blob and its
 * removal), not internal state.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {SNAPSHOT_KEY} from '../lib/runPersistence';

function mockBackendWithShoe() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    else if (u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
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

// 종료 버튼은 onLongPress 로만 동작한다(롱프레스 자체가 오작동 종료 가드 — RunActiveScreen).
function longPressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onLongPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no long-pressable containing text: ${label}`);
  act(() => {
    target.props.onLongPress();
  });
}

function readKm(root: ReactTestRenderer.ReactTestInstance): number {
  const node = root
    .findAll(n => typeof n.type === 'string')
    .find(n => {
      const c = n.props.children;
      return typeof c === 'string' && /^\d+\.\d{2}$/.test(c.trim());
    });
  if (!node) throw new Error('km readout not found');
  return parseFloat(node.props.children as string);
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// Advance the snapshot interval and let the async storage write settle.
async function advanceSnapshot(ms = 3000) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flushMicrotasks();
}

async function readSnapshot(): Promise<any | null> {
  const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
  return raw ? JSON.parse(raw) : null;
}

const LON = 127.0;

// Start a live run with one shoe and accumulate some distance via GPS fixes.
async function startRunWithDistance() {
  mockBackendWithShoe();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flushMicrotasks();
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // home → goal
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → 카운트다운
  });
  // 카운트다운(준비·GPS락·3·2·1·GO) 자동 진행을 건너뛰어 라이브 런으로 진입한다.
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });

  const calls = (Location.watchPositionAsync as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  // expo watchPositionAsync(options, callback, errorHandler) → callback is arg 1.
  const onPos = calls[calls.length - 1][1] as (p: any) => void;
  const emit = (lat: number, lon: number, accuracy: number, timestamp: number) =>
    act(() => {
      onPos({coords: {latitude: lat, longitude: lon, accuracy}, timestamp});
    });

  // Clear warmup at P0, then two accepted ~33m segments → dist > 0.
  await emit(37.5, LON, 5, 100000);
  await emit(37.5, LON, 5, 102000);
  await emit(37.5, LON, 5, 104000);
  await emit(37.5003, LON, 5, 107000);
  await emit(37.5006, LON, 5, 110000);

  return {renderer, root, km: () => readKm(root)};
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  jest.clearAllTimers(); // drop any pending interval/timeout the run engine left
  jest.useRealTimers();
  await AsyncStorage.clear();
});

test('a live run persists a snapshot on the 3s interval capturing the accumulated distance + shoe + goal', async () => {
  const {renderer, km} = await startRunWithDistance();
  const dist = km();
  expect(dist).toBeGreaterThan(0);

  await advanceSnapshot(3000);

  const snap = await readSnapshot();
  expect(snap).not.toBeNull();
  expect(snap.shoe.id).toBe('s1'); // the running shoe
  expect(snap.goalKm).toBe(5); // the chosen goal
  // The persisted distance tracks the live readout (crash here resumes here).
  expect(snap.dist).toBeGreaterThan(0);
  expect(Math.abs(snap.dist - dist)).toBeLessThan(0.05);

  act(() => renderer.unmount());
});

test('saving the run clears the snapshot (no stale resume offer afterwards)', async () => {
  const {renderer, root} = await startRunWithDistance();
  await advanceSnapshot(3000);
  expect(await readSnapshot()).not.toBeNull(); // snapshot exists while running

  // 안전 컨트롤: 달리는 중엔 종료 버튼이 숨겨져 있어, 먼저 일시정지해야 종료가 보인다.
  pressByText(root, 'pause');
  // 종료는 롱프레스(직접 stop → 리뷰 화면). 롱프레스 자체가 오작동 종료 가드.
  longPressByText(root, 'stop');
  await flushMicrotasks();
  await act(async () => {
    pressByText(root, '저장하기');
  });
  await flushMicrotasks();
  await flushMicrotasks();

  // The snapshot is gone — a relaunch will not spuriously offer to resume.
  expect(await readSnapshot()).toBeNull();

  act(() => renderer.unmount());
});

test('discarding the run clears the snapshot', async () => {
  const {renderer, root} = await startRunWithDistance();
  await advanceSnapshot(3000);
  expect(await readSnapshot()).not.toBeNull();

  // 안전 컨트롤: 종료 전 일시정지(달리는 중엔 종료 숨김), 종료는 롱프레스(직접 stop).
  pressByText(root, 'pause');
  longPressByText(root, 'stop');
  await flushMicrotasks();
  pressByText(root, '버리기');
  await flushMicrotasks();

  expect(await readSnapshot()).toBeNull();

  act(() => renderer.unmount());
});
