# slice-1 백그라운드 트래킹 — expo-location 교체 마무리

type: journal
job_name: 백그라운드 트래킹 expo-location 교체 (pro-overhaul 마무리)
date: 2026-06-01
result: success

## 배경

이전 재스코프(rescope)에서는 react-native-geolocation-service@5.3.1에 포그라운드
서비스가 없어 백그라운드 트래킹을 "forward-prep no-op"으로 축소했었다. 이번 job은
expo-location 교체로 **실제 화면off 트래킹을 동작**하게 마무리하는 것이다. 설치·네이티브
통합·엔진(lib/runTracker.ts) 작성은 선행 워커가 완료(gradle assembleDebug GREEN)했고,
heartbeat stale로 취소돼 **남은 wiring/권한/테스트만** 완성했다(처음부터 재작성 금지 준수).

## 완성한 것

1. **App.tsx ↔ runTracker 연결**: RunActiveScreen의 인라인 엔진 + react-native-geolocation-service
   watchPosition을 제거하고, 공유 엔진(`runTracker`)을 `subscribe`로 구독해 거리/시간/일시정지/
   死구간/권한 회수 상태를 화면에 반영. 케이던스(가속도계)만 화면이 소유하고 `setMeta`로 엔진에
   전달. TTS(시작/구간/일시정지·재개)와 역지오코딩은 엔진 이벤트(firstFix/paused/resumed)에 연결.
2. **lib/locationService.ts**: expo-location/expo-task-manager delivery 레이어.
   - foreground: `Location.watchPositionAsync` → `runTracker.ingestFix`
   - background(화면off): 모듈 스코프 `TaskManager.defineTask` + `Location.startLocationUpdatesAsync`
     (`foregroundService` notification) → 같은 엔진. 타임스탬프 de-dup으로 이중 계산 방지.
   - `requestRunPermissions`(foreground 필수 / background graceful), `isPermissionError`, `stopTracking`.
3. **AndroidManifest**: `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_LOCATION`/`ACCESS_BACKGROUND_LOCATION`
   복원. location 타입 `<service>`는 expo-location 매니페스트가 머지하므로 직접 선언 안 함
   (uses-permission만 추가 → 머지 충돌 없음). fine 게이트·graceful 거부 유지.
4. **테스트(jest)**: `lib/runTracker.test.ts`(순수 엔진: 워밍업/거리누적/de-dup/일시정지/자동정지/
   권한정지/이벤트), `lib/locationService.test.ts`(expo 모킹: foreground fix→거리, 백그라운드 task
   배치 전달·error 배치 무시, 권한 graceful, stop 정리). 기존 GPS 결합 테스트(gps/autopause/
   foreground/permission/coldstart/runsnapshot/harness)를 expo-location API로 갱신. jest.setup.js에
   expo-location/expo-task-manager 모킹 추가.

## 게이트

- `npx tsc --noEmit` GREEN
- `npm run lint` GREEN (0 errors)
- `npx jest` GREEN — 45 suites / 403 tests

네이티브 빌드는 매니페스트 권한 추가(<service> 미선언)뿐이라 머지 충돌 위험 없음 — 오케스트레이터가
`gradlew :app:assembleDebug`로 재검증.
