// routeSidecar.test.ts — GPS 경로를 클라우드 사이드카로 옮기는 계약 (2026-07-30)
//
// 배경(실측): 백업 문서 userBackups/{uid} 는 신발·런 전량이 들어가는 **단일 문서**이고
// Firestore 상한이 1MiB 다. 주 계정 실측에서 경로 있는 런 12건이 런 데이터의 74%를
// 차지했고, 이대로면 GPS 런 약 163건에서 상한에 닿는다. 넘으면 write 가 실패하는데
// 호출부가 그 실패를 삼켜 사용자는 기기를 바꾸는 날에야 안다.
//
// 여기서 고정하는 것:
//  1) route 가 사이드카 동기에 실제로 실린다(push→pull 라운드트립·복원).
//  2) 본문에서 route 를 덜어내는 건 **사이드카에 확실히 올라간 런에 한정**된다.
//     확인되지 않은 런을 덜어내면 그 경로는 어디에도 남지 않는다 — 그 실수를 막는 게 핵심.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  collectLocalDetail,
  persistLocalDetailIfMissing,
  detailSignature,
  runsWithCloudRoute,
  syncRunDetails,
} from '../../lib/runDetailSync';
import {stripSyncedRoutes} from '../../lib/cloudSync';

const ROUTE = [
  {lat: 37.5, lon: 127.0},
  {lat: 37.501, lon: 127.001},
  {lat: 37.502, lon: 127.002},
];

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('route 가 상세 사이드카에 합류한다', () => {
  test('collectLocalDetail 이 route_<id> 를 담는다', async () => {
    await AsyncStorage.setItem('route_r1', JSON.stringify(ROUTE));
    const d = await collectLocalDetail('r1');
    expect(d).not.toBeNull();
    expect(d!.route).toEqual(ROUTE);
  });

  test('시그니처에 route 길이가 들어간다(변경 감지)', async () => {
    expect(detailSignature({route: ROUTE})).toContain('route:3');
    expect(detailSignature({})).toContain('route:0');
  });

  test('원격 상세의 route 를 로컬이 비었을 때만 복원한다(재설치 복구)', async () => {
    const restored = await persistLocalDetailIfMissing('r1', {route: ROUTE});
    expect(restored).toBe(1);
    expect(JSON.parse((await AsyncStorage.getItem('route_r1'))!)).toEqual(ROUTE);

    // 로컬 실측이 있으면 덮지 않는다.
    await persistLocalDetailIfMissing('r1', {route: [{lat: 0, lon: 0}]});
    expect(JSON.parse((await AsyncStorage.getItem('route_r1'))!)).toEqual(ROUTE);
  });

  test('syncRunDetails 가 route 를 push 하고, 로컬이 비면 pull 로 되살린다', async () => {
    const cloud: Record<string, Record<string, unknown>> = {};
    const port = {
      pushRunDetail: async (id: string, d: Record<string, unknown>) => {
        cloud[id] = d;
      },
      pullRunDetail: async (id: string) => cloud[id] ?? null,
    };

    await AsyncStorage.setItem('route_r1', JSON.stringify(ROUTE));
    const up = await syncRunDetails([{id: 'r1'}], port);
    expect(up.pushed).toBe(1);
    expect(cloud.r1.route).toEqual(ROUTE);

    // 재설치 시뮬: 로컬 전부 소실 → pull 복원
    await AsyncStorage.clear();
    const down = await syncRunDetails([{id: 'r1'}], port);
    expect(down.restored).toBe(1);
    expect(JSON.parse((await AsyncStorage.getItem('route_r1'))!)).toEqual(ROUTE);
  });
});

describe('runsWithCloudRoute — 본문에서 덜어내도 되는지 판정', () => {
  test('push 마커에 route:N(N>0) 이 있어야 확인으로 친다', async () => {
    await AsyncStorage.setItem('detail_pushed_r1', 'splits:5|route:3');
    await AsyncStorage.setItem('detail_pushed_r2', 'splits:5|route:0'); // 경로 없이 올라감
    await AsyncStorage.setItem('detail_pushed_r3', 'splits:5'); // 구버전 마커(route 항목 자체가 없음)
    const set = await runsWithCloudRoute(['r1', 'r2', 'r3', 'r4']);
    expect(set.has('r1')).toBe(true);
    expect(set.has('r2')).toBe(false);
    expect(set.has('r3')).toBe(false);
    expect(set.has('r4')).toBe(false); // 마커 자체가 없음
  });

  test('마커를 못 읽으면 빈 집합 — 아무것도 덜어내지 않는 쪽이 안전하다', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getMany').mockRejectedValueOnce(new Error('boom'));
    await expect(runsWithCloudRoute(['r1'])).resolves.toEqual(new Set());
    spy.mockRestore();
  });
});

describe('stripSyncedRoutes — 동기 페이로드에서만, 확인된 런만', () => {
  const payload = () => ({
    shoes: [{id: 's1'}],
    runs: [
      {id: 'r1', km: 5, route: JSON.stringify(ROUTE)},
      {id: 'r2', km: 3, route: JSON.stringify(ROUTE)},
    ],
    settings: {},
  });

  test('확인된 런의 route 만 비운다', () => {
    const out = stripSyncedRoutes(payload(), new Set(['r1']));
    expect(out.runs[0].route).toBe('');
    expect(out.runs[1].route).toBe(JSON.stringify(ROUTE)); // 미확인 — 그대로 둔다
  });

  test('확인 집합이 비면 원본을 그대로 돌려준다(참조 동일)', () => {
    const p = payload();
    expect(stripSyncedRoutes(p, new Set())).toBe(p);
  });

  test('입력을 변형하지 않는다(순수)', () => {
    const p = payload();
    stripSyncedRoutes(p, new Set(['r1', 'r2']));
    expect(p.runs[0].route).toBe(JSON.stringify(ROUTE));
  });

  test('route 외 다른 필드는 건드리지 않는다', () => {
    const out = stripSyncedRoutes(payload(), new Set(['r1']));
    expect(out.runs[0]).toMatchObject({id: 'r1', km: 5});
    expect(out.shoes).toEqual([{id: 's1'}]);
  });
});
