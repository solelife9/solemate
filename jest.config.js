module.exports = {
  preset: '@react-native/jest-preset',
  // Native/device mocks load before the framework; per-test reset loads after.
  // Jest concatenates these with the preset's own setup arrays.
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.after.js'],
  // 공용 테스트 헬퍼(__tests__/helpers/)는 테스트 스위트가 아니므로 기본 testMatch 에서 제외한다.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/helpers/'],
  // 번들 오디오 클립(assets/voice/*.mp3) — jest 는 .mp3 트랜스포머가 없어 JS 로 파싱하다 깨진다.
  // require 결과를 더미 숫자(에셋 핸들 모사)로 매핑한다.
  moduleNameMapper: {
    '\\.(mp3|wav|m4a|aac|ogg)$': '<rootDir>/__mocks__/audioFileMock.js',
  },
  // Let babel transform the async-storage package so its official ESM jest mock
  // parses; everything else keeps the React Native preset's defaults.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage)/)',
  ],
};
