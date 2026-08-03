# 앱 ID 변경 — `com.solemate` → `com.keego.app`

> 2026-08-03 · **코드 변경은 끝났습니다. 아래 콘솔 작업이 끝나야 앱이 켜집니다.**
> 순서를 지켜 주세요 — 중간에 빌드하면 Firebase 초기화가 실패합니다.

---

## 왜 지금 바꿨나

앱 ID 는 **출시하는 순간 영구 고정**입니다. 나중에 바꾸려면 완전히 새 앱으로 올려야 하고
사용자·리뷰·순위·다운로드가 전부 0에서 시작합니다.

```
지금 바꾸기 :  반나절 · 사용자 0명 · 되돌릴 수 있음
나중 바꾸기 :  불가능
```

한쪽은 반나절이고 다른 쪽은 영원히 못 합니다. 이 정도로 비대칭이면 확신이 없어도
바꾸는 쪽이 맞습니다. 그리고 브랜드는 이미 **Keego** 인데 안 보이는 데 옛 이름이
박혀 있었습니다 — **안드로이드는 플레이스토어 URL 에 그대로 노출**됩니다
(`play.google.com/store/apps/details?id=...`).

---

## ✅ 제가 끝낸 것 (코드)

| 무엇 | 어디 |
|---|---|
| iOS 번들 ID 3개 | `com.keego.app` · `.RunActivity` · `.watchkitapp` |
| **워치 companion** | `WKCompanionAppBundleIdentifier` — 안 고치면 **워치 페어링이 죽는다** |
| App Group | `group.com.solemate.keego` → `group.com.keego.app`<br>(entitlements · `WatchSessionModule.swift` · `RunActivityBundle.swift`) |
| Android | `applicationId` · `namespace` |
| Android 소스 | `com/solemate/*.kt` → `com/keego/app/` + `package` 선언 5개 |
| 테스트 | 플레이스토어 URL 고정값 |

게이트: `tsc` 0 · lint 에러 0 · **274스위트 3,072테스트** 그린.

---

## ✅ 콘솔 작업 — 2026-08-03 완료

| | 상태 |
|---|---|
| Firebase iOS 앱 등록 + `GoogleService-Info.plist` | ✅ (BUNDLE_ID 검증) |
| 구글 로그인 URL 스킴 교체 | ✅ (plist 에서 읽어 자동 반영, 옛 스킴 잔존 0) |
| Firebase Android 앱 등록 + `google-services.json` | ✅ |
| **Android SHA-1 2개** | ✅ CLI 로 등록 후 설정 재발급 |
| 카카오 iOS 번들 ID · Android 패키지 · 키 해시 | ✅ |
| 네이버 Android 패키지명 (iOS 는 URL 스킴이라 무관) | ✅ |
| 애플 App Group `group.com.keego.app` | ✅ (App ID 3개는 Xcode 자동 생성) |
| 빌드·서명·설치 검증 | ✅ 산출물에서 번들 ID·entitlements 직접 확인 |

### 곁들여 고친 것

- **카카오 '앱 대표 도메인'** 이 이미 철거된 Render 백엔드를 가리키고 있었다
  (`solelife-backend.onrender.com`). 로그인 동의 화면에 사용자에게 보이는 값이라 교체.
- **제공자 표시가 틀리던 버그** — 카카오로 로그인했는데 "네이버 계정"으로 떴다.
  앱 ID 와 무관한 기존 버그였고, `cloud_account` 를 쓰는 곳이 둘이라(LoginScreen +
  계정 정합) 순서가 어긋난 것이었다. 정합 뒤 한 곳에서만 쓰도록 수정 + 회귀 테스트 3건.

---

## ⚠️ 미해결 — 첫 로그인이 두 번 필요했던 건

새 앱 첫 설치 직후, **네 제공자 모두** 첫 탭이 실패하고 두 번째 탭에서 로그인됐다.
그 뒤로는 재현되지 않는다.

배제한 것: App Check(호출되는 곳이 없음) · Cloud Functions 콜드스타트(애플은 서버를
안 거침) · URL 스킴/AppDelegate(애플은 URL 콜백이 없음) · iOS 동의 창(애플도 두 번 필요).
남는 공통점은 `signInWithCredential` 직후뿐이다.

