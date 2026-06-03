# slice-3-e2e heartrate UI hidden blocking finding fixed

type: journal
source_job: 0e173f3b-405f-47c4-9e23-e3508dd6c8be
job_name: blocking finding follow-up for 통합검증: Slice 3 (디자인 수용 sweep)
created: 2026-06-02T01:11:26.992Z

## Findings

- **outcome**: slice-3-e2e 통합검증의 blocking finding(심박 UI 노출) 해결·eval 3/3 PASS. child 수정잡 커밋 6e3a802.
- **finding**: slice-3-e2e(report-only) code_critic이 HistoryScreen.rn.tsx run-detail이 '평균 심박 152bpm/--'를 렌더 — spec #15/iron law #17 '심박 UI 숨김' 위반. 더구나 heartRatePreserved.test가 그 위반 UI 존재를 단언해 결함을 잠그고 있었음. 게이트 green(510/510)이어도 수용기준 위반 상존.
- **resolution**: report-only 부모가 tenet_report_blocking_finding → child dev 수정잡 자동 생성. child: (1)HistoryScreen stats에서 '평균 심박' 행 제거(데이터 Run.bpm/heart_rate 타입·저장 보존), (2)heartRatePreserved.test 프레젠테이션 단언 반전(심박 UI 부재+케이던스 positive control), 저장/컴파일 보존 가드 유지, (3)RunScreen 심박 UI 부재 가드 추가.
- **gates**: tsc 0, lint 0, jest 511/511, acceptance 60/60. 심박 UI 전역 숨김 완성(Run+History), 데이터 보존.
- **key_lesson**: iron law #17 같은 'UI 숨김 + 데이터 보존' 요구는 보존 증명을 저장/타입 레이어로 해야 하며, 프레젠테이션 레이어로 보존 단언하면 오히려 'UI 숨김' 위반을 잠그는 함정. slice-3-run의 heartRatePreserved.test가 바로 그 함정이었고 e2e 통합검증이 잡아냄. report-only blocking finding 플로우(escalate→child→부모 재개)가 제대로 작동.
- **next**: report-only 부모(slice-3-e2e) 재개·재디스패치 → PASS 시 Slice 3 done → 최종 use-checkpoint(실기기 GPS 백그라운드).
