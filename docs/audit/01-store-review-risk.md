# 01 — 스토어 심사 리젝 위험 감사 (App Store + Google Play)

> 작성 2026-07-30 · 기준 커밋 `83c7dbd` · **Android 동시 출시 확정** 전제로 범위 확장
> 근거는 저장소의 실제 설정·코드다. 콘솔/실기기에서만 확인 가능한 항목은 `[확인필요]`로 표시했다.
> 심각도: `BLOCKER` 제출 불가·리젝 확실 · `MAJOR` 리젝 가능·심사 지연 · `MINOR` 품질

---

## 0. 한눈에

| # | 항목 | 플랫폼 | 심각도 |
|---|---|---|---|
| A-1 | ~~릴리스가 debug 키로 서명된다~~ **오판정 — 정식 키로 서명돼 있었다.** 조용한 폴백만 차단(해결) | Android | ~~`BLOCKER`~~ 해결 |
| A-2 | `aps-environment: development` | iOS | `BLOCKER` |
| A-3 | Google Maps API 키 저장소 평문 커밋 | Android | `BLOCKER`(비용/보안) |
| B-1 | ~~로그인 강제~~ **소셜 전용으로 확정(2026-07-30)** · 등급 하향 | 양쪽 | ~~`MAJOR`~~ `MINOR` |
| B-2 | **백그라운드 위치 권한이 실제로 필요 없을 수 있다** | Android | `MAJOR`(심사 지연) |
| B-3 | Android 기능 동등성 갭 5종(심박·워치·위젯·Live Activity·햅틱) | Android | `MAJOR` |
| B-4 | 앱 ID `com.solemate` vs 브랜드 Keego | 양쪽 | `MINOR`(되돌릴 수 없음) |
| C-* | 콘솔 제출물(데이터 보안 폼·등급·선언) | 양쪽 | `[확인필요]` |

---

## A. 제출 차단

### A-1. ~~`BLOCKER`~~ **해결됨(2026-07-30)** — 릴리스 서명

> **정정: 처음 판정이 틀렸다.** "기존 `app-release.aab`가 debug 서명일 가능성이 높다"고
> 적었으나, 실제로 인증서를 열어보니 **정식 업로드 키로 서명돼 있었다**:
> `CN=Keego, OU=Keego, O=Keego, L=Seoul, C=KR`.
> `~/.gradle/gradle.properties`에 `KEEGO_UPLOAD_*` 4개가 설정돼 있고 keystore 도 실재한다
> (`~/keystores/keego-upload.keystore`). **설정 파일을 확인하지 않고 코드의 폴백 분기만 보고
> 단정했다** — 기준선 감사에서 세 번 반복한 실수와 같은 종류다.

남은 위험은 **조용한 폴백** 자체였다. `KEEGO_UPLOAD_*`가 없으면 경고 없이 debug 키로
서명되므로, 새 노트북·CI 처럼 `~/.gradle/gradle.properties`가 없는 환경에서 만든 산출물이
그대로 업로드돼 "원인 모를 거부"가 된다. 지금 환경이 멀쩡한 것과 별개로 재발 가능한 구조다.

**조치:** `android/app/build.gradle`에 태스크 그래프 검사를 추가해 **release 산출물을 만드는
순간 빌드를 실패**시킨다(구성 단계 throw 는 debug 빌드·IDE 동기화까지 막으므로 피했다).
keystore 파일이 사라진 경우도 별도 메시지로 잡는다. 기기 테스트용 debug 서명 release 는
의도를 명령에 드러내야 한다:

```bash
./gradlew assembleRelease -PKEEGO_ALLOW_DEBUG_SIGNED_RELEASE=true
```

검증: 존재하지 않는 keystore 경로를 주입하면 빌드가 실패하고, 정상 설정에서는 통과한다.

> ### ⚠️ 이 항목에서 정작 중요한 것 — **keystore 백업**
> `~/keystores/keego-upload.keystore` 를 잃으면 **그 앱은 영원히 업데이트할 수 없다.**
> 새 키로는 같은 앱을 갱신할 수 없고, 새 앱으로 다시 올려야 한다(리뷰·순위·설치수 초기화).
> 저장소 밖에 있어서(올바름) 이 파일은 git 이 지켜주지 않는다.
> **지금 안전한 곳 두 군데 이상에 백업할 것**(비밀번호 4개도 함께). `[사용자 액션]`
> Play App Signing 에 등록하면 구글이 배포 키를 보관해 위험이 줄지만, **업로드 키는
> 여전히 본인이 지켜야 한다.**

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

