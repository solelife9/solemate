# Keego 출시 체크리스트

> **2026-08-04 재판정** (HEAD `a89a3e8` 기준). 이전 판(2026-06-17)은 낡아서 전면 재작성했다.
> 판정 규칙: **코드·파일·실측으로 확인되는 것만** ✅/🚫 로 적는다. 저장소 밖(스토어 콘솔·
> Firebase 콘솔·실기기)에 있어 여기서 볼 수 없는 것은 **「민우 확인 필요」** 로 분류했다.
> 🚫=블로커, 🟡=권장, ✅=해소(근거 병기), 👤=민우 확인 필요.
>
> **2026-08-07 방침 변경 — iOS·Android 동시 출시로 확정(민우님).**
> 이전 판의 "iOS 단독 선출시"는 폐기한다. 근거: 08-05 안드로이드 실기기 검증(거리 오차 0%)과
> 08-06 심박(Health Connect) 연동이 **"출시 전 필수"로 확정**되면서, 안드로이드를 뒤로 미룰
> 이유가 사라졌다. §5 는 '보류'가 아니라 **진행 중인 작업 목록**이다.

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
- ✅ **버전 표기 정합**(2026-08-08) — 안드로이드 기본 `versionName` 을 `1.0` 으로 맞췄다(iOS `MARKETING_VERSION` 과 동일). 갈려 있으면 문의·크래시 리포트가 버전으로 안 묶여 "1.0 에서만 나는 버그"를 추적할 수 없다.
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
- ✅ **Firebase Storage — 켜고 배포까지 완료**(2026-08-09).
  버킷 `keego-620b8.firebasestorage.app`(**asia-northeast3** — Firestore 와 같은 위치.
  ⚠️ 위치는 생성 후 변경 불가라 맞춰 만들었다), 규칙 배포 완료.
  **배포됐다는 말만 믿지 않고 실제로 막히는지 확인했다** — 인증 없는 읽기·업로드·규칙 밖
  경로 3방향 전부 403. 이제 메달·기록증 사진 백업이 실동작한다.
- ✅ **랭킹 서버 — 배포·검증 완료**(2026-08-07~08).
  `functions` + `firestore:rules` 를 함께 올렸다. 운영 확인: `/api/health` 200 ·
  `/api/ranking/publish` 무토큰·가짜토큰 모두 401 · 소셜 로그인 400(503 아님 = 환경변수 정상).
  함수 런타임은 Node 22 로 올렸다(20 은 2026-10-30 폐기 — 그 뒤엔 배포 자체가 막힌다).
- 🟡 👤 **스크린샷(6.7"/6.5") — 자산은 있다. 남은 건 제작이 아니라 재검증이다.**
  저장소에는 없지만(맞다) `~/Desktop/keego-스토어-스크린샷/` 에 6장이 있고,
  `docs/audit/05-appstore.md §5.7` 이 **파일을 직접 열어** 상표 검수까지 마쳤다
  (2026-08-02 — 타사 로고·제품 사진 0건, 브랜드명은 텍스트로만).
  즉 브랜드 개명(2026-07-21) 이후 자산이다. **다만 08-03~04 의 UX 수정(T4→T3 스윕·
  ctrlHint·빈 상태·온보딩 헤더)이 그 뒤에 들어갔으므로 눈으로 대조해야 한다.**
  전면 재제작이 아니라 바뀐 화면만 다시 찍으면 될 가능성이 높다.
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
- ✅ **빌드 23 = 낡은 앱의 것이었다**(2026-08-09 API 조회로 확정). TestFlight 의 23 은
  **2026-07-29 업로드**이고 번들 ID 가 `com.solemate` 다 — 앱 ID 전환(08-03) 전 빌드라
  받으면 오히려 11일 되돌아간다.
  ⚠️ **더 큰 것이 여기서 드러났다**: ASC 앱 레코드가 옛 번들 ID 를 쥐고 있어 새 코드를
  올릴 수 없었다(ASC 의 번들 ID 는 생성 후 변경 불가). 2026-08-09 에 `com.keego.app` 로
  **새 앱 레코드를 만들고**(민우님) 옛 레코드는 삭제했다. 이름 `Keego` 는 API 로 옛
  레코드를 개명해 풀었다.
