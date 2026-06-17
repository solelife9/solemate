# Keego — 맥 개발 환경 & iOS 출시 가이드

> 2026-06-17 작성. Windows(Android 빌드)에서 맥북으로 옮겨 **iOS도 출시**하기 위한 셋업.
> 이 프로젝트는 iOS 골격(`ios/SoleMate.xcodeproj` + `Podfile`)이 이미 있어 새로 만들 필요 없음.
> RN 0.85.3 / Expo SDK 56 modules. 네이티브 프로젝트명은 옛 이름 `SoleMate`(번들 `com.solemate`)
> 유지, 표시 이름만 **Keego**.

---

## 1. 맥 개발 환경 셋업

```bash
# 1) Xcode (App Store에서 설치) + 커맨드라인 툴
xcode-select --install
sudo xcodebuild -license accept     # 라이선스 동의(최초 1회)

# 2) Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3) 필수 툴 (RN 0.85는 Node 20+ 권장)
brew install node@20 watchman git
sudo gem install cocoapods          # 또는: brew install cocoapods

# 4) 저장소 클론 + 의존성 (RNFirebase 때문에 --legacy-peer-deps 필수!)
git clone https://github.com/solelife9/solemate.git
cd solemate
npm install --legacy-peer-deps

# 5) iOS 네이티브 의존성 (Pods는 git에 없음 → 맥에서 설치)
cd ios && pod install && cd ..
#   pod install이 느리거나 실패하면:  npx pod-install
#   M1/M2/M3(Apple Silicon)에서 pod 에러 시:  cd ios && arch -x86_64 pod install

# 6) 실행 (시뮬레이터)
npm run ios
#   또는 Xcode로 ios/SoleMate.xcworkspace (.xcodeproj 아님!) 열고 Run
```

Android도 계속 빌드하려면: **JDK 17** + **Android Studio**(SDK/플랫폼툴/에뮬레이터) 추가 설치.

---

## 2. git에 없는 비밀 파일 복원

> **2026-06-17 업데이트**: Firebase 클라이언트 설정 2종을 이제 **git에 커밋**했다(하드 시크릿 아님 — APK/IPA에 어차피 포함). 따라서 `git clone`만 하면 자동 포함되어 **수동 복원 불필요**. (커밋 b7e666f / 55b11f7)

| 파일 | 용도 | 상태 |
|---|---|---|
| `android/app/google-services.json` | Firebase Android | ✅ **git에 포함**(clone 시 자동) |
| `ios/GoogleService-Info.plist` | Firebase iOS (`com.solemate`·`keego-620b8`) | ✅ **git에 포함**(clone 시 자동). 단 Xcode에서 타깃 Copy Bundle Resources에 추가 필요 — 3-① |
| `.env` | 환경변수 | 있으면 직접 가져오기 |
| Android 릴리스 keystore | APK 서명 | debug.keystore로 서명 중(SHA-1 등록됨) |

> ⚠️ **Firebase Admin 서비스계정 JSON**(서버 전권 시크릿)은 `.gitignore`로 영구 차단 — 절대 커밋 금지. solelife-backend Render 환경변수로만.

자세한 복원 절차는 메모리 `tenet-resume-another-machine` / `keego-firebase-native` 참고.

---

## 3. iOS 출시 전 남은 것

### 이미 해둔 것 (커밋 b90dbf2)
`ios/SoleMate/Info.plist` 보강 — **없으면 기능 미동작·심사 거절**:
- 표시 이름 SoleMate → **Keego**
- `NSLocationWhenInUseUsageDescription` / `NSLocationAlwaysAndWhenInUseUsageDescription`(백그라운드 트래킹)
- `NSMotionUsageDescription`(케이던스 보수계 — iOS 필수, 없으면 Pedometer 거부됨)
- `NSPhotoLibraryUsageDescription`(신발 사진 등록)
- `UIBackgroundModes: location`(화면 off 러닝 GPS)

### 추가로 해둔 것 (커밋 b7e666f / 55b11f7, 2026-06-17)
- ✅ **Firebase iOS 앱 등록 완료** — 콘솔에 iOS 앱(`com.solemate`) 추가 + `GoogleService-Info.plist` 다운로드해 `ios/SoleMate/`에 배치·**커밋**.
- ✅ **iOS 번들 ID 확정** — 플레이스홀더 `org.reactjs.native.example.SoleMate` → **`com.solemate`**(Android 패키지와 일치).

### 남은 작업
1. **plist를 Xcode 타깃에 추가** (맥에서, 유일한 남은 Firebase iOS 단계): Xcode로 `ios/SoleMate.xcworkspace` 열고 `GoogleService-Info.plist`를 프로젝트 네비게이터의 SoleMate 타깃에 드래그 → "Copy items if needed" 체크, 타깃 멤버십(Copy Bundle Resources) 확인. AppDelegate의 Firebase 초기화(`FirebaseApp.configure()`) 확인.
2. **react-native-maps iOS 키**: Google Maps iOS SDK 키 발급 → AppDelegate에 `GMSServices.provideAPIKey(...)`(또는 현행 설정 방식) 연결. (지도는 HistoryScreen 코스맵)
3. **Apple Developer 계정**($99/년) → Bundle ID 등록 → 서명/프로비저닝(Xcode Automatic Signing 권장).
4. **App Store Connect**: 앱 생성 + 스크린샷(6.7"/6.5" 등) + 설명/키워드/개인정보 처리방침 URL.
5. **푸시(FCM)**: APNs 인증키(.p8)를 Firebase 콘솔에 업로드 + Xcode Push Notifications capability.
6. **카카오·네이버 로그인**(쓰면): iOS URL scheme + 콘솔에 iOS 앱/키 등록. 메모리 `keego-kakao-naver-login` 참고.

---

## 4. 전략 — iOS 우선 도그푸딩 (2026-06-17 결정)

사용자 데이지드라이버가 **아이폰 + 애플워치**라, 러닝 앱(GPS·야외 실주행)은 실제 들고 달리는 iOS 기기에서 도그푸딩하는 게 진짜 검증. → **iOS를 1차 테스트 타깃으로, Android는 "빌드 가능" 유지(2차)**. RN이라 코드 공유 → Android 안 잃음. 지금 도는 audit-hardening 배치는 JS-only·플랫폼 무관이라 iOS에도 그대로 적용됨.

- **애플워치 컴패니언은 별개의 큰 작업**(RN watchOS 미지원 → 네이티브 Swift/watchOS 따로). 아이폰 출시를 워치에 묶지 말 것 — Phase 2 차별화로.
- **iOS 백그라운드 위치**는 Android 포그라운드 서비스와 별개 구현(expo-location이 양쪽 지원하나 iOS는 background mode 설정·실기기 테스트 따로).

## 4-1. 추천 순서

1. 맥 셋업 → `npm run ios`로 **시뮬레이터에서 일단 띄우기** (여기서 Pod/네이티브 빌드 에러를 먼저 잡는 게 핵심)
2. Firebase iOS plist + Maps 키 연결 → 시뮬레이터에서 로그인/지도 확인
3. 실기기 연결 + 서명 → 실기기 테스트(위치·모션 권한 실제 동작 확인)
4. TestFlight 업로드 → 내부 테스트
5. 스토어 메타데이터 + 심사 제출

> 막히면 `npm run ios` / `pod install` 의 **에러 로그 전체**를 그대로 공유. 대부분 Pod 버전·Apple Silicon arch·서명 이슈라 빠르게 잡힘.
