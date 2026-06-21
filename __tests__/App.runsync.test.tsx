/**
 * App.tsx 레거시 미동기 큐 처리 (Phase 5b · Stage 3 · Firestore 정본).
 *
 * 이전 빌드(REST)는 부팅 시 pending 큐의 런을 /api/runs 로 재-POST 하고 드레인했다. Stage 3
 * 부터 런 영속은 로컬 캐시 + cloudSync(Firestore)다 — 부팅은 REST 를 타지 않는다. 따라서:
 *   1) 부팅 시 큐 런이 REST 로 POST 되지 않는다(큐 드레인 제거).
 *   2) 레거시 큐 런은 유실되지 않는다 — overlayPendingRuns 로 화면 runs 에 합류하고(단위테스트
 *      는 lib/runPersistence), 다음 cloudSync 가 Firestore 정본에 반영한다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';
import {PENDING_RUNS_KEY, loadPendingRuns, PendingRun} from '../lib/runPersistence';

type RecordedCall = {method: string; url: string};

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

// 모든 fetch 호출을 기록한다. Stage 3 에선 부팅이 REST 를 타지 않아야 하므로, /api/runs POST
// 가 0건임을 단언하는 데 쓴다.
function mockBackend(): RecordedCall[] {
  const calls: RecordedCall[] = [];
  (globalThis.fetch as jest.Mock).mockImplementation((url: any, init: any) => {
    const u = String(url);
    const method = (init && init.method ? String(init.method) : 'GET').toUpperCase();
    calls.push({method, url: u});
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    });
  });
  return calls;
}

async function mountAndSettle() {
  await act(async () => {
    ReactTestRenderer.create(<App />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

test('레거시 미동기 큐 런은 부팅 시 REST 로 POST 되지 않고(드레인 제거) 유실되지 않는다', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(PENDING_RUNS_KEY, JSON.stringify([QUEUED]));
  // 부모 신발을 캐시에 시드(런 렌더링·머지의 부모 존재). 런은 큐에서 오버레이된다.
  await seedBootCache([{id: 'shoe-1', name: '테스트화', max_km: 600, start_km: 0}], []);
  const calls = mockBackend();

  await mountAndSettle();

  // 1) Firestore 정본: 부팅은 REST 로 런을 POST 하지 않는다(큐 → REST 드레인 제거).
  expect(calls.find(c => c.method === 'POST' && c.url.includes('/api/runs'))).toBeUndefined();

  // 2) 유실 0: 레거시 큐 런은 그대로 보존된다(overlayPendingRuns 가 화면 runs 에 합류시키고,
  //    cloudSync 가 Firestore 정본에 올린다 — REST 재키잉/드롭 없음).
  const queue = await loadPendingRuns();
  expect(queue).toHaveLength(1);
  expect(queue[0].localId).toBe('run_offline_1');
  expect(queue[0].km).toBe(4.2);
  expect(queue[0].route).toContain('37.5');
});
