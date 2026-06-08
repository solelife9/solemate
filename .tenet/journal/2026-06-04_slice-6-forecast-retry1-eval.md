# slice-6 forecast 완료 retry1 eval통과

type: journal
source_job: 99d0f58f-fb88-4a4a-86a7-ea45d7678834
job_name: 교체 예측 (lib/replacementForecast)
created: 2026-06-04T11:51:45.782Z

## Findings

- **job**: slice-6-forecast
- **commit_v1**: 2cda5b0
- **commit_retry1**: 2c99135
- **result**: retry1 후 eval 3/3 PASS
- **delivered**: lib/replacementForecast.ts forecastReplacement(wearModel 재사용, 중복구현 0) + __tests__/lib/replacementForecast.test.ts 15 tests
- **retry_reason**: test_critic 차단(test_bug): ok 분기 etaISO를 weeksRemaining과 묶는 불변식 미검증 — days↔weeks 혼동 버그가 통과됨
- **retry_fix**: 구현 불변, 테스트만 4건 보강: (1)eta≈now+weeks*7d toBeCloseTo 불변식[차단해소] (2)weeks 타당성 band(1~520) (3)overdue vs no_recent 우선순위 (4)28일 정확경계(now-28d in, +1ms out)
- **iron_law**: tsc/lint clean, 725/725 전체 pass, target 15/15
- **lesson**: 사용자 노출 수치(ETA 같은 파생값)는 존재/범위 단언만으로 부족 — 출력↔출력 불변식으로 수식 자체를 핀해야 test_critic 통과
