# slice-2-profile-settings 완료 (retry#1)

type: journal
source_job: 91c4031b-86ec-4e98-9ee5-ddc298529ff2
job_name: ProfileScreen 설정 4행 실동작
created: 2026-06-01T03:31:49.992Z

## Findings

- **outcome**: PASSED (retry#1) — 3 critics all green
- **commit**: 42f8e8e
- **deliverables**: ProfileScreen 설정 4행 실동작(목표/알림/단위/계정), lib/settings.ts, lib/units 확장(unitKorean/displayNum), App가 설정 소유+영속+unit 주입. jest 35 suites/320.
- **first_fail**: 1차(f896f61): code product_bug — ShoesScreen:183 cost-per-km 힌트가 사용거리 하드코딩 km로 표시(mi 전환 시 한 화면 두 단위). test 4 gap: 환산 숫자값 미검증+lib/units 무테스트, 임계값 미검증, checkShoeAlerts on/off 미검증, 계정행 미검증.
- **fix**: usedDisp+unit 환산(비용 비율 '1km당'은 km 유지). units.test.ts 신규, App.settings 환산숫자값+계정행+cost 회귀, App.alerts.test.tsx 신규(임계값 75% 발화/on-off 효과). critic이 fix revert해 회귀 테스트 실패 확인.
- **lesson**: 단위 환산 기능은 '비율'(원/km, 페이스 /km)과 '거리 값'을 구분 — 거리는 환산, 비율은 km 유지. 한 화면 안 한 지표가 두 단위로 나오면 버그.
- **next**: goals-streak-ui, replace-badge, course-map, export, run-edit-manual-pr, states-onboard 남음.
