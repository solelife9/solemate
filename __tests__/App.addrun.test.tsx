/**
 * App.tsx addRun 로컬-퍼스트 영속 (Phase 5b · Stage 2b · Firestore 정본).
 *
 * 완주 런은 낙관적 상태 반영 *전에* durable 해야 하고, REST 에 의존하지 않아야 한다(영속은
 * 부팅 캐시 + cloudSync→Firestore). 스냅샷 복구 경로로 알려진 거리+route 의 리뷰 화면에 도달한
 * 뒤 저장하기를 눌러 addRun 을 호출하고, OBSERVABLE 결과(부팅 캐시·route_/time_ 키·REST 호출
 * 부재)를 단언한다:
 *
 *   1) 크래시-세이프티: 저장 순간 런이 이미 부팅 캐시(cache_runs_v1)에 durable 하게 들어가
 *      있고, REST 런 POST 는 일어나지 않는다(Firestore 정본).
 *   2) 누수 없음: route_/time_ 키는 영구 클라 id(run_)로 남고 서버 id 로 재키잉되지 않는다.
 *   3) 데이터 유실 0: 백엔드 상태와 무관하게 런+route 가 영속된다(네트워크 의존 없음).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {SNAPSHOT_KEY, RunSnapshot} from '../lib/runPersistence';

const CACHE_RUNS_KEY = 'cache_runs_v1';

/** 이번 마운트에서 발생한 /api/runs POST 호출들. */
function runPosts() {
  return (globalThis.fetch as jest.Mock).mock.calls.filter(
    ([u, init]: any) =>
      String(u).includes('/api/runs') &&
      (init && init.method ? String(init.method) : 'GET').toUpperCase() === 'POST',
  );
}
async function cacheRuns() {
  const raw = await AsyncStorage.getItem(CACHE_RUNS_KEY);
  return raw ? JSON.parse(raw) : [];
}

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

type Mode = {kind: 'ok'} | {kind: 'down'};

// 백엔드 목. Firestore 정본이라 런 저장은 REST 를 타지 않지만, 부팅(apiAuth/GET)은 그대로
// 동작한다. mode 'down' 은 모든 응답을 실패시켜 "백엔드와 무관하게 런이 영속되는가"를 본다.
function mockBackend(mode: Mode) {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    if (mode.kind === 'down') {
      return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({}), text: () => Promise.resolve('')});
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
  const recover = (call[2] as any[]).find(b => b.text === '기록 저장');
  await act(async () => {
    recover.onPress();
  });
  return renderer;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

test('크래시-세이프티: 저장 즉시 부팅 캐시에 durable 기록 + REST 런 POST 없음', async () => {
  mockBackend({kind: 'ok'});

  const renderer = await recoverToReview();
  await act(async () => {
    pressByText(renderer.root, '저장하기');
  });
  await tick();

  // 낙관적 상태 반영 전에 부팅 캐시에 durable 하게 들어갔다(800ms 디바운스 캐시 효과와 무관).
  const cache = await cacheRuns();
  expect(cache).toHaveLength(1);
  expect(cache[0].km).toBe(3.2);
  expect(cache[0].route).toContain('37.5');
  expect(String(cache[0].id).startsWith('run_')).toBe(true); // 영구 클라 id
  // Firestore 정본 — REST 런 POST 는 일어나지 않는다.
  expect(runPosts()).toHaveLength(0);

  act(() => renderer.unmount());
});

test('누수 없음: route_/time_ 키는 영구 클라 id(run_)로 남고 서버 id 로 재키잉되지 않는다', async () => {
  mockBackend({kind: 'ok'});

  const renderer = await recoverToReview();
  await act(async () => {
    pressByText(renderer.root, '저장하기');
  });
  await tick(8);

  const keys = await AsyncStorage.getAllKeys();
  const routeKeys = keys.filter(k => k.startsWith('route_'));
  const timeKeys = keys.filter(k => k.startsWith('time_'));
  expect(routeKeys).toHaveLength(1);
  expect(routeKeys[0].startsWith('route_run_')).toBe(true);
  expect(timeKeys[0].startsWith('time_run_')).toBe(true);
  // 서버 id 재키잉 없음(REST 제거).
  expect(keys.some(k => k.startsWith('route_server'))).toBe(false);

  act(() => renderer.unmount());
});

test('데이터 유실 0: 백엔드가 죽어 있어도 런과 route 가 영속된다(네트워크 의존 없음)', async () => {
  mockBackend({kind: 'down'});

  const renderer = await recoverToReview();
  await act(async () => {
    pressByText(renderer.root, '저장하기');
  });
  await tick(8);

  const cache = await cacheRuns();
  expect(cache).toHaveLength(1);
  expect(cache[0].km).toBe(3.2);
  expect(cache[0].route).toContain('37.5'); // route never dropped

  act(() => renderer.unmount());
});
