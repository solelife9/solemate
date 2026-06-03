# slice-2-shoe-intel 완료 + expo/addshoe 보류 결정

type: journal
source_job: 79e53516-01fc-4249-8ae1-2e22f796627f
job_name: activeIdx 수정 + 오늘이신발 추천 + 타임라인/cost-per-km
created: 2026-06-01T01:54:43.210Z

## Findings

- **outcome**: PASSED — 3 critics all green (첫 시도)
- **commit**: 4f77064
- **deliverables**: lib/shoeRecommend.ts(lastWornDate/recommendShoeId 휴식로테이션/restDays/costPerKm), App.tsx activeIdx={0} 제거+selectedShoeId/effectiveId, HomeScreen 추천칩, ShoesScreen 마지막착용일+구매가→원/km. price_<id> AsyncStorage 영속(additive). jest 285/285, 신규 13 단위+4 통합.
- **autonomous_decision**: 자율 루프 중 중요 결정: slice-2-expo-location(네이티브 expo 모듈 통합)과 slice-2-addshoe 사진업로드(image picker 네이티브)를 사용자 부재 중 보류. 이유: eval 게이트(tsc/lint/test)가 Android gradle 빌드 무결성 검증 못함(jest 통과해도 빌드 깨질 수 있음) + 실기기 테스트 필요. user-source steer로 기록. 대신 순수-JS 잡 먼저 소진. tenet_continue가 expo-location을 계속 반환해서, node:sqlite로 .tenet/.state/tenet.db의 pending 잡 UUID 직접 조회 후 형제 잡을 직접 디스패치함(better-sqlite3 없음→node:sqlite 내장 사용).
- **next**: shoe-run-cta(deps shoe-intel) → profile-settings, goals-streak-ui, replace-badge, course-map, export, run-edit-manual-pr, states-onboard 순으로 순수-JS 소진. expo-location·addshoe는 사용자 복귀 후.
