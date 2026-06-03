# slice-3-theme-primitives done (retry 1)

type: journal
source_job: 2bc14bdc-3296-4ea3-9896-f5b2c86b9827
job_name: theme flip(Pretendard 통일) + primitives 확장
created: 2026-06-01T23:08:21.934Z

## Findings

- **outcome**: slice-3-theme-primitives 완료·eval 3/3 PASS (retry 1). 커밋 0c0b8ea.
- **deliverables**: theme.ts UNIFY_DISPLAY_FONT=true(DISPLAY===FONT Pretendard, Bebas 은퇴) + withAlpha(hex,alpha) 헬퍼. primitives.tsx 확장(Button cta/ghost, Card, Pill+TONE_BG, Metric, KeegoWordmark, SectionTitle, conditionColor/conditionTone). TONE_BG는 withAlpha(GOOD/WARN/DANGER/ACCENT,0.15)로 토큰 파생(단일 진실원).
- **retry_reason**: 초회 eval 2건 차단: (1) code_critic product_bug=TONE_BG가 rgba 리터럴로 토큰 수동복제→withAlpha 파생으로 수정. (2) test_critic test_bug=신규 primitives 행동테스트 0개→__tests__/primitives.test.tsx 12케이스 신설. (3) playwright caveat harness_bug=slice-3-design.test.ts fs/path가 @types/node 없어 tsc 전역 RED→npm i -D @types/node + tsconfig types에 'node' 추가로 tsc exit 0.
- **gates**: tsc exit 0, lint 0 errors, jest 443 passed(primitives 12/12). 남은 7 실패는 화면파일(6 raw-hex + HomeScreen SOLEMATE)로 형제 잡(slice-3-home 등) 소관.
- **advisory_nonblocking**: test_critic 잔여 advisory(통과엔 무관): conditionColor default 분기('알수없음'→GOOD) 미테스트, Metric baseline 테스트가 findAllByType(View)[0] 의존으로 브리틀. 후속 polish 잡에서 보강 가능.
- **design**: 다크(#000)+오렌지(#FF6500) 유지 — light redirect 철회됨.
- **next**: slice-3-home/shoes-addshoe/run/history-profile 4개 화면 잡 unblocked(theme-primitives 의존 충족). @types/node 이제 가용하므로 acceptance 테스트 tsc green.
