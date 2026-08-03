> 2026-07-29 재감사. 선행 감사: .tenet/spec/ 의 3개 감사 문서 참조.

*(위 줄은 지정된 공통 꼬리말이라 그대로 넣었습니다. 이 감사 자체의 실제 수행일은 **2026-08-02**,
기준 커밋은 `1a1a5a8` 이고, 직접적인 선행 감사는 `.tenet/spec/` 이 아니라 `docs/audit/00-baseline.md`
· `01-store-review-risk.md` 입니다. `.tenet/spec/` 의 3개 감사 문서 — `audit-2026-05-31.md` ·
`audit-2026-06-24-reliability.md` · `2026-06-17-audit-hardening.md` — 는 `00-baseline.md` 가
이미 전수 판정한 상태라 그 판정표를 경유해 반영했습니다.)*

# 05 — App Store 심사관 감사 (제출 자료 ↔ 실제 앱 대조)

작성 2026-08-02 · 기준 커밋 `1a1a5a8` · 감사자: App Store 심사관 관점 · **코드 수정 0**

**범위:** 이미 준비된 `docs/store-privacy-labels.md` · `docs/store-listing.md` ·
`ios/SoleMate/Info.plist` · `ios/SoleMate/PrivacyInfo.xcprivacy` 를 코드와 한 줄씩 대조해
"제출하면 리젝되는가"만 판정했다. 새 자료는 만들지 않았다.

**심각도:** `BLOCKER` 제출 시 리젝 확실 또는 법적 위반 · `MAJOR` 리젝 가능·심사 지연 ·
`MINOR` 출시 후 수정 가능 · `NITPICK` 취향·정합성

**제외 기준(공통 규칙):** `00-baseline.md` 에서 **[해결됨]** 으로 판정된 항목과 선행 감사가 이미
보고한 항목은 넣지 않았다. 무엇을 왜 뺐는지는 §7 에 남겼다.

---

# 0. BLOCKER 요약 — **3건 전부 수정 완료(2026-08-03)**

| # | 항목 | 근거 (파일:줄) | 조항 | 상태 |
|---|---|---|---|---|
| **B-1** | **공개 프로필이 전 이용자에게 공개되는데 신고서·처리방침 어디에도 없다** | `App.tsx:1546` · `lib/firebaseCloudPort.ts:412` · `firestore.rules:122-123` · `docs/privacy.html:82,103` · `docs/store-privacy-labels.md:22-31`(부재) | 5.1.1 / 5.1.2 · 개인정보보호법 §17 | ✅ **해결** |
| **B-2** | **Firebase Analytics 를 쓰면서 신고서는 "Analytics SDK 0 · 미사용"이라 단언한다** | `lib/productAnalytics.ts:21,46,57` · `package.json:23` · `docs/store-privacy-labels.md:4-5` | 5.1.1(i) 데이터 신고 | ✅ **해결** |
| **B-3** | **스토어 설명의 "월간 랭킹"이 실제로는 영구히 빈 화면이다** | `docs/store-listing.md:31` · `lib/featureFlags.ts:34` · `App.tsx:1406` · `HallOfFameScreen.rn.tsx:349` | 2.1 · 2.3.1 · 4.2 | ✅ **해결** |

**세 건 모두 코드 결함이 아니라 신고서·설명 문구의 문제였다.** 조치 내역은 §8.

> 아래 §3 의 상세 진단은 **수정 전 상태를 그대로 남긴다** — 무엇이 왜 문제였는지가 1.1 에서
> 소셜을 다시 열 때의 판단 근거이기 때문이다. 지금 코드 상태는 §8 을 본다.

---

# 1. MAJOR 이하 요약 — **N-4 를 뺀 전부 수정 완료(2026-08-03)**

| # | 항목 | 근거 (파일:줄) | 심각도 | 상태 |
|---|---|---|---|---|
| M-1 | 공개 프로필을 **볼 수 있는 화면이 앱에 없다** — 동의만 받고 아무도 못 본다 | `lib/cloudPort.ts:90-91` · `SocialConsentScreen.rn.tsx:78` | `MAJOR` | ✅ **해결**(다른 세션 `ef39695` — `RunnerProfileScreen`) |
| M-2 | 사진 신고가 **두 문서에서 정반대** (ASC 답안=수집 / xcprivacy=미수집 / 실제=기기 전용) | `docs/store-privacy-labels.md:27` ↔ `__tests__/nativePermissions.test.ts:138-142` · `lib/backup.ts:17-32` | `MAJOR` | ✅ **해결** |
| M-3 | 검색 기록이 **xcprivacy 에만 빠져 있다**(ASC 답안엔 있음) | `docs/store-privacy-labels.md:30` ↔ `ios/SoleMate/PrivacyInfo.xcprivacy`(부재) · `firestore.rules:180-188` | `MAJOR` | ✅ **해결**(+연결 여부 정정) |
| M-4 | 체중·나이·성별·안정시심박을 클라우드에 올리는데 신고 항목이 지정돼 있지 않다 | `App.tsx:1270` · `docs/store-privacy-labels.md:22-31`(부재) | `MAJOR` | ✅ **해결** |
| M-5 | 로그인 게이트가 **약관·처리방침 링크 없이** 계정을 만든다 | `LoginScreen.rn.tsx:63-166` · `App.tsx:2257` ↔ `2283` | `MAJOR` | ✅ **해결** |
| M-6 | 기기 ID — xcprivacy 는 `DeviceID` 선언, ASC 답안은 "UID만" | `ios/SoleMate/PrivacyInfo.xcprivacy` ↔ `docs/store-privacy-labels.md:64` | `MAJOR` | ✅ **해결** |
| N-1 | Apple 로그인 버튼이 공식 마크가 아니라 Ionicons 글리프다 | `LoginScreen.rn.tsx:151` | `MINOR` | ✅ **해결** |
| N-2 | '이름(displayName)' 신고 여부가 **"선택"으로 방치**돼 xcprivacy 와 어긋난다 | `docs/store-privacy-labels.md:44` ↔ `ios/SoleMate/PrivacyInfo.xcprivacy`(`Name` 선언) | `MINOR` | ✅ **해결** |
| N-3 | Google 버튼도 단색 Ionicons 글리프(구글 브랜딩 가이드라인) | `LoginScreen.rn.tsx:130` | `NITPICK` | ✅ **해결** |
| N-4 | 온보딩 히어로 사진의 사용권 근거가 저장소에 없다 | `assets/onboarding/hero-runner-bw.png` · `OnboardingScreen.rn.tsx` | `NITPICK` | ⛔ **`[민우 확인]`** — 출처를 아는 사람만 판정 가능 |

**통과(지적 없음):** 권한 사용 설명 8종 · 미사용 권한 · 백그라운드 위치·오디오 정당성 ·
계정 삭제 인앱 완결 · Sign in with Apple 제공 · 더미 데이터 노출 경로 · 상표(로고·제품사진·
아이콘·스크린샷). 근거는 §4·§5.

---

# 2. 코드가 실제로 수집하는 것 — 전수 목록

**기준: "기기 밖으로 나가는가".** 앱은 로컬-퍼스트라 대부분의 데이터가 기기에도 있지만
App Store 가 묻는 건 *수집(collect)* = 개발자 서버로의 전송이다.

