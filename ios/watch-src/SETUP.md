# watchOS 컴패니언(실시간 심박) — Xcode 설정 절차

코드는 다 준비됨. Xcode가 해줘야 하는 "타깃 배선"만 아래대로 하면 된다.

## 1. 워치 앱 타깃 생성
- `SoleMate.xcworkspace` 열기 → **File ▸ New ▸ Target…**
- **watchOS ▸ App** 선택 → Next
- Product Name: **`SoleMateWatch`** (정확히)
- Interface: **SwiftUI**, Language: **Swift**
- "Include Notification Scene"/"Complication" 등 체크 **해제**, 테스트 추가 안 함
- 생성되면 "Activate scheme?" → **Activate**
- 타깃 ▸ Signing & Capabilities ▸ Team = **LTWYG63SY7**

> Xcode가 자동으로: 워치 앱 번들ID(`com.solemate.watchkitapp` 류), 아이폰 앱에 embed,
> `WKCompanionAppBundleIdentifier = com.solemate` 를 세팅한다.

## 2. 워치 소스 교체 (이 폴더 → 워치 타깃)
Xcode가 만든 `SoleMateWatchApp.swift`, `ContentView.swift` 내용을 이 폴더(`ios/watch-src/`)의
동명 파일로 **교체**하고, **`WorkoutManager.swift`** 를 워치 타깃에 **추가**한다(드래그 → Target
Membership: SoleMateWatch 체크).

## 3. 워치 타깃 capability / Info
- Signing & Capabilities ▸ **+ Capability ▸ HealthKit** 추가
- Info(타깃 빌드 Info 탭 또는 Info.plist)에 추가:
  - `NSHealthShareUsageDescription` = `러닝 중 실시간 심박을 표시하기 위해 사용합니다.`
  - `NSHealthUpdateUsageDescription` = `러닝 운동을 건강 앱에 기록하기 위해 사용합니다.`
  - `WKBackgroundModes` = 배열 1개 항목 `workout-processing`  (손목 내려도 심박 유지)

## 4. 아이폰 수신 모듈을 앱 타깃에 추가
이미 디스크에 있음(`ios/SoleMate/WatchSessionModule.swift`, `.m`). Project Navigator의
SoleMate 그룹으로 드래그 → **Target Membership: SoleMate 체크**. (WatchConnectivity는
별도 entitlement 불필요.)

## 5. 빌드/테스트
- 스킴을 **SoleMateWatch** 로 → 페어링된 Apple Watch 선택 → Run
- 워치 앱에서 "러닝 시작" → 심박 표시 + 아이폰 러닝 화면 BPM 칸이 '--'→실제값
- (아이폰 러닝 화면이 떠 있을 때 sendMessage 전달됨)

## 끝나면
"워치 타깃 만들었어" 라고만 하면 Claude가 빌드/서명/설치를 마저 잡는다.
