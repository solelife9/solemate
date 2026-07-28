/**
 * 원격 신발 카탈로그 — 캐시·증분 동기화 계약.
 *
 * 이 스위트가 지키는 건 하나다: **원격이 죽어도 등록 화면은 멀쩡해야 한다.**
 * 카탈로그 갱신은 부가 기능이고, 신발 등록은 앱의 핵심 동선이다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CACHE_KEY,
  SYNC_INTERVAL_MS,
  isDue,
  loadCache,
  cachedDocs,
  syncRemoteCatalog,
} from '../../lib/shoeCatalogRemote';

jest.mock('../../services/shoes', () => ({listShoesUpdatedAfter: jest.fn()}));
const {listShoesUpdatedAfter} = require('../../services/shoes');

const doc = (id: string, brand = 'Nike', model = 'Pegasus') => ({
  id, brand, model, version: '42', variant: null, collabWith: null,
  category: 'daily', defaultLifespanKm: 650, releaseYear: 2025,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  listShoesUpdatedAfter.mockResolvedValue({docs: [], maxUpdatedAtMs: 0});
});

describe('만기 판정', () => {
  it('한 번도 안 받았으면 받는다', () => {
    expect(isDue({cursorMs: 0, lastAttemptMs: 0, byId: {}}, 1_000)).toBe(true);
  });

  it('간격 안이면 네트워크를 건드리지 않는다', () => {
    const c = {cursorMs: 0, lastAttemptMs: 1_000, byId: {}};
    expect(isDue(c, 1_000 + SYNC_INTERVAL_MS - 1)).toBe(false);
    expect(isDue(c, 1_000 + SYNC_INTERVAL_MS)).toBe(true);
  });

  it('기기 시계를 뒤로 돌려도 다시 받는다(미래 값에 갇히지 않는다)', () => {
    expect(isDue({cursorMs: 0, lastAttemptMs: 9_999, byId: {}}, 1_000)).toBe(true);
  });
});

describe('동기화', () => {
  it('처음엔 커서 없이 전체를 받는다', async () => {
    listShoesUpdatedAfter.mockResolvedValue({docs: [doc('a')], maxUpdatedAtMs: 500});
    const out = await syncRemoteCatalog({now: 1_000});
    expect(listShoesUpdatedAfter).toHaveBeenCalledWith(null);
    expect(out.map(d => (d as unknown as {id: string}).id)).toEqual(['a']);
  });

  it('두 번째부터는 **바뀐 것만** 요청한다 — 매번 전체를 읽으면 그대로 요금이다', async () => {
    listShoesUpdatedAfter.mockResolvedValue({docs: [doc('a')], maxUpdatedAtMs: 500});
    await syncRemoteCatalog({now: 1_000});
    listShoesUpdatedAfter.mockResolvedValue({docs: [], maxUpdatedAtMs: 500});
    await syncRemoteCatalog({now: 1_000 + SYNC_INTERVAL_MS});
    expect(listShoesUpdatedAfter).toHaveBeenLastCalledWith(500);
  });

  it('받은 문서는 캐시에 쌓인다(증분이라 이전 것이 사라지면 안 된다)', async () => {
    listShoesUpdatedAfter.mockResolvedValue({docs: [doc('a')], maxUpdatedAtMs: 500});
    await syncRemoteCatalog({now: 1_000});
    listShoesUpdatedAfter.mockResolvedValue({docs: [doc('b', 'Hoka', 'Clifton')], maxUpdatedAtMs: 900});
    const out = await syncRemoteCatalog({now: 1_000 + SYNC_INTERVAL_MS});
    expect(out.map(d => (d as unknown as {id: string}).id).sort()).toEqual(['a', 'b']);
  });

  it('같은 id 가 다시 오면 덮어쓴다(중복이 아니라 갱신이다)', async () => {
    listShoesUpdatedAfter.mockResolvedValue({docs: [doc('a')], maxUpdatedAtMs: 500});
    await syncRemoteCatalog({now: 1_000});
    listShoesUpdatedAfter.mockResolvedValue({
      docs: [{...doc('a'), model: 'Vomero'}], maxUpdatedAtMs: 900,
    });
    const out = await syncRemoteCatalog({now: 1_000 + SYNC_INTERVAL_MS});
    expect(out).toHaveLength(1);
    expect((out[0] as {model: string}).model).toBe('Vomero');
  });

  it('간격 안에는 서버를 부르지 않고 캐시를 준다', async () => {
    listShoesUpdatedAfter.mockResolvedValue({docs: [doc('a')], maxUpdatedAtMs: 500});
    await syncRemoteCatalog({now: 1_000});
    listShoesUpdatedAfter.mockClear();
    const out = await syncRemoteCatalog({now: 2_000});
    expect(listShoesUpdatedAfter).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
  });
});

describe('실패해도 앱은 간다', () => {
  it('서버가 던져도 throw 하지 않고 캐시를 준다', async () => {
    listShoesUpdatedAfter.mockResolvedValue({docs: [doc('a')], maxUpdatedAtMs: 500});
    await syncRemoteCatalog({now: 1_000});
    listShoesUpdatedAfter.mockRejectedValue(new Error('오프라인'));
    const out = await syncRemoteCatalog({now: 1_000 + SYNC_INTERVAL_MS});
    expect(out).toHaveLength(1);
  });

  it('첫 시도가 실패하면 빈 목록 — 화면은 번들 목록으로 간다', async () => {
    listShoesUpdatedAfter.mockRejectedValue(new Error('로그인 안 됨'));
    await expect(syncRemoteCatalog({now: 1_000})).resolves.toEqual([]);
  });

  it('실패해도 시도 시각은 남긴다 — 매 실행 재시도하면 그것도 비용이다', async () => {
    listShoesUpdatedAfter.mockRejectedValue(new Error('오프라인'));
    await syncRemoteCatalog({now: 1_000});
    const c = await loadCache();
    expect(c.lastAttemptMs).toBe(1_000);
    expect(isDue(c, 2_000)).toBe(false);
  });

  it('캐시가 손상돼 있어도 빈 캐시로 시작한다', async () => {
    await AsyncStorage.setItem(CACHE_KEY, '{깨진 JSON');
    await expect(loadCache()).resolves.toEqual({cursorMs: 0, lastAttemptMs: 0, byId: {}});
  });

  it('순서가 실행마다 흔들리지 않는다(id 순 고정)', () => {
    const c = {cursorMs: 0, lastAttemptMs: 0, byId: {b: doc('b'), a: doc('a')}};
    expect(cachedDocs(c).map(d => (d as unknown as {id: string}).id)).toEqual(['a', 'b']);
  });
});
