module.exports = {
  preset: '@react-native/jest-preset',
  // Native/device mocks load before the framework; per-test reset loads after.
  // Jest concatenates these with the preset's own setup arrays.
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.after.js'],
  // Let babel transform the async-storage package so its official ESM jest mock
  // parses; everything else keeps the React Native preset's defaults.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage)/)',
  ],
};