| # | 나가는 데이터 | 근거 (파일:줄) | 목적지 |
|---|---|---|---|
| 1 | GPS 경로 좌표열·거리·페이스 | `lib/runTracker.ts:548-612` → `App.tsx:1520` 동기 | `userBackups/{uid}` + `runDetails/{runId}` |
| 2 | 위치 라벨("성수동, 서울") | `lib/geocode.ts:36-42`(역지오코딩은 OS 온디바이스) | 런 레코드 → `userBackups` |
| 3 | 심박 시계열·안정시심박 | `lib/healthkit.ts:72-73` (HealthKit read) | `runDetails` |
| 4 | 케이던스·고도·칼로리·스플릿·랩 | `lib/laps.ts` · `lib/elevation.ts` · `lib/calories.ts` | `userBackups` |
| 5 | **체중·나이·성별·안정시심박(설정값)** | `App.tsx:1270` `settings:{weight_kg,age,sex,rest_hr}` | `userBackups` → **M-4** |
| 6 | 이메일·표시이름 | `lib/firebaseCloudPort.ts:259-284` (소셜 4종) | Firebase Auth |
| 7 | Firebase UID | `lib/firebaseCloudPort.ts:243-248` | Auth · 문서 키 |
| 8 | 사용자 입력 텍스트 — 신발 이름·닉네임·런 메모·메달 기록 | `lib/backup.ts:17-32` | `userBackups` |
| 9 | 결과 0건 검색어 + `userId` | `firestore.rules:180-188` (`logSearchMiss`) | `search_misses` |
| 10 | 직접 입력한 브랜드·모델 + `userId` | `firestore.rules:189-201` (`requestShoe`) | `shoe_requests` |
| 11 | 🔴 **공개 프로필** — 닉네임·현역 신발 6켤레(이름·주행거리)·명예의전당 12켤레·총거리·이번달 거리·러닝 횟수·VO₂max·평균 페이스·최장 거리·5K/10K/하프/풀 PB | `lib/publicProfile.ts:186-232` → `App.tsx:1546` → `lib/firebaseCloudPort.ts:412` | `profiles/{uid}` — **로그인 전원 읽기 가능**(`firestore.rules:123`) → **B-1** |
| 12 | 🔴 **제품 사용 이벤트 10종** + 앱 인스턴스 ID·기기/OS 정보 | `lib/productAnalytics.ts:29-38,57` | Firebase Analytics → **B-2·M-6** |
| 13 | 크래시 스택·빵부스러기 로그 | `lib/crashlytics.ts:36-45` | Crashlytics |
| 14 | App Check 증명 토큰(DeviceCheck) | `lib/appCheck.ts:46` | Firebase |
| 15 | 카카오·네이버 액세스 토큰(교환용, 일시적) | `lib/firebaseCloudPort.ts:268-276` | Cloud Functions `api` |
| 16 | 월간 랭킹 엔트리 | `lib/progression/firestoreRankingStore.ts:146` | **현재 미전송** — `App.tsx:1406` 이 단락 |
| 17 | FCM 푸시 토큰 | `lib/pushMessaging.ts:82` | **현재 미취득** — `lib/featureFlags.ts:75` 로 단락 |

**기기 밖으로 안 나가는 것(수집 아님):** 러닝화·메달·기록증 **사진** — `lib/backup.ts:17-32`
페이로드에 이미지 바이트가 없다(로컬 파일 경로만) · OCR 인식 결과(온디바이스 Vision/ML Kit,
`lib/ocrNative.ts`) · 역지오코딩 원본 좌표(`lib/geocode.ts:6` — OSM 공용 서버 은퇴, OS 내장 사용).

## 2.1 대조표 — 실제 vs ASC 답안 vs xcprivacy

| 데이터 유형 | 실제 | `store-privacy-labels.md` | `PrivacyInfo.xcprivacy` | 판정 |
|---|---|---|---|---|
| 정확한 위치 | 예 | 예(`:24`) | `PreciseLocation` | ✅ |
| 건강(심박·안정시심박) | 예 | 예(`:25`) | `Health` | ✅ |
| 피트니스 | 예 | 예(`:25`) | `Fitness` | ✅ |
| 이메일 | 예 | 예(`:26`) | `EmailAddress` | ✅ |
| 사용자 ID | 예 | 예(`:28`) | `UserID` | ✅ |
| 충돌 데이터 | 예 | 예(`:29`) | `CrashData` | ✅ |
| 기타 사용자 콘텐츠 | 예 | 예(`:31`) | `OtherUserContent` | ✅ |
| 이름(표시이름) | 예 | **"선택"(`:44`)** | `Name` | `MINOR` N-2 |
| 검색 기록 | 예 | 예(`:30`) | ❌ 없음 | `MAJOR` M-3 |
| 사진 | **아니오** | **예(`:27`)** ❌ | 없음(의도적) | `MAJOR` M-2 |
| 제품 상호작용 | **예** | ❌ **"미사용"(`:4`)** | `ProductInteraction` | `BLOCKER` B-2 |
| 기기 ID | 예 | ❌ UID만(`:64`) | `DeviceID` | `MAJOR` M-6 |
| 체중·나이·성별 | 예 | ❌ 없음 | 없음 | `MAJOR` M-4 |
| **공개 프로필** | **예** | ❌ **전무** | ❌ 전무 | `BLOCKER` B-1 |

> **주목:** `PrivacyInfo.xcprivacy` 는 `ProductInteraction`·`DeviceID` 를 **정확히 선언하고 있고
> 회귀 테스트까지 있다**(`__tests__/nativePermissions.test.ts:132`). 틀린 건 코드가 아니라
> **App Store Connect 에 옮겨 적을 답안 문서**다. 지금 문서대로 설문에 답하면 바이너리의
> 매니페스트와 콘솔 답변이 **서로 모순된 채로** 제출된다.

---

# 3. BLOCKER 상세

## B-1 `BLOCKER` — 공개 프로필이 신고서에도, 처리방침에도 없다

**증거.** 클라우드 동기가 성공할 때마다 돈다:

```
App.tsx:1539            buildPublicProfile({visibility: socialVisibility, nickname, shoes, runs, spec})
App.tsx:1546            publishProfile(cloudPortRef.current, profile)
firebaseCloudPort.ts:412  setDoc(doc(getFirestore(),'profiles',uid), {...profile, updatedAt})
firestore.rules:122-123   match /profiles/{uid} { allow read: if signedIn(); }
```

`lib/publicProfile.ts:186-232` 이 담는 것: 닉네임, 현역 신발 6켤레(이름·누적 km·수명 상한),
은퇴 신발 12켤레, 총 누적거리, 이번 달 거리, 러닝 횟수, VO₂max, 평균 페이스, 최장 거리,
5K·10K·하프·풀 개인 기록.

**두 자료 모두 그런 일이 없다고 말한다.**

- `docs/store-privacy-labels.md:22-31` — 수집 표 8행 어디에도 없다. `profiles` 라는 단어 자체가
  문서 전체에 없다.
- `docs/privacy.html:82` — *"제3자에게 제공·판매하지 않습니다"*
- `docs/privacy.html:103` — *"이 기록은 **다른 이용자에게 공개되지 않으며**…"*

`:103` 은 문맥상 검색어를 가리키지만, 처리방침 전체에 **"다른 이용자에게 공개된다"는 고지가
단 한 줄도 없다.** 이용자는 읽고 "내 기록은 나만 본다"고 이해한다.

**프로젝트가 이 위험을 이미 알고 있었다.** `lib/featureFlags.ts:23-31` 이 리더보드를 켜는 조건
셋을 못 박고, 그중 ③을 이렇게 적었다:

