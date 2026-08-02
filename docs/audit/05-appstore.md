# 05 — App Store 심사관 감사 (제출 자료 ↔ 실제 앱 대조)

> 작성 2026-08-02 · 기준 커밋 `1a1a5a8` · 감사자: App Store 심사관 관점
> 선행: `docs/audit/01-store-review-risk.md`(2026-07-30, 설정·서명 중심) · `02-infra.md` · `03-data-integrity.md`
>
> **이 감사는 새 자료를 만들지 않는다.** 이미 준비된 `docs/store-privacy-labels.md`·
> `docs/store-listing.md`·`Info.plist`·`PrivacyInfo.xcprivacy` 를 **코드와 한 줄씩 대조**해
> "제출하면 리젝되는가"만 판정했다. 판정 근거는 전부 저장소의 코드다.
> 저장소 밖(콘솔·스크린샷 원본·실기기)에서만 확인 가능한 항목은 `[민우 확인]` 으로 표시했다.
>
> 심각도: `BLOCKER` 제출 시 리젝 확실 또는 법적 위반 · `MAJOR` 리젝 가능·심사 지연 · `MINOR` 품질

---

## 0. 한눈에

| # | 항목 | 근거 | 심각도 |
|---|---|---|---|
| **B-1** | **공개 프로필(`profiles/{uid}`)이 전 사용자에게 공개되는데 신고서·처리방침 어디에도 없다** | `App.tsx:1546` · `firestore.rules` · `privacy.html:103` | `BLOCKER` |
| **B-2** | **Firebase Analytics 를 쓰는데 신고서는 "Analytics SDK 0 · 미사용"이라고 단언한다** | `lib/productAnalytics.ts` · `store-privacy-labels.md:4` | `BLOCKER` |
| **B-3** | **스토어 설명의 "월간 랭킹"이 실제로는 영구히 빈 화면이다** | `featureFlags.ts:34` · `HallOfFameScreen.rn.tsx:349` | `BLOCKER` |
| M-1 | 공개 프로필을 **볼 수 있는 화면이 앱에 없다** — 동의만 받고 아무도 못 본다 | 뷰어 부재(§1.4) | `MAJOR` |
| M-2 | 사진 신고가 **양쪽 문서에서 반대** (ASC 답안=수집 / xcprivacy=미수집 / 실제=기기 전용) | `nativePermissions.test.ts:138` | `MAJOR` |
| M-3 | 검색 기록이 **xcprivacy 에만 빠져 있다**(ASC 답안엔 있음) | `PrivacyInfo.xcprivacy` | `MAJOR` |
| M-4 | 체중·나이·성별·안정시심박을 클라우드에 올리는데 신고 항목이 지정돼 있지 않다 | `App.tsx:1270` | `MAJOR` |
| M-5 | 로그인 게이트가 **약관·처리방침 링크 없이** 계정을 만든다 | `LoginScreen.rn.tsx` · `App.tsx:2257` | `MAJOR` |
| M-6 | 기기 ID 신고 — xcprivacy 는 `DeviceID` 선언, ASC 답안 문서는 "UID만" | 두 문서 대조 | `MAJOR` |
| N-1 | Apple 로그인 버튼이 공식 마크가 아니라 Ionicons 글리프다 | `LoginScreen.rn.tsx:151` | `MINOR` |
| N-2 | Google 버튼도 단색 Ionicons 글리프(구글 브랜딩 가이드라인 위반) | `LoginScreen.rn.tsx:128` | `MINOR` |
| N-3 | 로그인 강제 — 코어 기능이 로컬만으로 동작한다(5.1.1(i)) | §3.2 | `MINOR` |
| ✅ | 권한 문구·미사용 권한·백그라운드 정당화·계정 삭제·SIWA·상표 | §2·§3·§4 | 통과 |

**결론: 지금 제출하면 리젝된다.** 막는 건 코드가 아니라 **신고서 3줄**이다 — B-1·B-2 는 문서를
고치거나(신고 추가) 기능을 끄면(플래그) 끝나고, B-3 은 설명 한 줄을 빼거나 플래그를 켜면 끝난다.
어느 쪽이든 몇 시간 안에 해소된다.

---

# 1. 자료 ↔ 코드 대조 ①: 개인정보 라벨

## 1.1 코드가 실제로 수집하는 것 — 전수 목록

**기준: "기기 밖으로 나가는가".** 앱은 로컬-퍼스트라 대부분의 데이터가 기기에도 있지만,
App Store 가 묻는 건 *수집(collect)* = 개발자 서버로의 전송이다. 그래서 **Firestore·Firebase
서비스·Cloud Functions 로 나가는 것만** 수집으로 셌고, 기기에만 남는 것은 별도로 표시했다.

