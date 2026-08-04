# Keego 출시 체크리스트

> **2026-08-04 재판정** (HEAD `a89a3e8` 기준). 이전 판(2026-06-17)은 낡아서 전면 재작성했다.
> 판정 규칙: **코드·파일·실측으로 확인되는 것만** ✅/🚫 로 적는다. 저장소 밖(스토어 콘솔·
> Firebase 콘솔·실기기)에 있어 여기서 볼 수 없는 것은 **「민우 확인 필요」** 로 분류했다.
> 🚫=블로커, 🟡=권장, ✅=해소(근거 병기), 👤=민우 확인 필요.
>
> **현재 우선순위는 iOS 단독 선출시**다. Android 는 §5 로 분리했다(지금 손대지 않는다).

---

## 0. 공통

- ✅ **백엔드 Render 제거** — 정본 = Firestore. `lib/api.ts` 없음(2026-07-17, `3eaccb1`).
  `docs/backend-deploy.md` 는 역사 문서.
- ✅ **개인정보 처리방침·약관 공개 URL** — 4개 페이지 **전부 200 실측**(2026-08-04 `curl`):
  `privacy.html` · `terms.html` · `support.html` · `delete-account.html`
  (`https://solelife9.github.io/keego-legal/…`). 앱 내 상수 = `lib/legalLinks.ts`.
- ✅ **버전 체계** — iOS `CURRENT_PROJECT_VERSION = 23` / `MARKETING_VERSION = 1.0`
  (`ios/SoleMate.xcodeproj/project.pbxproj:700,709`). Android 는 `KEEGO_VERSION_CODE`/
  `KEEGO_VERSION_NAME` 을 `-P` 로 주입(`android/app/build.gradle:191-194`, 기본 1 / `1.0.0`).
- ✅ **앱 아이콘·스플래시 자산 존재** — `ios/SoleMate/Images.xcassets/AppIcon.appiconset/`
  (1024 포함 8종) · `ios/SoleMate/LaunchScreen.storyboard` · `android/…/mipmap-*/ic_launcher.png`.
- 🟡 **버전 표기 정합** — iOS `1.0` 과 Android 기본 `1.0.0` 이 다르다. 제출 전 하나로.
- 👤 **처리방침 본문 법적 검토** — 문서는 있고 게시도 됐으나, 법률 자문을 받았는지는
  저장소로 판정 불가.

---

## 1. iOS (App Store) — 현재 우선

### 해소된 것
- ✅ **Firebase iOS 앱 + 설정 파일** — `ios/SoleMate/GoogleService-Info.plist`,
  워치 타깃분 `ios/SoleMateWatch Watch App/GoogleService-Info.plist`(`44b06ec`).
- ✅ **번들 ID = `com.keego.app`** — 앱 `:716` · 워치 `com.keego.app.watchkitapp` ·
  위젯 `com.keego.app.RunActivity`(`project.pbxproj`). Android `applicationId` 도 동일.
- ✅ **Apple Developer 계정 · ASC 앱 생성** — TestFlight 업로드 이력으로 성립
  (빌드 22 업로드 완료, 코드는 빌드 23).
- ✅ **권한 사용 설명(Info.plist)** — 위치 2종·모션·건강 2종·사진 2종·카메라 모두 구체 문구.
  마이크는 **의도적으로 미선언**(`Info.plist:91` 주석, 심사 B-10). `ITSAppUsesNonExemptEncryption=false`(`:54`).
- ✅ **소셜 로그인 URL scheme** — google·kakao·naver `CFBundleURLTypes`(`:25-45`) +
  `LSApplicationQueriesSchemes`(`:58-65`).
- ✅ **Maps iOS 키 — 불필요로 판정.** iOS 는 Apple Maps 를 쓴다(`RunLiveMap.tsx:99`,
  `CourseMap.tsx` — `provider` 가 android 일 때만 `PROVIDER_GOOGLE`). 구 체크리스트의
  "Maps iOS 키" 항목은 성립하지 않는다.
- ✅ **App Privacy 답안 준비** — `docs/store-privacy-labels.md` + `PrivacyInfo.xcprivacy` 3종
  (앱·위젯·워치). 심사 감사 BLOCKER 3건은 2026-08-03 수정 완료(`docs/audit/05-appstore.md`).

### 남은 것
- 🚫 **스크린샷(6.7"/6.5")** — 저장소에 자산이 없다. 브랜드 개명(2026-07-21) 이후
  재제작 필요 여부 포함해 👤.