> ③ 처리방침 제3자 공개 조항 …… ⛔ **미완** — 문안은 `docs/legal/social-disclosure.md` 에
> 준비돼 있고, keego-legal 저장소에 반영해 배포해야 한다.
> …**그 전에는 켜지 않는다** — 화면과 동의를 갖춰도 처리방침에 고지가 없으면 "동의 없이 공개"와
> 법적으로 같은 자리다.

**리더보드는 그 규율을 지켰다(`App.tsx:1406` 이 플래그로 단락). 공개 프로필은 지키지 않았다** —
`App.tsx:1546` 에는 플래그가 없고 `socialVisibility` 만 확인한 뒤 곧장 쓴다.

> **베이스라인과의 관계:** `00-baseline.md:179` 의 3-2(진입점 없는 리더보드가 전원 공개 컬렉션에
> 씀)는 **[해결됨]**(`767032e`, 2026-07-30)이라 이 리포트에 다시 넣지 않았다. **B-1 은 그것과
> 다른 컬렉션이다** — `profiles` 는 2026-08-01 에 신설됐고(`firestore.rules:112-121` 주석),
> 베이스라인 작성 시점(`743d2ca`)에 존재하지 않았다. 사고의 **패턴**은 같지만 **항목은 신규**다.

> 설계 자체는 훌륭하다는 점은 밝혀 둔다. `lib/publicProfile.ts:120-127` 은 스프레드를 금지한
> 화이트리스트 전용이라 경로·체중·나이·성별·메모가 **구조적으로** 새어나갈 수 없다. 문제는
> 설계가 아니라 고지다.

**판정:** App Store 는 실제 수집·공개 데이터를 신고하지 않은 상태를 5.1.1/5.1.2 로 리젝한다.
개인정보보호법 §17(제3자 제공·공개 동의)에서도 처리방침 미고지 공개는 그대로 위반이다.

---

## B-2 `BLOCKER` — Analytics 를 쓰면서 "Analytics SDK 0" 이라 신고한다

`docs/store-privacy-labels.md:4-5`:

> **광고·추적·IAP·Analytics SDK 0**, Firebase Analytics 미사용 → **다른 앱/웹 추적 안 함**

**사실이 아니다.**

| 증거 | 파일:줄 |
|---|---|
| SDK 설치됨 | `package.json:23` `"@react-native-firebase/analytics": "^24.0.0"` |
| 모듈 로드 | `lib/productAnalytics.ts:21` `require('@react-native-firebase/analytics')` |
| 인스턴스 획득 | `lib/productAnalytics.ts:46` `mod.getAnalytics()` |
| 이벤트 전송 | `lib/productAnalytics.ts:57` `mod.logEvent(a, name, params)` |
| 이벤트 10종 정의 | `lib/productAnalytics.ts:29-38` |
| 실제 호출부 4곳 | `OnboardingScreen.rn.tsx:668` · `App.tsx:974` · `screens/RunEngine.tsx:545,743` · `ProfileScreen.rn.tsx:336` |
| 기본 켬(opt-out 없음) | `lib/productAnalytics.ts:153-157` 주석: *"사용자 opt-out 스위치가 생기면 여기에 연결한다"* |

Firebase Analytics 는 이벤트 외에 **앱 인스턴스 ID·기기 모델·OS 버전·IP 기반 국가**를 자동
수집한다. 설문에서는 최소 **"사용 데이터 › 제품 상호작용"** + **"식별자 › 기기 ID"** 이고
목적에 **"분석(Analytics)"** 이 포함돼야 한다.

**모듈 자체는 모범적이다** — `lib/productAnalytics.ts:11-15` 가 자유 텍스트 금지·버킷 전용·
`setUserId` 미사용을 원칙으로 못 박았고 실제로 지킨다(`:62-87` 버킷 함수). 하지만 **"조심스럽게
수집한다"와 "수집하지 않는다"는 다르다.** 설문은 후자로 답하게 돼 있다.

**모순의 증거:** `ios/SoleMate/PrivacyInfo.xcprivacy` 는 이미 `ProductInteraction`
(linked: false, purposes: **Analytics**, AppFunctionality)과 `DeviceID` 를 선언했고,
`__tests__/nativePermissions.test.ts:132` 가 그 선언을 강제한다:

```
// 제품 계측(lib/productAnalytics) — 선언 없이 수집하면 App Privacy 표기와 어긋난다.
'NSPrivacyCollectedDataTypeProductInteraction',
```

**즉 바이너리는 옳고 답안 문서만 낡았다.** 문서는 2026-07-19 초안이고 계측은 그 뒤에 붙었다.
같은 사유로 검색 기록은 **이미 한 번 정정됐는데**(`docs/store-privacy-labels.md:41-43`)
Analytics 는 그 정정에서 누락됐다.

> **추적(Tracking)은 계속 "아니오"가 맞다.** IDFA 미사용이고 AdSupport 프레임워크도 링크돼 있지
> 않다(`ios/SoleMate/PrivacyInfo.xcprivacy` `NSPrivacyTracking: false`). ATT 프롬프트 불필요.

---

## B-3 `BLOCKER` — "월간 랭킹"은 심사관이 열면 100% 빈 화면이다

`docs/store-listing.md:31`: *"· **월간 랭킹**, 업적과 랭크"*

화면도 진입 경로도 실재한다(`HallOfFameScreen.rn.tsx` · `App.tsx:2481`). 그런데:

```
lib/featureFlags.ts:34   export const LEADERBOARD_PUBLISH_ENABLED = false;
App.tsx:1406             if(!LEADERBOARD_PUBLISH_ENABLED) return;   // 발행이 여기서 끝난다
```

**아무도 엔트리를 발행하지 않는다.** `leaderboards/{ym}/entries` 는 어느 달에도 비어 있고
화면은 항상 빈 상태를 그린다:

```
HallOfFameScreen.rn.tsx:349   title={loadFailed ? '지금은 오프라인이에요' : '랭킹이 곧 열려요'}
```

**심사관이 정확히 밟게 되는 경로:** 신발 등록 → `App.tsx:2291` 이 공개 범위 동의 화면을 띄움
→ "이대로 공개하기" → `App.tsx:2481` 이 `socialVisibility==='public'` 일 때만 진입점을 주입
→ 마이 → 명예의 전당 → **"랭킹이 곧 열려요."**

세 조항에 동시에 걸린다:
- **2.1 App Completeness** — 동작하지 않는 기능 제출
- **2.3.1** — 설명이 실제 동작을 반영하지 않음
- **4.2** — 카피가 문자 그대로 *"곧 열려요"*. Apple 은 앱 내 'coming soon' 표시를 반복 리젝해 왔다

> **B-1 을 플래그로 막으면 이 경로도 함께 막힌다** — 공개 동의를 안 받으면 `App.tsx:2481` 의
> 진입점 조건이 성립하지 않는다.

---

# 4. MAJOR / MINOR / NITPICK 상세

## M-1 `MAJOR` — 공개 프로필을 볼 수 있는 화면이 앱에 없다

`profiles` 컬렉션을 **읽는 코드가 저장소에 없다.**

| 확인 | 파일:줄 |
|---|---|
| 포트 계약에 읽기 API 자체가 없다(`put`/`delete` 둘뿐) | `lib/cloudPort.ts:90-91` |
| 구현도 쓰기·삭제뿐 | `lib/firebaseCloudPort.ts:412,419` |
| `SocialProfileCard` 의 유일한 사용처 = **자기 카드 미리보기** | `SocialConsentScreen.rn.tsx:78` |
| 랭킹이 보여주는 신발은 `profiles` 가 아니라 리더보드 `shoes_summary` (발행 자체가 꺼짐) | `lib/progression/firestoreRankingStore.ts:129,165` |