| # | 실제 나가는 데이터 | 코드 근거 | 목적지 |
|---|---|---|---|
| 1 | **GPS 경로 좌표열·거리·페이스** | `runTracker.ts` → `App.tsx` 동기 | `userBackups/{uid}` + `runDetails/{runId}` |
| 2 | **위치 라벨**("성수동, 서울") | `lib/geocode.ts`(역지오코딩은 OS 온디바이스) | 런 레코드 → `userBackups` |
| 3 | **심박 시계열·평균·안정시심박** | `lib/healthkit.ts:72` (HealthKit read) | `runDetails` |
| 4 | **케이던스·고도·칼로리·스플릿·랩** | `lib/elevation`·`laps`·`calories` | `userBackups` |
| 5 | **체중·나이·성별·안정시심박(설정값)** | `App.tsx:1270` `settings:{weight_kg,age,sex,rest_hr}` | `userBackups` |
| 6 | **이메일·표시이름** | 소셜 로그인 4종 | Firebase Auth |
| 7 | **Firebase UID** | 전 경로 | Auth·Firestore 문서 키 |
| 8 | **사용자 입력 텍스트** — 신발 이름·닉네임·런 메모·메달 기록 | `userBackups`·`medals` | `userBackups` |
| 9 | **결과 0건 검색어** + `userId` | `services/shoes.ts` `logSearchMiss` | `search_misses` |
| 10 | **직접 입력한 브랜드·모델** + `userId` | `services/shoes.ts` `requestShoe` | `shoe_requests` |
| 11 | 🔴 **공개 프로필** — 닉네임·현역 신발 6켤레(이름·주행거리)·명예의전당 12켤레·총거리·이번달 거리·러닝 횟수·VO₂max·평균 페이스·최장 거리·5K/10K/하프/풀 PB | `lib/publicProfile.ts` → `App.tsx:1546` → `firebaseCloudPort.ts:412` | `profiles/{uid}` — **로그인한 모든 사용자가 읽을 수 있다** |
| 12 | 🔴 **제품 사용 이벤트 10종** — 온보딩 단계, 첫 신발, 러닝 시작/저장/폐기, 권한 수락 여부, 로그인 제공자, 동기 실패, 크래시 복구, 신발 은퇴 | `lib/productAnalytics.ts` (`@react-native-firebase/analytics`) | Firebase Analytics (+ 앱 인스턴스 ID·기기/OS 정보 자동 수집) |
| 13 | 크래시 스택·빵부스러기 로그 | `lib/crashlytics.ts` | Crashlytics |
| 14 | App Check 증명 토큰(DeviceCheck) | `lib/appCheck.ts` | Firebase |
| 15 | 카카오·네이버 **액세스 토큰**(교환용, 일시적) | `functions/` `api` | Cloud Functions(asia-northeast3) |
| 16 | 월간 랭킹 엔트리 | `firestoreRankingStore.ts` | **현재 미전송**(`LEADERBOARD_PUBLISH_ENABLED=false`) |
| 17 | FCM 푸시 토큰 | `lib/pushMessaging.ts:82` | **현재 미취득**(`REMOTE_PUSH_ENABLED=false` 로 단락) |

**기기 밖으로 안 나가는 것(수집 아님):** 러닝화·메달·기록증 **사진**(로컬 파일 경로만 보관,
이미지 자체는 업로드 안 함 — `CHECKLIST.md §3 #3` 과 일치) · OCR 인식 결과(온디바이스
Vision/ML Kit) · 역지오코딩 원본 좌표(OS 내장, 외부 서버 없음).

## 1.2 대조표 — 신고서 vs 코드 vs xcprivacy

세 자료가 서로 어긋난다. **한 칸이라도 ❌ 면 그 자리가 리젝 지점이다.**

| 데이터 유형 | 실제 수집? | `store-privacy-labels.md`(ASC 답안) | `PrivacyInfo.xcprivacy` | 판정 |
|---|---|---|---|---|
| 정확한 위치 | 예 | 예 | `PreciseLocation` | ✅ |
| 건강(심박·안정시심박) | 예 | 예 | `Health` | ✅ |
| 피트니스(운동·케이던스·고도) | 예 | 예 | `Fitness` | ✅ |
| 이메일 | 예 | 예 | `EmailAddress` | ✅ |
| 이름(표시이름) | 예 | **"선택"으로 미정** | `Name` | ⚠️ 확정 필요 |
| 사용자 ID(UID) | 예 | 예 | `UserID` | ✅ |
| 충돌 데이터 | 예 | 예 | `CrashData` | ✅ |
| 기타 사용자 콘텐츠(신발 요청) | 예 | 예 | `OtherUserContent` | ✅ |
| **검색 기록** | 예 | 예 | ❌ **없음** | `MAJOR` M-3 |
| **사진** | **아니오**(기기 전용) | **예** ❌ | 없음(의도적) | `MAJOR` M-2 |
| **제품 상호작용(Analytics)** | **예** | ❌ **"미사용"이라 명시** | `ProductInteraction` | `BLOCKER` B-2 |
| **기기 ID** | 예(Analytics 인스턴스 ID) | ❌ **UID만 기재** | `DeviceID` | `MAJOR` M-6 |
| **체중·나이·성별** | 예 | ❌ 항목 미지정 | 없음 | `MAJOR` M-4 |
| **공개 프로필(타 이용자 공개)** | **예** | ❌ **전무** | ❌ 전무 | `BLOCKER` B-1 |

> **주목할 점:** `PrivacyInfo.xcprivacy` 는 `ProductInteraction`·`DeviceID` 를 **정확히 선언하고
> 있다**(회귀 테스트까지 있다 — `__tests__/nativePermissions.test.ts:132`). 틀린 건 코드가 아니라
> **App Store Connect 에 옮겨 적을 답안 문서**다. 즉 지금 문서대로 설문에 답하면, 앱 바이너리에
> 들어 있는 매니페스트와 콘솔 답변이 **서로 모순된 상태로 제출**된다.

---

## B-1 `BLOCKER` — 공개 프로필이 신고서에도, 처리방침에도 없다

**무슨 일이 벌어지는가.** 클라우드 동기가 성공할 때마다 이 코드가 돈다:

```
App.tsx:1539   buildPublicProfile({visibility: socialVisibility, nickname, shoes, runs, spec})
App.tsx:1546   publishProfile(cloudPort, profile)
   → firebaseCloudPort.ts:412  setDoc(doc(db,'profiles',uid), {...profile, updatedAt})
```

그리고 규칙은 이렇게 열려 있다:

```
firestore.rules   match /profiles/{uid} { allow read: if signedIn(); }
```

**로그인한 아무나 남의 문서를 읽을 수 있다.** 실리는 내용은 닉네임, 신고 있는 신발 6켤레와 각각의
주행거리, 은퇴 신발 12켤레, 총 누적거리, 이번 달 거리, 러닝 횟수, VO₂max, 평균 페이스, 최장 거리,
5K·10K·하프·풀 개인 기록이다.

**그런데 두 자료 모두 그런 일이 없다고 말한다.**

- `docs/store-privacy-labels.md` — 수집 표 8행 어디에도 없다. `profiles` 라는 단어 자체가 없다.
- `docs/privacy.html:82` — *"제3자에게 제공·판매하지 않습니다"*
- `docs/privacy.html:103` — *"이 기록은 **다른 이용자에게 공개되지 않으며**…"*

