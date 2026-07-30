# 01 — 스토어 심사 리젝 위험 감사 (App Store + Google Play)

> 작성 2026-07-30 · 기준 커밋 `83c7dbd` · **Android 동시 출시 확정** 전제로 범위 확장
> 근거는 저장소의 실제 설정·코드다. 콘솔/실기기에서만 확인 가능한 항목은 `[확인필요]`로 표시했다.
> 심각도: `BLOCKER` 제출 불가·리젝 확실 · `MAJOR` 리젝 가능·심사 지연 · `MINOR` 품질

---

## 0. 한눈에

| # | 항목 | 플랫폼 | 심각도 |
|---|---|---|---|
| A-1 | 릴리스가 **debug 키로 조용히 서명**된다 | Android | `BLOCKER` |
| A-2 | `aps-environment: development` | iOS | `BLOCKER` |
| A-3 | Google Maps API 키 저장소 평문 커밋 | Android | `BLOCKER`(비용/보안) |
| B-1 | 로그인 강제 — 핵심 기능은 계정 없이 동작한다 | 양쪽 | `MAJOR` |
| B-2 | **백그라운드 위치 권한이 실제로 필요 없을 수 있다** | Android | `MAJOR`(심사 지연) |
| B-3 | Android 기능 동등성 갭 5종(심박·워치·위젯·Live Activity·햅틱) | Android | `MAJOR` |
| B-4 | 앱 ID `com.solemate` vs 브랜드 Keego | 양쪽 | `MINOR`(되돌릴 수 없음) |
| C-* | 콘솔 제출물(데이터 보안 폼·등급·선언) | 양쪽 | `[확인필요]` |

---

## A. 제출 차단

### A-1. `BLOCKER` Android 릴리스가 debug 키로 **조용히** 서명된다

```gradle
// android/app/build.gradle:145
signingConfig project.hasProperty('KEEGO_UPLOAD_STORE_FILE')
  ? signingConfigs.release : signingConfigs.debug
```

`KEEGO_UPLOAD_*`가 없으면 **경고 없이 debug 키로 서명**된다. Play는 debug 서명 업로드를 거부한다.

주석은 "출시 빌드는 반드시 KEEGO_UPLOAD_* 설정 후 수행"이라 적어뒀지만, **사람의 기억에 기댄 안전장치는 안전장치가 아니다.** 실제로 `android/app/build/outputs/bundle/release/app-release.aab`(2026-07-18 생성)가 이미 있는데, 이게 debug 서명일 가능성이 높다 — 그걸 모르고 업로드하면 거부당하고 원인을 찾느라 시간을 쓴다.

**고칠 것:** release 빌드에서 업로드 키가 없으면 **빌드를 실패시킨다**. 폴백은 개발 편의였는데, 그 편의의 대가가 "출시 직전에 원인 모를 거부"다. (코드로 수정 가능 — 아래 권고 참조)

### A-2. `BLOCKER` `aps-environment: development`

```xml
<!-- ios/SoleMate/SoleMate.entitlements -->
<key>aps-environment</key><string>development</string>
```
App Store 빌드는 `production`이어야 푸시가 동작한다. Xcode 자동 서명이 배포 빌드에서 치환하는지 **실빌드로 확인해야 한다** `[확인필요]`.

### A-3. `BLOCKER` Google Maps API 키가 저장소에 평문으로 있다

```xml
<!-- android/app/src/main/AndroidManifest.xml (git 에 커밋됨) -->
<meta-data android:name="com.google.android.geo.API_KEY"
           android:value="AIzaSy…FEY"/>
```

CLAUDE.md의 **"시크릿/키 하드코딩 금지"** 위반 상태다. 다만 Android Maps 키는 성격이 다르다 — **앱 바이너리에 포함될 수밖에 없어서 '숨기는 것'이 답이 아니라 '제한하는 것'이 답이다.**

**해야 할 일(콘솔):** Google Cloud Console → 사용자 인증 정보 → 이 키에
**애플리케이션 제한(Android 앱: 패키지명 `com.solemate` + 릴리스 SHA-1)** + **API 제한(Maps SDK for Android만)** 을 건다. 제한이 없으면 누구나 이 키로 과금을 발생시킬 수 있다. `[확인필요]`

> 참고: `google-services.json`·`GoogleService-Info.plist`도 커밋돼 있는데 **이건 정상이다**
> (Firebase 클라이언트 설정은 공개 전제 — 그래서 App Check를 켰다). 다만 CLAUDE.md·
> `.gitignore` 주석은 "gitignore된다"고 적고 있어 실제와 다르다 → 문서 정정 필요.

---