**정리:** 앱은 동의를 받고 → 개인 기록을 전원 읽기 가능한 컬렉션에 올리고 → **볼 방법을 주지
않는다.** 동의 화면은 *"다른 러너에게 내 프로필이 이렇게 보입니다"*
(`SocialConsentScreen.rn.tsx:75`)라고 말하는데 **그 '다른 러너'가 볼 화면이 없다.**
B-1 을 §6 A안으로 처리하면 함께 사라진다.

## M-2 `MAJOR` — 사진 신고 방향이 두 문서에서 반대다

- `docs/store-privacy-labels.md:27` — 사진을 **"수집: 예"** 로 신고.
- `__tests__/nativePermissions.test.ts:138-142` — xcprivacy 에서 사진을 **의도적으로 제외**하고
  테스트가 그걸 강제한다: *"사진은 수집으로 선언하지 않는다(기기에만 저장 — 과잉 선언도 부정확)"*.

**코드 확인 결과 xcprivacy 가 옳다.** `lib/backup.ts:17-32` 의 `BackupPayload` 는
`shoes`·`runs`·`settings`·`progression`·`medals` 뿐이고 이미지 바이트가 없다. `CHECKLIST.md`
§3 #3 의 "사진 클라우드 미백업 — 재설치하면 영구 소실"과도 일치한다.
→ **ASC 답안에서 사진 행을 삭제한다.** 과잉 신고도 부정확한 신고다.

## M-3 `MAJOR` — 검색 기록이 xcprivacy 에만 빠졌다

`search_misses` 는 검색어를 실제로 올린다(`firestore.rules:180-188` 이 `query` 필드를 형태
검증한다). ASC 답안에는 있는데(`docs/store-privacy-labels.md:30`) `ios/SoleMate/PrivacyInfo.xcprivacy`
의 `NSPrivacyCollectedDataTypes` 에는 `SearchHistory` 항목이 없다(파싱해 전수 확인:
`PreciseLocation`·`Health`·`Fitness`·`UserID`·`EmailAddress`·`Name`·`DeviceID`·`CrashData`·
`ProductInteraction`·`OtherUserContent` 10종뿐).
→ `NSPrivacyCollectedDataTypeSearchHistory`(linked: true, AppFunctionality) 추가 +
`__tests__/nativePermissions.test.ts:127-136` 기대 목록에도 추가.

## M-4 `MAJOR` — 체중·나이·성별·안정시심박의 신고 항목이 지정돼 있지 않다

```
App.tsx:1270  settings:{unit,goal_weekly_km:goalWeeklyKm,alerts,weight_kg:weightKg,age,sex,rest_hr:restHR,updated_at:settingsTs}
```

이 `settings` 는 `userBackups/{uid}` 로 그대로 올라간다. 체중·안정시심박은 "건강"으로 덮이지만
**나이·성별은 Apple 의 어느 기존 유형에도 자동으로 들어가지 않는다** — `기타 데이터 유형
(Other Data Types)` 으로 신고하는 것이 맞다. ASC 답안(`:22-31`)과 xcprivacy 양쪽 모두 없다.
Play 는 "개인 정보 › 기타 정보"에 해당.

## M-5 `MAJOR` — 약관·처리방침 링크 없이 계정이 만들어진다

`App.tsx` 렌더 사다리 순서:

```
App.tsx:2257   if(!authUser) return <LoginScreen …/>              ← 여기서 Firebase 계정 생성
App.tsx:2283   return <OnboardingScreen onDone={completeOnboarding}/>  ← 약관 고지는 여기
```

`LoginScreen.rn.tsx:63-166` 전문을 확인했다 — **처리방침·이용약관 링크가 없다.** 있는 건
가치 3행(`:73-83`)과 각주 *"로그인하면 신발·러닝 기록·설정이 안전하게 보관되고…"*(`:160-162`)
뿐이다. `PRIVACY_URL`/`TERMS_URL` 을 쓰는 화면은 `ProfileScreen.rn.tsx:601,611` 과
`OnboardingScreen.rn.tsx:32,379-383` 둘인데 **둘 다 계정 생성 뒤에 나온다.**

- **5.1.1(ii)** — 계정 생성 시점의 처리방침 접근. 심사관에 따라 갈리지만 실제 리젝 사례가 있다.
- **한국법** — 회원가입 시 약관·수집 동의가 먼저다. 온보딩은 위치기반서비스 약관을 이름으로
  구분해 잘 처리하고 있다(`OnboardingScreen.rn.tsx:379-383` 주석) — **순서만 뒤집혀 있다.**

→ `LoginScreen.rn.tsx:160` 각주를 *"계속하면 [이용약관]과 [개인정보 처리방침]에 동의하는
것으로 봅니다."* 로 바꾸고 `lib/legalLinks.ts` 의 URL 을 `Linking` 으로 연결.

## M-6 `MAJOR` — 기기 ID 신고 누락

`ios/SoleMate/PrivacyInfo.xcprivacy` 는 `DeviceID`(linked: true, AppFunctionality)를 선언했는데,
`docs/store-privacy-labels.md:64` 의 Play 표는 "기기 또는 기타 ID = 사용자 ID(UID)"만 적었고
App Store 표(`:22-31`)에는 기기 ID 행이 아예 없다. 오히려 `:10-11` 이 *"'기기 또는 기타 ID'에
푸시 토큰을 넣지 말 것"* 이라고 못 박는다 — **푸시 토큰은 미수집이 맞다**(`lib/featureFlags.ts:75`
가 `getToken` 을 단락). 그러나 그 자리를 **Analytics 앱 인스턴스 ID** 가 채운다(B-2 와 같은 뿌리).

## N-1 `MINOR` — Apple 로그인 버튼의 로고가 공식 마크가 아니다

버튼 스타일은 공식 스펙을 정확히 따랐다 — 다크 배경 위 흰 버튼, 검정 라벨, 공식 한국어
"Apple로 계속하기"(`LoginScreen.rn.tsx:145-153`, 주석이 4.8 을 인용). **로고만 Ionicons 글리프**다:

```
LoginScreen.rn.tsx:151   <Ionicons name="logo-apple" size={ri(ICON.action)} color={BLACK} />
```

Apple 은 SIWA 버튼에 자사 제공 에셋(또는 `ASAuthorizationAppleIDButton`)을 요구한다. Ionicons
의 사과 글리프는 유사 도형이지 공식 마크가 아니다.
→ `expo-apple-authentication`(`package.json:36` 이미 설치됨)의 `AppleAuthenticationButton`
또는 공식 마크 SVG 로 교체. 나머지는 이미 맞으므로 아이콘 한 곳만 바꾸면 된다.

## N-2 `MINOR` — '이름' 신고 여부가 "선택"으로 방치돼 있다

`docs/store-privacy-labels.md:44` — *"이름은 소셜 로그인의 표시이름(displayName)만 계정 표시용으로
보관 — 별도 수집 항목으로 신고할지는 **선택**(…보수적으로 포함 권장)"*.
그런데 `ios/SoleMate/PrivacyInfo.xcprivacy` 는 **이미 `Name` 을 선언했다.** 선택으로 두면 두
문서가 어긋난 채 제출된다. → **'신고'로 확정**해 답안 표에 행으로 올린다.

