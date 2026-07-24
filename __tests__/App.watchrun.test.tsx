/**
 * 워치 런 인제스트 → 심박 보강 대기 등록(버그픽스 2026-07-22) 통합 테스트.
 *
 * 회귀 배경: onWatchRun 인제스트가 track_/splits_ 사이드카는 저장하면서 HR 보강
 * 대기(hr_backfill_pending_v1)에는 등록하지 않아 — ① 워치 직송 심박(onWatchHrTrack)이
 * 매칭 상대를 못 찾아 버려지고 ② HK 백필 재시도 대상에서도 빠져 — hrTrack_<id> 가
 * 영영 비었고, 기록 상세에 심박 존 카드(곡선·존 막대)가 아예 안 떴다.
 *
 * 검증: 실제 App 을 mount 하고 watchSession.onWatchRun 콜백에 워치 완주 페이로드를
 * 흘리면, ① 런이 저장되고 ② splits_ 사이드카가 생기고 ③ pending 레지스트리에
 * '워치가 보낸 실제 러닝 시간창(startMs~startMs+durationS)'으로 등록된다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

// watchSession 을 제어 가능한 목으로 — onWatchRun 콜백을 붙잡아 테스트가 직접 발화한다.
// 나머지 표면은 App 이 부팅 중 호출하는 전부를 no-op 으로 채운다(모듈 부재와 동일 계약).
let watchRunCb: ((p: any) => void) | null = null;
jest.mock('../lib/watchSession', () => ({
  watchSession: {
    onWatchRun: jest.fn((cb: any) => { watchRunCb = cb; return () => { watchRunCb = null; }; }),
    onWatchHrTrack: jest.fn(() => () => {}),
    onWatchStop: jest.fn(() => () => {}),
    onHeartRate: jest.fn(() => () => {}),
    updateShoes: jest.fn(),
    updateRecentRuns: jest.fn(),
    updateWidgetShoe: jest.fn(),
    setHaptics: jest.fn(),
    zoneHaptic: jest.fn(),
    startWorkout: jest.fn(),
    stopWorkout: jest.fn(),
  },
}));

const flush = async (renderer?: ReactTestRenderer.ReactTestRenderer) => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  void renderer;
};

test('워치 런 인제스트 시 HR 보강 대기에 실제 러닝 시간창으로 등록된다(심박 존 카드 회귀 방지)', async () => {
  await AsyncStorage.clear();
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}], []);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await flush(renderer);
  expect(watchRunCb).toBeTruthy(); // App 이 onWatchRun 을 구독했다

  const startMs = Date.parse('2026-07-22T07:00:00Z');
  const durationS = 1800;
  await act(async () => {
    watchRunCb!({
      runId: 'watch-run-1', shoeId: 's1', km: 5, durationS,
      cadence: 172, avgBpm: 151, elevGainM: 12, kcal: 400,
      startMs, laps: 0, lapM: 0, lapTimes: [],
      splitsS: [360, 360, 360, 360, 360],
      route: [{lat: 37.5, lon: 127.0}, {lat: 37.51, lon: 127.01}], // 워치 GPS 경로(지도)
    });
  });
  await flush(renderer);

  // ① 런 저장(부팅 캐시에 반영 — Firestore 정본 이전의 로컬 정합 관측점).
  const cacheRuns = JSON.parse((await AsyncStorage.getItem('cache_runs_v1')) || '[]');
  expect(cacheRuns.some((r: any) => Number(r.km) === 5 && r.source === 'watch')).toBe(true);

  // ② 스플릿 사이드카(기존 계약 회귀 방지).
  const savedRun = cacheRuns.find((r: any) => r.source === 'watch');
  const splitsRaw = await AsyncStorage.getItem('splits_' + savedRun.id);
  expect(splitsRaw).toBeTruthy();
  expect(JSON.parse(splitsRaw!)).toHaveLength(5);

  // ②b 경로(민우님 2026-07-24 "워치 런도 지도") — 레코드 route(클라우드 동기) + 사이드카.
  expect(String(savedRun.route || '')).toContain('37.51');
  const routeSide = await AsyncStorage.getItem('route_' + savedRun.id);
  expect(routeSide).toBeTruthy();

  // ③ 핵심 — HR 보강 대기 레지스트리에 '워치가 보낸 실제 시간창'으로 등록됐다.
  //    (updatedAt 역산이 아니라 startMs 기준 — 늦게 가져온 워치 런도 창이 정확하다.)
  const pending = JSON.parse((await AsyncStorage.getItem('hr_backfill_pending_v1')) || '[]');
  const entry = pending.find((e: any) => e.runId === String(savedRun.id));
  expect(entry).toBeTruthy();
  expect(entry.startMs).toBe(startMs);
  expect(entry.endMs).toBe(startMs + durationS * 1000);

  await act(async () => { renderer.unmount(); });
});
