# Keego 출시 체크리스트 (Android & iOS)

> 2026-06-17 기준. 코드 완성도는 높음(1200+ 테스트). 아래는 **출시 게이트**(코드 외 운영/플랫폼/스토어).
> 🚫=블로커, 🟡=권장.

## 0. 공통 (출시 전 필수)
- ✅ ~~백엔드 Render 배포~~ — **해소(2026-07-17)**: 정본=Firestore 로 완전 이전, Render 코드
  완전 제거(lib/api.ts·일회성 이관 삭제). 랭킹/동기화 전부 Firestore. Render 서비스는
  해지해도 된다(앱 무관). `docs/backend-deploy.md` 는 역사 문서.
- 🚫 **개인정보 처리방침 공개 URL** — `docs/privacy-policy.md` 를 호스팅(GitHub Pages 등).
- 🚫 **실기기 QA 1회전**: 실제 풀 러닝(GPS 거리/경로/케이던스/저장) + 화면 off 백그라운드 추적 + FCM 푸시 수신 + 신발 등록/은퇴/교체 알림.
- 🟡 버전·빌드번호 정리(Android versionCode/Name, iOS MARKETING_VERSION/CURRENT_PROJECT_VERSION).
- 🟡 앱 아이콘·스플래시 최종본(현재 자산 점검), 다크 일관성.

## 1. Android (Google Play)
- 🚫 릴리스 서명 키 결정: 현재 **debug.keystore**로 서명 중(Firebase OAuth SHA-1 등록됨). Play 업로드용 **업로드 키** 별도 생성 + Play App Signing 등록 권장. (debug 키로 스토어 업로드는 비권장)
- 🚫 Play Console: 앱 생성, 데이터 보안 폼, 콘텐츠 등급, 타겟 SDK 정책 충족.
- 🚫 백그라운드 위치 권한: Play 정책상 선언 양식 + 시연 영상 제출 가능성.
- 🟡 스크린샷(폰), 피처 그래픽, 짧은/긴 설명.
- 🟡 AAB(.aab) 빌드 — 현재 APK 빌드 중. Play는 AAB 요구(`bundleRelease`).

## 2. iOS (App Store) — 맥 셋업 후
- 🚫 `docs/mac-ios-setup.md` 의 iOS 갭 전부: Firebase iOS 앱+`GoogleService-Info.plist`, Maps iOS 키, 서명/프로비저닝.
- 🚫 Apple Developer 계정($99/년), App Store Connect 앱 생성.
- 🚫 권한 사용 설명(Info.plist) — 이미 보강함(위치/모션/사진/백그라운드).
- 🟡 APNs 키(.p8) Firebase 업로드(푸시), Push capability.
- 🟡 스크린샷(6.7"/6.5"), App Privacy 표기.
- 🟡 카카오/네이버 로그인 쓰면 iOS URL scheme.

## 3. QA 시나리오(실기기)
1. 신규 설치 → 온보딩 → 신발 등록 → 러닝 1회(실외) → 저장 → 기록/상세/코스맵 확인
2. 화면 끄고 러닝 지속 → 거리 누적 확인(백그라운드)
3. 신발 수명 80%/100% 도달 → 컨디션 색·교체 알림
4. 은퇴 플로우 → Midnight 카드 저장/공유
5. 오프라인(비행기모드)에서 부팅·러닝·저장 → 복귀 시 동기화
6. 푸시 알림 수신(교체/리캡)
7. **크래시 복구 '이어 달리기'(P1-6)**: 러닝 중 앱 강제종료 → 재실행 → '미완료 런 발견'에서
   **이어 달리기** 선택 → GPS 가 다시 잡히고 거리가 *직전 누적값에서* 이어 쌓이는지, 경과시간이
   크래시 시점부터 이어지는지(크래시 공백 시간은 더해지지 않음) 확인. '기록 저장'은 검토 후
   저장만, '버리기'는 폐기. (엔진 시드는 단위테스트로 검증됨 — 실제 GPS 재가동 연속성은 실기기 필수.)

## 4. 출시 순서(권장)
1. 백엔드 배포 → 2. 실기기 QA → 3. 개인정보방침 호스팅 + 스토어 자산 → 4. **Android 먼저(내부테스트→프로덕션)** → 5. 맥에서 iOS 설정 → TestFlight → App Store

## 5. 릴리스 서명·버전·개인정보 (P0-3 — 코드는 처리됨, 아래는 사용자 액션)

### 5.1 Android 업로드 서명 (필수 — 현재 release 는 KEEGO_UPLOAD_* 미설정 시 debug 폴백)
`android/app/build.gradle` 에 `release` signingConfig 를 추가했고, 비밀값은 저장소에 두지
않는다(`~/.gradle/gradle.properties` 또는 CI 시크릿/`-P` 로 주입; `*.keystore`/`*.jks` gitignore).
```bash
# 1) 업로드 keystore 생성(1회 — 안전하게 백업! 분실 시 앱 업데이트 불가)
keytool -genkeypair -v -keystore keego-upload.jks -alias keego-upload \
  -keyalg RSA -keysize 2048 -validity 10000
# 2) ~/.gradle/gradle.properties 에(저장소 밖, 커밋 금지):
#   KEEGO_UPLOAD_STORE_FILE=/절대경로/keego-upload.jks
#   KEEGO_UPLOAD_STORE_PASSWORD=****
#   KEEGO_UPLOAD_KEY_ALIAS=keego-upload
#   KEEGO_UPLOAD_KEY_PASSWORD=****
# 3) AAB(Play 업로드 포맷) 빌드:
cd android && ./gradlew bundleRelease   # app/build/outputs/bundle/release/app-release.aab
# (Play App Signing 권장 — 업로드 키만 보관)
```