## N-3 `NITPICK` — Google 버튼도 단색 Ionicons 글리프

```
LoginScreen.rn.tsx:130   <Ionicons name="logo-google" size={ri(ICON.inline)} color={signingIn ? T3 : T1} />
```

Google 브랜딩 가이드라인은 4색 "G" 마크를 요구한다. App Store 리젝 사유는 아니지만 구글의
상표 정책 위반이고 OAuth 브랜딩 검수에서 지적될 수 있다.

> **카카오·네이버는 정상이다** — `primitives.tsx` 의 `KakaoMark`·`NaverMark` 를 각 사 지정색
> (`theme.ts` `KAKAO_YELLOW`·`NAVER_GREEN`)과 함께 쓴다. 두 회사는 가이드라인이 로고 사용을
> **요구**하므로 올바른 상표 사용이다.

## N-4 `NITPICK` — 온보딩 히어로 사진의 사용권 근거가 없다

`assets/onboarding/hero-runner-bw.png` — 앱에 번들되는 유일한 사진 자산인데 출처·라이선스
기록이 저장소에 없다. 상표 문제는 아니지만 저작권·초상권 이슈는 될 수 있다.
`[민우 확인]` 직접 촬영했거나 상업적 사용이 허용된 소스인지 확인 필요. 애매하면 브랜드
정체성상(2026-07-10 "비주얼 없음" 결정) 빼는 쪽이 일관되기도 하다.

---

# 5. 통과 항목 (지적 없음 — 근거만 남긴다)

## 5.1 Info.plist 권한 사용 설명 — 전부 구체적

| 키 | 위치 | 문구 |
|---|---|---|
| `NSLocationAlwaysAndWhenInUse` | `Info.plist:75-76` | "화면을 꺼도 러닝 거리·경로를 계속 기록하려면…" |
| `NSHealthShare` | `:77-78` | "애플워치의 심박 데이터로 러닝 부하와 체력 분석을…" |
| `NSHealthUpdate` | `:79-80` | "Keego에서 기록한 러닝을 Apple 건강에 워크아웃으로 저장해요." |
| `NSLocationWhenInUse` | `:81-82` | "러닝 중 경로와 거리를 기록하기 위해…" |
| `NSMotion` | `:83-84` | "케이던스(분당 걸음 수)와 고도 변화를 정확히 측정하기 위해…" |
| `NSPhotoLibraryAdd` | `:85-86` | "러닝 공유 카드를 사진 보관함에 저장하기 위해…" |
| `NSPhotoLibrary` | `:87-88` | "러닝화 사진을 등록하기 위해…" |
| `NSCamera` | `:89-90` | "메달·기록증·러닝화 사진을 촬영하기 위해…" |

**뭉뚱그린 문구가 하나도 없다** — "서비스 향상을 위해" 류가 0건이고, 전부 *어떤 기능이 그
권한을 쓰는지*를 이름으로 말한다. 워치 타깃도 동일하며
(`ios/SoleMateWatch Watch App/Info.plist:13-18`), 건강 읽기는 *"이 권한이 없으면 심박이
측정되지 않아요"* 라고 결과까지 밝힌다.

## 5.2 선언만 하고 안 쓰는 권한 — 없음

| 선언 | 실제 사용 근거 |
|---|---|
| 위치(항상/사용중) | `lib/locationService.ts:84-101,165-176` |
| 건강 읽기/쓰기 | `lib/healthkit.ts:72,75` |
| 동작·피트니스 | `lib/pedometerDistance.ts` · Android `ACTIVITY_RECOGNITION`(`AndroidManifest.xml:8`) |
| 사진·카메라 | `lib/photo.ts` · `MedalCamera.tsx` |
| 알림 | `lib/localReminder.ts`(OS 로컬 스케줄) · `AndroidManifest.xml:44` |
| **마이크** | **의도적 미선언** — `Info.plist:91-93` 주석 + `__tests__/nativePermissions.test.ts:100` 회귀 가드 |
| `UIBackgroundModes: audio` | `Info.plist:118` ← `lib/runVoice/voice.ts:21` `shouldPlayInBackground:true` |
| `UIBackgroundModes: location` | `Info.plist:117` ← 백그라운드 러닝 추적 |
| `NSSupportsLiveActivities` | `Info.plist:99` ← `lib/liveActivity.ts` · `ios/RunActivity/` |
| iPad 방향 키(`:139-145`) | `ios/SoleMate.xcodeproj/project.pbxproj:651` `TARGETED_DEVICE_FAMILY = 1`(iPhone 전용)이라 무해 |

## 5.3 백그라운드 위치의 정당성 — 성립

핵심 기능 자체가 백그라운드 위치다. 심사에 유리한 조건도 갖췄다:
- 사전 설명 화면이 OS 다이얼로그 **전에** 뜬다 — `LocationPrimeScreen.rn.tsx` · `App.tsx:2312`
- 백그라운드 권한을 거부해도 포그라운드 추적은 graceful — `AndroidManifest.xml:20-22` 주석
- Android 는 `location` 타입 포그라운드 서비스로 기동해 알림이 상시 표시 — `lib/foregroundService.ts`

> `[민우 확인]` **Play 콘솔**은 별도로 백그라운드 위치 **선언 양식 + 시연 영상**을 요구한다
> (`docs/store-privacy-labels.md:66` 이 이미 예고). iOS 는 불필요.

## 5.4 계정 삭제 — 앱 안에서 완결

`ProfileScreen.rn.tsx:1195`(진입) → `:371-395`(확인 다이얼로그) → `App.tsx:1619-1624` →
`lib/firebaseCloudPort.ts:291-341`

삭제 범위: `runDetails` 하위 문서 순회(`:301-306`) → 백업 본체(`:307`) → **`profiles/{uid}`**
(`:309`) → 최근 N개월 리더보드 엔트리(`:319-328`) → Firebase Auth 계정(`:333`) → 로컬 초기화.
`requires-recent-login` 을 한국어 안내로 변환(`:335-338`). **5.1.1(v) 충족.** 외부 링크 아님.

> 잔여 1건은 **신규가 아니다** — `search_misses`·`shoe_requests` 의 `userId` 가 탈퇴 후에도
> 남는 문제는 `CHECKLIST.md §3 #2` 가 이미 결정 대기로 올려 뒀다. 여기서 다시 세지 않는다.

## 5.5 Sign in with Apple — 제공됨

로그인이 강제이고 제3자 소셜을 쓰므로 4.8 이 SIWA 를 요구한다.
`LoginScreen.rn.tsx:135` — `Platform.OS === 'ios'` 일 때 렌더. 스타일은 공식 스펙 준수
(로고만 N-1).

## 5.6 빈 화면·더미 데이터·미완성 노출 경로

| 경로 | 상태 | 근거 |
|---|---|---|
| 랭킹(명예의 전당) | ❌ 영구 빈 화면 | **B-3** |
| 데모 신발/런 | ✅ 3중 게이트 | `App.tsx:924` `__DEV__ && NODE_ENV!=='test' && liveShoes.length===0` |
| 온보딩 미리보기 | ✅ `__DEV__` 게이트 | `App.tsx:336` |
| 러닝화 아카이브·보관함·메달 아카이브 | ✅ 의미 있는 빈 상태 | `HallOfShoes.rn.tsx:331-332` · `ShoeArchiveScreen.rn.tsx:49` |
| 구매가·가격 조회 UI | ✅ 노출 없음 | 커밋 `1a1a5a8` 에서 되돌림. 앱에 가격 조회 코드 0건 |
| 제휴 링크 | ✅ 실물 상품 외부 구매 = IAP 불필요(3.1.1 예외) | `lib/affiliate.ts:29-31`(태그는 빈 값) |