- ✅ **APNs 는 출시 게이트가 아니다 — 원격 푸시를 쓰지 않는다.**
  `lib/featureFlags.ts REMOTE_PUSH_ENABLED = false`(2026-07-30 결정). FCM 토큰을 **받지도
  않고**(`pushMessaging.ts:161-165`), 등록 엔드포인트도 빈 값(`:186`)이다. 그러므로
  Firebase 에 APNs `.p8` 을 올렸는지, 엔타이틀먼트 `aps-environment` 가 `development` 인지는
  **지금 아무 영향이 없다** — 서버가 이 앱으로 푸시를 보내지 않는다.
  · 참고: 배포 경로 자체는 정상이다(`ios/ExportOptions-AppStore.plist` =
    `method: app-store-connect` + `signingStyle: automatic` → 내보내기 시 배포
    프로파일로 재서명). 로컬에 남은 `keego.xcarchive`(2026-07-20)는 **개발 서명**이고
    (`get-task-allow=true`, 구 번들 ID `com.solemate`) 업로드본이 아니라 판정 근거가 못 된다.
  · **원격 푸시를 켜는 날 다시 판정할 것**: `.p8` 업로드 → `FCM_REGISTER_ENDPOINT` 채우기
    → 플래그 true → 실기기 수신 확인. 그 전까지 이 항목은 닫는다.
- 🟡 **알림은 전부 로컬이다** — 러닝 리마인더만 OS 정시 발화(expo-notifications 7일 원샷
  체인, `lib/localReminder.ts`), 교체 임박·주간 목표는 **앱을 열 때** 계산해 보여준다
  (`dueNotifications` → `presentDue`). 구 체크리스트의 "FCM 푸시 수신" QA 항목은 성립하지
  않는다. 실측 대상은 §2 로 옮겼다.
- 👤 **빌드 23 업로드 여부** — 코드는 23 인데 업로드된 것은 22 로 들었다. ASC 확인.
- 🟡 **`docs/mac-ios-setup.md` 가 낡았다** — 번들 ID 를 `com.solemate` 로 적고 있고,
  "plist 를 Xcode 타깃에 추가"를 남은 작업으로 두고 있으나 둘 다 이미 해소됐다.

---

## 2. 실기기 QA — 코드로 대체 불가한 것만 (전부 👤)

> `docs/audit/05-qa.md` 20건 감사에서 코드로 판정 가능한 것은 전부 처리했고,
> **아래 8건만 실기기 몫**으로 남았다. 6·7 번은 이 앱의 코어다.

- [ ] **6.** 러닝 중 화면 잠금 → 30분 후 해제: 거리·경과시간 연속성, 케이던스 유지
- [ ] **7.** 러닝 중 백그라운드 → 타 앱 → 복귀: 첫 프레임 점프 여부, 폴리라인 연속성
- [ ] **8.** 러닝 중 비행기모드 on/off: 정확도·`stalledMs`·재수렴 시간
- [ ] **9.** 강제 종료 → 재실행 → 이어 달리기: 공백 구간 미계상, 재개 후 페이스 복귀
- [ ] **10.** 위치 권한 회수 → 재허용: 배너 노출 여부(OS 에러 문자열 의존), 거리 보존
- [ ] **12.** 5시간 러닝: 경로점 1.8만 개 규모의 스냅샷 쓰기 지연·프레임 드랍·배터리
- [ ] **19.** 시스템 글꼴 최대 크기: 고정 높이 3곳(`primitives.tsx:819,820,1558`) 글자 잘림
- [ ] **1.** 신규 설치 첫 로그인: "첫 탭이 먹지 않는다" 미해결 1건(코드 근거 없음 — 네이티브 SDK 타이밍 추정)
- [ ] **알림(원격 아님).** 러닝 리마인더가 **앱을 닫아둔 채** 설정 시각에 실제로 울리는가
      (`lib/localReminder.ts` — 7일 원샷 체인). 오늘 이미 달린 날은 조용한가.
      앱을 열었을 때 교체 임박·주간 목표 안내가 뜨는가(`presentDue`).

**최근 수정분 눈 확인**(새 경로라 봐야 한다)
- [ ] 위치 권한 끈 채 러닝 시작 → 종료: "기록된 러닝이 없어요" + 기록 탭에 아무것도 안 생김(`a2a3ddc`)
- [ ] 러닝 중 크래시 → 재실행: **홈 도달 후** 복구 프롬프트(`4d2d109`)
- [ ] 비행기모드 회원 탈퇴: 15초 뒤 안내 + 계정 보존(`aaf792b`)
- [ ] 비행기모드 완주 저장: 5초 내 완료, 위치 라벨만 빔(`91e0776`)