- ✅ **`docs/mac-ios-setup.md`** — 낡았다고 적혀 있었으나 **2026-08-05 에 이미 정정됐다**(문서 머리말이 `com.keego.app` 을 명시하고 옛 이름이 남은 이유까지 설명한다). 체크리스트 쪽이 낡았던 것 — 2026-08-08 대조.
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
- ✅ **CI 초록 1회 확인(2026-08-04, run `30959631347`).** 두 잡 모두 success —
  `테스트` 284스위트 3,165테스트(85.7초) · `커버리지 게이트` 138스위트 2,105테스트 ·
  `Firestore 보안 규칙` success. **이제 게이트가 실재한다.**
  · 6번을 잘렸고 원인은 **워커도 러너 속도도 아닌 Node 버전 불일치**였다(개발 26 / CI 22).
    버전을 `.nvmrc` 한 곳으로 모았다. 진단 과정과 틀린 판정 2건은
    `docs/audit/FINAL-readiness.md` 부록 B.
  · CI 가 곧바로 값을 했다 — 로컬에서는 영영 안 보였을 결함 2건을 잡았다:
    Node 22 에서 테스트가 매달리는 것, 그리고 `naverAuthClient` 스위트가 **개발 기기의
    로컬 키에 의존**해 한 대에서만 통과하던 것(`socialConfig.ts` = skip-worktree).
- [ ] 👤 지원 URL 게시 확인(→ 3.1, 페이지는 200)
- [ ] 👤 단계 0: 지인 3~5명 실외 러닝 1회 완주·저장 → **크래시 0** 확인 후 단계 1 발송
- 100명을 한 번에 모으지 않는다. 3~5명 → 15~20명 → 50명+, 단계 사이 **최소 3일**.

---

## 4. 출시 순서(2026-08-07 동시 출시 개정)

**대기가 긴 것부터 건다** — 내 시간이 아니라 남이 처리하는 시간이 일정을 정한다.

| 순서 | 할 일 | 왜 이 자리인가 |
|---|---|---|
| 0 | **방통위 위치기반서비스 신고 접수** | 수 주 대기. **이게 출시일을 정한다** |
| 0 | **Play Console 앱 생성 + 건강 데이터 접근 선언** | 심박(Health Connect)을 붙였으므로 별도 절차가 붙는다. 소요 미지수 → 먼저 걸어둔다 |
| 1 | 콘솔 3종(App Check enforce · Maps 키 제한 · 예산 알림) + keystore 백업 | **사용자 0명인 지금만 안전**하거나, 잃으면 되돌릴 수 없다 |
| 2 | 게이트 리허설(§3.2) | 비상 장치를 비상 때 처음 쓰면 안 된다 |
| 3 | iOS 빌드 → TestFlight · Android AAB 재빌드 | 실기기 QA 의 전제 |
| 4 | **실기기 QA** — iOS §2 잔여 + **안드로이드 시내 신호등 코스**(걸음 정지 게이트·케이던스·잠금화면 알림·심박 실수신) | 이 구간이 제일 무겁다 |
| 5 | 관측성 도착 확인(§3.3) | Analytics 는 24h 뒤 재확인이라 일찍 걸어둔다 |
| 6 | 스크린샷(iOS 재검증 · Android 신규) + 스토어 폼 | **화면이 확정된 뒤에** 찍는다 |
| 7 | 제출 — App Store(Phased Release) · Play(단계적 출시) | |
| 8 | **Play 첫 업로드 직후: 재서명 SHA-1 을 Firebase·카카오에 등록** | 빠뜨리면 **스토어 앱만** 로그인 전멸 |
| 9 | 단계 0 지인 3~5명 → 크래시 0 → 단계 1 → 단계 2 | 단계 사이 최소 3일 |

---

## 5. Android (Google Play) — **진행 중 (2026-08-07 동시 출시 확정)**

> 이전 판의 "보류"는 폐기했다. 08-05~06 에 실기기 검증·케이던스 근본수정·잠금화면 알림·
> 성능 3건이 들어갔고, **심박(Health Connect)이 "출시 전 필수"로 확정**됐다.
> **Wear OS 워치 앱은 범위 밖이다(1.1)** — 2026-08-07 확정. 우선순위가 아니라 **하드웨어 부재**가
> 이유다: 실기기가 없으면 GPS·심박·전력을 판정할 수 없고 그 셋이 워치 앱의 존재 이유다.
> 남는 갭 = 안드로이드는 **워치 단독 러닝 없이** 출시된다. **심박은 된다**(Health Connect 는
> 저장소라 갤럭시워치·가민이 쓰고 우리가 읽는다) — 근거는 `docs/audit/FINAL-readiness.md §5 D`.

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