`privacy.html:103` 은 문맥상 검색어 기록을 가리키지만, 문서 전체에 **"다른 이용자에게 공개된다"는
고지가 단 한 줄도 없다.** 이용자는 처리방침을 읽고 "내 기록은 나만 본다"고 이해한다.

**아이러니:** 이 위험을 프로젝트 스스로 이미 알고 있었다. `lib/featureFlags.ts:23-31` 은 리더보드를
켜는 조건 셋을 못 박아 뒀고, 그중 ③이 이것이다:

> ③ 처리방침 제3자 공개 조항 …… ⛔ **미완** — 문안은 `docs/legal/social-disclosure.md` 에
> 준비돼 있고, keego-legal 저장소에 반영해 배포해야 한다(민우님 작업).
> …**그 전에는 켜지 않는다** — 화면과 동의를 갖춰도 처리방침에 고지가 없으면 "동의 없이 공개"와
> 법적으로 같은 자리다.

**리더보드는 그 규율을 지켰다. 공개 프로필은 지키지 않았다.** 같은 컬렉션 성격, 같은 공개 범위,
같은 미완 조건인데 `profiles` 발행에는 플래그가 없다 — `App.tsx:1546` 은 `socialVisibility` 만
확인하고 곧장 쓴다. AUDIT 1 이 잡아낸 사고(`767032e`)가 **컬렉션 이름만 바꿔 재발한 구조**다.

> 참고: 설계 자체는 훌륭하다. `lib/publicProfile.ts` 는 화이트리스트 전용이라 경로·체중·나이·성별·
> 메모가 **구조적으로** 새어나갈 수 없고, 동의 화면(`SocialConsentScreen`)은 공개될 카드를 실물로
> 보여준다. 문제는 **설계가 아니라 고지**다.

**판정:** App Store 는 앱이 실제로 수집·공개하는 데이터를 신고하지 않은 상태를 5.1.1/5.1.2 로
리젝한다. 한국법(개인정보보호법 제17조 — 제3자 제공·공개 동의)에서도 처리방침 미고지 상태의
공개는 그대로 위반이다.

**선택지(둘 중 하나면 해소):**

| | 방법 | 소요 | 결과 |
|---|---|---|---|
| **A (권장)** | `App.tsx:1546` 발행을 **플래그로 감싼다**(리더보드와 동일하게 `SOCIAL_PROFILE_PUBLISH_ENABLED=false`). 동의 화면 진입 조건도 함께 끈다 | 30분 | 1.0 에서 공개 0. 뷰어도 없으니(M-1) 잃는 기능도 없다 |
| B | `docs/legal/social-disclosure.md` 문안을 `privacy.html` 에 반영 → **keego-legal 저장소 푸시** → 신고서에 "기타 사용자 콘텐츠·피트니스(타 이용자 공개)" 추가 | 반나절 + 배포 | 공개 유지. 단 뷰어가 없어 M-1 은 남는다 |

**A 를 권한다.** B 는 "볼 수도 없는 기능을 위해 개인정보를 공개하고 법적 고지를 새로 배포하는
것"이다. 소셜은 뷰어까지 갖춘 1.1 에서 한 번에 여는 게 맞다.

---

## B-2 `BLOCKER` — Analytics 를 쓰면서 "Analytics SDK 0" 이라고 신고한다

`docs/store-privacy-labels.md` 4~5행:

> **광고·추적·IAP·Analytics SDK 0**, Firebase Analytics 미사용 → **다른 앱/웹 추적 안 함**

**사실이 아니다.**

- `package.json:23` — `"@react-native-firebase/analytics": "^24.0.0"` 설치돼 있다.
- `lib/productAnalytics.ts` — `getAnalytics()`·`logEvent()` 로 이벤트 10종을 보낸다.
- 호출부 4곳이 실제로 배선돼 있다: `OnboardingScreen.rn.tsx:668` · `App.tsx`(첫 신발) ·
  `screens/RunEngine.tsx:545,743`(러닝 시작·저장) · `ProfileScreen.rn.tsx:336`(로그인).
- `setAnalyticsEnabled` 은 존재하지만 **기본이 켬**이고 사용자 opt-out 스위치는 아직 없다
  (파일 주석이 스스로 밝힌다).

Firebase Analytics 는 이벤트 외에 **앱 인스턴스 ID·기기 모델·OS 버전·대략적 위치(IP 기반 국가)**
를 자동 수집한다. App Store 설문에서 이건 최소 **"사용 데이터 › 제품 상호작용"** + **"식별자 ›
기기 ID"** 이고, 목적에 **"분석(Analytics)"** 이 포함돼야 한다.

**모듈 자체는 모범적이다.** 자유 텍스트 금지, 거리·시간은 버킷으로만, `setUserId` 미사용 —
개인 식별성을 낮추려 신경 쓴 흔적이 뚜렷하다. 하지만 **"조심스럽게 수집한다"와 "수집하지
않는다"는 다르다.** 설문은 후자로 답하게 돼 있다.

**모순의 증거:** 같은 저장소의 `ios/SoleMate/PrivacyInfo.xcprivacy` 는 이미 정확히 선언한다 —
`ProductInteraction`(linked: false, purposes: **Analytics**, AppFunctionality) · `DeviceID`.
회귀 테스트까지 있다:

```
__tests__/nativePermissions.test.ts:132
  // 제품 계측(lib/productAnalytics) — 선언 없이 수집하면 App Privacy 표기와 어긋난다.
  'NSPrivacyCollectedDataTypeProductInteraction',
```

**즉 바이너리는 옳고 답안 문서만 낡았다.** 문서가 2026-07-19 초안이고 계측은 그 후(2026-07-26
출시 심사 B-12 대응)에 붙었기 때문이다. 검색 기록에 대해서는 문서가 **똑같은 사유로 이미 한 번
정정했다**(41~43행) — Analytics 는 그 정정에서 누락됐다.

**수정(문서만, 30분):**
1. 4~5행의 "Analytics SDK 0 · Firebase Analytics 미사용" 삭제 → *"Firebase Analytics 사용
   (제품 개선 목적, 이벤트 10종·파라미터는 열거값/버킷만, `setUserId` 미사용)"*