---

## 3. 출시 운영 (`docs/audit/07-launch-ops.md`)

### 3.1 지원 창구
- ✅ **지원 페이지 게시** — `support.html` 200 실측. 원본 `docs/support.html`.
- ✅ **문의하기 상시 노출** — 아코디언 밖으로(`ProfileScreen.rn.tsx:678-695`, L-08).
  앱 버전·기기 정보 자동 첨부(`:661-667`, L-04).
- ✅ **전용 지원 메일** — `keego.support@gmail.com`(`18f621b`, L-09).
- [ ] 👤 ASC `Support URL` · Play 지원 웹사이트 **양쪽에 입력**

### 3.2 강제 업데이트 게이트 (한 번도 켜 본 적 없음)
- ✅ 도구는 있다 — `scripts/seed-config.mjs`(조회/`--min`/`--ios`/`--android`/`--off`),
  클라이언트 `lib/forceUpdate.ts`.
- [ ] 👤 프로덕션에 `config/app` 문서 생성
- [ ] 👤 스토어 링크 등록(없으면 "검색해서 받으세요" 폴백 — 최후 수단이지 기본이 아니다)
- [ ] 👤 `--min` 을 **현재 버전과 같게** 넣어 게이트가 **안 뜨는 것**까지 확인 → 확인 후 `--off`
- ⚠️ `--min` 은 사용자를 잠그는 스위치다. **고친 버전이 스토어 심사를 통과한 뒤에만** 넣는다.
- ⚠️ 한계: 게이트는 **로그인 이후에만** 판정한다(`firestore.rules` 의 `config` 읽기가 signedIn).
  로그인 자체가 깨지는 버그는 못 막는다.

### 3.3 관측성
- ✅ **배선 완료** — 폰 Crashlytics(`lib/crashlytics.ts`), **워치 Crashlytics 신설**
  (`ios/SoleMateWatch Watch App/WatchCrash.swift` + 설정 파일 투입, `44b06ec`, L-02).
- ✅ **`kg_*` 이벤트 10개 전부 호출처 있음**(L-12 해소) — 감사 시점엔 5개가 0 이었다.
  워치 단독 러닝도 잡힌다(`App.tsx:1906` `device:'watch'`, L-11).
- ✅ **계측 opt-out 스위치** — 설정에서 끄면 실제로 꺼진다(`a89a3e8`, L-13).
- [ ] 👤 릴리스 빌드에서 의도적 크래시 1회 → Crashlytics 도착 + **심볼화**(dSYM) 확인
- [ ] 👤 워치 크래시도 도착하는지
- [ ] 👤 Analytics 콘솔에 `kg_*` 도착 확인(첫 수집까지 최대 24시간)

### 3.4 단계적 출시 (전부 👤)
- [ ] iOS App Store Connect **Phased Release** 켜기
- [ ] iOS **Expedited Review** 요청 경로만 미리 확인(데이터 유실·보안 때만 쓰는 카드)

### 3.5 모집 전 게이트
- ✅ **CI 가 `.github/workflows/ci.yml` 로 설치됨**(`5d26f9e`, L-05) — 게이트 잡(tsc·lint·
  test·커버리지) + Firestore 규칙 잡.
- 🚫 **CI 가 아직 한 번도 그린이 아니다.** 2026-08-04 실행 이력: 실패 1(`30905027879`),
  타임아웃 취소 2(`30905338977`·`30906938251`), 진행 중 1(`30908243859`).
  timeout 45분 + `--maxWorkers=2` 로 고친 실행이 아직 결과를 안 냈다. **초록 1회를 보기 전엔
  "게이트가 있다"고 말할 수 없다.**
- [ ] 👤 지원 URL 게시 확인(→ 3.1, 페이지는 200)
- [ ] 👤 단계 0: 지인 3~5명 실외 러닝 1회 완주·저장 → **크래시 0** 확인 후 단계 1 발송
- 100명을 한 번에 모으지 않는다. 3~5명 → 15~20명 → 50명+, 단계 사이 **최소 3일**.

---

## 4. 출시 순서(iOS 우선 개정)

1. CI 초록 1회 확인 → 2. 실기기 QA §2 → 3. 스크린샷 재제작 →
4. 게이트 리허설(§3.2) + 관측성 도착 확인(§3.3) → 5. TestFlight 빌드 23 →
6. Phased Release 로 App Store → 7. (그 다음) Android

