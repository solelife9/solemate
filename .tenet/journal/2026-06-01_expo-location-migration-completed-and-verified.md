# expo-location migration completed and verified

type: journal
source_job: 2fed6fdf-c2de-4da3-9d98-07ca4bd28bbc
job_name: expo-location 마무리(App.tsx 연결+권한복원+테스트)
created: 2026-06-01T15:16:33.325Z

## Findings

- **outcome**: 백그라운드 트래킹 expo-location 교체 완료·검증. 원 DAG job(slice-2-expo-location, 9b31bb01)이 heartbeat stale로 취소돼 retry 불가 → ad-hoc dev job(2fed6fdf)으로 마무리.
- **what_happened**: 1) 첫 stale 워커가 expo SDK56 설치 + Android 네이티브 wiring + lib/runTracker.ts까지 했으나 heartbeat 멈춰 취소. 2) 오케스트레이터가 gradlew assembleDebug로 expo56+RN0.85 네이티브 호환성 GREEN 확인. 3) ad-hoc job이 App.tsx↔runTracker 연결 + lib/locationService.ts(expo foreground watch + task-manager 백그라운드) + AndroidManifest 권한복원 + 테스트. 4) 마무리 커밋이 네이티브 통합 파일(package.json/gradle/MainApplication 등)을 누락 → 오케스트레이터 fallback 커밋(8713720)으로 HEAD 빌드 자기완결성 복원. 5) code_critic 3건 fail(docstring/죽은mock/권한취소 타이머) → retry로 수정(1a2546e). 6) 전체 eval 3 critic PASS + gradle 재빌드 GREEN.
- **commits**: ["9db7717 마무리 배선/테스트","8713720 expo 네이티브 통합 파일 fallback 커밋","1a2546e code_critic 3건 수정"]
- **lessons**: heartbeat 고정(elapsed는 증가해도)이 stale 신호. 워커 마무리 커밋이 이전 워커의 미커밋 더티 파일을 누락할 수 있으니 오케스트레이터가 git show --stat로 커밋 내용 vs 더티 트리를 대조해 fallback 커밋 필요. 네이티브 모듈 dep 제거는 autolinking 바뀌므로 gradle 재검증 필수.
- **remaining**: 실제 야외 백그라운드 GPS 거동은 실기기 최종확인 대기(에뮬레이터 위치주입 1차). 미사용 react-native-geolocation-service dep는 제거 완료.
