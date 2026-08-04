module.exports = {
  preset: '@react-native/jest-preset',
  // ── 테스트 1건 제한 시간 30초(2026-08-04, CI 3회 실패로 확정) ────────────────
  // jest 기본값 5초는 **개발 기기 속도를 전제한 값**이다. 이 저장소에는 App 트리를 통째로
  // 렌더하는 스위트가 여럿 있어(App.bootcache · audit-hardening 등) 로컬에서도 스위트 하나가
  // 5초를 넘긴다. GitHub 러너는 그보다 4~10배 느리다 — 실측 대조:
  //
  //     tests/acceptance/audit-hardening   로컬 5.5s   →  러너 19.9s
  //     __tests__/lib/runTracker            로컬 <1s    →  러너 25.3s
  //     __tests__/App.bootcache             로컬 <1s    →  러너 45.5s
  //
  // 그래서 러너에서만 개별 테스트가 5초를 넘겨 줄줄이 터졌다(관측된 CI 실패는 **전부**
  // "Exceeded timeout of 5000 ms" 였다. 단언 실패는 한 건도 없었다). 그리고 그 타임아웃
  // 무더기 **뒤에** 잡이 통째로 멎었다 — act() 안에서 중단된 테스트가 뒤를 물고 늘어졌다.
  //
  // 30초는 느린 기기를 위한 여유이지 단언을 무르게 하는 값이 아니다. 진짜로 멈춘 테스트는
  // 여전히 실패한다(5초 대신 30초 걸릴 뿐이다).
  // ⚠️ CLI 플래그가 아니라 여기 두는 이유: 로컬과 CI 가 **같은 값**을 쓰게 하기 위해서다.
  //    한쪽만 느슨하면 "로컬은 그린인데 CI 만 빨갛다"가 다시 생긴다.
  testTimeout: 30000,
  // Native/device mocks load before the framework; per-test reset loads after.
  // Jest concatenates these with the preset's own setup arrays.
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.after.js'],
  // 공용 테스트 헬퍼(__tests__/helpers/)는 테스트 스위트가 아니므로 기본 testMatch 에서 제외한다.
  // tests/rules/ 는 Firestore 에뮬레이터가 필요한 규칙 계약 테스트다 — 기본 스위트에서 제외하고
  // `npm run test:rules` 로 따로 돌린다(jest.rules.config.js).
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/__tests__/helpers/',
    '<rootDir>/tests/rules/',
  ],
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