### B-1. ~~`MAJOR`~~ → `MINOR` 로그인 강제 — **소셜 전용으로 확정(2026-07-30 민우님 결정)**

> **결정:** 익명 계정을 두지 않고 소셜 로그인만 쓴다. 익명 시작 버튼은 넣었다가 되돌렸다.
>
> **판단 근거(순서가 결정적이다):** 커뮤니티·친구·랭킹이 확정된 로드맵이므로 **모든 사용자가
> 결국 소셜 계정으로 옮겨간다.** 익명은 잠깐의 이득(가입 없이 체험)을 주고 그 전환 비용을
> 전원에게 안긴다 — 지금 코드는 익명→소셜 시 uid 가 새로 생겨(`linkWithCredential` 미사용)
> 친구 관계·랭킹 이력이 옛 uid 에 남는다. 소셜 전용이면 그 문제가 통째로 사라지고,
> 모두가 1일차부터 안정적인 uid 를 갖는다.
> 또 **나중에 익명을 추가하는 건 안전하지만 나중에 없애는 건 어렵다**(이미 갈라진 계정을
> 손으로 병합해야 한다). 유입이 생긴 뒤 체험 모드가 필요해지면 그때 넣는다.
>
> **등급 하향 사유(감사자 정정):** 처음 `MAJOR`로 적은 건 과했다. Strava·Nike Run Club·
> Garmin 모두 계정 필수로 심사를 통과하고, keego 도 "기기를 바꿔도 기록이 이어진다"는
> 클라우드 동기가 핵심 약속이라 '계정 기반 기능'이 있다고 볼 근거가 충분하다. 해당 지침은
> 순수 로컬 앱이 데이터 수집 목적으로 계정을 강요하는 경우를 겨냥한다. 회색지대이긴 하나
> 리젝될 앱이라 단정할 근거는 약하다.
>
> **남는 실제 비용은 온보딩 이탈 하나다.** 완화책은 이미 있다 — 로그인 화면이 가치 3행으로
> "왜 로그인해야 하는가"를 스스로 판다(`LoginScreen.rn.tsx` 가치 행). 국내 사용자에겐
> 카카오·네이버 원탭이라 이메일+비밀번호 대비 장벽이 낮은 편이다.
>
> 아래는 발견 당시 기록이다(익명 경로가 구현돼 있다는 사실은 여전히 유효 — 되살릴 때 씀).

#### (발견 당시 기록) 계정 없이 동작하는 앱인데 첫 화면이 로그인이다

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

1. ~~A-1~~ **완료**. 대신 **keystore 백업**이 이 항목의 진짜 과제로 남았다(위 경고 상자).
2. **B-2를 실기기로 판정한다** — 성공하면 Play 심사에서 가장 무거운 항목이 사라진다. 화면 끄고 30분 러닝.
3. **B-3 심박(Health Connect) 범위 결정** — 동시 출시의 실질적 최대 변수. 넣으면 일정↑, 빼면 Android는 반쪽.
4. ~~B-1 익명 로그인 결정~~ **완료** — 소셜 전용 확정(계정 필수).
5. **B-4 앱 ID 결정** — 되돌릴 수 없으므로 지금.
6. A-2·A-3·C는 콘솔/실빌드 작업.

---

## 이 감사가 아직 안 본 것

이 문서는 **설정·정책 층**만 봤다. 남은 축:
- 실제 러닝 시나리오의 에러 경로(GPS 끊김 × 저장 실패 × 강제종료 조합)
- 성능(첫 진입, 런 수백 건일 때 기록 탭, 메모리)
- 접근성 실측(대비·터치타깃·스크린리더 — 코드상 라벨 밀도가 화면마다 크게 다르다)
- **Android 실기기 QA 전체**(빌드 산출물은 2026-07-18자로 존재하나 동작 검증 기록 없음)