## 5.7 상표 — 문제 없음

**① 브랜드 로고 이미지 0건.** 앱에 번들되는 이미지는 정확히 3개다 — `assets/tab-shoe.png` ·
`assets/tab-shoe-fill.png`(자체 제작 탭 아이콘) · `assets/onboarding/hero-runner-bw.png`.
신발 브랜드 로고 파일은 없다. 2026-07-10 "비주얼 없음" 결정(신발 = 글리프 + 수명 링 + 타이포,
`primitives.tsx` `ShoeGlyph`)이 리스크를 구조적으로 제거했다.

**② 제품 사진 0건.** `data/shoes.json`(624켤레)에 이미지 URL 필드가 없고, 원격 제품컷을
받아오는 코드 경로도 없다.

**③ 텍스트 브랜드명 — 허용 범위.** "NIKE Pegasus 41" 처럼 **이름만** 표시한다. 지시적 공정사용
이고 러닝화 관리 앱의 성립 조건이다.

**④ 앱 아이콘.** `ios/SoleMate/Images.xcassets/AppIcon.appiconset/icon-1024.png` 을 직접 열어
확인 — 검정 배경 위 오렌지 열린 링. 타사 요소 없음. 워치·안드로이드 런처 아이콘도 동일 계열.

**⑤ 스크린샷 6장.** `~/Desktop/keego-스토어-스크린샷/` 실물을 열어 확인. #1(홈)·#2(신발탭)에
NIKE·HOKA·ADIDAS 가 **텍스트로만** 보이고 로고·제품 사진은 없다. 앱 이름·부제·키워드에도
타사 상표가 없다(`docs/store-listing.md:39-40` — 2026-07-21 에 '나이키·스트라바' 제거).

---

# 6. 무엇부터 고치면 되는가

| 순서 | 할 일 | 대상 | 소요 | 해소 |
|---|---|---|---|---|
| 1 | 공개 프로필 발행에 플래그를 씌운다 + 동의 게이트 차단 | `App.tsx:1546` · `App.tsx:2291` | 30분 | **B-1·B-3·M-1** |
| 2 | 설명에서 "월간 랭킹, " 삭제 | `docs/store-listing.md:31` | 1분 | B-3 확정 |
| 3 | "Analytics 미사용" 삭제 + 제품 상호작용·기기 ID 2행 추가 | `docs/store-privacy-labels.md:4-5,22-31` | 20분 | **B-2·M-6** |
| 4 | 사진 행 삭제 · 이름을 '신고'로 확정 · 나이·성별을 기타 데이터로 추가 | `docs/store-privacy-labels.md:27,44` | 20분 | M-2·M-4·N-2 |
| 5 | xcprivacy 에 `SearchHistory`·`OtherDataTypes` 추가 + 테스트 기대 갱신 | `ios/SoleMate/PrivacyInfo.xcprivacy` · `__tests__/nativePermissions.test.ts:127-136` | 20분 | M-3 |
| 6 | 로그인 화면에 약관·처리방침 링크 한 줄 | `LoginScreen.rn.tsx:160` | 30분 | M-5 |
| 7 | Apple 로그인 로고를 공식 마크로 | `LoginScreen.rn.tsx:151` | 20분 | N-1 |
| 8 | Play 데이터 보안 표에 앱 상호작용 추가 | `docs/store-privacy-labels.md:54-64` | 5분 | B-2(Play) |

**1·2 만 해도 BLOCKER 3건이 전부 해소된다.** 3~5 는 같은 문서를 손보는 작업이라 묶는 게 낫다.

**B-1 의 대안(B안):** `docs/legal/social-disclosure.md` 문안을 `docs/privacy.html` 에 반영하고
**공개 저장소 `solelife9/keego-legal` 에 푸시**한 뒤 신고서에 공개 항목을 추가하는 길도 있다.
권하지 않는다 — 뷰어가 없어(M-1) "볼 수도 없는 기능을 위해 개인정보를 공개하고 법적 고지를
새로 배포하는 것"이 된다. 소셜은 뷰어까지 갖춘 1.1 에서 한 번에 여는 게 맞다.

---

# 7. 공통 규칙에 따라 **빼거나 접은** 항목

리포트에 넣지 않은 것과 그 이유를 남긴다(중복 보고 방지).

| 항목 | 왜 뺐나 |
|---|---|
| 진입점 없는 리더보드가 전원 공개 컬렉션에 씀 | `00-baseline.md:179` 3-2 **[해결됨]**(`767032e`). B-1 은 **다른 컬렉션**(`profiles`, 2026-08-01 신설)이라 별건으로 보고 |
| 탈퇴 후 리더보드 엔트리 잔존 | `00-baseline.md:198` 3-3 **[해결됨]**. `lib/firebaseCloudPort.ts:319-328` 로 재확인 |
| 백그라운드 트래킹 부재 | `00-baseline.md:38` #1 **[해결됨]**. 이번엔 "권한이 정당한가"만 봤고 정당했다(§5.3) |
| 권한 거부·주행 중 회수 graceful | `00-baseline.md:65` **[해결됨]** |
| iOS 권한 요청 자체 없음 | `00-baseline.md:66` **[해결됨]** |
| **로그인 강제**(5.1.1(i)) | 신규 아님 — `00-baseline.md:257` 3-6 `MAJOR` · `01-store-review-risk.md:173` B-1. 2026-07-30 에 "소셜 전용" 으로 결정되고 `MINOR` 로 하향된 상태라 그 결정을 유지 |
| `aps-environment: development` | 신규 아님 — `00-baseline.md:142` · `01-store-review-risk.md` A-2 `BLOCKER` |
| 처리방침 공개 URL 응답 | `00-baseline.md:138` **[확인불가]** → 이후 200 확인(`docs/store-privacy-labels.md:81-84`) |
| `search_misses`·`shoe_requests` 의 `userId` 탈퇴 후 잔존 | 신규 아님 — `CHECKLIST.md §3 #2` 결정 대기 항목 |
| Android 서명·Maps 키·Play 데이터보안 폼 | `01-store-review-risk.md` A-3·A-4·C-* 소관 |

## 7.1 처음 의심했다가 코드 확인 후 접은 것

`solemate-external-audit-verify-first` 의 교훈대로 부재 주장일수록 열어 봤다.

| 처음 의심 | 실제 | 확인 |
|---|---|---|
| 리더보드가 동의 없이 발행될 것 | 플래그 + `socialVisibility` 이중 가드로 막혀 있다 | `App.tsx:1406,1409` |
| 구매가·가격 조회 UI 가 미완성으로 노출될 것 | 앱에 코드 자체가 없다 | 커밋 `1a1a5a8` |
| 사진이 클라우드로 올라갈 것 | 페이로드에 이미지 없음 — xcprivacy 판단이 옳았다 | `lib/backup.ts:17-32` |
| 백그라운드 오디오가 미사용 선언일 것 | 실제 사용 | `lib/runVoice/voice.ts:21` |
| iPad 방향 키가 미대응 노출일 것 | iPhone 전용이라 무해 | `project.pbxproj:651` |
| FCM 토큰을 받아 저장할 것 | 플래그로 `getToken` 단락 | `lib/featureFlags.ts:75` · `lib/pushMessaging.ts:82` |