2. 수집 표에 2행 추가:
   - `사용 데이터 › 제품 상호작용` — 온보딩·러닝·권한·로그인 퍼널 — **분석** — 연결 안 됨
   - `식별자 › 기기 ID` — Analytics 앱 인스턴스 ID — 분석 — 연결 안 됨
3. Play 데이터 보안 표에도 `앱 활동 › 앱 상호작용` 추가.
4. `privacy.html` 93행이 이미 *"정해진 이벤트만 남기며…"* 로 고지하고 있다 ✅ — 처리방침은 정상.

> ⚠️ **추적(Tracking)은 계속 "아니오"가 맞다.** Firebase Analytics 는 IDFA 를 쓰지 않고
> AdSupport 프레임워크도 링크돼 있지 않다. ATT 프롬프트는 불필요하다.

---

# 2. 자료 ↔ 코드 대조 ②: 스토어 설명의 기능이 앱에 있는가

`docs/store-listing.md` 의 기능 주장 16개를 하나씩 코드로 확인했다.

| 설명 문구 | 구현 | 판정 |
|---|---|---|
| GPS 러닝 트래킹(칼만 필터 보정) | `lib/kalman.ts` · `App.tsx` KalmanFilter | ✅ |
| 자동 일시정지 | `lib/autoPause.ts` | ✅ |
| 400m 트랙 모드 — 랩 자동 카운트 | `lib/laps.ts`(자동랩·거리 스냅) | ✅ |
| 오프라인 한국어 음성 안내 | `assets/voice/` 254 클립 + `lib/runVoice/` | ✅ |
| 거리별 스플릿 | `RunSplits.tsx` · `lib/laps.ts` | ✅ |
| 경사 보정 페이스 | `lib/analytics/gap.ts` | ✅ |
| Apple 건강 연동(심박·워크아웃 자동 저장) | `lib/healthkit.ts:72,75` (read HR/RestingHR, share Workout) | ✅ |
| Apple Watch 단독 러닝 | `ios/SoleMateWatch Watch App/` | ✅ |
| 신발별 누적 거리·남은 수명 | `lib/shoe.ts` `shoeHealth` | ✅ |
| 교체 예측 — **근거와 정확도까지** | `lib/replacementForecast.ts:36-37` (`confidence` high/low + `reason`) | ✅ |
| 로테이션 | `lib/rotation.ts` · `RotationInsightPanel.tsx` | ✅ |
| '러닝화 아카이브' | `HallOfShoes.rn.tsx:125` — 화면 제목이 정확히 "러닝화 아카이브" | ✅ |
| 거리 PB(5K~풀코스) | `lib/bestEfforts.ts` | ✅ |
| VO₂max 추정 | `lib/analytics/vo2max.ts` | ✅ |
| 훈련 부하 | `lib/analytics/load.ts` · `TrainingLoadCard.tsx` | ✅ |
| 국내 마라톤 대회 자동 감지 + 메달 아카이브 | `lib/raceStore.ts` · `lib/medals.ts` · `MedalArchiveScreen` | ✅ |
| 업적과 랭크 | `lib/progression/` | ✅ |
| **월간 랭킹** | `HallOfFameScreen` 은 있으나 **데이터가 영원히 없다** | ❌ **B-3** |

**15/16 정확하다.** 과장도, 없는 기능도 없다 — 한 줄만 빼면.

---

## B-3 `BLOCKER` — "월간 랭킹"은 심사관이 열면 100% 빈 화면이다

설명 31행: *"· **월간 랭킹**, 업적과 랭크"*

화면은 실재한다. 진입 경로도 있다(마이 → 명예의 전당, `App.tsx:2481`). 그런데:

```
lib/featureFlags.ts:34   export const LEADERBOARD_PUBLISH_ENABLED = false;
App.tsx:1406             if(!LEADERBOARD_PUBLISH_ENABLED) return;   // ← 발행이 여기서 끝난다
```

**아무도 엔트리를 발행하지 않는다.** 그러므로 `leaderboards/{ym}/entries` 는 어느 달에도
비어 있고, `HallOfFameScreen` 은 항상 빈 상태를 그린다:

```
HallOfFameScreen.rn.tsx:349
  title={loadFailed ? '지금은 오프라인이에요' : '랭킹이 곧 열려요'}
```

**심사관 시나리오(정확히 밟게 된다):** 신발을 등록하면 `App.tsx:2291` 이 공개 범위 동의 화면을
띄운다 → "이대로 공개하기"를 누른다 → 마이 → 명예의 전당 진입점이 생긴다 → 들어간다 →
**"랭킹이 곧 열려요."**

세 조항에 동시에 걸린다:

- **2.1 App Completeness** — 기능이 동작하지 않는 상태로 제출.
- **2.3.1** — 스토어 설명이 앱의 실제 동작을 정확히 반영하지 않음.
- **4.2 Minimum Functionality / "coming soon"** — 카피가 문자 그대로 *"곧 열려요"*다.
  Apple 은 앱 내 'coming soon' 표시를 반복적으로 리젝해 왔다.

> 아이러니하게도 **B-1 을 A안(플래그로 끄기)으로 고치면 이 경로가 함께 막힌다** — 공개 동의를
> 안 받으니 진입점(`socialVisibility==='public'` 조건)이 생기지 않는다. 두 블로커가 한 수정으로
> 같이 해소된다.

**선택지:**

| | 방법 | 결과 |
|---|---|---|
| **A (권장)** | 설명 31행에서 **"월간 랭킹, "** 삭제 → `· 업적과 랭크` · B-1 A안으로 진입점도 차단 | 1.0 은 랭킹 없이 출시. 1.1 에서 처리방침·뷰어와 함께 정식 개봉 |
| B | `LEADERBOARD_PUBLISH_ENABLED=true` | **금지.** featureFlags 가 명시한 조건 ③(처리방침 고지)이 미완이다. 켜는 순간 B-1 과 같은 위반이 리더보드에서도 발생한다 |

---

## M-1 `MAJOR` — 공개 프로필을 볼 수 있는 화면이 앱에 없다

`profiles` 컬렉션을 **읽는 코드가 저장소에 없다.** 확인한 것:

