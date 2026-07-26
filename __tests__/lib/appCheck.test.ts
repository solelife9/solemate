/**
 * App Check 활성화 계약(2026-07-26 출시 심사 B-07).
 *
 * 관찰:
 *   1) 릴리스 빌드는 App Attest(디바이스체크 폴백) / Play Integrity 로 설정한다.
 *   2) 개발 빌드는 debug provider — 시뮬레이터에서 App Attest 가 불가능하다.
 *   3) 토큰 자동 갱신을 켠다(러닝 중 만료로 동기화가 끊기지 않게).
 *   4) 한 번만 활성화한다(중복 호출 무시).
 *   5) 초기화가 실패해도 throw 하지 않는다 — 보안 코드가 앱을 죽이면 안 된다.
 *
 * @format
 */
import {activateAppCheck, isAppCheckActivated, __resetAppCheckForTests} from '../../lib/appCheck';

const appCheck = require('@react-native-firebase/app-check');

beforeEach(() => {
  __resetAppCheckForTests();
  appCheck.initializeAppCheck.mockClear();
  appCheck.initializeAppCheck.mockImplementation(() => Promise.resolve({__appCheck: true}));
});

/** initializeAppCheck 에 넘어간 옵션(provider 포함). */
function lastOptions(): any {
  const calls = appCheck.initializeAppCheck.mock.calls;
  return calls[calls.length - 1][1];
}

test('릴리스 빌드는 App Attest(폴백) / Play Integrity 를 쓴다', async () => {
  const ok = await activateAppCheck(false);
  expect(ok).toBe(true);
  const opts = lastOptions();
  expect(opts.provider.providerOptions).toEqual({
    apple: {provider: 'appAttestWithDeviceCheckFallback'},
    android: {provider: 'playIntegrity'},
  });
});

test('개발 빌드는 debug provider 를 쓴다(시뮬레이터 대응)', async () => {
  const ok = await activateAppCheck(true);
  expect(ok).toBe(true);
  expect(lastOptions().provider.providerOptions).toEqual({
    apple: {provider: 'debug'},
    android: {provider: 'debug'},
  });
});

test('토큰 자동 갱신을 켠다', async () => {
  await activateAppCheck(false);
  expect(lastOptions().isTokenAutoRefreshEnabled).toBe(true);
});

test('두 번 불러도 한 번만 활성화한다', async () => {
  await activateAppCheck(false);
  await activateAppCheck(false);
  expect(appCheck.initializeAppCheck).toHaveBeenCalledTimes(1);
  expect(isAppCheckActivated()).toBe(true);
});

test('초기화 실패는 삼키고 false 를 돌려준다(앱은 계속 동작)', async () => {
  appCheck.initializeAppCheck.mockImplementationOnce(() => Promise.reject(new Error('no attest')));
  await expect(activateAppCheck(false)).resolves.toBe(false);
  expect(isAppCheckActivated()).toBe(false);
});

test('실패 뒤 재시도가 가능하다', async () => {
  appCheck.initializeAppCheck.mockImplementationOnce(() => Promise.reject(new Error('flaky')));
  await activateAppCheck(false);
  await expect(activateAppCheck(false)).resolves.toBe(true);
});
