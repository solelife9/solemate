/**
 * Jest setup (setupFilesAfterEnv — runs after the test framework is installed,
 * so beforeEach/afterEach are available). Keeps every test isolated.
 */

/* eslint-env jest */

const {
  clearAllMockStorages,
} = require('@react-native-async-storage/async-storage/jest');
const AsyncStorage = require('@react-native-async-storage/async-storage');

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
