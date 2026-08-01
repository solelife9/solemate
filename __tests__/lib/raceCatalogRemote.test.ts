// ============================================================================
// raceCatalogRemote — 대회 카탈로그 캐시 + 증분 동기 (AUDIT 2 I-1)
//
// 계약:
//   · 24시간 간격 — 그 안에는 네트워크를 건드리지 않는다(부팅마다 전량 읽던 것의 교정)
//   · 커서 증분 — 두 번째부터는 마지막으로 본 updatedAt 이후만 조회한다
//   · 실패는 캐시를 지우지 않는다 — 오프라인 한 번에 목록이 비면 안 된다
//   · 결과는 언제나 시드와 머지된 "지금 쓸 수 있는 목록"이다
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../lib/raceStore', () => {
  const actual = jest.requireActual('../../lib/raceStore');
  return {...actual, fetchRacesUpdatedAfter: jest.fn()};
});
const {fetchRacesUpdatedAfter} = require('../../lib/raceStore');

import {
  syncRemoteRaces,
  loadCache,
  isDue,
  cachedRaces,
  CACHE_KEY,
  SYNC_INTERVAL_MS,
} from '../../lib/raceCatalogRemote';
import {SEED_RACES} from '../../data/raceEvents';

const race = (id: string, name = '테스트 대회') => ({
  id,
  name,
  date: '2026-10-01',
  region: '서울',
  venue: '',
  distances: ['full'] as any,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  (fetchRacesUpdatedAfter as jest.Mock).mockReset();
  (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue({races: [], maxUpdatedAtMs: 0});
});

describe('isDue — 언제 네트워크를 건드리는가', () => {
  test('한 번도 시도한 적 없으면 만기다', () => {
    expect(isDue({cursorMs: 0, lastAttemptMs: 0, byId: {}}, 1_000)).toBe(true);
  });

  test('간격 안이면 만기가 아니다', () => {
    const c = {cursorMs: 0, lastAttemptMs: 1_000, byId: {}};
    expect(isDue(c, 1_000 + SYNC_INTERVAL_MS - 1)).toBe(false);
  });

  test('간격이 지나면 만기다', () => {
    const c = {cursorMs: 0, lastAttemptMs: 1_000, byId: {}};
    expect(isDue(c, 1_000 + SYNC_INTERVAL_MS)).toBe(true);
  });

  test('기기 시계를 뒤로 돌려 미래 값이 저장돼도 만기로 본다(영영 안 도는 것 방지)', () => {
    const c = {cursorMs: 0, lastAttemptMs: 9_000_000, byId: {}};
    expect(isDue(c, 1_000)).toBe(true);
  });
});

describe('syncRemoteRaces', () => {
  test('첫 호출은 커서 없이(null) 조회한다 — 전량 1회', async () => {
    await syncRemoteRaces({now: 1_000});
    expect(fetchRacesUpdatedAfter).toHaveBeenCalledWith(null);
  });

  test('두 번째부터는 서버가 준 커서 이후만 조회한다(증분)', async () => {
    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue({
      races: [race('a')],
      maxUpdatedAtMs: 500,
    });
    await syncRemoteRaces({now: 1_000});
    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue({races: [], maxUpdatedAtMs: 500});
    await syncRemoteRaces({now: 1_000 + SYNC_INTERVAL_MS});
    expect(fetchRacesUpdatedAfter).toHaveBeenLastCalledWith(500);
  });

  test('간격 안에서는 네트워크를 건드리지 않는다 — 이게 I-1 의 핵심', async () => {
    await syncRemoteRaces({now: 1_000});
    (fetchRacesUpdatedAfter as jest.Mock).mockClear();
    await syncRemoteRaces({now: 1_000 + SYNC_INTERVAL_MS - 1});
    expect(fetchRacesUpdatedAfter).not.toHaveBeenCalled();
  });

  test('force 는 간격을 무시한다', async () => {
    await syncRemoteRaces({now: 1_000});
    (fetchRacesUpdatedAfter as jest.Mock).mockClear();
    await syncRemoteRaces({now: 1_001, force: true});
    expect(fetchRacesUpdatedAfter).toHaveBeenCalled();
  });

  test('결과는 시드 + 원격 머지다(원격이 같은 id 를 이긴다)', async () => {
    const seedId = SEED_RACES[0].id;
    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue({
      races: [race(seedId, '서버가 고친 이름')],
      maxUpdatedAtMs: 500,
    });
    const out = await syncRemoteRaces({now: 1_000});
    expect(out.find(r => r.id === seedId)?.name).toBe('서버가 고친 이름');
    // 시드의 나머지는 그대로 남는다 — 원격은 덮는 게 아니라 얹는 것이다.
    expect(out.length).toBeGreaterThanOrEqual(SEED_RACES.length);
  });

  test('증분으로 받은 것이 캐시에 누적된다(이전 것을 지우지 않는다)', async () => {
    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue({
      races: [race('a', 'A대회')],
      maxUpdatedAtMs: 500,
    });
    await syncRemoteRaces({now: 1_000});
    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue({
      races: [race('b', 'B대회')],
      maxUpdatedAtMs: 900,
    });
    await syncRemoteRaces({now: 1_000 + SYNC_INTERVAL_MS});

    const cache = await loadCache();
    expect(cachedRaces(cache).map(r => r.id).sort()).toEqual(['a', 'b']);
    expect(cache.cursorMs).toBe(900);
  });

  test('조회 실패(null)여도 캐시를 지우지 않는다 — 시드+캐시로 계속 간다', async () => {
    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue({
      races: [race('a', 'A대회')],
      maxUpdatedAtMs: 500,
    });
    await syncRemoteRaces({now: 1_000});

    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue(null); // 오프라인/규칙 거부
    const out = await syncRemoteRaces({now: 1_000 + SYNC_INTERVAL_MS});

    expect(out.find(r => r.id === 'a')?.name).toBe('A대회');
    const cache = await loadCache();
    expect(cache.cursorMs).toBe(500); // 커서도 후퇴하지 않는다
  });

  test('실패해도 시도 시각은 남긴다 — 매 실행 재시도하지 않는다', async () => {
    (fetchRacesUpdatedAfter as jest.Mock).mockResolvedValue(null);
    await syncRemoteRaces({now: 7_777});
    expect((await loadCache()).lastAttemptMs).toBe(7_777);
  });

  test('캐시가 손상돼도 throw 하지 않고 시드로 간다', async () => {
    await AsyncStorage.setItem(CACHE_KEY, '{망가진 JSON');
    const out = await syncRemoteRaces({now: 1_000});
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(SEED_RACES.length);
  });
});
