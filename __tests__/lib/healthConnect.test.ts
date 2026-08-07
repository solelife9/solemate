// ============================================================================
// lib/healthConnect — 안드로이드 심박(Health Connect) 계약
//
// 왜 이 파일이 새로 필요한가(2026-08-07 감사)
// ----------------------------------------------------------------------------
// `react-native-health-connect` 목이 **존재하지 않았다.** 기존 healthFacade 테스트는
// 안드로이드 커버리지처럼 보이지만, jest 에서 `getSdkStatus` 가 던져 파싱 코드 이전에
// 단락되므로 "어느 모듈을 부르는가"만 증명한다. 즉 이 파일의 표본 평탄화·노이즈 컷·
// 정렬·richer-wins 가 **전부 미검증**이었다.
//
// 그 사각지대에서 결함 두 개가 살아 있었다:
//   ① 구간 레코드 부분 겹침 — HeartRate 는 startTime~endTime 을 덮는 **구간 레코드**이고
//      `between` 은 그 구간을 기준으로 거른다. 삼성헬스처럼 워크아웃 전체를 한 레코드로
//      쓰는 앱이면 우리 창보다 1초만 먼저 시작해도 반환되지 않아 **러닝 전체가 0표본**.
//   ② 페이지네이션 미추적 — pageSize 미지정(네이티브 기본 1000) + pageToken 무시.
//      장시간 러닝의 뒷부분 심박이 통째로 빠질 수 있었다.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

const RUN_START = 1_700_000_000_000;
const RUN_END = RUN_START + 30 * 60 * 1000; // 30분 러닝

/** samples 를 담은 구간 레코드 하나를 만든다. */
const record = (fromMs: number, count: number, stepMs = 60_000) => ({
  startTime: new Date(fromMs).toISOString(),
  endTime: new Date(fromMs + count * stepMs).toISOString(),
  samples: Array.from({length: count}, (_, i) => ({
    time: new Date(fromMs + i * stepMs).toISOString(),
    beatsPerMinute: 150,
  })),
});

/** Health Connect 네이티브 목을 세우고 모듈을 새로 물어온다. */
function boot(readRecords: jest.Mock) {
  jest.resetModules();
  const api = {
    getSdkStatus: jest.fn().mockResolvedValue(3), // SDK_AVAILABLE
    initialize: jest.fn().mockResolvedValue(true),
    getGrantedPermissions: jest.fn().mockResolvedValue([
      {accessType: 'read', recordType: 'HeartRate'},
    ]),
    requestPermission: jest.fn().mockResolvedValue([]),
    readRecords,
    insertRecords: jest.fn().mockResolvedValue([]),
    openHealthConnectSettings: jest.fn(),
  };
  jest.doMock('react-native-health-connect', () => api, {virtual: true});
  const rn = require('react-native');
  rn.Platform.OS = 'android';
  // ⚠️ 저장소도 **부팅 뒤 인스턴스**를 써야 한다. jest.resetModules() 가 AsyncStorage 목까지
  // 새로 물어오므로, 부팅 전에 잡아둔 참조로 읽고 쓰면 테스트 대상과 다른 저장소를 본다.
  const asMod = require('@react-native-async-storage/async-storage');
  const store = (asMod.default ?? asMod) as typeof AsyncStorage;
  return {api, store, hc: require('../../lib/healthConnect')};
}

beforeEach(async () => {
  await AsyncStorage.clear();
});
afterEach(() => {
  jest.dontMock('react-native-health-connect');
  jest.resetModules();
});

