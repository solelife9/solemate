/**
 * Jest setup (setupFilesAfterEnv — runs after the test framework is installed,
 * so beforeEach/afterEach are available). Keeps every test isolated.
 */

/* eslint-env jest */

const {
  clearAllMockStorages,
} = require('@react-native-async-storage/async-storage/jest');
const AsyncStorage = require('@react-native-async-storage/async-storage');

// ── Animated 타이머 누수 차단(전 스위트) ────────────────────────────────────
// JS 드라이버 애니메이션(링 스윕·Rise·TabBar 스프링·토스트 등)은 rAF→setTimeout 으로
// 틱을 돌린다. 테스트가 끝난 뒤에도 남은 틱이 발화하면 "Jest environment torn down" /
// "Cannot log after tests are done"(act 경고)으로 무작위 스위트가 깨진다 — 세션 내내
// 관찰된 간헐 실패의 원인. 테스트에선 timing/spring 을 '즉시 완료'로 바꿔 타이머 자체를
// 만들지 않는다(최종 상태만 관찰하는 기존 단언과 의미 동일).
const {Animated} = require('react-native');
for (const kind of ['timing', 'spring']) {
  const real = Animated[kind];
  Animated[kind] = (value, config) => {
    const anim = real(value, config);
    return {
      ...anim,
      start: (cb) => {
        // 합성값(예: Animated.event 대상)이 아니면 목표값으로 즉시 점프.
        if (value && typeof value.setValue === 'function' && config && config.toValue !== undefined
            && typeof config.toValue !== 'object') {
          value.setValue(config.toValue);
        }
        cb && cb({finished: true});
      },
      stop: () => {},
      reset: () => {},
    };
  };
}

beforeEach(async () => {
  // Drop the in-memory AsyncStorage between tests and clear recorded mock calls
  // (implementations set in jest.setup.js are preserved by clearAllMocks).
  clearAllMockStorages();
  jest.clearAllMocks();
  // audit#9/#10: the default test fixture is a RETURNING user — already onboarded
  // and already shown the location-permission priming. This keeps the existing
  // suites (which mount straight into Home / the live-run flow) unchanged. The
  // dedicated cold-start/onboarding/priming tests opt back into first-run by
  // removing these keys before they mount.
  await AsyncStorage.setItem('onboarded', '1');
  await AsyncStorage.setItem('loc_perm_primed', '1');
});
