module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // 무음 catch 금지(2026-07-26 감사 F-04). 빈 catch 는 '무시하기로 한 것'과 '잊은 것'을
    // 코드에서 구분할 수 없게 만든다 — 저장 공간이 가득 차 캐시 쓰기가 계속 실패해도
    // 흔적이 0이라, 오프라인에서 낡은 데이터가 '현재'로 보이는 CS 를 추적할 수 없었다.
    // 정말 무시해도 되는 실패는 catch { /* 사유 */ } 로 **사유를 남기면** 통과한다.
    'no-empty': ['error', {allowEmptyCatch: false}],
    // console 금지(2026-07-26 감사 F-05). 릴리스 번들은 babel 이 console.log 를 걷어내므로
    // console 로만 남긴 진단은 **정작 사용자 기기에서만 사라진다** — 원인을 알아야 하는
    // 바로 그곳에서 무음이 된다. 진단은 lib/crashlytics 의 reportIssue 로 남긴다
    // (개발=콘솔 · 릴리스=원격, 한 줄로 보장). warn/error 는 RN 내부 경고용으로 허용.
    'no-console': ['error', {allow: ['warn', 'error']}],
    // `void promise()` 는 이 코드베이스의 **정식 관용구**다(2026-07-30). 비차단 호출을
    // "일부러 기다리지 않는다"고 코드에 명시하는 표시이고, 안 붙이면 떠도는 promise 를
    // 실수로 놓친 것과 구분되지 않는다(no-floating-promises 계열 규칙의 표준 해법).
    // 기본 설정은 이걸 전부 경고로 세서 120건이 쌓였고, --max-warnings 상한과 맞물려
    // **관용구를 한 줄 더 쓰면 lint 가 깨지는** 상태였다(여유 1). 표현식 자리의 void
    // (값으로 쓰는 것)는 여전히 잡고, 문(statement) 자리만 허용한다.
    'no-void': ['warn', {allowAsStatement: true}],
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
    {
      // 빌드 스크립트는 콘솔이 곧 출력 수단이다(앱 번들에 포함되지 않는다).
      files: ['scripts/**'],
      rules: {'no-console': 'off'},
    },
  ],
};
