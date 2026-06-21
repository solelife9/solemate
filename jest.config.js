module.exports = {
  preset: '@react-native/jest-preset',
  // Native/device mocks load before the framework; per-test reset loads after.
  // Jest concatenates these with the preset's own setup arrays.
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.after.js'],
  // 공용 테스트 헬퍼(__tests__/helpers/)는 테스트 스위트가 아니므로 기본 testMatch 에서 제외한다.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/helpers/'],
  // Let babel transform the async-storage package so its official ESM jest mock
  // parses; everything else keeps the React Native preset's defaults.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage)/)',
  ],
};
