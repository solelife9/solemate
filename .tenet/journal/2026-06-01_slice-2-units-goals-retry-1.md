# slice-2-units-goals 완료 (retry#1 통과)

type: journal
source_job: 2f61f432-45db-41dc-a973-bbe87549650a
job_name: 단위/목표/스트릭/PR 순수함수
created: 2026-06-01T00:44:00.963Z

## Findings

- **outcome**: PASSED (retry#1) — 3 critics all green
- **commit**: 685e235
- **deliverables**: lib/units.ts(kmToDisplay/displayToKm/fmtDistance, KM_PER_MI=1.60934), lib/goals.ts(weeklyProgress/currentStreak/personalRecords). 이제 slice-2-features.test.ts의 lib/units·lib/goals import 해소, jest 265/265.
- **first_attempt_fail**: 1차(400752b) code_critic product_bug: currentStreak가 0km 날을 스트릭에 포함(정책 위반, [{km:5},{km:0}]→2 대신 0이어야 함). test_critic 4 test_bug: displayToKm 무테스트, currentStreak 정책 미검증(이름과 다름), weeklyProgress mondayISO 경계 미검증, fmtDistance 값 미검증.
- **fix**: currentStreak day-set에 km>0 필터, weeklyProgress km<=0 제외, personalRecords.longest km>0만. 테스트 5종 강화(round-trip, 0km→toBe(0), gap→toBe(1), 정확한 toBe(2), 주경계 toBe(12), fmtDistance '3.1 mi'). critic들이 pre-fix에서 테스트 실패 확인(vacuous 아님).
- **lesson**: 계약 테스트 이름이 '정책 확인'이라 해도 loose assertion(>=2, 라벨만 체크)이면 정책을 실제로 검증 안 함 — oracle leakage. eval이 잘 잡아냄.
