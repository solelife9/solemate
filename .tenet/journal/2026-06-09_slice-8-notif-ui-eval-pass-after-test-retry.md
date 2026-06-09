# Slice 8 notif-ui eval pass after test retry

type: journal
source_job: 56d47dc8-55d6-4752-93fd-e75c22cbbd0e
job_name: ProfileScreen 푸시 알림 설정 + 권한 흐름 + App 배선
created: 2026-06-09T00:07:11.455Z

## Findings

- **job**: slice-8-notif-ui — 완료(retry 1회 후 전 critic green)
- **impl**: ProfileScreen 푸시 알림 설정(교체임박/주간목표/리마인더 토글+시각, 기존 인앱 알림과 공존). App.tsx AppState active→dueNotifications→presentDue, notif_presented 일일 중복방지(디스크 영속+부트 복원), 최초 마운트 미표시(온보딩 독립). 커밋 b3176f3.
- **retry**: test_critic 1차 FAIL(테스트 강화 필요) → 구현 불변으로 테스트만 보강: 초기마운트 미표시 단언(mockClear 전)·settings_alerts 바이트 불변·notif_presented 재시작 넘는 dedup(remount)·shoe_replacement+weekly_goal App레벨 배선. App.notif.test 3→7. 커밋 b59072a.
- **eval**: code/test/playwright 전부 PASS. 전체 832 tests/94 suites green, tsc/lint 0 error, 시크릿0, 데이터파괴0.
- **lesson**: UI 잡은 steer 8992e6cc대로 처음부터 행동 테스트 동반 필수 — 특히 (a) 상태 불변(기존 키 보존), (b) 영속 기반 dedup은 remount로 검증, (c) mockClear 전 미표시 단언을 빼면 test_critic 차단.
- **next**: slice-8-recap-ui (마지막 dev — 리캡 보기+공유카드 svg toDataURL).
