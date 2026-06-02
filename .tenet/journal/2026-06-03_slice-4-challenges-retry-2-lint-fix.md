# slice-4-challenges — retry 2 (lint fix, iron law)

## 차단
- `npm run lint`(=eslint . 전체)가 **exit 1**. 원본 커밋 5c6842b부터 잔존.
- `ChallengesSection.tsx`가 `SPACE`(theme), `SectionTitle`(primitives)를 import 하지만
  **미사용** → `@typescript-eslint/no-unused-vars` **error** 2건.
- 앞선 평가들이 변경 파일만 lint 해서 전체 exit 1을 놓침. playwright_eval이 전체 lint로 발견.

## 수정
- grep으로 두 심볼이 import 행에만 등장(본문 미사용) 확인 후 import에서 제거.
  - L12: `…, RADIUS, SPACE, withAlpha` → `…, RADIUS, withAlpha`
  - L13: `{Ring, Pill, SectionTitle}` → `{Ring, Pill}`
- 로직·UI·스타일 변경 없음.

## 검증 (iron law green)
- `npm run lint`(eslint . 전체): **0 errors** (115 warnings only), exit 0
- `npx tsc --noEmit`: exit 0
- `npm test`: **69 suites / 614 tests** all pass
- 데이터 키 변경 0, 네이티브 의존 0