---

## 5. Android (Google Play) — **지금은 보류**

> iOS 선출시가 확정 방침이라 **Play Console 작업은 착수하지 않는다.** 다만 2026-08-04 에
> AAB 만 새 앱 ID 로 다시 구워 뒀다 — 옛 산출물이 남아 있으면 "Android 도 준비됐다"는
> 거짓 신호가 되기 때문이다.

### 해소된 것
- ✅ **업로드 서명 준비 완료** — `android/app/build.gradle:209-228` 에 release signingConfig,
  비밀값은 `~/.gradle/gradle.properties` 에 `KEEGO_UPLOAD_*` 4개 키 설정됨, keystore 파일
  존재 확인. `KEEGO_UPLOAD_STORE_FILE` 미설정 시에만 debug 폴백.
- ✅ **AAB 재빌드 완료(2026-08-04)** — 앱 ID 전환 이후 산출물로 갱신했다. 옛 7/18 빌드는
  구 패키지(`com.solemate`) 것이라 못 쓴다. 명령:
  `./scripts/bundle-android-release.sh && (cd android && ./gradlew bundleRelease -PKEEGO_VERSION_CODE=1 -PKEEGO_VERSION_NAME=1.0.0)`
  → `android/app/build/outputs/bundle/release/app-release.aab` (117MB, BUILD SUCCESSFUL 2m33s).
  **검증한 것**:
  · 패키지 `com.keego.app` · `versionCode 1` · `versionName 1.0.0`
    (`app/build/intermediates/merged_manifest/release/…/AndroidManifest.xml`).
    AAB 매니페스트에 `com.solemate` 문자열 0건.
  · **업로드 키로 서명됨** — `META-INF/KEEGO-UP.RSA`, `CN=Keego, O=Keego, C=KR`,
    유효기간 2053-12-03. debug 키가 아니다.
  · Firebase 설정도 새 앱 것이 들어갔다 — 리소스에 박힌 앱 ID
    `1:404780715201:android:0972114c82f6999b351840` = `google-services.json` 의
    `com.keego.app` 클라이언트.
- ✅ **업로드 키 SHA-1 은 Firebase 에 이미 등록돼 있다** — `com.keego.app` 클라이언트에
  `39:D4:16:D7:52:BE:F6:34:17:D4:A2:2F:20:F4:69:C3:EE:12:67:CE`(업로드 키) +
  `5E:8F:16:…:F6:25`(debug 키) 2개. 즉 **로컬에서 만든 이 AAB 는 소셜 로그인이 된다.**
- ✅ **타겟 SDK 정책** — `compileSdk/targetSdk = 36`(`android/build.gradle:5-6`).
- ✅ **Maps Android 키 배선** — `AndroidManifest.xml:72` `com.google.android.geo.API_KEY`.

### 남은 것
- 🚫 👤 Play Console: 앱 생성, 데이터 보안 폼, 콘텐츠 등급
- 🚫 👤 **Play App Signing 재서명 SHA-1 을 Firebase 에 추가.** 위에서 확인했듯 등록된 2개는
  **업로드 키와 debug 키뿐**이다. Play 가 재서명에 쓰는 키는 **업로드 후에야 생기는 제3의 키**다
  (Play Console → 앱 무결성 → 앱 서명 키 인증서 SHA-1). 이걸 빠뜨리면 **스토어에서 받은 앱만**
  소셜 로그인이 전멸한다 — 로컬 빌드는 멀쩡하니 끝까지 안 보인다.
- 🚫 👤 백그라운드 위치 권한 선언 양식 + 시연 영상 제출
- 🚫 👤 **Android 실기기 검증 0회** — 지금까지 실측은 전부 iOS 였다.
- 🟡 👤 스크린샷(폰)·피처 그래픽·짧은/긴 설명
- 🚫 👤 위치기반서비스사업 신고서 — 제출서류 중 기술 자료는 준비됨
  (`docs/legal/location-data-flow.md`), **사업자 정보 양식 작성이 남음**(`:251`).

---

## 6. 참고
- 상세 감사: `docs/audit/05-qa.md`(QA 20건) · `docs/audit/05-appstore.md`(심사관 시점) ·
  `docs/audit/07-launch-ops.md`(출시 운영) · `docs/audit/06-ux.md`
- 스토어 문구: `docs/store-listing.md` · `docs/store-privacy-labels.md`
- 모집: `docs/beta-recruiting.md`
