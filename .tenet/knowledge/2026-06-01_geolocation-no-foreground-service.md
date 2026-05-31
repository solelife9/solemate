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
- **재스코프 결정(2026-06-01, 정직·Play-safe):** 위 사실 때문에 "백그라운드 트래킹이 동작한다"는 전제는 거짓이다. 그 상태로 `ACCESS_BACKGROUND_LOCATION`을 요청하고 "화면을 꺼도 안 끊김"을 약속하는 것은 **거짓 약속 + Google Play 심사 거부 위험**이라 다음과 같이 정직한 forward-compat 상태로 축소했다(진짜 백그라운드 구현은 사용자 결정사항이라 이 job 밖):
  - **제거(harmful):** App.tsx의 `ACCESS_BACKGROUND_LOCATION` 런타임 요청과 "화면을 끄거나 다른 앱을 써도 끊기지 않도록" 거짓 약속 dialog 제거. `needsBackgroundLocationPermission` 호출 제거(함수는 lib에 순수·테스트로 유지). AndroidManifest에서 `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_LOCATION`/`ACCESS_BACKGROUND_LOCATION` 권한 **모두 제거** — 동작하는 서비스가 없으므로 선언 자체가 심사 red flag.
  - **유지(harmless forward-prep):** `lib/foregroundService.ts`(순수, 테스트됨) 유지. watchPosition의 `foregroundService` 옵션도 유지하되 **현재 no-op**임을 코드 주석에 명시(미지의 키는 네이티브 파서가 무시 → 크래시 없음). 서비스 제공 모듈로 교체 시 옵션이 즉시 활성.
  - **정직한 테스트:** App 통합테스트는 "foregroundService 옵션이 watchPosition에 전달됨(forward-prep)"만 검증하고, "screen-off keeps recording" 과장 문구는 제거. fine-location 거부 시 watchPosition이 호출되지 않는 권한 게이트 회귀 테스트 추가.
- **남은 작업(follow-up, 이번 job 범위 밖 = 매니페스트-only 승인 예외를 넘는 네이티브 코드)**: 화면off/백그라운드 기록이 **실제로** 지속되려면 둘 중 하나 필요 —
  1. location 타입 포그라운드 서비스를 제공하는 라이브러리로 교체/업그레이드(예: 포그라운드 서비스 내장 geolocation 모듈) → 부착해둔 `foregroundService` 옵션·권한·채널이 매니페스트 머지만으로 즉시 활성.
  2. 또는 자체 Kotlin 포그라운드 서비스 + ReactPackage 작성(MainApplication 등록) — `android/` 네이티브 코드 변경이라 별도 사용자 승인 필요.
- **applies_to**: 백그라운드 트래킹 후속 job, geolocation 라이브러리 교체 검토.
