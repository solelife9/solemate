module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // 무음 catch 금지(2026-07-26 감사 F-04). 빈 catch 는 '무시하기로 한 것'과 '잊은 것'을
    // 코드에서 구분할 수 없게 만든다 — 저장 공간이 가득 차 캐시 쓰기가 계속 실패해도
    // 흔적이 0이라, 오프라인에서 낡은 데이터가 '현재'로 보이는 CS 를 추적할 수 없었다.
    // 정말 무시해도 되는 실패는 catch { /* 사유 */ } 로 **사유를 남기면** 통과한다.
    'no-empty': ['error', {allowEmptyCatch: false}],
    // Dynamic Type 정책(DESIGN.md §6.7): Text/TextInput 은 lib/text 래퍼 경유 강제 —
    // RN 직수입은 시스템 글꼴 배율 무제한(레이아웃 파괴) + 라이트 키보드 회귀를 만든다.
    // TS 변형을 쓰는 이유: ref 인스턴스 타입 등 `import type` 은 허용해야 해서.
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native',
            importNames: ['Text', 'TextInput'],
            allowTypeImports: true,
            message:
              "Text/TextInput 은 'lib/text' 래퍼에서 import 하세요 (Dynamic Type 상한 + 다크 키보드 — DESIGN.md §6.7).",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // 래퍼 자신과 테스트는 RN 원본 접근 허용.
      files: ['lib/text.tsx', '__tests__/**', 'tests/**'],
      rules: {'@typescript-eslint/no-restricted-imports': 'off'},
    },
  ],
};