## B. 심사 리젝·지연 위험

### B-1. `MAJOR` 로그인 강제 — 계정 없이 동작하는 앱인데 첫 화면이 로그인이다

`App.tsx`의 라우팅 사다리는 `authUser===null`이면 무조건 `LoginScreen`이다(우회 없음). 그런데 코드상 **핵심 기능은 계정이 필요 없다**:

- 러닝 기록·신발 수명은 AsyncStorage(로컬)에서 완결된다.
- 클라우드 동기는 uid가 없으면 **조용히 건너뛴다**(`App.tsx:1210`).
- 익명 로그인 구현이 **이미 있다**(`lib/firebaseCloudPort.ts:190`) — `LoginScreen`이 버튼을 안 그릴 뿐.
- 기기 데이터를 나중에 계정으로 무손실 이관하는 경로까지 있다(`cloudSync.migrateDeviceToAccount`).

Apple 심사 지침에는 *"계정 기반 기능이 핵심이 아니면 로그인 없이 쓸 수 있게 하라"* 취지의 조항이 있다(5.1.1 계열, 최신 문구는 `[확인필요]`). keego는 그 조항에 걸릴 수 있는 형태이고, 리젝이 아니더라도 **온보딩 이탈의 최대 단일 요인**이다.

**권고:** 익명 시작을 노출한다. 단 *"로그인하지 않으면 기기를 바꿀 때 기록이 넘어가지 않는다"*를 정직하게 고지한다. → **제품 결정 필요**

### B-2. `MAJOR` 백그라운드 위치 권한이 **실제로는 필요 없을 수 있다** (Play 심사 난이도 급감)

`AndroidManifest.xml`이 `ACCESS_BACKGROUND_LOCATION`을 선언하고 `requestRunPermissions`가 이를 요청한다(`lib/locationService.ts:95`). 그런데 **같은 파일의 주석이 스스로 이렇게 적고 있다**:

> "백그라운드 task 시작 조건은 '항상 허용'이 *아니라* 포그라운드 권한이다. … '항상 허용'은
> (앱이 종료된 뒤 재기동 같은) 극단 상황에만 의미가 있고 **일반 러닝엔 불필요하다.**"

즉 **코드가 필요 없다고 적어둔 권한을 선언·요청하고 있다.** 대가가 크다:

- Play는 `ACCESS_BACKGROUND_LOCATION` 선언 시 **별도 선언 양식 + 용도 시연 영상**을 요구하고, 검토에 시간이 걸린다. 출시일을 좌우한다.
- 사용자에게도 "항상 허용"이라는 가장 무거운 권한을 묻게 된다(수락률↓).

Android 10+ 에서 **포그라운드에서 시작한 `location` 타입 포그라운드 서비스**는 백그라운드 권한 없이도 위치를 계속 받는다 — 지금 구조가 정확히 그것이다(`FOREGROUND_SERVICE_LOCATION` 선언됨, `startLocationUpdatesAsync`가 포그라운드 서비스로 기동).

**권고:** 제거를 전제로 검증한다. **실기기 검증 없이 지우면 안 된다** — 화면을 끄고 30분 러닝해 거리가 계속 쌓이는지 확인한 뒤 제거한다. 성공하면 Play 심사에서 가장 무거운 항목 하나가 통째로 사라진다.

### B-3. `MAJOR` Android 기능 동등성 갭 — "iOS랑 똑같이"의 실제 목록

`Platform.OS === 'ios'` 분기를 전수 조사한 결과, Android에 **없는** 기능은 다음과 같다.

| 기능 | iOS | Android 현재 | 동등화 비용 |
|---|---|---|---|
| **심박** | HealthKit + Apple Watch | **없음** | **큼** — Health Connect 연동 필요(**새 네이티브 의존 = 승인제**) |
| **워치 앱** | Apple Watch 단독 러닝 | **없음** | **매우 큼** — Wear OS 앱 신규 개발 |
| **잠금화면 실시간** | Live Activity | **없음** | 중간 — 포그라운드 서비스 알림으로 대체 가능(이미 있는 알림을 확장) |
| **홈 위젯** | iOS 위젯 | **없음** | 중간 — Android App Widget 신규 |
| **햅틱 품질** | Taptic 네이티브 | `Vibration` 폴백 | 작음 — 품질 차이만 |
| **걸음 거리 보정** | `PedometerDistanceModule` | **없음** | 작음 — GPS만으로 동작(정확도 소폭↓) |

