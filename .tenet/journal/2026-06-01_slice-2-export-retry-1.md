# slice-2-export 완료 (retry#1 페이스단위)

type: journal
source_job: ed6d9e56-027b-48a0-8db0-180fe1ac9c79
job_name: 기록 내보내기(Share 텍스트)
created: 2026-06-01T06:42:07.793Z

## Findings

- **outcome**: PASSED (retry#1) — 3 critics green
- **commit**: 5701a8d
- **deliverables**: lib/share.ts buildRunShareText 순수함수(keep-going 한국어 요약) + HistoryScreen 공유 버튼→RN Share. jest 368/368.
- **first_fail**: 1차(22eed4f): code_critic만 product_bug — 페이스 mi 모드 오라벨(fmtPace는 초/km 고정인데 /mi 라벨만 붙여 거짓 통계). 주목: test_critic·playwright는 오히려 /mi를 정답으로 검증하며 통과 — 다중 critic의 적대적 검증이 단일 critic 놓친 버그 잡음.
- **fix**: 페이스 라벨 /km 고정(거리는 mi 환산 유지). 테스트 /mi→/km+not.toContain('/mi'), 실패경로 통합테스트 추가.
- **lesson**: 단위 환산은 '비율'(페이스 초/km, 원/km)과 '거리 값'을 구분. 앱이 per-mile 페이스를 계산안하면 페이스는 /km 유지. 동일 지표가 화면마다 다른 단위면 버그. [[slice-2-profile-settings]] cost-per-km과 동일 패턴.
- **next**: run-edit-manual-pr, states-onboard 남음. 그 다음 expo-location·addshoe(보류)·slice-2-e2e.
