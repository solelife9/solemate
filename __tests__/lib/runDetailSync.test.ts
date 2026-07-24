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