describe('hcBackfillHeartRate — 구간 레코드', () => {
  test('러닝보다 먼저 시작한 레코드도 잡는다 — 삼성헬스 패턴', async () => {
    // 워크아웃 전체를 한 레코드로 쓰는데, 러닝보다 5분 먼저 시작한다.
    const readRecords = jest.fn().mockResolvedValue({
      records: [record(RUN_START - 5 * 60 * 1000, 40)],
    });
    const {hc} = boot(readRecords);

    const n = await hc.hcBackfillHeartRate('run-1', RUN_START, RUN_END);

    // 예전 구현이라면 `between` 이 이 레코드를 안 돌려줘 0 이었다.
    expect(n).toBeGreaterThan(0);
    // 검색창을 넓혔는지 실제로 확인한다.
    const filter = readRecords.mock.calls[0][1].timeRangeFilter;
    expect(new Date(filter.startTime).getTime()).toBeLessThan(RUN_START);
    expect(new Date(filter.endTime).getTime()).toBeGreaterThan(RUN_END);
  });

  test('넓혀서 찾되 표본은 러닝 창으로 자른다 — 정밀도는 그대로', async () => {
    const readRecords = jest.fn().mockResolvedValue({
      records: [record(RUN_START - 20 * 60 * 1000, 80)], // 20분 전부터 80분치
    });
    const {hc, store} = boot(readRecords);

    await hc.hcBackfillHeartRate('run-2', RUN_START, RUN_END);

    const saved = JSON.parse((await store.getItem('hrTrack_run-2')) as string);
    // 러닝 밖 표본이 하나도 없어야 한다(t 는 시작 기준 초).
    expect(saved.length).toBeGreaterThan(0);
    for (const p of saved) {
      expect(p.t).toBeGreaterThanOrEqual(0);
      expect(p.t).toBeLessThanOrEqual((RUN_END - RUN_START) / 1000);
    }
  });

  test('여러 페이지를 끝까지 따라간다', async () => {
    const readRecords = jest
      .fn()
      .mockResolvedValueOnce({records: [record(RUN_START, 10)], pageToken: 'p2'})
      .mockResolvedValueOnce({records: [record(RUN_START + 10 * 60_000, 10)]});
    const {hc} = boot(readRecords);

    const n = await hc.hcBackfillHeartRate('run-3', RUN_START, RUN_END);

    expect(readRecords).toHaveBeenCalledTimes(2);
    expect(readRecords.mock.calls[1][1].pageToken).toBe('p2');
    expect(n).toBe(20);
  });

  test('더 촘촘한 기존 트랙을 덮어쓰지 않는다(richer-wins)', async () => {
    const {hc, store} = boot(jest.fn().mockResolvedValue({records: [record(RUN_START, 5)]}));
    // ⚠️ 시드는 **부팅 뒤에** 한다(boot 주석 참조).
    const rich = Array.from({length: 100}, (_, i) => ({t: i, bpm: 150}));
    await store.setItem('hrTrack_run-4', JSON.stringify(rich));

    const n = await hc.hcBackfillHeartRate('run-4', RUN_START, RUN_END);

    expect(n).toBe(0);
    expect(JSON.parse((await store.getItem('hrTrack_run-4')) as string)).toHaveLength(100);
  });

  test('명백한 노이즈(30 이하·240 이상)는 버린다', async () => {
    const bad = {
      startTime: new Date(RUN_START).toISOString(),
      endTime: new Date(RUN_END).toISOString(),
      samples: [
        {time: new Date(RUN_START + 1000).toISOString(), beatsPerMinute: 15},
        {time: new Date(RUN_START + 2000).toISOString(), beatsPerMinute: 300},
        {time: new Date(RUN_START + 3000).toISOString(), beatsPerMinute: 150},
        {time: new Date(RUN_START + 4000).toISOString(), beatsPerMinute: 152},
      ],
    };
    const {hc} = boot(jest.fn().mockResolvedValue({records: [bad]}));

    const n = await hc.hcBackfillHeartRate('run-5', RUN_START, RUN_END);
    expect(n).toBe(2);
  });
});

describe('실패는 조용히 사라지지 않는다', () => {
  test('읽기가 던지면 0 을 돌려주되 계측에 남긴다', async () => {
    const {hc} = boot(jest.fn().mockRejectedValue(new Error('boom')));
    const {reportIssue} = require('../../lib/crashlytics');
    const spy = jest.spyOn(require('../../lib/crashlytics'), 'reportIssue');

    const n = await hc.hcBackfillHeartRate('run-6', RUN_START, RUN_END);

    // 러닝을 막지 않는다 — 심박은 부가 정보다.
    expect(n).toBe(0);
    // 그런데 "깨졌다"와 "워치가 없다"는 구분돼야 한다.
    expect(typeof reportIssue).toBe('function');
    spy.mockRestore();
  });
});