**UI는 이미 방어돼 있다** — `hkAvailable()`이 비 iOS에서 false라 '애플 건강 연동' 행이 Android에서 뜨지 않고, Apple 로그인 버튼도 `Platform.OS === 'ios'` 가드가 있다(`LoginScreen.rn.tsx:136`). 즉 **Android에서 깨지지는 않는다.** 문제는 "똑같이"가 아니라는 것이다.

> **심박이 핵심 갭이다.** 훈련 부하(TRIMP)·심박존 코칭·체력 지표가 전부 심박에 의존하는데,
> Android 사용자는 워치가 있어도 그 데이터를 받을 경로가 없다. 이건 "기능이 조금 적다"가
> 아니라 **제품의 한 기둥이 빠지는 것**이다. 동시 출시하려면 Health Connect 연동을
> 범위에 넣을지 먼저 결정해야 한다(네이티브 의존 = 사전 승인 대상).

### B-4. `MINOR` 앱 ID가 `com.solemate`인데 브랜드는 Keego

iOS `PRODUCT_BUNDLE_IDENTIFIER = com.solemate` · Android `applicationId "com.solemate"`.
리젝 사유는 아니다. 다만 **한번 스토어에 올리면 영구히 못 바꾼다**(바꾸려면 새 앱 등록 = 리뷰·순위·설치수 초기화). 지금이 마지막 기회다. → **결정 필요**

### B-5. `MINOR` 확인된 정상 항목 (리젝 위험 없음)

- **계정 삭제 동선** — 앱 내(마이 → 계정) + 웹 안내 URL(라이브 200). Apple 5.1.1(v) 충족.
- **Sign in with Apple** — 타 소셜 로그인이 있으므로 필수인데 구현·노출됨(iOS 한정 가드).
- **마이크 권한 미요청** — `NSMicrophoneUsageDescription` 의도적 부재 + 회귀 가드.
- **cleartext 트래픽** — release 병합 매니페스트에서 `usesCleartextTraffic="false"` 확인.
- **targetSdk 36 / minSdk 24** — Play의 타깃 API 요건 충족.
- **결제 없음** — IAP·구독 코드 0 → 결제 관련 심사 항목 전부 비해당.
- **건강 주장** — `__tests__/healthClaims.test.tsx`가 의학적 주장 카피를 가드.

---

## C. 콘솔 제출물 `[확인필요]` — 코드로 판정 불가

| 항목 | 플랫폼 | 메모 |
|---|---|---|
| 데이터 보안 폼 / App Privacy | 양쪽 | `docs/store-privacy-labels.md`가 2026-07-30 정정본. **검색 기록·기타 사용자 콘텐츠 2행이 새로 추가됐으니 그대로 옮길 것** |
| 백그라운드 위치 선언 양식 + 시연 영상 | Play | B-2를 먼저 판정하면 **불필요해질 수 있다** |
| 콘텐츠 등급 설문 | 양쪽 | 만 14세 미만 대상 아님(처리방침 §12와 일치시킬 것) |
| 개인정보 처리방침 URL | 양쪽 | 라이브 200 확인(2026-07-30) |
| 위치기반서비스사업 신고 | 국내 | 방통위. **수 주 소요 — 출시일을 좌우한다**(`docs/privacy-policy.md`에 기록됨) |
| 업로드 키 생성 + Play App Signing 등록 | Play | A-1과 한 쌍 |
| Maps 키 제한 설정 | Android | A-3 |

---

## 권고 순서

1. **A-1을 코드로 막는다**(빌드 실패시키기) — 유일하게 지금 코드로 해결 가능한 BLOCKER.
2. **B-2를 실기기로 판정한다** — 성공하면 Play 심사에서 가장 무거운 항목이 사라진다. 화면 끄고 30분 러닝.
3. **B-3 심박(Health Connect) 범위 결정** — 동시 출시의 실질적 최대 변수. 넣으면 일정↑, 빼면 Android는 반쪽.
4. **B-1 익명 로그인 결정** — 리젝 위험 + 이탈 둘 다 해소.
5. **B-4 앱 ID 결정** — 되돌릴 수 없으므로 지금.
6. A-2·A-3·C는 콘솔/실빌드 작업.

---

## 이 감사가 아직 안 본 것

이 문서는 **설정·정책 층**만 봤다. 남은 축:
- 실제 러닝 시나리오의 에러 경로(GPS 끊김 × 저장 실패 × 강제종료 조합)
- 성능(첫 진입, 런 수백 건일 때 기록 탭, 메모리)
- 접근성 실측(대비·터치타깃·스크린리더 — 코드상 라벨 밀도가 화면마다 크게 다르다)
- **Android 실기기 QA 전체**(빌드 산출물은 2026-07-18자로 존재하나 동작 검증 기록 없음)
