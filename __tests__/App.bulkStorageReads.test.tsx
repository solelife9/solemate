/**
 * 런이 많을 때 저장소를 **묶어서** 읽는다 (QA 감사 Q-4).
 *
 * 두 자리가 런 수에 비례해 개별 브리지 왕복을 냈다:
 *   1) 노면 태그(surface_<runId>) — runs 가 바뀔 때마다 전량 재조회하는 자리인데
 *      `Promise.all(ids.map(getItem))` 이었다(주석은 "multiGet 으로 한 번에"라고 적혀 있었다).
 *      동기 1회·런 추가/편집/삭제·워치 런 수신마다 다시 돈다 → 1000건이면 1000 왕복.
 *   2) 거리 PB 의 paceTrack — `for … await` 직렬. 평소엔 캐시가 막지만 재설치·기기 변경
 *      직후 첫 부팅은 전량 미스라 1000번이 한 줄로 늘어선다.
 *
 * 관찰 가능한 계약으로 못 박는다: 런 N 건에 대해 개별 getItem 이 N 번 나가지 않는다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';
import {getDistancePBs, PB_LOAD_CHUNK} from '../lib/distancePBStore';

const N = 60;
const SHOE = {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0};
const RUNS = Array.from({length: N}, (_, i) => ({
  id: `r${i}`,
  shoe_id: 's1',
  km: 5,
  run_date: `2026-0${(i % 9) + 1}-01`,
  duration: 1800,
  updatedAt: 1_700_000_000_000 + i,
}));

test('노면 태그는 런 수만큼 개별 getItem 을 내지 않는다 — 한 번의 getMany 로 읽는다', async () => {
  await seedBootCache([SHOE], RUNS);
  const getItemSpy = jest.spyOn(AsyncStorage, 'getItem');
  const getManySpy = jest.spyOn(AsyncStorage, 'getMany');
  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // surface_* 를 개별로 읽은 횟수 — 0 이어야 한다.
    const perRunSurface = getItemSpy.mock.calls.filter(c => String(c[0]).startsWith('surface_'));
    expect(perRunSurface).toHaveLength(0);

    // 대신 키 전체가 한 번의 getMany 로 나갔다.
    const bulk = getManySpy.mock.calls.find(c =>
      Array.isArray(c[0]) && (c[0] as string[]).some(k => k.startsWith('surface_')),
    );
    expect(bulk).toBeTruthy();
    expect(bulk![0] as string[]).toHaveLength(N);

    act(() => renderer.unmount());
  } finally {
    getItemSpy.mockRestore();
    getManySpy.mockRestore();
  }
});

test('거리 PB 는 캐시 미스를 직렬로 읽지 않는다 — 묶음 단위 병렬(상한 유지)', async () => {
  const ids = Array.from({length: N}, (_, i) => `r${i}`);
  let inFlight = 0;
  let peak = 0;
  const cache: Record<string, unknown> = {};

  await getDistancePBs(ids, {
    loadTrack: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return null;
    },
    getCache: async () => null,
    setCache: async c => {
      Object.assign(cache, c);
    },
  });

  // 직렬(1)이 아니다 — 그게 재설치 직후 첫 부팅을 느리게 만들던 원인이다.
  expect(peak).toBeGreaterThan(1);
  // 그렇다고 전량 동시도 아니다 — 시계열은 런당 수십 KB 라 상한이 있어야 한다.
  expect(peak).toBeLessThanOrEqual(PB_LOAD_CHUNK);
  // 미스 전량이 '계산됨' 표식으로 채워져 다음 조회는 다시 읽지 않는다.
  expect(Object.keys(cache)).toHaveLength(N);
});