- `lib/cloudPort.ts` 의 프로필 API 는 `putPublicProfile`·`deletePublicProfile` 둘뿐이다.
  `get`/`list` 가 없다.
- `SocialProfileCard.tsx` 의 유일한 사용처는 `SocialConsentScreen.rn.tsx:78` — **자기 카드
  미리보기**다.
- 랭킹 화면이 보여주는 신발은 `profiles` 가 아니라 리더보드 엔트리의 `shoes_summary` 이고,
  그건 발행 자체가 꺼져 있다(B-3).

**정리하면:** 앱은 동의를 받고 → 개인 기록을 전원 읽기 가능한 컬렉션에 올리고 → **그걸 볼 방법을
제공하지 않는다.** AUDIT 1 사고(`767032e`)의 정의와 글자 그대로 같다 — "볼 수 없는 기능 때문에
개인정보가 공개돼 있는 상태". 다른 점은 이번엔 동의를 받는다는 것뿐이고, 동의 화면은
*"다른 러너에게 내 프로필이 이렇게 보입니다"* 라고 말하는데 **그 '다른 러너'가 볼 화면이 없다.**

B-1 을 A안으로 처리하면 함께 사라진다.

---

# 3. 권한

## 3.1 Info.plist 사용 설명 — 전부 구체적 ✅

| 키 | 문구 | 판정 |
|---|---|---|
| `NSLocationAlwaysAndWhenInUse` | "화면을 꺼도 러닝 거리·경로를 계속 기록하려면 위치 권한이 필요해요." | ✅ 무엇을·왜가 다 있다 |
| `NSLocationWhenInUse` | "러닝 중 경로와 거리를 기록하기 위해 위치를 사용해요." | ✅ |
| `NSHealthShare` | "애플워치의 심박 데이터로 러닝 부하와 체력 분석을 정확하게 만들어요." | ✅ 읽는 대상·용도 명시 |
| `NSHealthUpdate` | "Keego에서 기록한 러닝을 Apple 건강에 워크아웃으로 저장해요." | ✅ |
| `NSMotion` | "케이던스(분당 걸음 수)와 고도 변화를 정확히 측정하기 위해…" | ✅ 지표 이름까지 밝힘 |
| `NSPhotoLibraryAdd` | "러닝 공유 카드를 사진 보관함에 저장하기 위해 접근해요." | ✅ |
| `NSPhotoLibrary` | "러닝화 사진을 등록하기 위해 사진 보관함에 접근해요." | ✅ |
| `NSCamera` | "메달·기록증·러닝화 사진을 촬영하기 위해 카메라에 접근해요." | ✅ |

**뭉뚱그린 문구가 하나도 없다.** "서비스 향상을 위해" 같은 표현이 전무하고, 전부 *어떤 기능이
그 권한을 쓰는지*를 이름으로 말한다. 심사관 관점에서 이 부분은 모범 사례다.

워치 타깃(`ios/SoleMateWatch Watch App/Info.plist`)도 3개 전부 구체적이며, 특히 건강 읽기는
*"이 권한이 없으면 심박이 측정되지 않아요"* 라고 결과까지 밝힌다.

## 3.2 선언만 하고 안 쓰는 권한 — 없음 ✅

| 선언 | 실제 사용 | |
|---|---|---|
| 위치(항상/사용중) | `lib/locationService.ts` · `expo-location` 백그라운드 태스크 | ✅ |
| 건강 읽기/쓰기 | `lib/healthkit.ts:72,75` | ✅ |
| 동작·피트니스 | `expo-sensors` 보수계·`lib/pedometerDistance.ts` · Android `ACTIVITY_RECOGNITION` | ✅ |
| 사진 추가/읽기·카메라 | `lib/photo.ts`·`MedalCamera.tsx`·공유카드 저장 | ✅ |
| 알림 | `lib/localReminder.ts` (OS 로컬 스케줄) | ✅ |
| **마이크** | **의도적으로 선언하지 않음** — `Info.plist:91` 주석 + 회귀 가드 `nativePermissions.test.ts` | ✅ 모범 |
| `UIBackgroundModes: audio` | `lib/runVoice/voice.ts:21` `setAudioModeAsync({shouldPlayInBackground:true})` — 화면 꺼도 km 안내 | ✅ 정당 |
| `UIBackgroundModes: location` | 백그라운드 러닝 추적 | ✅ 정당 |
| `NSSupportsLiveActivities` | `lib/liveActivity.ts` · `ios/RunActivity/` | ✅ |
| iPad 방향 키 | `TARGETED_DEVICE_FAMILY = 1`(iPhone 전용)이라 무해 | ✅ |

**Android 도 동일하게 깨끗하다.** `RECEIVE_BOOT_COMPLETED` 같은 의심스러워 보이는 권한까지
매니페스트 주석이 *왜 없으면 크래시하는지*를 코드 경로로 설명한다. `RECORD_AUDIO` 는 없고
테스트가 재발을 막는다.

## 3.3 백그라운드 위치의 정당성 — 성립한다 ✅

핵심 기능 자체가 백그라운드 위치다. **러닝 앱은 화면을 끄고 주머니에 넣은 채 달린다** — 그때
거리·경로가 멈추면 앱의 존재 이유가 사라진다(실제로 그 버그가 있었고 고쳤다:
`solemate-gps-background-tracking`, `38f6585`).

심사에 유리한 조건도 갖췄다:
- **사전 설명 화면**(`LocationPrimeScreen.rn.tsx`)이 OS 다이얼로그 **전에** 브랜디드 설명을 띄운다.
- 백그라운드 권한을 **거부해도 포그라운드 추적은 graceful 하게 동작**한다(매니페스트 주석 명시).
- Android 는 `location` 타입 포그라운드 서비스로 기동해 알림이 상시 표시된다.

> `[민우 확인]` **Play 콘솔**은 별도로 백그라운드 위치 **선언 양식 + 시연 영상**을 요구한다
> (`store-privacy-labels.md:66` 이 이미 예고). iOS 는 불필요, Android 만 해당.

---

# 4. 필수 기능

