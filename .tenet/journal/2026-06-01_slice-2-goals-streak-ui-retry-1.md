# slice-2-goals-streak-ui 완료 (retry#1 테스트보강)

type: journal
source_job: 27576310-fc68-4833-867d-fe6b79e43aab
job_name: 목표 달성률 + 스트릭 UI
created: 2026-06-01T04:36:12.034Z

## Findings

- **outcome**: PASSED (retry#1) — 3 critics green
- **product_commit**: eb7aa3f
- **test_commit**: f80f388
- **deliverables**: HomeScreen WeeklyGoal: primitives.Ring 달성%(100% GOOD 녹색)+flame 스트릭 칩, App currentStreak/weeklyProgress 주입. jest 329/329.
- **first_fail**: 1차: code/playwright 통과, test_critic만 4 test_bug — 주간윈도/스트릭 gap/초과/GOOD색 미증명(모든 런이 TODAY라 전체합 구현도 통과했을 것).
- **fix**: 제품코드 불변, App.goals.test.tsx에 5종 통합 추가(주간 isoOffset(10) 제외, gap→1일, 150% 클램프, GOOD 색전환, mi불변). 뜪e턴(전체합/distinct-day)으로 실패 확인해 식별력 입증.
- **lesson**: 통합 테스트가 '주간'·'연속' 같은 핵심 의미를 증명하려면 그 의미가 깨지는 데이터(윈도 밖 런/gap)를 포함해야 함. happy-path만으로는 vacuous. 순수함수 단위테스트가 있어도 통합 레벨 재증명을 critic이 요구함.
- **next**: replace-badge, course-map, export, run-edit-manual-pr, states-onboard 남음.
