# react-native-geolocation-service@5.3.1은 포그라운드 서비스를 내장하지 않음

type: knowledge
job_name: 백그라운드 트래킹(포그라운드 서비스) (slice-1-background-track)
confidence: implemented-and-tested
created: 2026-06-01

## Findings

- **issue**: audit#1은 "react-native-geolocation-service의 foregroundService 옵션 + notification 채널"로 화면off/백그라운드 기록을 켜는 것을 전제하나, 설치된 **v5.3.1(5.x 마지막 릴리스, 2022-09 이후 미유지보수)**의 네이티브 소스에는 포그라운드 서비스가 **전혀 없다**. 근거:
  - `android/.../RNFusedLocation/*.java` 전체에 `startForeground` / `Notification` / `ForegroundService` 문자열 0건.
  - `LocationOptions.fromReadableMap`은 알려진 키(interval/accuracy/distanceFilter 등)만 읽고 **미지의 키는 조용히 무시** → `foregroundService` 옵션을 넘겨도 크래시는 없으나 동작도 없다(no-op).
  - README/CHANGELOG에 foregroundService 항목 없음.
- **결정(이번 job 범위)**:
  - JS: `lib/foregroundService.ts`(순수, 테스트됨)로 `foregroundService` 설정(channelId/title/body)과 `needsBackgroundLocationPermission(platform,api)`를 분리. App.tsx가 watchPosition 옵션에 `foregroundService`를 부착하고, Android 10+에서 ACCESS_BACKGROUND_LOCATION을 **graceful(거부해도 트래킹 계속, 기존 fine-location 게이트 회귀 금지)** 로 요청.
  - Manifest: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` 권한 선언(승인된 예외). **`<service>` 선언은 보류** — v5.3.1은 실재 서비스 클래스를 제공하지 않아 임의 클래스명을 선언하면 런타임 크래시 위험. AndroidManifest에 사유를 주석으로 남김.
- **남은 작업(follow-up, 이번 job 범위 밖 = 매니페스트-only 승인 예외를 넘는 네이티브 코드)**: 화면off/백그라운드 기록이 **실제로** 지속되려면 둘 중 하나 필요 —
  1. location 타입 포그라운드 서비스를 제공하는 라이브러리로 교체/업그레이드(예: 포그라운드 서비스 내장 geolocation 모듈) → 부착해둔 `foregroundService` 옵션·권한·채널이 매니페스트 머지만으로 즉시 활성.
  2. 또는 자체 Kotlin 포그라운드 서비스 + ReactPackage 작성(MainApplication 등록) — `android/` 네이티브 코드 변경이라 별도 사용자 승인 필요.
- **applies_to**: 백그라운드 트래킹 후속 job, geolocation 라이브러리 교체 검토.
