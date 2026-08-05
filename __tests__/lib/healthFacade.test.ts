/**
 * 심박 플랫폼 파사드 (2026-08-05)
 *
 * 왜: 안드로이드에는 심박이 아예 없었다. 같은 러닝을 아이폰은 트레이닝 부하 76(심박 기반),
 * 안드로이드는 52(페이스 기반)로 봤고 평균 심박·심박 존·VO2max 는 전부 비었다.
 * 심박 없이 출시하면 안드로이드는 반쪽이다 — 민우님 판단으로 출시 전 필수.
 *
 * lib/health.ts 는 호출부(App·ProfileScreen 45곳)가 플랫폼을 모르게 하는 파사드다.
 * 여기서 못 박는 건 **어느 구현으로 갈라지는가** 하나다 — 각 구현의 내부 동작이 아니라.
 * 갈림이 틀어지면 한쪽 플랫폼의 심박이 통째로 죽는데, 그건 조용히 죽는 종류다
 * (모든 함수가 실패 시 0/false 를 반환하도록 설계돼 있어 예외가 안 올라온다).
 *
 * @format
 */
describe('lib/health 파사드는 플랫폼에 맞는 구현으로 간다', () => {
  afterEach(() => jest.resetModules());

  // ⚠️ 순서가 중요하다. jest.resetModules() 는 react-native 도 새로 불러오므로,
  // 리셋 **전에** Platform.OS 를 바꾸면 버려질 옛 객체를 고치는 셈이 된다(그래서 안드로이드
  // 분기가 안 잡혔다). 반드시 리셋한 뒤 새 인스턴스에 심는다.
  function load(os: string) {
    jest.resetModules();
    const RN = require('react-native');
    Object.defineProperty(RN.Platform, 'OS', {value: os, configurable: true});
    const hk = require('../../lib/healthkit');
    const hc = require('../../lib/healthConnect');
    const facade = require('../../lib/health');
    return {hk, hc, facade};
  }

  test('안드로이드: Health Connect 구현이 불린다', async () => {
    const {hc, facade} = load('android');
    const spy = jest.spyOn(hc, 'hcBackfillHeartRate').mockResolvedValue(7 as never);
    await expect(facade.hkBackfillHeartRate('run-1', 1000, 2000)).resolves.toBe(7);
    expect(spy).toHaveBeenCalledWith('run-1', 1000, 2000);
  });

  test('iOS: HealthKit 구현이 불린다(회귀 금지 — 검증된 경로)', async () => {
    const {hk, facade} = load('ios');
    const spy = jest.spyOn(hk, 'hkBackfillHeartRate').mockResolvedValue(5 as never);
    await expect(facade.hkBackfillHeartRate('run-2', 10, 20)).resolves.toBe(5);
    expect(spy).toHaveBeenCalledWith('run-2', 10, 20);
  });

  test('안정시 심박·워크아웃 저장도 같은 규칙으로 갈라진다', async () => {
    const {hc, facade} = load('android');
    jest.spyOn(hc, 'hcRestingHR').mockResolvedValue(48 as never);
    jest.spyOn(hc, 'hcSaveRunWorkout').mockResolvedValue(true as never);
    await expect(facade.hkRestingHR()).resolves.toBe(48);
    await expect(facade.hkSaveRunWorkout(5, 100, 200, 300)).resolves.toBe(true);
  });

  test('Health Connect 미설치 상태는 안드로이드에만 존재하는 개념이다', async () => {
    // iOS 에는 '창고 앱 미설치' 라는 상태가 없다 — 항상 false 로 답해 화면이 안내를 띄우지 않게.
    const {facade} = load('ios');
    await expect(facade.healthStoreReady()).resolves.toBe(false);
  });

  test('설정 열기는 iOS 에서 아무 일도 하지 않는다(크래시 금지)', () => {
    const {facade} = load('ios');
    expect(() => facade.openHealthStoreSettings()).not.toThrow();
  });
});

describe('healthConnect 는 모듈이 없어도 조용히 실패한다', () => {
  afterEach(() => jest.resetModules());

  test('네이티브 모듈 결측(jest 환경)에서 throw 하지 않고 0/false 를 준다', async () => {
    // 심박은 부가 정보이고 러닝 기록이 본질이다. 심박 경로의 예외가 러닝으로 올라가면 안 된다.
    jest.resetModules();
    const RN = require('react-native');
    Object.defineProperty(RN.Platform, 'OS', {value: 'android', configurable: true});
    const hc = require('../../lib/healthConnect');
    // hcAvailable 은 **JS 모듈 존재**만 본다(동기 판정이라 네이티브를 물어볼 수 없다).
    // jest 에서는 패키지가 설치돼 있으므로 true 다 — 여기서 검증할 것은 그 다음, 즉
    // 네이티브가 없을 때 실제 호출들이 예외 없이 안전하게 떨어지느냐다.
    expect(() => hc.hcAvailable()).not.toThrow();
    await expect(hc.hcSdkReady()).resolves.toBe(false);
    await expect(hc.hcLinked()).resolves.toBe(false);
    await expect(hc.hcRestingHR()).resolves.toBe(0);
    await expect(hc.hcBackfillHeartRate('r', 1, 2)).resolves.toBe(0);
    await expect(hc.hcSaveRunWorkout(5, 1, 2)).resolves.toBe(false);
    await expect(hc.hcFindRunWorkoutWindow('2026-08-05', 1800)).resolves.toBeNull();
    expect(() => hc.hcOpenSettings()).not.toThrow();
  });
});
