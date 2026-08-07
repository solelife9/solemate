/**
 * lib/runDetailSync — 런 상세 사이드카 클라우드 백업/복원 행동 테스트 (2026-07-24).
 *
 * 계약:
 *   1) 로컬 사이드카가 있으면 port.pushRunDetail 로 올리고, 같은 내용은 재업로드하지 않는다.
 *      내용이 바뀌면(심박 백필 등) 다시 올린다(시그니처 마커).
 *   2) 로컬이 비어 있으면 pull 로 내려받아 '빈 자리만' 복원한다(로컬 실측 우선).
 *   3) 시계열은 상한(DETAIL_SERIES_CAP)으로 다운샘플 — 울트라 런 문서 크기 방어.
 *   4) 개별 런 실패는 삼키고 계속(비차단) — 마커 미기록이라 다음 스윕에서 재시도.
 *
 * @format
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  syncRunDetails,
  collectLocalDetail,
  persistLocalDetailIfMissing,
  DETAIL_SERIES_CAP,
  DETAIL_ABSENT_TTL_MS,
  isAbsentMarkerFresh,
} from '../../lib/runDetailSync';

const SPLITS = [{km: 1, paceSec: 360, elevM: 2}, {km: 2, paceSec: 355, elevM: 1}];
const HR = [{t: 0, bpm: 120}, {t: 5, bpm: 141}, {t: 10, bpm: 150}];

function makePort() {
  const remote = new Map<string, Record<string, unknown>>();
  return {
    remote,
    pushRunDetail: jest.fn(async (id: string, d: Record<string, unknown>) => {
      remote.set(id, JSON.parse(JSON.stringify(d)));
    }),
    pullRunDetail: jest.fn(async (id: string) => remote.get(id) ?? null),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('로컬 사이드카를 push 하고, 같은 내용은 재업로드하지 않으며, 변경되면 다시 올린다', async () => {
  await AsyncStorage.setItem('splits_r1', JSON.stringify(SPLITS));
  await AsyncStorage.setItem('hrTrack_r1', JSON.stringify(HR));
  const port = makePort();

  const first = await syncRunDetails([{id: 'r1'}], port);
  expect(first.pushed).toBe(1);
  expect(port.remote.get('r1')).toEqual({splits: SPLITS, hrTrack: HR});

  // 같은 내용 — 재업로드 생략(일일 스윕이 무의미한 쓰기를 반복하지 않게).
  const second = await syncRunDetails([{id: 'r1'}], port);
  expect(second.pushed).toBe(0);
  expect(port.pushRunDetail).toHaveBeenCalledTimes(1);

  // 심박 백필로 hrTrack 이 자란 뒤 — 시그니처 변경 → 재push.
  await AsyncStorage.setItem('hrTrack_r1', JSON.stringify([...HR, {t: 15, bpm: 152}]));
  const third = await syncRunDetails([{id: 'r1'}], port);
  expect(third.pushed).toBe(1);
  expect((port.remote.get('r1')!.hrTrack as unknown[]).length).toBe(4);
});

test('로컬이 비면 pull 로 복원하되, 이미 있는 키는 덮지 않는다(로컬 실측 우선)', async () => {
  const port = makePort();
  port.remote.set('r2', {splits: SPLITS, hrTrack: HR, track: {lapM: 400, laps: 3, lapTimes: [95, 190, 288]}});

  const res = await syncRunDetails([{id: 'r2'}], port);
  expect(res.restored).toBe(1);
  expect(JSON.parse((await AsyncStorage.getItem('splits_r2'))!)).toEqual(SPLITS);
  expect(JSON.parse((await AsyncStorage.getItem('hrTrack_r2'))!)).toEqual(HR);
  expect(JSON.parse((await AsyncStorage.getItem('track_r2'))!).lapM).toBe(400);

  // 로컬 실측이 있는 키는 원격이 달라도 보존.
  const localHr = [{t: 0, bpm: 100}];
  await AsyncStorage.setItem('hrTrack_r3', JSON.stringify(localHr));
  await persistLocalDetailIfMissing('r3', {hrTrack: HR, splits: SPLITS});
  expect(JSON.parse((await AsyncStorage.getItem('hrTrack_r3'))!)).toEqual(localHr);
  expect(JSON.parse((await AsyncStorage.getItem('splits_r3'))!)).toEqual(SPLITS);
});

test('시계열 상한 — CAP 초과 시 균등 다운샘플로 push(문서 크기 방어)', async () => {
  const huge = Array.from({length: DETAIL_SERIES_CAP + 5000}, (_, i) => ({t: i, bpm: 130}));
  await AsyncStorage.setItem('hrTrack_r4', JSON.stringify(huge));
  const detail = await collectLocalDetail('r4');
  expect((detail!.hrTrack as unknown[]).length).toBe(DETAIL_SERIES_CAP);
});

test('개별 런 push 실패는 삼키고 다음 런 계속 + 마커 미기록(다음 스윕 재시도)', async () => {
  await AsyncStorage.setItem('splits_bad', JSON.stringify(SPLITS));
  await AsyncStorage.setItem('splits_good', JSON.stringify(SPLITS));
  const port = makePort();
  port.pushRunDetail.mockImplementationOnce(async () => {
    throw new Error('offline');
  });

  const res = await syncRunDetails([{id: 'bad'}, {id: 'good'}], port);
  expect(res.pushed).toBe(1); // good 만 성공
  await expect(AsyncStorage.getItem('detail_pushed_bad')).resolves.toBeNull();

  // 다음 스윕 — bad 재시도 성공.
  const retry = await syncRunDetails([{id: 'bad'}], port);
  expect(retry.pushed).toBe(1);
});

// ─── '원격에도 없음' 마커 (AUDIT 2 I-5) ───────────────────────────────────────
// 없었을 때: 로컬에도 원격에도 상세가 없는 런은 매 스윕마다 다시 조회됐다(영원히).
// 고친 뒤: 한 번 확인하면 기한(7일) 동안 묻지 않는다. **영구가 아닌 게 핵심** —
// 다른 기기가 나중에 올린 상세를 영영 못 받으면 읽기 아끼려다 데이터를 잃는 것이다.
describe('상세 없는 런 재조회 억제 (I-5)', () => {
  const runs = [{id: 'r-empty'}];

  test('원격도 비었으면 다음 스윕에서 다시 묻지 않는다', async () => {
    const pullRunDetail = jest.fn().mockResolvedValue(null);
    const port = {pullRunDetail, pushRunDetail: jest.fn()};

    await syncRunDetails(runs, port, {now: 1_000});
    expect(pullRunDetail).toHaveBeenCalledTimes(1);

    await syncRunDetails(runs, port, {now: 1_000 + 60_000});
    expect(pullRunDetail).toHaveBeenCalledTimes(1); // 늘지 않는다
  });

  test('기한이 지나면 다시 묻는다 — 다른 기기가 올렸을 수 있다', async () => {
    const pullRunDetail = jest.fn().mockResolvedValue(null);
    const port = {pullRunDetail, pushRunDetail: jest.fn()};

    await syncRunDetails(runs, port, {now: 1_000});
    await syncRunDetails(runs, port, {now: 1_000 + DETAIL_ABSENT_TTL_MS});
    expect(pullRunDetail).toHaveBeenCalledTimes(2);
  });

  test('기한 안에 실제로 받아오면 마커를 지운다', async () => {
    const port = {
      pullRunDetail: jest.fn().mockResolvedValue(null),
      pushRunDetail: jest.fn(),
    };
    await syncRunDetails(runs, port, {now: 1_000}); // 마커 기록
    expect(await AsyncStorage.getItem('detail_absent_r-empty')).toBe('1000');

    // 기한이 지나 다시 물었더니 이번엔 있다 → 복원하고 마커 제거.
    port.pullRunDetail.mockResolvedValue({splits: [1, 2, 3]});
    const out = await syncRunDetails(runs, port, {now: 1_000 + DETAIL_ABSENT_TTL_MS});
    expect(out.restored).toBe(1);
    expect(await AsyncStorage.getItem('detail_absent_r-empty')).toBeNull();
  });

  test('로컬 상세가 생기면 마커와 무관하게 push 한다(억제가 업로드를 막지 않는다)', async () => {
    const port = {pullRunDetail: jest.fn().mockResolvedValue(null), pushRunDetail: jest.fn()};
    await syncRunDetails(runs, port, {now: 1_000}); // 마커 기록됨

    await AsyncStorage.setItem('splits_r-empty', JSON.stringify([1, 2]));
    const out = await syncRunDetails(runs, port, {now: 1_500});
    expect(out.pushed).toBe(1);
    expect(port.pushRunDetail).toHaveBeenCalled();
  });
});

describe('isAbsentMarkerFresh — 판정은 항상 "받는 쪽"으로 기운다', () => {
  test('마커가 없으면 조회한다', () => {
    expect(isAbsentMarkerFresh(null, 1_000)).toBe(false);
  });
  test('손상된 값이면 조회한다', () => {
    for (const bad of ['', 'abc', '0', '-5', 'NaN']) {
      expect(isAbsentMarkerFresh(bad, 1_000)).toBe(false);
    }
  });
  test('기한 안이면 건너뛴다', () => {
    expect(isAbsentMarkerFresh('1000', 1_000 + DETAIL_ABSENT_TTL_MS - 1)).toBe(true);
  });
  test('기한이 지나면 조회한다', () => {
    expect(isAbsentMarkerFresh('1000', 1_000 + DETAIL_ABSENT_TTL_MS)).toBe(false);
  });
  test('기기 시계가 뒤로 가도 막지 않는다', () => {
    expect(isAbsentMarkerFresh('9000000', 1_000)).toBe(false);
  });
});

// ============================================================================
// 자를 거면 최신부터 자른다 (2026-08-07 감사)
//
// 예전엔 호출부가 넘긴 순서 그대로 앞 30개를 잘랐다. 평시엔 addRun 이 앞에 붙여 최신순
// 이라 맞았지만, **재설치 직후엔 달랐다** — 클라우드 델타 복원(mergePulled)이
// `orderBy('updatedAt')` **오름차순**으로 배열을 만든다.
//
// 그래서 재설치한 장기 사용자는 **가장 오래된 30건의 상세만 복원되고, 최근 러닝의
// 지도·스플릿·심박은 영영 안 내려왔다**(클라우드엔 있는데 안 읽는다). 하루 1회 게이트라
// 다음 날도 같은 30건을 다시 훑는다.
//
// 호출부에 "정렬해서 넘겨라"라고 맡기지 않는다 — 그게 바로 이 결함이 생긴 방식이다.
// ============================================================================
describe('상세 동기 — 잘라낼 때의 순서', () => {
  test('오래된 순으로 들어와도 최신 것부터 처리한다(재설치 시나리오)', async () => {
    const port = {
      pushRunDetail: jest.fn().mockResolvedValue(undefined),
      getRunDetail: jest.fn().mockResolvedValue(null),
      deleteRunDetail: jest.fn().mockResolvedValue(undefined),
    };
    // 오래된 순(mergePulled 가 만드는 순서)으로 5건을 넘기고 2건만 처리하게 한다.
    const runs = [1, 2, 3, 4, 5].map(i => ({
      id: `r${i}`,
      run_date: `2026-01-0${i}`,
      updatedAt: 1_700_000_000_000 + i * 1000,
    }));
    // 각 런에 로컬 상세가 있게 시드(그래야 push 대상이 된다).
    for (const r of runs) {
      await AsyncStorage.setItem('route_' + r.id, JSON.stringify([{lat: 37.5, lon: 127}]));
    }

    await syncRunDetails(runs, port as never, {max: 2});

    const pushed = port.pushRunDetail.mock.calls.map(c => c[0]);
    // 가장 최신 둘(r5, r4)이어야 한다 — 예전 동작이면 r1, r2 였다.
    expect(pushed).toEqual(['r5', 'r4']);
  });

  test('updatedAt 이 없으면 날짜로 정렬한다', async () => {
    const port = {
      pushRunDetail: jest.fn().mockResolvedValue(undefined),
      getRunDetail: jest.fn().mockResolvedValue(null),
      deleteRunDetail: jest.fn().mockResolvedValue(undefined),
    };
    const runs = [
      {id: 'old', run_date: '2026-01-01'},
      {id: 'new', run_date: '2026-06-01'},
    ];
    for (const r of runs) {
      await AsyncStorage.setItem('route_' + r.id, JSON.stringify([{lat: 37.5, lon: 127}]));
    }

    await syncRunDetails(runs, port as never, {max: 1});

    expect(port.pushRunDetail.mock.calls[0][0]).toBe('new');
  });
});
