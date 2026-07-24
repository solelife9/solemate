module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
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