## 4.1 계정 삭제 — 앱 안에서 완결된다 ✅

`ProfileScreen.rn.tsx:1195` → `App.tsx:1619` → `firebaseCloudPort.ts:291`

- 진입: 마이 → 계정 → **회원 탈퇴**(빨강). 외부 링크가 **아니다**.
- 확인 다이얼로그 1겹 + 정직한 카피("영구 삭제되며 복구할 수 없어요").
- 삭제 범위: `runDetails` 하위 문서 순회 → 백업 본체 → **`profiles/{uid}`** → 최근 N개월
  리더보드 엔트리 → Firebase Auth 계정 → 로컬 저장소 초기화.
- `requires-recent-login` 을 한국어 안내로 바꿔 재로그인 유도 ✅

**5.1.1(v) 요건 충족.** 웹 삭제 안내 페이지도 별도로 살아 있다(`delete-account.html`, 200 확인).

> 잔여 항목 1건(신규 아님, `CHECKLIST.md §3 #2`): `search_misses`·`shoe_requests` 의 `userId` 는
> 규칙상 앱이 찾지도 지우지도 못해 탈퇴 후에도 남는다. 처리방침 "탈퇴 시까지"와 어긋난다.
> **권장 해법은 변함없다 — 애초에 `userId` 를 저장하지 않는 것**(신호 목적상 불필요하다).
> App Store 리젝 사유는 아니지만 한국법상 파기 의무와 충돌한다.

## 4.2 Sign in with Apple — 제공된다 ✅

로그인은 강제이고 제3자 소셜(구글·카카오·네이버)을 쓰므로 **4.8 이 SIWA 를 요구한다.**
`LoginScreen.rn.tsx:135` — `Platform.OS === 'ios'` 일 때 렌더된다. 다크 배경 위 흰 버튼 +
검정 라벨 "Apple로 계속하기"로 공식 스펙을 따랐다.

## 4.3 빈 화면·더미 데이터·미완성 노출 경로

| 경로 | 상태 |
|---|---|
| **랭킹(명예의 전당)** | ❌ **영구 빈 화면** — B-3 |
| 데모 신발/런(`devSeed`) | ✅ `__DEV__ && NODE_ENV!=='test' && 신발 0켤레` 3중 게이트(`App.tsx:924`). 릴리스에서 `__DEV__=false` |
| 온보딩 미리보기 | ✅ `__DEV__` 게이트(`App.tsx:336`) |
| 러닝화 아카이브 / 보관함 / 메달 아카이브 | ✅ 데이터 없을 때 **의미 있는 빈 상태**("첫 헌액을 기다려요" 등). 정상 |
| 구매가·가격 조회 UI | ✅ 노출 없음 — 구매 플로우는 `1a1a5a8` 에서 되돌렸고 앱에 가격 조회 코드가 없다 |
| 제휴 링크(`FindShoesScreen`) | ✅ 실물 상품 외부 구매라 IAP 불필요(3.1.1 예외). 제휴 태그는 빈 값 |

---

## M-2 · M-3 · M-4 · M-6 — 신고서 정합성 4건 (`MAJOR`)

한 번에 고칠 수 있어 묶는다. **전부 문서 수정이며 코드 변경은 없다.**

**M-2 사진 — 방향이 서로 반대다.**
`store-privacy-labels.md:27` 은 사진을 **"수집: 예"** 로 신고한다. 그러나 `xcprivacy` 는
의도적으로 **제외**하고 테스트가 그걸 강제한다(*"기기에만 저장 — 과잉 선언도 부정확"*).
코드 확인 결과 **xcprivacy 가 옳다** — 백업 페이로드(`lib/backup.ts:17`)에 이미지 바이트가
없고 사진은 로컬 파일로만 남는다(`CHECKLIST §3 #3` 이 "재설치하면 영구 소실"이라 적은 것과 일치).
→ **ASC 답안에서 사진 행을 삭제한다.** 과잉 신고도 부정확한 신고다.

**M-3 검색 기록 — xcprivacy 에만 빠졌다.**
`search_misses` 는 실제로 검색어를 올린다. ASC 답안에는 있는데(30행) `xcprivacy` 에는 없다.
→ `ios/SoleMate/PrivacyInfo.xcprivacy` 에 `NSPrivacyCollectedDataTypeSearchHistory`
(linked: true, AppFunctionality) 추가 + `nativePermissions.test.ts` 기대 목록에도 추가.

**M-4 체중·나이·성별·안정시심박 — 신고 항목이 지정되지 않았다.**
`App.tsx:1270` 이 `settings:{weight_kg, age, sex, rest_hr}` 를 클라우드로 올린다.
체중·안정시심박은 **건강**으로 덮이지만, **나이·성별은 Apple 의 어느 유형에도 자동으로 안
들어간다** — `기타 데이터 유형(Other Data Types)` 으로 신고하는 게 맞다.
→ ASC 답안·`xcprivacy`(`NSPrivacyCollectedDataTypeOtherDataTypes`) 양쪽에 추가.
Play 는 "개인 정보 › 기타 정보"에 해당.

**M-6 기기 ID.**
`xcprivacy` 는 `DeviceID` 를 선언했는데 ASC 답안은 "기기 또는 기타 ID = 사용자 ID(UID)"만
적었고, 오히려 *"'기기 또는 기타 ID'에 푸시 토큰을 넣지 말 것"* 이라고 못 박는다. 푸시 토큰은
정확히 미수집이 맞다(`REMOTE_PUSH_ENABLED=false` 로 `getToken` 단락) — 그러나 **Analytics
앱 인스턴스 ID** 가 그 자리를 채운다(B-2 와 같은 뿌리).
→ ASC 답안에 `식별자 › 기기 ID`(분석 목적, 연결 안 됨) 추가.

**추가 확정 1건 — 이름.** 답안 44행이 *"별도 수집 항목으로 신고할지는 선택"* 이라고 열어 뒀는데,
`xcprivacy` 는 이미 `Name` 을 선언했다. **선택이 아니라 신고로 확정**해야 두 문서가 일치한다
(소셜 로그인 displayName 을 실제로 받아 보관한다).

---