### 08-05~07 에 해소된 것 (동시 출시로 방침이 바뀐 근거)
- ✅ **Android 실기기 검증 완료(08-05)** — 의왕 5km 4중 대조: 가민 5.07 · NRC 5.03 ·
  Keego 아이폰 5.03 · **Keego 안드로이드 5.07(오차 0%)**. 주머니 러닝이라 백그라운드 추적도
  함께 검증됐다. GPS 계수 `PHANTOM_ACC_FLOOR_FACTOR=0.6` 확정 — **플랫폼별로 가를 필요 없음**.
- ✅ **심박 — Health Connect 연동(08-06 `d7ce0a9`).** iOS HealthKit 의 안드로이드 짝.
  `minSdk 24→26`. 호출부 45곳 무변경(파사드 `lib/health.ts`).
- ✅ **케이던스 근본수정(08-05 `1aeebe4`)** — 안드로이드에서 항상 예외를 던지는 API 를 부르고
  그 예외를 삼키고 있었다. **같은 호출이 걸음 정지 게이트도 먹였으므로 그 게이트는
  안드로이드에서 여태 한 번도 동작한 적이 없다** → 아래 실기기 2차의 핵심 검증 대상.
- ✅ **잠금화면 거리·시간 알림 신설(`495e133`)** · 성능 3건 · 공유 2건.
- ✅ **배경 위치 권한 제거(08-07 `3c7571c`)** — 코드가 스스로 "일반 러닝엔 불필요"라고 적어둔
  권한이었다. **Play 심사에서 가장 무거운 관문(선언 양식 + 시연 영상)이 통째로 사라졌다.**

### 남은 것
- 🚫 👤 **Play Console: 앱 생성 · 데이터 보안 폼 · 콘텐츠 등급**
- 🚫 👤 **Health Connect 건강 데이터 접근 선언** — 08-06 에 건강 권한 6개를 새로 선언했다.
  Play 는 건강 데이터에 별도 절차를 둔다. **요구 항목과 소요는 콘솔에서 확인할 것**
  (저장소로는 판정 불가 — 추정하지 않는다). 앱 생성 직후 가장 먼저 걸어두는 게 맞다.
- 🚫 👤 **Play App Signing 재서명 SHA-1 을 Firebase·카카오에 추가.** 등록된 2개는
  **업로드 키와 debug 키뿐**이다. Play 가 재서명에 쓰는 키는 **업로드 후에야 생기는 제3의 키**다
  (Play Console → 앱 무결성 → 앱 서명 키 인증서 SHA-1). 이걸 빠뜨리면 **스토어에서 받은 앱만**
  소셜 로그인이 전멸한다 — 로컬 빌드는 멀쩡하니 끝까지 안 보인다.
- 🚫 👤 **안드로이드 실기기 2차 — ⭐ 신호등 많은 시내 코스.** 되살린 걸음 정지 게이트가
  정확히 그 상황용이다. 한 번에 넷이 판정된다: 정지 후 자동 일시정지까지 걸리는 시간(2~3초면
  정상, 5~6초면 게이트가 안 문 것) · **다시 출발할 때 즉시 재개되는가(반대 방향 사고)** ·
  케이던스 숫자 · 잠금화면 알림. **심박 실수신**은 가민을 안드로이드에 페어링해야 볼 수 있다.
- 🚫 👤 **AAB 재빌드** — minSdk 26·심박·배경위치 제거가 반영된 산출물로 갱신
  (08-04 AAB 는 그 전 것이라 못 쓴다).
- 🟡 👤 스크린샷(폰)·피처 그래픽·짧은/긴 설명
- 🚫 👤 위치기반서비스사업 신고서 — 제출서류 중 기술 자료는 준비됨
  (`docs/legal/location-data-flow.md`), **사업자 정보 양식 작성이 남음**. iOS·Android 공통이다.

---

## 6. 참고
- 상세 감사: `docs/audit/05-qa.md`(QA 20건) · `docs/audit/05-appstore.md`(심사관 시점) ·
  `docs/audit/07-launch-ops.md`(출시 운영) · `docs/audit/06-ux.md`
- 스토어 문구: `docs/store-listing.md` · `docs/store-privacy-labels.md`
- 모집: `docs/beta-recruiting.md`