---

---

# 8. 조치 내역 (2026-08-03 — BLOCKER 3건)

> 감사 단계는 코드를 읽기만 했다(공통 규칙). 이 절의 변경은 **감사 종료 후 민우님이 "블로커
> 3건 고쳐줘"라고 별도 지시**해서 수행한 것이다.

## B-1 — 공개 프로필 발행을 플래그로 막았다 (§6 A안)

| 변경 | 내용 |
|---|---|
| `lib/featureFlags.ts` | `SOCIAL_PROFILE_PUBLISH_ENABLED = false` 신설. 끈 이유 4가지와 **켜는 조건 셋**(①옵트인 ✅ / ②볼 화면 ⛔ / ③처리방침 고지 ⛔)을 `LEADERBOARD_PUBLISH_ENABLED` 와 같은 형식으로 명시 |
| `App.tsx:1546` | `SOCIAL_PROFILE_PUBLISH_ENABLED ? buildPublicProfile({...}) : null` |
| `App.tsx:2291` | 동의 화면(`consentGateOn`)이 플래그를 따르게 — 꺼진 기능의 동의는 받지 않는다 |

**핵심은 "멈춤"이 아니라 "내림"이다.** 호출을 건너뛰면 **이미 발행된 프로필이 서버에 그대로
남는다.** 그래서 플래그가 꺼져 있을 때 `null` 을 넘긴다 — `lib/publicProfile.publishProfile`
은 `null` 을 "지우라"로 읽으므로(`:281-289`), 다음 동기에서 기존 문서가 **내려간다.**
회귀 테스트가 이 삼항의 `else` 가지가 `null` 인지까지 검사한다.

> **탈퇴 경로는 원래부터 안전했다** — `lib/firebaseCloudPort.ts:309` 가 이미
> `profiles/{uid}` 를 지운다(§5.4).

## B-2 — 신고서의 Analytics 오기를 정정했다

`docs/store-privacy-labels.md`:
- 상단 "Analytics SDK 0 · Firebase Analytics 미사용" → **정정 주석**으로 교체(왜 오기였는지,
  xcprivacy 는 이미 옳았다는 사실 포함)
- App Store 표에 2행 추가 — **사용 데이터 › 제품 상호작용**(분석) · **식별자 › 기기 ID**(분석),
  둘 다 **연결 안 됨**(`setUserId` 미사용이 근거) + 각주 `***`
- §3 '수집하지 않는 것'에 정정 이력 추가(검색 기록 정정과 같은 형식)
- Play 데이터 보안 표에 **앱 활동 › 앱 상호작용** 추가 + 기기 ID 행에 Analytics 인스턴스 ID 병기

**추적(Tracking)은 "아니오"로 유지했다** — IDFA 미사용·AdSupport 미링크가 근거다.

## B-3 — 없는 기능 광고를 지우고, 진입점을 데이터 플래그에 묶었다

| 변경 | 내용 |
|---|---|
| `docs/store-listing.md:31` | `· 월간 랭킹, 업적과 랭크` → `· 업적과 랭크` |
| `App.tsx:2481` | `LEADERBOARD_PUBLISH_ENABLED && socialVisibility==='public'` 일 때만 `onOpenHallOfFame` 주입 |

설명만 지우면 화면은 여전히 도달 가능하다. **진입점이 '데이터를 만드는 플래그'를 따라가게**
한 것이 근본 수정이다 — 발행이 꺼져 있으면 리더보드는 어느 달이든 비어 있으므로, 그 상태에서
문을 열어 두는 것 자체가 2.1·4.2 위반이다.

## 회귀 가드

`__tests__/socialProfilePublishFlag.test.ts` 신설 — `leaderboardPublishFlag.test.ts` 와 같은
두 겹 구조(값 + 정적 스캔) + 3가지 추가 검사:
① 꺼졌을 때 `null` 을 넘겨 **내리는지**, ② 동의 화면이 플래그를 따르는지,
③ 랭킹 진입점이 `LEADERBOARD_PUBLISH_ENABLED` 를 함께 보는지, ④ 스토어 설명이 없는 기능을
광고하지 않는지. 발행 구현·동의 화면이 **삭제되지 않고 남아 있는지**도 고정한다(1.1 재개봉 전제).

`__tests__/leaderboardPublishFlag.test.ts` 의 import 정규식을 한 곳 넓혔다 — 이름 하나만
허용하던 패턴이라 같은 구문에 플래그가 하나 더 붙자 깨졌다. 검사 의도("이 플래그를
featureFlags 에서 가져오는가")는 그대로다.

---

# 9. 조치 내역 2차 (2026-08-03 — 나머지 전부)

## 9.0 먼저 한 것: 선제검사 — **정답이 두 군데 바뀌어 있었다**

고치기 전에 현재 코드를 다시 읽었고, **감사 시점(08-02)의 정답이 이미 낡아 있었다.**
그대로 "감사서에 적힌 대로" 고쳤으면 새 오답을 만들 뻔했다.

| 감사 시점(08-02) | 지금(08-03) | 출처 |
|---|---|---|
| 검색어·신발요청에 `userId` 가 함께 저장됨 → **연결됨**으로 신고 | `userId` **제거됨** → **연결 안 됨**이 정답 | 다른 세션 `6852e02` |
| 공개 프로필을 볼 화면이 없음(M-1) | 뷰어 **완성**(`RunnerProfileScreen`) | 다른 세션 `ef39695` |

→ 검색 기록을 `Linked: false` 로 선언했고, `SOCIAL_PROFILE_PUBLISH_ENABLED` 주석의 켜는 조건
②를 ✅ 로 갱신했다(**남은 건 ③ 처리방침 배포 하나**).

## 9.1 신고 정합성 (M-2·M-3·M-4·M-6·N-2)

`ios/SoleMate/PrivacyInfo.xcprivacy` 에 **2종 추가**:
- `SearchHistory` — **Linked: false**. 근거: `6852e02` 이후 계정 미첨부이고, `firestore.rules`
  가 `keys().hasOnly(['query','createdAt'])` 로 **서버에서 강제**한다(코드가 되돌아가도 거부된다).
- `OtherDataTypes` — Linked: true. 나이·성별(`App.tsx:1270`). 체중·안정시심박은 `Health` 가 덮는다.
- `DeviceID` 에 `Analytics` 목적 추가(기존 `AppFunctionality` 유지).

`docs/store-privacy-labels.md`:
- **사진 행 삭제** — 백업 페이로드에 이미지가 없다(`lib/backup.ts`). *과잉 신고도 부정확한
  신고다*: 심사관이 "사진을 어디에 올리느냐"고 물으면 답이 없다.
- **이름 행 추가**(선택 → 확정) · **기타 데이터 유형 행 추가**(나이·성별) ·
  **기기 ID 행 추가** · 검색 기록·제품 상호작용을 **연결 안 됨**으로 정정.
- Play 표도 같은 내용으로 정합화(사진 = 아니오, 기타 정보 = 예, 앱 상호작용 = 예).

## 9.2 로그인 게이트 (M-5)

`LoginScreen.rn.tsx` 에 약관·처리방침 링크를 넣었다 — *"계속하면 [이용약관]과 [개인정보
처리방침]에 동의하는 것으로 봅니다."* `lib/legalLinks` 의 공개 URL 을 `Linking` 으로 연다.