**첫 설치 1회성으로 보이지만 확증하지 못했다.** 다시 나오면 폰 잠금을 푼 채로
`xcrun devicectl device process launch --console com.keego.app` 으로 로그를 잡아야 한다
(잠겨 있으면 iOS 가 실행을 거부한다 — 이번에 그래서 못 잡았다).

---

## ⛔ 남은 것 — 나중에

### ① Firebase — 앱 2개 새로 등록 (제일 먼저)

기존 앱은 **지우지 마세요.** 새로 추가하는 겁니다(같은 프로젝트 `keego-620b8` 안에).

- 콘솔 → 프로젝트 설정 → 내 앱 → **앱 추가**
- **iOS**: 번들 ID `com.keego.app` → `GoogleService-Info.plist` 내려받기
  → `ios/SoleMate/GoogleService-Info.plist` **덮어쓰기**
- **Android**: 패키지명 `com.keego.app` → `google-services.json` 내려받기
  → `android/app/google-services.json` **덮어쓰기**
- ⚠️ Android 는 **SHA-1 지문**도 새 앱에 다시 등록해야 합니다(구글 로그인용).
  기존 앱에 등록해 둔 값을 그대로 복사하면 됩니다.

> **이 단계 전에는 빌드하지 마세요.** 설정 파일의 `BUNDLE_ID` 가 실제 번들 ID 와
> 다르면 Firebase 초기화가 실패합니다.

### ② 구글 로그인 — URL 스킴 교체

새 `GoogleService-Info.plist` 의 `REVERSED_CLIENT_ID` 가 **바뀝니다.**
`ios/SoleMate/Info.plist` 의 URL 스킴에 그 값이 들어가 있으니 새 값으로 바꿔 주세요.
(찾기 어려우시면 새 plist 를 넣어 두시고 말씀해 주세요 — 제가 대조해 고치겠습니다.)

### ③ 카카오 — iOS 번들 ID 변경

- [developers.kakao.com](https://developers.kakao.com) → 내 애플리케이션 → 플랫폼 → iOS
- 번들 ID 를 `com.keego.app` 로 수정
- Android 는 패키지명 `com.keego.app` + **키 해시** 재등록

### ④ 네이버 — 번들 ID / 패키지명 변경

- [developers.naver.com](https://developers.naver.com) → 내 애플리케이션 → API 설정
- iOS 번들 ID · Android 패키지명 둘 다 `com.keego.app`

### ⑤ 애플 — App ID 재생성

- [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list)
  → Identifiers → **+** → App IDs → `com.keego.app`
- **Capabilities 체크**: Sign in with Apple · HealthKit · App Groups · Push Notifications
- App Group 도 새로: `group.com.keego.app`
- 워치·Live Activity 용 App ID 도 함께: `com.keego.app.watchkitapp` · `com.keego.app.RunActivity`

### ⑥ (선택) Play Console · App Store Connect

앱 레코드를 **아직 안 만들었으면** 할 일 없습니다. 만들었다면 패키지명이 다르므로
새로 만들어야 합니다.

---

## 끝나고 반드시 확인할 것

번들 ID 변경은 **로그인을 통째로 끊을 수 있는** 변경입니다. 빌드 후 실기기에서:

- [ ] 앱이 켜진다(Firebase 초기화 통과)
- [ ] **구글 로그인**
- [ ] **애플 로그인**
- [ ] **카카오 로그인**
- [ ] **네이버 로그인**
- [ ] 러닝 저장 → 클라우드 동기
- [ ] 홈 위젯이 데이터를 읽는다 (App Group 이 바뀌었다)
- [ ] 애플워치 페어링 (`WKCompanionAppBundleIdentifier` 가 바뀌었다)

⚠️ **위젯과 워치는 특히 조심.** App Group 이 바뀌어서 **기존에 저장된 위젯 데이터는
안 읽힙니다.** 앱을 한 번 열어 다시 쓰이면 정상으로 돌아옵니다.

---

## 되돌리려면

이 커밋 하나를 revert 하면 코드는 전부 돌아옵니다. 콘솔에 등록한 새 앱은
그냥 두면 됩니다(안 쓰면 아무 일도 안 일어납니다).