## M-5 `MAJOR` — 약관·처리방침 링크 없이 계정이 만들어진다

`App.tsx` 렌더 사다리의 순서:

```
2257   if(!authUser) return <LoginScreen …/>      ← 여기서 Firebase 계정이 생성된다
2283   return <OnboardingScreen onDone={completeOnboarding}/>   ← 약관 고지는 여기에 있다
```

`LoginScreen.rn.tsx` 전문을 확인했다 — **개인정보 처리방침·이용약관 링크가 없다.** 있는 건
가치 3행과 *"로그인하면 신발·러닝 기록·설정이 안전하게 보관되고…"* 라는 각주뿐이다.
`PRIVACY_URL`/`TERMS_URL` 을 쓰는 화면은 `ProfileScreen`(설정)과 `OnboardingScreen` 둘인데,
**둘 다 계정이 만들어진 뒤에 나온다.**

- **App Store 5.1.1(ii)** — 계정 생성 시점에 개인정보 처리방침 접근이 요구된다. 심사관에 따라
  갈리지만 실제 리젝 사례가 있는 조항이다.
- **한국법** — 회원가입 시 약관 동의·개인정보 수집 동의가 먼저다. 위치정보법상 개인위치정보는
  별도 동의가 필요하고, 온보딩은 그걸 이미 잘 처리하고 있다(`OnboardingScreen.rn.tsx:379-383`
  주석이 위치기반서비스 약관을 이름으로 밝힌다) — **순서만 뒤집혀 있다.**

**수정(30분):** 로그인 버튼 아래 각주를 한 줄 바꾼다 —
*"계속하면 [이용약관]과 [개인정보 처리방침]에 동의하는 것으로 봅니다."* (두 단어를 `Linking`
으로 연결). `legalLinks.ts` 가 이미 URL 을 갖고 있어 배선만 하면 된다.

---

## N-1 · N-2 `MINOR` — 로그인 버튼의 상표 사용

**N-1 Apple.** 버튼은 공식 스펙(흰 배경·검정 라벨·"Apple로 계속하기")을 정확히 따랐는데,
로고만 **Ionicons 글리프**다:

```
LoginScreen.rn.tsx:151   <Ionicons name="logo-apple" … color={BLACK} />
```

Apple 은 SIWA 버튼에 **자사가 제공한 Apple 로고 에셋**(또는 `ASAuthorizationAppleIDButton`)을
쓰도록 요구한다. Ionicons 의 사과 글리프는 유사 도형이지 공식 마크가 아니다. 심사관에 따라
"Sign in with Apple 버튼이 HIG 를 따르지 않음"으로 지적될 수 있다.
→ **권장:** `expo-apple-authentication` 의 `AppleAuthenticationButton`(이미 의존성에 있다) 또는
공식 마크 SVG 로 교체. 나머지 스타일은 이미 맞으므로 아이콘 한 곳만 바꾸면 된다.

**N-2 Google.** 같은 문제다 — `Ionicons name="logo-google"` 은 단색 글리프인데, Google 브랜딩
가이드라인은 **4색 "G" 마크**를 요구한다. App Store 리젝 사유는 아니지만 구글의 상표 정책
위반이고, OAuth 브랜딩 검수에서 지적될 수 있다.

> **카카오·네이버는 정상이다** — `primitives.tsx` 의 `KakaoMark`·`NaverMark` 를 각 사 지정
> 색상(`KAKAO_YELLOW`·`NAVER_GREEN`)과 함께 쓴다. 두 회사 로그인 버튼은 **각 사 가이드라인이
> 로고 사용을 요구**하므로 이건 올바른 상표 사용이다.

---

## N-3 `MINOR` — 로그인 강제 (5.1.1(i))

**심사관 시각에서 짚어 둔다.** 5.1.1(i) 는 *"앱에 계정 기반 기능이 실질적으로 없다면 로그인
없이 쓸 수 있게 하라"* 고 요구한다. keego 의 코어(러닝 추적·신발 마일리지)는 **완전히 로컬로
동작한다** — 저장소가 AsyncStorage 로컬-퍼스트이고, 러닝 중에는 네트워크를 아예 쓰지 않는다
(`03-data-integrity.md` L-5 "러닝은 네트워크를 쓰지 않는다").

동시에 방어 논리도 충분하다: 클라우드 동기·기기 변경 복구·랭킹·소셜이 계정 기반 기능이고,
로그인 화면이 그 가치를 3행으로 명시한다(`LoginScreen.rn.tsx` 가치 3행). Strava·Nike Run Club
등 경쟁 앱도 전부 로그인을 강제한다.

`01-store-review-risk.md` 가 이미 이 항목을 `MAJOR` → `MINOR` 로 낮추고 "소셜 전용으로 확정"
(2026-07-30 민우님 결정)한 상태이므로 **그 결정을 유지한다.** 다만 리젝이 온다면 이 조항일
가능성이 있고, 그때의 답변은 위 방어 논리 그대로다.

---

# 5. 상표 (Trademark)

**요청한 세 가지를 전부 확인했고, 문제 없다.**

**① 브랜드 로고 이미지 — 0건.** 저장소의 이미지 자산을 전수 확인했다(`node_modules`·빌드
산출물 제외). 앱에 번들되는 이미지는 **정확히 3개**다:
- `assets/tab-shoe.png` / `tab-shoe-fill.png` — 자체 제작 탭 아이콘(신발끈 음각)
- `assets/onboarding/hero-runner-bw.png` — 온보딩 히어로

신발 브랜드 로고 파일은 하나도 없다. 2026-07-10 의 **"비주얼 없음"** 결정(사진·실루엣 전면
폐기, 신발 = 글리프 + 수명 링 + 타이포)이 상표 리스크를 구조적으로 제거했다. `ShoeGlyph` 는
자체 도형이다.

**② 제품 사진 — 0건.** 카탈로그(`data/shoes.json`, 624켤레)에 이미지 URL 필드가 없다.
원격에서 제품컷을 받아오는 경로도 없다.

