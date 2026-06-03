# slice-3-home done (retry 1)

type: journal
source_job: f8615cd5-fdce-4c4b-9121-22c6b3bf97ce
job_name: HomeScreen 토큰화 + shoe-first 시각 주인공
created: 2026-06-01T23:24:34.171Z

## Findings

- **outcome**: slice-3-home 완료·eval 3/3 PASS (retry 1). 구현 커밋 f1f39ec + 테스트 커밋 b33aea2.
- **deliverables**: HomeScreen.rn.tsx 토큰화(#fff→T1, 인라인 rgba→withAlpha, SPACE/RADIUS), SOLEMATE 제거→KeegoWordmark, CTA→Button, conditionColor/SectionTitle 채택, 오렌지 절제(라벨 T3). shoe-first 히어=실 activeIdx.
- **retry_reason**: 초회 test_critic test_bug 차단: 인터랙티브 요소(CTA Button 전환·activeIdx 히어) 무테스트. retry에서 __tests__/HomeScreen.test.tsx 7케이스 추가(onStart(activeIdx) idx0·1, 히어 신발/링% swap+99 clamp, KeegoWordmark 직접렌더, T3 라벨). HomeScreen.rn.tsx엔 testID='home-hero'만 추가.
- **gates**: tsc exit 0, lint 0 errors, jest 452 passed(HomeScreen.test 7/7). slice-3-design.test 잔여 실패 5건은 형제 화면(Shoes/Run/Profile/History/AddShoe raw-hex) — 후속 잡.
- **pattern_note**: Slice 3 화면 잡은 토큰화만이 아니라 교체한 인터랙티브 요소(Button 등)의 행동테스트를 동반해야 test_critic 통과. 후속 shoes/run/history-profile 잡도 교체한 CTA/인터랙션 테스트 포함 권장.
- **next**: slice-3-shoes-addshoe 다음.
