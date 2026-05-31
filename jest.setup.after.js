/**
 * Jest setup (setupFilesAfterEnv — runs after the test framework is installed,
 * so beforeEach/afterEach are available). Keeps every test isolated.
 */

/* eslint-env jest */

const {
  clearAllMockStorages,
} = require('@react-native-async-storage/async-storage/jest');

beforeEach(() => {
  // Drop the in-memory AsyncStorage between tests and clear recorded mock calls
  // (implementations set in jest.setup.js are preserved by clearAllMocks).
  clearAllMockStorages();
  jest.clearAllMocks();
});
