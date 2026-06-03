# slice-2-replace-badge 완료

type: journal
source_job: c3945152-84e4-4c94-9ea9-8c26c5e1b39a
job_name: 신발 교체 알림 배지 + 임계값
created: 2026-06-01T05:08:57.052Z

## Findings

- **outcome**: PASSED — 3 critics green (첫 시도)
- **commit**: 2d073e8
- **deliverables**: primitives TierBadge(주의/교체, 양호×) → 홈 hero+신발 카드/상세. ShoeDetail max_km +/- 스테퍼(단위인식, 100~2000 클램프)→티어 즉시 재파생+낙관적 PATCH. 하루1회 Alert→reconcileShoeAlerts 순수 per-shoe 추적(shoe_alert_notified set). keep-going 카피. jest 345/345.
- **nonblocking**: test_critic 3 강화 제안(비차단): 목록 카드 배지 고립 단언 없음, 스테퍼 mi 모드 미검증, 임계 표시 값 미검증. 향후 개선 가능.
- **next**: course-map, export, run-edit-manual-pr, states-onboard 남음. 그 다음 expo-location·addshoe(보류)·slice-2-e2e.