**③ 텍스트 브랜드명 — 사용하지만 허용 범위.** "NIKE Pegasus 41" 처럼 **이름만** 표시한다.
이건 지시적 공정사용(nominative fair use)이고, 러닝화 관리 앱의 성립 조건이다. 사용자가
자기 신발을 등록하는 기능이라 사용자 생성 콘텐츠 성격도 있다.

**④ 앱 아이콘 — 깨끗하다.** `icon-1024.png` 을 직접 확인했다: 검정 배경 위 오렌지 열린 링.
타사 브랜드 요소 없음. 워치·안드로이드 런처 아이콘도 동일 계열.

**⑤ 스크린샷 6장 — 브랜드명은 텍스트로만 등장.** `~/Desktop/keego-스토어-스크린샷/` 의
실물을 열어 확인했다. #1(홈)에 "NIKE · 데일리 / Pegasus 41", #2(신발탭)에 NIKE·HOKA·ADIDAS
가 **텍스트로만** 보인다. 로고 이미지·제품 사진은 없다. 앱 이름·부제·키워드에도 타사 상표가
없다(2026-07-21 에 '나이키·스트라바' 키워드를 이미 제거했다 — 2.3.7 대응).

> `[민우 확인]` **`hero-runner-bw.png` 의 사용권.** 온보딩 히어로에 쓰이는 러너 사진인데,
> 출처·라이선스를 저장소에서 확인할 수 없다. 상표 문제는 아니지만 저작권·초상권 문제는 될 수
> 있다. 직접 촬영했거나 상업적 사용이 허용된 소스인지 확인해 주시면 된다. 애매하면 브랜드
> 정체성상(사진 폐기 원칙) 빼는 쪽이 일관되기도 하다.

---

# 6. 무엇부터 고치면 되는가

**전부 코드 수정 없이, 또는 한 줄 플래그로 끝난다.**

| 순서 | 할 일 | 대상 | 소요 |
|---|---|---|---|
| 1 | **공개 프로필 발행에 플래그를 씌운다** — `App.tsx:1546` + 동의 게이트(`App.tsx:2291`) | 코드 | 30분 |
| 2 | **설명에서 "월간 랭킹, " 삭제** | `docs/store-listing.md:31` | 1분 |
| 3 | **Analytics 신고 정정** — "미사용" 삭제 + 제품 상호작용·기기 ID 2행 추가 | `store-privacy-labels.md` | 20분 |
| 4 | **사진 행 삭제**(과잉 신고) · **이름을 '신고'로 확정** · **나이·성별을 기타 데이터로 추가** | `store-privacy-labels.md` | 20분 |
| 5 | **xcprivacy 에 SearchHistory·OtherDataTypes 추가** + 테스트 기대 갱신 | `PrivacyInfo.xcprivacy` | 20분 |
| 6 | **로그인 화면에 약관·처리방침 링크 한 줄** | `LoginScreen.rn.tsx` | 30분 |
| 7 | **Apple 로그인 로고를 공식 마크로** | `LoginScreen.rn.tsx:151` | 20분 |
| 8 | Play 데이터 보안 표에 앱 상호작용 추가 | `store-privacy-labels.md §B` | 5분 |

1·2 만 해도 **BLOCKER 3건이 전부 해소된다**(1이 B-1·B-3·M-1 을 동시에 막는다).
3~5 는 같은 문서를 한 번에 손보는 작업이라 묶어서 하는 게 효율적이다.

## 이 감사에서 확인만 하고 넘어간 것 (문제 없었습니다)

- **권한 문구 8종** — 전부 구체적. "서비스 향상을 위해" 류가 0건이다. 심사에서 자주 걸리는
  지점인데 여기는 모범 사례에 가깝다.
- **미사용 권한 0** — 마이크는 의도적으로 선언하지 않았고 회귀 테스트가 지킨다.
- **계정 삭제** — 앱 내 완결. 공개 프로필·리더보드 엔트리·런 상세 사이드카까지 지운다.
- **더미 데이터** — `devSeed` 는 3중 게이트. 릴리스 노출 경로 없음.
- **상표** — 로고·제품사진 0건. 아이콘·스크린샷 깨끗.
- **추적(Tracking) = 아니오** — IDFA·AdSupport 미사용. ATT 프롬프트 불필요가 맞다.
- **FCM 토큰 미수집** — `REMOTE_PUSH_ENABLED=false` 가 `getToken` 을 단락시킨다. 신고서의
  "푸시 토큰을 넣지 말 것" 지침은 정확하다.

## 이번 감사에서 제가 처음에 의심했다가 코드 확인 후 접은 것

기록으로 남긴다 — `solemate-external-audit-verify-first` 의 교훈대로 부재 주장일수록 확인했다.

| 처음 의심 | 실제 |
|---|---|
| "리더보드가 동의 없이 발행될 것" | 플래그 + `socialVisibility` 이중 가드로 완전히 막혀 있었다 |
| "구매가·가격 조회 UI 가 미완성으로 노출될 것" | `1a1a5a8` 에서 되돌려 앱에 코드 자체가 없다 |
| "사진이 클라우드로 올라갈 것" | 백업 페이로드에 이미지가 없다. xcprivacy 판단이 옳았다 |
| "백그라운드 오디오가 미사용 선언일 것" | `voice.ts:21` 이 `shouldPlayInBackground:true` 로 실제 사용 |
| "iPad 방향 키가 미대응 노출일 것" | `TARGETED_DEVICE_FAMILY=1`(iPhone 전용)이라 무해 |

---

*게이트: `tsc` 0 · `lint` 0 에러(경고 241, 전부 기존) · **267스위트 2,958테스트** — 전부 그린*
*(이 감사는 문서만 작성했고 코드는 변경하지 않았다 — 위 수치는 기준 커밋 `1a1a5a8` 의 상태다.)*

> 📌 `[공통 꼬리말 붙이기]` 가 AUDIT 1·2·5 프롬프트에 모두 있었는데 그 꼬리말 내용을 아직
> 받지 못했습니다. 알려주시면 이 문서와 `01-security.md`·`02-infra.md`·`03-data-integrity.md`
> 에 소급 적용하겠습니다. 그때까지는 위 게이트 줄을 관례상 꼬리말로 씁니다.
