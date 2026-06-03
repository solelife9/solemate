# slice-2-states-onboard 완료 + 네이티브 잡 재개

type: journal
source_job: adaefcb6-2ec9-49d3-bf99-2219384d2772
job_name: 로딩/에러 상태 + 온보딩 + 서버 truth
created: 2026-06-01T14:07:36.255Z

## Findings

- **outcome**: PASSED — 3 critics 모두 green (code/test/playwright)
- **commit**: fd798c6
- **deliverables**: 콜드백엔드 BootState(loading→skeleton/error→retry card/empty≠error), 위치권한 priming(OS 다이얼로그 전 한국어 사유), 첫실행 온보딩(신발등록→수명차감), 서버 truth(BackendShoe.total_km/run_time, shoeHealth가 서버 total_km 우선, durationLabel). jest 43스위트/388테스트, tsc0/eslint0.
- **session_change**: 사용자 복귀 + Pixel_7 에뮬레이터(emulator-5554) 부팅 완료 + ANDROID_HOME 설정. 이전 세션이 보류했던 네이티브 잡(slice-2-expo-location, slice-2-addshoe 사진picker)을 이제 진행 — 각 잡 완료 후 eval에 더해 오케스트레이터가 직접 gradle 빌드(run-android)로 빌드 무결성 검증.
- **out_of_scope_note**: code_critic이 비차단 관찰: 향후 백엔드가 total_km를 채우면 in-session 새 런이 다음 initUser refetch 전까지 마모에 반영 안 됨. 현재 백엔드는 해당 필드 미제공(fallback 활성)이라 무해, 점진 마이그레이션 설계 의도와 일치. Phase2 백엔드 작업 시 재검토.
- **next**: expo-location(expo 모듈 통합·백그라운드 트래킹) → 에뮬레이터 gradle 빌드 검증 → addshoe(expo-image-picker) → slice-2-e2e