### 5.2 버전 체계
`versionCode`/`versionName` 은 `gradle.properties`/`-P` 로 덮어쓴다(기본 1 / `1.0.0`).
업로드마다 `KEEGO_VERSION_CODE` +1, `KEEGO_VERSION_NAME` SemVer:
```bash
./gradlew bundleRelease -PKEEGO_VERSION_CODE=2 -PKEEGO_VERSION_NAME=1.0.1
```

### 5.3 개인정보 처리방침 공개 URL
- 정적 페이지: `docs/privacy.html`. 앱 내 링크는 `lib/legalLinks.ts`(온보딩 동의 문구 탭→열림).
- **활성화(사용자)**: 저장소 → Settings → Pages → Source `main` / `/docs` → 저장.
  → `https://solelife9.github.io/keego-legal/privacy.html` 열리는지 확인.
- 스토어 등록 정보(Play Data safety / App Privacy)에도 **같은 URL** 입력.
- ⚠️ 방침 본문은 초안 — 법적 자문 후 최종본으로 갱신.

---

## 6. 출시 운영 (2026-08-04 출시 운영 감사 — `docs/audit/07-launch-ops.md`)

> 여기 있는 항목들은 **앱이 잘 도는지**가 아니라 **출시 다음 날 무슨 일이 벌어지고 그때
> 무엇을 할 수 있는지**에 관한 것이다. 앞의 1~5절을 다 통과해도 이게 비면 출시 직후가 깜깜하다.

### 6.1 지원 URL (제출 필수 — 없으면 폼을 못 채운다)
- 원본 `docs/support.html` → 공개 저장소 **keego-legal 에 푸시**해야 200 이 된다
  (privacy/terms 와 동일 규약). 앱 내 상수 = `lib/legalLinks.ts SUPPORT_URL`.
- ASC `Support URL` 은 버전 제출 **필수 입력값**이고 `mailto:` 로 대체할 수 없다.
  Play 등록정보의 지원 웹사이트에도 같은 주소를 넣는다.
- [ ] `https://solelife9.github.io/keego-legal/support.html` 200 확인
- [ ] ASC · Play Console 양쪽에 입력

### 6.2 강제 업데이트 게이트 리허설 (비상 장치를 비상 때 처음 쓰지 않는다)
스토어에 나간 빌드에 데이터 유실급 버그가 있을 때, 심사(iOS 1~2일 / Play 최대 7일)를
기다리는 것 말고 할 수 있는 유일한 조치다. 그런데 **한 번도 켜 본 적이 없다.**
```bash
node scripts/seed-config.mjs                     # 현재 설정 조회(문서 존재 확인)
node scripts/seed-config.mjs --ios https://apps.apple.com/app/idXXXXXXXX \
                             --android https://play.google.com/store/apps/details?id=com.keego.app
```
- [ ] 프로덕션에 `config/app` 문서 생성
- [ ] **스토어 링크 등록**(없으면 게이트 화면이 "검색해서 받으세요" 폴백 — 최후 수단이지 기본이 아니다)
- [ ] `--min` 을 **현재 버전과 같게** 넣어 게이트가 **뜨지 않는 것**까지 확인 → 확인 후 `--off`
- ⚠️ `--min` 은 사용자를 잠그는 스위치다. **고친 버전이 이미 스토어에서 심사를 통과한 뒤에만** 넣는다.
- ⚠️ 한계: 게이트는 **로그인 이후**에만 판정한다(`firestore.rules` 의 `config` 읽기가 signedIn).
  로그인 자체가 깨지는 버그는 이 장치로 못 막는다 — 그때 남는 건 심사 대기뿐이다.

### 6.3 관측성 실제 도착 확인 (배선이 맞아도 콘솔이 안 붙어 있는 경우가 흔하다)
- [ ] **릴리스 빌드에서 의도적으로 크래시 1회** → Firebase Crashlytics 콘솔 도착 확인
      (심볼화된 스택으로 보이는지까지. dSYM 업로드가 안 되면 주소만 나온다)
- [ ] Firebase Analytics 콘솔에 `kg_*` 이벤트 도착 확인 (첫 수집까지 **최대 24시간** 지연)
- [ ] 워치 앱 크래시도 도착하는지 (워치 타깃 Crashlytics — 2026-08-04 추가)

### 6.4 첫 릴리스는 단계적 출시로
- [ ] iOS: App Store Connect **Phased Release** 켜기
- [ ] Android: Play **staged rollout**(예: 20% → 50% → 100%)
- 문제가 보이면 **심사 없이 배포를 멈출 수 있다.** 첫 출시에 가장 값싼 보험이다.
- [ ] iOS **Expedited Review**(신속 심사) 요청 경로를 미리 열어만 볼 것. 남용하면 다음부터
      안 받아주므로 데이터 유실·보안 같은 진짜 긴급 때만 쓰는 카드다.

### 6.5 모집 전 게이트 (`docs/beta-recruiting.md` 문구를 보내기 **전에**)
- [ ] 6.1 지원 URL 게시
- [ ] CI 가 `.github/workflows/` 에서 돌고 있는지 (핫픽스가 게이트 없이 나가는 것을 막는다)
- [ ] 단계 0: 지인 3~5명 실외 러닝 1회 완주·저장 → **크래시 0** 확인 후에 단계 1 발송
- 100명을 한 번에 모으지 않는다. 3~5명 → 15~20명 → 50명+, 단계 사이 **최소 3일**
  (D1 리텐션은 하루가 지나야 존재하는 숫자다).
