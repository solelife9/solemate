/**
 * lib/healthkit — Apple 건강 포트 행동 테스트(네이티브 목 기반).
 *
 * 계약:
 *  1) hkLink 는 권한 요청(심박·안정시심박 읽기 + 워크아웃 쓰기) 후 연동 플래그를 영속한다.
 *  2) 미연동이면 백필/워크아웃/안정시심박 전부 no-op(0/false) — 앱 동작에 영향 0.
 *  3) 심박 백필: HK 샘플 → hrTrack_<id>({t초,bpm}) 저장, 기존 hrTrack 있으면 덮지 않음
 *     (워치 컴패니언 실측 우선), 2점 미만·노이즈(bpm≤30/≥240)는 저장 생략.
 *  4) 워크아웃 기록: 러닝 타입(37) + 미터 거리로 저장.
 *  5) 안정시심박: 비현실값(≤25/≥120)은 0.
 * @format
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hkLink, hkLinked, hkBackfillHeartRate, hkSaveRunWorkout, hkRestingHR,
} from '../../lib/healthkit';

const hk = jest.requireMock('@kingstinct/react-native-healthkit');

// 테스트 간 완전 격리 — 전역 setup 은 스토리지를 자동으로 비우지 않고(연동 플래그 누수),
// 단락(기존 hrTrack)으로 소비되지 않은 mockOnce 큐가 다음 테스트로 넘어갈 수 있다.
beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of [hk.requestAuthorization, hk.queryQuantitySamples, hk.queryWorkoutSamples, hk.getMostRecentQuantitySample, hk.saveWorkoutSample]) {
    f.mockReset();
  }
  hk.requestAuthorization.mockResolvedValue(true);
  hk.queryQuantitySamples.mockResolvedValue([]);
  hk.queryWorkoutSamples.mockResolvedValue([]);
  hk.getMostRecentQuantitySample.mockResolvedValue(undefined);
  hk.saveWorkoutSample.mockResolvedValue({});
});

const START = 1_750_000_000_000;
const sample = (offsetSec: number, bpm: number) => ({
  startDate: new Date(START + offsetSec * 1000),
  quantity: bpm,
});

describe('hkLink / hkLinked', () => {
  test('연동 성공 시 플래그 영속 + 읽기/쓰기 권한을 요청한다', async () => {
    expect(await hkLinked()).toBe(false);
    expect(await hkLink()).toBe(true);
    expect(await hkLinked()).toBe(true);
    const req = hk.requestAuthorization.mock.calls[0][0];
    expect(req.toRead).toContain('HKQuantityTypeIdentifierHeartRate');
    expect(req.toRead).toContain('HKQuantityTypeIdentifierRestingHeartRate');
    expect(req.toShare).toContain('HKWorkoutTypeIdentifier');
  });

  test('권한 요청이 던지면 false + 플래그 미기록', async () => {
    hk.requestAuthorization.mockRejectedValueOnce(new Error('denied'));
    expect(await hkLink()).toBe(false);
    expect(await hkLinked()).toBe(false);
  });
});

describe('hkBackfillHeartRate', () => {
  test('미연동이면 no-op(0)', async () => {
    expect(await hkBackfillHeartRate('r1', START, START + 600_000)).toBe(0);
    expect(hk.queryQuantitySamples).not.toHaveBeenCalled();
  });

  test('HK 샘플을 {t초,bpm} hrTrack 으로 저장하고 노이즈는 거른다', async () => {
    await hkLink();
    hk.queryQuantitySamples.mockResolvedValueOnce([
      sample(0, 92), sample(60, 141), sample(120, 300) /* 노이즈 */, sample(180, 155),
    ]);
    const n = await hkBackfillHeartRate('r1', START, START + 600_000);
    expect(n).toBe(3);
    const raw = await AsyncStorage.getItem('hrTrack_r1');
    expect(JSON.parse(raw as string)).toEqual([
      {t: 0, bpm: 92}, {t: 60, bpm: 141}, {t: 180, bpm: 155},
    ]);
  });

  test('기존 hrTrack 이 있으면 덮지 않는다(워치 컴패니언 실측 우선)', async () => {
    await hkLink();
    await AsyncStorage.setItem('hrTrack_r2', JSON.stringify([{t: 0, bpm: 120}, {t: 5, bpm: 121}]));
    hk.queryQuantitySamples.mockResolvedValueOnce([sample(0, 90), sample(60, 95)]);
    expect(await hkBackfillHeartRate('r2', START, START + 600_000)).toBe(0);
    const raw = await AsyncStorage.getItem('hrTrack_r2');
    expect(JSON.parse(raw as string)[0].bpm).toBe(120); // 원본 보존
  });

  test('유효 샘플 2점 미만이면 저장 생략(RunDetail 표시 계약과 동일)', async () => {
    await hkLink();
    hk.queryQuantitySamples.mockResolvedValueOnce([sample(0, 130)]);
    expect(await hkBackfillHeartRate('r3', START, START + 600_000)).toBe(0);
    expect(await AsyncStorage.getItem('hrTrack_r3')).toBeNull();
  });
});

describe('hkSaveRunWorkout', () => {
  test('미연동이면 false, 연동 후 러닝(37)+미터 거리로 저장', async () => {
    expect(await hkSaveRunWorkout(5, START, START + 1_800_000, 320)).toBe(false);
    await hkLink();
    expect(await hkSaveRunWorkout(5, START, START + 1_800_000, 320)).toBe(true);
    const [activity, , start, end, totals] = hk.saveWorkoutSample.mock.calls[0];
    expect(activity).toBe(37); // WorkoutActivityType.running
    expect(start.getTime()).toBe(START);
    expect(end.getTime()).toBe(START + 1_800_000);
    expect(totals).toEqual({distance: 5000, energyBurned: 320});
  });
});

describe('hkRestingHR', () => {
  test('최신 안정시심박을 돌려주고 비현실값은 0', async () => {
    await hkLink();
    hk.getMostRecentQuantitySample.mockResolvedValueOnce({quantity: 52.4});
    expect(await hkRestingHR()).toBe(52);
    hk.getMostRecentQuantitySample.mockResolvedValueOnce({quantity: 240});
    expect(await hkRestingHR()).toBe(0);
    hk.getMostRecentQuantitySample.mockResolvedValueOnce(undefined);
    expect(await hkRestingHR()).toBe(0);
  });
});

describe('hkSaveRunWorkout — 중복 방지(워치 기본 운동 앱 병행)', () => {
  test('같은 시간창에 HK 워크아웃이 이미 있으면 저장을 건너뛴다(이중 집계 방지)', async () => {
    await hkLink();
    hk.queryWorkoutSamples.mockResolvedValueOnce([{uuid: 'w1'}]);
    expect(await hkSaveRunWorkout(5, START, START + 1_800_000)).toBe(false);
    expect(hk.saveWorkoutSample).not.toHaveBeenCalled();
  });
  test('겹치는 워크아웃 조회가 실패해도 저장은 진행(graceful)', async () => {
    await hkLink();
    hk.queryWorkoutSamples.mockRejectedValueOnce(new Error('unavailable'));
    expect(await hkSaveRunWorkout(5, START, START + 1_800_000)).toBe(true);
  });
});
