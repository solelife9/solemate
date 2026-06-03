# 테스트에서 global 대신 globalThis 사용

type: knowledge
source_job: e966567c-ce94-4351-8fe4-4f9e1a1e6af8
job_name: jest 네이티브 모킹 셋업
confidence: implemented-and-tested
created: 2026-05-31T16:11:20.105Z

## Findings

- **issue**: tsconfig.json이 types:["jest"]만 선언 → @types/node 제외 → 테스트(.tsx/.ts)에서 `global` 참조 시 tsc TS2304 'Cannot find name global'. babel-jest는 타입 제거해 jest는 통과하지만 `npx tsc --noEmit`(iron law)가 깨짐.
- **fix**: 테스트 코드에서 `global.fetch` 등 `global` 대신 **`globalThis`** 사용(예: `(globalThis.fetch as jest.Mock)`). globalThis는 표준 lib 글로벌로 @types/node 불필요. tsconfig는 건들지 말 것(side-effect 회피).
- **applies_to**: Slice 1~3의 모든 테스트 작성 job(fix-filter, auto-pause, cadence, shoe-health, run-persistence 등). jest 모킹은 jest.setup.js(.js, tsc 미철크)에 있으나 테스트파일(.tsx)에서 global 참조 금지.