디자인은 **색이 아니라 밑줄로** 구분했다(무채 액센트 원칙 — 링크를 파랗게 칠하면 CTA 와
경쟁한다). 온보딩의 위치기반서비스 약관 고지는 **그대로 뒀다** — 개인위치정보는 일반 약관과
구분되는 별도 동의라 두 곳 다 필요하다.

## 9.3 브랜드 마크 (N-1·N-3)

`primitives.tsx` 에 `AppleMark`·`GoogleMark` 신설 — `KakaoMark`·`NaverMark` 와 같은 관례다.
Ionicons 의 `logo-apple`·`logo-google` 은 각 사가 배포한 마크가 아니라 유사 도형이다.

- **Apple**: 흰 버튼 위 검정 공식 마크(4.8 · HIG). 네이티브 `AppleAuthenticationButton` 을
  쓰지 않은 이유는 높이·라운드·타이포가 고정이라 나머지 3개 버튼과 어긋나기 때문이고,
  애플은 커스텀 버튼을 허용하되 **로고·문구·대비**를 요구하는데 이 화면은 셋 다 지킨다.
- **Google**: 공식 4색 G. `color` prop 을 **받지 않는 시그니처**로 만들어 재색칠을 구조적으로
  막았고, 비활성은 `opacity` 로만 표현한다(마크를 회색으로 칠하는 것 자체가 위반이다).
- 색은 `theme.ts` 의 `GOOGLE_G` 토큰으로 올렸다 — 프리미티브 raw hex 0 원칙(CLAUDE.md).
  이걸 안 하면 `slice-3-design` 회귀 가드가 빨개진다(실제로 한 번 걸렸고, 그게 옳은 동작이다).

**렌더해서 눈으로 확인했다** — 두 마크 모두 정상 지오메트리(애플 = 잎 + 베어문 자국,
구글 = 4색 G). 경로가 틀린 로고가 나가면 상표 문제가 되므로 코드만 보고 넘기지 않았다.

## 9.4 장기 운영 가드 — **이게 이번 조치의 핵심이다**

> 민우님 지시: *"나중에 길게 운영했을 때 문제 생기지 않도록 먼저 선제검사하고 미리 잘 만들어줘"*

이 프로젝트의 개인정보 신고는 **두 번 낡았고 두 번 다 같은 방식**이었다 — 검색 기록(07-19
초안 → 07-30 정정), Analytics(07-19 초안 → 08-02 정정). 둘 다 *코드가 나중에 바뀌었는데 문서를
안 고쳐서*였고, 둘 다 사람이 우연히 읽다가 발견했다. **세 번째를 기다릴 이유가 없다.**

`__tests__/privacyLabelsSync.test.ts` 신설 — 기계가 대조한다:

| 검사 | 무엇을 막나 |
|---|---|
| 문서의 정본 목록(```privacy-labels 블록) **==** xcprivacy 선언 집합 | 두 자료가 조용히 갈라지는 것 |
| 정본 목록의 각 항목이 **문서 본문 표에도** 있는가 | 목록만 고치고 표(=ASC 에 옮겨 적을 실물)를 빠뜨리는 것 |
| 코드에 수집 지점이 있으면 그 유형이 선언돼 있는가 (7규칙) | **SDK 를 새로 붙이고 신고를 잊는 것 — B-2 의 재발** |
| 사진: 백업 페이로드에 이미지가 없으면 신고도 없어야 | 과잉 신고(M-2 의 재발) + 사진 백업을 만들면 먼저 빨개짐 |
| 세 타깃 `NSPrivacyTracking: false` | 추적 신고가 조용히 뒤집히는 것 |

코드→선언 규칙 7개는 `조건(코드의 사실) → 기대(선언)` 구조라 **그 수집을 그만두면 규칙이
스스로 잠든다** — 죽은 검사가 쌓이지 않는다.

**가드가 실제로 잡는지 검증했다**: 정본 목록에서 `SearchHistory` 한 줄을 지우고 돌리자
해당 검사만 빨개졌고(`1 failed`), 되돌리자 다시 그린이 됐다. 통과하는 걸 확인만 하고
넘어가면 "아무것도 검사하지 않는 테스트"가 남는다.

`__tests__/LoginScreen.test.tsx` 에 심사 컴플라이언스 4건 추가 — 약관 고지 문구·**링크가
실제로 공개 URL 을 여는지**(글자만 적어두는 회귀 방지)·공식 마크 사용·구글 4색 유지.

## 9.5 남은 것

- **`[민우 확인]` N-4** — `assets/onboarding/hero-runner-bw.png` 의 출처·라이선스.
  저장소에 근거가 없어 코드로는 판정 불가다. 직접 촬영이거나 상업적 사용이 허용된 소스인지
  확인해 주시면 된다. 애매하면 브랜드 정체성상(2026-07-10 '비주얼 없음' 결정) 빼는 쪽이
  일관되기도 하다.
- **설정의 '프로필 공개' 토글이 무력하다.** `ProfileScreen.rn.tsx:1043` 의 토글은 보이지만
  발행이 꺼져 있어 켜도 아무 데도 올라가지 않는다. 개인정보 관점에서는 **안전한 쪽으로
  실패**하지만(공개를 눌러도 공개되지 않는다) 유령 어포던스다. `MINOR` — 리젝 사유는 아니고,
  ③(처리방침 배포)이 끝나 플래그를 켜면 저절로 해소된다. 그 전에 감추려면 `ProfileScreen`
  prop 배선과 테스트 3건을 함께 손봐야 한다.
- **③ 처리방침 제3자 공개 조항 배포** — 소셜을 여는 마지막 한 칸. 코드가 아니라 민우님 작업이다
  (`docs/legal/social-disclosure.md` 문안 → `docs/privacy.html` → **`solelife9/keego-legal` 푸시**).

---

*게이트(2차 조치 후): `tsc` **0 에러** · `lint` **0 에러** · **274스위트 3,067테스트** — 전부 그린*

---

*게이트(조치 후 재측정): `tsc` **0 에러** · `lint` **0 에러**(내 변경 파일 경고 8, 전부 기존
인라인 스타일) · **269스위트 2,973테스트** — 전부 그린*

> ⚠️ **동시 작업 주의.** 이 조치 중 다른 세션(오딧 4)이 같은 저장소를 함께 고치고 있었다.
> 커밋은 **내가 만진 파일만 경로로 지정**해 그쪽 작업이 섞이지 않게 했다.
>
> 1. `ShoePicker.tsx`·`services/shoes.ts`·`firestore.rules`·`__tests__/ShoePicker.noResult.test.tsx`
>    — `search_misses`·`shoe_requests` 에서 `userId` 제거(`CHECKLIST.md §3 #2`). 중간에 `tsc` 가
>    그쪽 파일에서 한 번 에러를 냈으나 **이 조치와 무관**하며 이후 해소됐다.
> 2. `lib/publicProfile.ts`·`lib/firebaseCloudPort.ts` — **공개 프로필 뷰어**(`getPublicProfile` ·
>    `fetchPublicProfile`)를 신설 중이다. 이건 **M-1 이 지적한 결손(§4)이자
>    `SOCIAL_PROFILE_PUBLISH_ENABLED` 를 켜는 조건 ②** 그 자체다.
>
> **②가 채워져도 플래그는 아직 켜면 안 된다** — 조건 ③(처리방침 제3자 공개 조항을
> `solelife9/keego-legal` 에 반영·배포)이 남아 있다. 뷰어가 완성되면 남는 건 ③ 하나이고,
> 그건 코드가 아니라 민우님의 배포 작업이다.
