# 00 — Keego 앱 구조 지도

> 작성일 2026-07-29 · 기준 커밋 `9c508c0` (main, `data/shoeCatalog.json` 미커밋 수정 있음)
> 코드 읽기만 수행. 이 문서는 **현재 코드에 있는 것**만 기술한다(계획/문서상 의도가 아니라).
> 심각도 태그: `BLOCKER` 출시 불가 · `MAJOR` 이탈/나쁜 리뷰 · `MINOR` 출시 후 수정 가능 · `NITPICK` 취향

---

## 0. 한눈에

| 항목 | 값 |
|---|---|
| 플랫폼 | iOS(주), Android(빌드 스크립트만 유지·미검증), watchOS 컴패니언 |
| 스택 | React Native 0.85.3 · React 19.2.3 · TypeScript 6.0.3 · Expo 모듈 56 |
| 내비게이션 | **React Navigation 없음.** `App.tsx`의 `useState` 조건부 렌더 = 라우터 |
| 화면 파일 | 25개 (`*.rn.tsx` 22 + `screens/` 3) |
| 저장 | AsyncStorage(로컬 정본 동작) + Firestore(클라우드 동기 정본) |
| 백엔드 | Cloud Functions 1개(`api`, asia-northeast3) — 소셜 로그인 토큰 발급 + 가격 조회 프록시 |
| 테스트 | 247 스위트(`npm test`) + 규칙 테스트 별도(`npm run test:rules`) |
| 결제 | **없음** |

---

## 1. 화면 목록

### 1.1 라우팅 구조 (중요)

`App.tsx`에 라우터 라이브러리가 없다. 렌더 함수 상단의 **early-return 사다리**가 우선순위 그대로 라우팅이다(`App.tsx:1890~2260`). 순서가 곧 z-order다:

```
authUser===undefined  → BootSkeleton
authUser===null       → LoginScreen            ← 로그인 강제 게이트
bootState==='loading' → BootSkeleton
bootState==='error'   → BootError
overlay==='add'       → AddShoeScreen
previewOnboard        → OnboardingScreen (개발 전용)
!onboarded && shoes=0 → OnboardingScreen
locPrimeGoal!=null    → LocationPrimeScreen
overlay==='goal'      → RunGoalScreen
overlay==='countdown' → RunActiveScreenView(countdown 모드)
overlay==='run'       → RunEngine
celebration           → CelebrationScreen
showHallOfFame        → HallOfFameScreen       ← 진입점 없음(플래그 오프)
showProgression       → ProgressionScreen
showHallOfShoes       → HallOfShoes
showArchive           → ShoeArchiveScreen
medalFlow             → RaceMedalScreen
showMedalArchive      → MedalArchiveScreen
runRecap              → RunRecapScreen
그 외                  → 탭 4개(Home/Shoes/History/Profile)
```

**하드웨어 뒤로가기(Android) 처리가 이 사다리에 붙어 있지 않다** → `MAJOR` (Android 출시 시).

### 1.2 탭 (`tab` state: 0~3)

| # | 화면 | 파일 | 역할 |
|---|---|---|---|
| 0 | 홈 | `HomeScreen.rn.tsx` (41KB) | shoe-first 히어로 캐러셀(신발 선택 → 바로 러닝 시작), 주간 진척, 교체 예측, 훈련 부하, 로테이션 추천 |
| 1 | 신발 | `ShoesScreen.rn.tsx` (58KB) | 신발 목록/상세, 수명 링, 마모 분석, 은퇴 플로우, 다음 신발 추천, 비교 |
| 2 | 기록 | `HistoryScreen.rn.tsx` (90KB) | 런 목록·상세(스플릿/페이스곡선/심박존/코스맵), 기간 요약·차트, 수동 런 추가/편집/삭제 |
| 3 | 마이 | `ProfileScreen.rn.tsx` (91KB) | 프로필·기록(PB)·배지, 설정 5섹션(신체/알림/푸시/음성/계정), 백업·복원, 계정 삭제, 진척·전당·메달 진입점 |

### 1.3 전체 화면 목록

| 화면 | 파일 | 진입 경로 |
|---|---|---|
| BootSkeleton / BootError | `screens/BootStates.rn.tsx` | 부팅 로딩·실패 |
| 로그인 | `LoginScreen.rn.tsx` | `authUser===null` (앱 최초 + 로그아웃 후) |
| 온보딩 | `OnboardingScreen.rn.tsx` (40KB) | 신발 0켤레 + 미완료 시 / 마이탭 '온보딩 다시 보기' |
| 홈 | `HomeScreen.rn.tsx` | 탭 0 |
| 홈 부품 | `screens/KeegoHome.tsx` | `ShoeCard`/`GhostShoeCard`/`Guardian`를 홈·FirstShoe가 import (자체 화면으로는 미사용) |
| 신발 목록 | `ShoesScreen.rn.tsx` | 탭 1 |
| 첫 신발 빈 상태 | `FirstShoeScreen.rn.tsx` | ShoesScreen에서 활성 신발 0켤레일 때 전체 대체 |
| 신발 추가 | `AddShoeScreen.rn.tsx` | 홈/신발탭 '추가' → `overlay='add'` |
| 신발 피커 | `ShoePicker.tsx` | AddShoe·Onboarding 내부 (카탈로그 검색·브랜드/모델 2열) |
| 은퇴 플로우 | `RetirementFlow.rn.tsx` (31KB) | 신발 상세 → 은퇴 (`flowOpen`) |
| 다음 신발 | `NextShoeScreen.rn.tsx` (30KB) | 신발 상세 → '다음 신발' (`nextShoeOpen`) |
| 신발 비교 | `ShoeCompareScreen.rn.tsx` | 신발 상세/다음신발 → 비교 (`compareOpen`) |
| 신발 보관함 | `ShoeArchiveScreen.rn.tsx` | 신발탭 → 보관함 |
| 명예의 전당(은퇴 신발) | `HallOfShoes.rn.tsx` (24KB) | 마이탭 → 은퇴 신발 박물관 |
| 위치 권한 안내 | `LocationPrimeScreen.rn.tsx` | 첫 GPS 런 시작 직전 1회 |
| 러닝 목표 | `RunGoalScreen.rn.tsx` (34KB) | 신발 선택 후 시작 → `overlay='goal'` (자유런/거리/시간/페이스플랜 4탭) |
| 페이스 플랜 | `SpeedPlanPanel.tsx` | RunGoal 내부 |
| 러닝 화면(뷰) | `RunActiveScreen.rn.tsx` (80KB) | 카운트다운 모드 + 러닝 중 표시 |
| 러닝 엔진 | `screens/RunEngine.tsx` | `overlay='run'` — GPS 구독·센서·자동일시정지·음성·랩/트랙·스냅샷 소유 |
| 라이브 지도 | `RunLiveMap.tsx` | 러닝 일시정지 시 배경 |
| 완주 리캡 | `RunRecapScreen.rn.tsx` (40KB) | 런 저장 직후 |
| 셀러브레이션 | `CelebrationScreen.rn.tsx` (25KB) | 등급 상승/업적 달성 시 |
| 진척 | `ProgressionScreen.rn.tsx` (26KB) | 마이탭 → 진척 |
| 명예의 전당(리더보드) | `HallOfFameScreen.rn.tsx` | **진입점 없음** — `App.tsx:2082` 주석대로 MVP 플래그 오프 |
| 대회 기록 | `RaceMedalScreen.rn.tsx` (21KB) | 리캡 대회 감지 배너 / 메달 아카이브 '추가' |
| 메달 카메라 | `MedalCamera.tsx` | RaceMedal 내부(기록증 OCR) |
| 메달 아카이브 | `MedalArchiveScreen.rn.tsx` (19KB) | 마이탭 → 메달 아카이브 |
| 기록 | `HistoryScreen.rn.tsx` | 탭 2 (런 상세는 내부 `detail` state) |
| 마이 | `ProfileScreen.rn.tsx` | 탭 3 |

공유 카드(전체화면 아님): `ShareCard.tsx` · `ShareCardPicker.tsx` · `MedalShareCard.tsx` · `RecapShareCard.tsx` · `RunnerSpecShareCard.tsx` · `RetirementCard.tsx`

---

## 2. 데이터 모델

### 2.1 Firestore 컬렉션 (전부 — `firestore.rules` 기준)

#### `userBackups/{uid}` — 사용자 클라우드 정본
쓰기 주체: `lib/firebaseCloudPort.ts`. 권한: 본인만 read/write.

| 필드 | 타입 | 용도 |
|---|---|---|
| `shoes` | array | 신발 레코드 전량(`BackendShoe`) |
| `runs` | array | 런 레코드 전량(`BackendRun`) — **route(경로 문자열) 포함** |
| `settings` | object | 단위·주간목표·알림·체중/나이/성별/안정시심박 등 |
| `progression` | object | 랭크 캐시·타이틀·업적 seen·은퇴 신발 기록·포인트 |
| `medals` | array | 마라톤 메달 아카이브 |

`BackendShoe`: `id, name, user_id?, max_km?, start_km?, purchase_date?, price_krw?, retired?, total_km?, run_time?, updatedAt?, deleted?`
`BackendRun`: `id, shoe_id, km, run_date, user_id?, duration?, cadence?, memo?, source?, route?, location?, run_time?, heart_rate?, elevation_m?, calories?, updatedAt?, deleted?`

#### `userBackups/{uid}/runDetails/{runId}` — 런 상세 사이드카
쓰기 주체: `lib/runDetailSync.ts`. 재설치 시 상세 유실 방지용(2026-07-24 신설).

| 필드 | 용도 |
|---|---|
| `splits` | per-km 구간(km, paceSec, elevM) |
| `paceTrack` | (거리, 경과시간) 시계열 → 페이스 곡선 |
| `hrTrack` | (t, bpm) 심박 시계열 → HR존·TRIMP |
| `gapTrack` | 경사보정 페이스 시계열 |
| `track` | 트랙 세션 메타(랩 수·랩 길이) |

시계열 상한 `DETAIL_SERIES_CAP = 10800`(1점/s × 3시간), 초과 시 균등 스트라이드 다운샘플.

#### `leaderboards/{yearMonth}/entries/{uid}` — 월간 리더보드
쓰기: `lib/progression/firestoreRankingStore.ts`. 읽기=로그인 전원, 쓰기=본인 문서만 + 형태 검증, 삭제 금지.

필드: `uid, nickname, rankTier, rankColor, equippedTitle(string|null), distance, consistency, shoeHealth, collection, progressPoints, updatedAt`

> 점수는 클라이언트 계산 → 규칙만으로 위조 완전 차단 불가(규칙 주석에 명시). 현재 화면 진입점이 없어 노출은 안 됨.

#### `races/{raceId}` — 대회 카탈로그 (읽기 전용)
읽기: `lib/raceStore.ts`. 쓰기는 admin SDK 스크립트만.
필드: `id, name, date, region, venue, startLat, startLon, distances[]`
로컬 시드 `data/races.json` 82건 존재(원격 미배포 시 폴백).

#### `shoes/{shoeId}` — 신발 카탈로그 (읽기 전용)
읽기: `lib/shoeCatalogRemote.ts` → `lib/shoeCatalogStore.ts`. 쓰기는 `services/shoes.ts`를 admin 자격 스크립트에서만.
문서 id = 슬러그 고정, `setDoc(merge:true)` upsert만(중복 방지), 단종은 삭제 아닌 `discontinued` 플래그.
필드(`types/shoe.ts` `ShoeDoc`): `id, brand, model, version, variant, collabWith, category(daily|tempo|racing|trail|stability|recovery), weight, weightBasis, drop, plate, stackHeight, releaseYear, defaultLifespanKm, discontinued, searchAliases[], verified`

#### `search_misses/{docId}` — 검색 0건 신호 (create only)
`{query, userId, createdAt}` · 읽기/수정/삭제 전부 금지 · query 1~100자.

#### `shoe_requests/{docId}` — 신발 등록 요청 (create only)
`{brand, model, userId, createdAt, source}` · source ∈ `not_found`|`manual_add` · brand/model ≤60자.

#### 그 외 전부 deny.

### 2.2 로컬(AsyncStorage) — 실질적 1차 저장소

| 키 | 내용 |
|---|---|
| `cache_shoes_v1` / `cache_runs_v1` | 부팅 폴백 캐시(런 캐시엔 route 제외 — 경량 미러) |
| `route_<runId>` | GPS 경로 원문(사이드카 정본) |
| `splits_` `paceTrack_` `hrTrack_` `gapTrack_` `track_` `surface_` `time_` `runphoto_` `<runId>` | 런 상세 사이드카 |
| `pending_runs` | 미동기 낙관적 런 |
| `medals_v1` · `challenges_v1` · `tombstones_v1` | 메달·챌린지·삭제 묘비 |
| `settings_unit/alerts/voice/haptics/autopause/target_zone/updated_at` | 설정 |
| `body_weight_kg` `body_age` `body_sex` `body_rest_hr` | 신체 정보 |
| `goal_weekly_km` · `profile_name` · `profile_photo` | 목표·프로필 |
| `notif_settings` · `notif_presented` · `shoe_alert_notified` | 알림 |
| `cloud_account` · `device_id` | 계정·기기 |
| `hr_backfill_pending_v1` · `detail_pushed_<runId>` | 심박 백필 대기 · 상세 push 마커 |
| `storage_schema_version` | 로컬 스키마 버전(현재 1) |

### 2.3 번들 데이터(정적)

| 파일 | 크기/건수 | 용도 |
|---|---|---|
| `data/shoeCatalog.json` | **588켤레** (배열, 신 스키마) | 신 카탈로그 정본 |
| `data/shoes.json` | 351켤레 / 19브랜드 | 구 시드(앱 등록화면 소스) |
| `data/shoeSpecs.json` | **71켤레만** 스펙 | 무게·힐스택·드롭 (`brand\|model` 키) |
| `data/shoeModels.ts` | — | 추천 엔진용 모델 DB |
| `data/races.json` | 82개 대회 | 대회 감지 시드 |

> **스펙 커버리지 71/588 (12%)** — CLAUDE.md 규칙상 스펙 없는 신발은 '다음 신발' 비교에서 축이 안 뜬다. 기능은 조용히 축소되지 실패하진 않음. `MINOR`

---

## 3. 외부 의존성

### 3.1 런타임 (package.json)

**Firebase (전부 v24 계열)**: `app 24.0.0` · `auth 24.0.0` · `firestore 24.0.0` · `analytics ^24` · `app-check ^24` · `crashlytics ^24` · `messaging ^24`

**소셜 로그인**: `@react-native-google-signin/google-signin ^16.1.2` · `@react-native-seoul/kakao-login ^5.4.2` · `@react-native-seoul/naver-login ^4.2.4` · `expo-apple-authentication ~56.0.4`

**센서/위치**: `expo-location ~56.0.22` · `expo-sensors ~56.0.0` · `expo-task-manager ~56.0.23` · `react-native-sensors ^7.3.6` · `@kingstinct/react-native-healthkit ^14.0.2`

**미디어/UI**: `react-native-maps ^1.27.2` · `react-native-svg ^15.15.4` · `react-native-vector-icons ^10.3.0` · `@react-native-community/blur ^4.4.1` · `react-native-safe-area-context ^5.7.0` · `expo-camera` · `expo-image-picker` · `expo-image-manipulator` · `expo-media-library` · `expo-file-system` · `expo-asset`

**기타**: `react-native-tts ^4.1.1` · `expo-audio` · `expo-notifications ~56.0.22` · `expo-keep-awake` · `expo-crypto` · `@react-native-ml-kit/text-recognition ^2.0.0`(기록증 OCR) · `@react-native-async-storage/async-storage ^3.1.1` · `react-native-nitro-modules ^0.36.1`

**빌드/툴**: TypeScript ~6.0.3 · ESLint ^8.19 (`--max-warnings 338`) · Jest ^29.6.3 · patch-package ^8 · Node ≥22.11

### 3.2 외부 API / 서비스

| 대상 | 호출 위치 | 비고 |
|---|---|---|
| Cloud Functions `api` (asia-northeast3) | `lib/socialConfig.ts` `SOCIAL_BACKEND` | `POST /auth/kakao`, `POST /auth/naver`, `GET /shop/price`, `GET /health` |
| 네이버 쇼핑 검색 API | Functions `/shop/price` → `openapi.naver.com/v1/search/shop.json` | 키는 서버 환경변수(`NAVER_SEARCH_CLIENT_ID/SECRET`) |
| 카카오 `access_token_info` / 사용자 조회 | Functions `/auth/kakao` | app_id audience 검증(fail-closed 503) |
| 네이버 OAuth refresh 교환 + 프로필 | `functions/naverAuth.js` | audience 증명 대체(introspection 부재) |
| Firestore / Firebase Auth / FCM / Crashlytics / Analytics / App Check | 앱 전역 | — |
| Apple HealthKit | `lib/healthkit.ts` | 심박·안정시심박 읽기, 워크아웃 쓰기 |
| 쇼핑몰 검색 링크 (네이버쇼핑·무신사·29CM) | `lib/shoeStore.ts` → `Linking.openURL` | **쿠팡 제외** |
| 법적 문서 (GitHub Pages) | `lib/legalLinks.ts` | `solelife9.github.io/keego-legal/{privacy,terms,delete-account}.html` |

### 3.3 Cloud Functions

`functions/` — Node 22, `firebase-functions ^6.6.0`, `firebase-admin ^12.7.0`, `express ^4.19.2`. 함수 1개(`exports.api`, express 앱). per-IP rate limit(인메모리, 기본 20req/60s).

**필수 환경변수**: `KAKAO_APP_ID` · `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` · `NAVER_SEARCH_CLIENT_ID` · `NAVER_SEARCH_CLIENT_SECRET`
미주입 시: 카카오/네이버 로그인 **503으로 거부**(fail-closed), 가격 조회 503(빈 목록).

> 배포 시 이 변수들이 없으면 **로그인 자체가 안 된다.** `BLOCKER` (배포 절차 의존)

---

## 4. iOS 권한

`ios/SoleMate/Info.plist` 기준. 요구 시점은 코드 추적 결과.

| 권한 키 | 요구 시점 | 코드 위치 |
|---|---|---|
| `NSLocationWhenInUseUsageDescription` | 첫 GPS 런 — LocationPrime '계속' → `enterRun` | `lib/locationService.ts:88` |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | 위와 동일 순간, 포그라운드 승인 **직후** 연쇄 요청. 거부해도 비치명(포그라운드만으로 화면꺼짐 추적 동작) | `lib/locationService.ts:95` |
| `NSMotionUsageDescription` | LocationPrime '계속' 시 선요청 + RunEngine 시작 시 | `App.tsx:1925`, `screens/RunEngine.tsx:624` |
| `NSHealthShareUsageDescription` | 마이탭 → 애플 건강 연동 토글 ON | `ProfileScreen.rn.tsx:257` → `lib/healthkit.ts:70` |
| `NSHealthUpdateUsageDescription` | 위와 동일(한 번에 요청) | 동상 |
| `NSPhotoLibraryUsageDescription` | 신발 사진/프로필 사진 등록 시 | `lib/photo.ts:59` |
| `NSPhotoLibraryAddUsageDescription` | 공유 카드 '사진에 저장' 시 (`writeOnly`) | `lib/shareCard.ts:370` |
| `NSCameraUsageDescription` | 신발/메달 촬영, 기록증 OCR | `lib/photo.ts:94,110` · `MedalCamera.tsx` |
| 알림(푸시) | **첫 러닝 리캡을 닫는 순간** 커스텀 다이얼로그로 프라이밍 → 수락 시 OS 요청 | `App.tsx:628` `maybePrimePush` → `lib/pushMessaging.ts:54` |

**의도적으로 없는 것**: `NSMicrophoneUsageDescription` — 앱은 오디오를 녹음하지 않음(회귀 가드 `__tests__/nativePermissions.test.ts`).

**Entitlements** (`ios/SoleMate/SoleMate.entitlements`):
- `com.apple.developer.applesignin: Default`
- `com.apple.developer.healthkit: true`
- `aps-environment: development` ← **App Store 빌드는 `production` 필요** `BLOCKER` (Xcode 자동 서명이 치환하는지 확인 필요)
- `com.apple.security.application-groups: group.com.solemate.keego` (위젯/Live Activity 공유)

**URL 스킴**: `com.googleusercontent.apps.404780715201-...`(구글), `kakao55769f3db645ff1d409a62654f2ffe31`(카카오), `keego`(네이버)
**앱 설정**: 다크 모드 강제(`UIUserInterfaceStyle: Dark`), 세로 고정(iPhone), `ITSAppUsesNonExemptEncryption: false`, `NSAllowsArbitraryLoads: false`

---

## 5. 백그라운드 동작

### 5.1 `UIBackgroundModes`: `location`, `audio`

| 동작 | 구현 | 조건 |
|---|---|---|
| **화면 꺼짐/주머니 GPS 추적** | `expo-task-manager` `defineTask`(전역 스코프) + `Location.startLocationUpdatesAsync` | 러닝 중에만. **포그라운드 권한만으로 동작**(항상 허용 불필요) — `lib/locationService.ts` |
| **음성 코칭 (TTS)** | `react-native-tts` + `audio` 백그라운드 모드 | 러닝 중, 음성 설정 ON |
| **Live Activity** (잠금화면/다이내믹 아일랜드) | `ios/RunActivity/` 위젯 확장 + `LiveActivityModule.swift` ← `lib/liveActivity.ts` | 러닝 시작 시 start, 진행 중 throttled update, 종료 시 end. iOS 16.1↑ · 모듈 부재 시 전부 no-op |
| **워치 세션** | `WatchSessionModule.swift` ↔ `lib/watchSession.ts` | 워치 단독 러닝의 심박/런/정지 명령 수신. 콜드런치 대비 버퍼 재생 |
| **홈/잠금 위젯** | `ios/RunActivity/` (App Group `group.com.solemate.keego`) | 활성 신발 수명 표시 |

### 5.2 앱이 완전히 종료됐을 때

- **로컬 알림 OS 스케줄 없음.** `lib/notifications.dueNotifications`는 순수 결정 함수이고, 실제 표시는 **앱이 포그라운드로 돌아온 시점**의 `presentDue`(커스텀 다이얼로그)다. 즉 러닝 리마인더·신발 교체 알림은 **앱을 열어야 뜬다.** `MAJOR` — 사용자는 "알림 켰는데 안 온다"고 인식한다.
- **FCM 토큰은 발급·로컬 큐잉만 하고 서버 등록을 안 한다.** `FCM_REGISTER_ENDPOINT`가 비어 있어 `registerPushToken`이 항상 `'queued'` 반환(`lib/pushMessaging.ts:210`). 즉 **원격 푸시를 보낼 수단이 현재 없다.** `MAJOR`
- `lib/localReminder.ts`가 `expo-notifications` 기반 스케줄 경로를 가지고 있으나 옵셔널 모듈 인터페이스 형태.

### 5.3 워치 (`ios/SoleMateWatch Watch App/`)

`WKBackgroundModes: workout-processing`. 단독 러닝(GPS·심박·자동일시정지·스플릿·신발 스와이프·목표·트랙 자동랩) 후 폰으로 전송. 권한: `NSHealthShare/Update`, `NSLocationWhenInUse`.

---

## 6. 인증

### 6.1 흐름

```
index.js → activateAppCheck(__DEV__)        ← 다른 Firebase 사용보다 먼저
App.tsx  → onAuthStateChanged 구독 → authUser
  undefined → BootSkeleton
  null      → LoginScreen (강제 게이트, 우회 불가)
  {uid}     → 부팅 진행
```

### 6.2 제공자 (`LoginScreen.rn.tsx` 실제 노출 4종)

| 제공자 | 경로 |
|---|---|
| 카카오 | 네이티브 SDK → access token → Functions `/auth/kakao`(app_id 검증) → Firebase 커스텀 토큰 → `signInWithCustomToken`. uid = `kakao:<회원번호>` |
| 네이버 | 네이티브 SDK → **refresh token** → Functions `/auth/naver`(client_id/secret로 교환해 audience 증명) → 커스텀 토큰 |
| 구글 | `@react-native-google-signin` → OAuth credential → `signInWithCredential` |
| 애플 | `expo-apple-authentication` → OAuth credential → `signInWithCredential` (iOS만 노출) |

### 6.3 익명 계정

`CloudProvider` 타입과 `firebaseCloudPort.ts:147`에 `'anonymous'` 구현이 **존재하지만 LoginScreen이 버튼을 노출하지 않는다.** → 실질적으로 **익명 로그인 없음. 로그인 필수 앱.**

> 러닝 앱이 첫 화면부터 소셜 로그인 4개를 요구한다 = 온보딩 이탈의 가장 큰 단일 요인. 익명 경로가 이미 구현돼 있는데 꺼져 있다. `MAJOR`

### 6.4 계정 삭제

`cloudPort.deleteAccount()` — 클라우드 백업 문서 삭제 + Firebase 계정 삭제. 최근 로그인 필요 시 명확한 에러로 reject. 로컬 정리는 App 담당. 마이탭 → 계정 섹션. (App Store 5.1.1(v) 요건 충족)

### 6.5 App Check

`lib/appCheck.ts` — 개발은 debug provider, 프로덕션은 App Attest. **콘솔에서 enforce 토글은 아직 켜지 않은 상태를 전제**로 주석에 명시(먼저 켜면 구버전 사용자가 잠김).

---

## 7. 결제 / 구독

**없음.**

- IAP 라이브러리(`react-native-iap` 등) 없음, StoreKit 코드 없음, 구독 티어 없음.
- 수익화 관련 코드는 **어필리에이트 뼈대만** 존재:
  - `lib/affiliate.ts` — `AFFILIATE` 태그 객체가 **전부 빈 문자열**(시크릿 0 원칙, 주입 지점만 마련)
  - `AFFILIATE_DISCLOSURE` 고지 문구 정의됨
  - `lib/shoeStore.ts` — 네이버쇼핑/무신사/29CM 검색 링크(쿠팡 제외)
  - **`HomeScreen.rn.tsx:319`: 제휴/쇼핑 링크 프로덕션 숨김** (2026-07-20 사용자 요청)
- `lib/shoePrice.ts` — 네이버 쇼핑 현재가 조회(정가 DB 대신). 공식 스토어 + `category4==='러닝화'`인 상품만 통과.

---

## 8. 미완성 표시

> `TODO`/`FIXME`/`HACK` 주석은 **코드베이스 전체에 0건**이다. 대신 아래는 코드를 읽어 찾은 실질적 미완성이다.

### 8.1 기능이 있으나 진입점이 막힌 것

| 항목 | 위치 | 상태 |
|---|---|---|
| 명예의 전당(라이브 리더보드) | `App.tsx:2082-2084` | `onOpenHallOfFame` 미주입 → ProgressionScreen이 버튼 자체를 숨김. 화면·Firestore 규칙·publish 로직은 전부 완성. 주석에 "한 줄만 복원" 명시 |
| 제휴/쇼핑 링크 | `HomeScreen.rn.tsx:319` | 프로덕션 숨김 |
| 익명 로그인 | `lib/firebaseCloudPort.ts:147` | 구현됐으나 LoginScreen 미노출 |
| 부상위험 상세 화면 | `App.tsx:2098` 주석 | "홈 진입점이 사라져 도달 불가"로 제거됨 |

### 8.2 개발 전용 코드가 프로덕션 경로에 남아 있음

| 위치 | 내용 | 가드 |
|---|---|---|
| `App.tsx:312` | `previewOnboard` 초기값 = `__DEV__ && !JEST_WORKER_ID` — **개발 빌드는 항상 온보딩부터 시작** | `__DEV__` |
| `App.tsx:737` | 개발 시드 데이터 주입 (`devSeedShoes`/`devSeedRuns`) | `__DEV__` && `NODE_ENV!=='test'` && 신발 0켤레 && `__KEEGO_DEV_SEED__!==false` |
| `App.tsx:373` 주석 | `__KEEGO_AUTH_USER__` 전역으로 인증 강제 주입 가능 | 테스트용 |
| `lib/devSeed.ts` | 시드 데이터 파일 자체가 번들에 포함 | — |

`__DEV__` 가드는 릴리스에서 제거되므로 기능적 위험은 없으나, `devSeed`는 릴리스 번들에 죽은 코드로 남는다. `NITPICK`

### 8.3 알려진 기능 공백 (코드 주석이 스스로 밝힌 것)

| 항목 | 위치 | 심각도 |
|---|---|---|
| **프로필/신발 사진이 클라우드 백업 안 됨** — 재설치 시 영구 소실. 화면에 그 사실을 고지 | `ProfileScreen.rn.tsx:1130` | `MAJOR` |
| **FCM 토큰 서버 등록 엔드포인트 미존재** — 원격 푸시 발송 불가 | `lib/pushMessaging.ts:210` | `MAJOR` |
| **알림이 앱 실행 중에만 표시됨** — OS 스케줄 알림 없음 | `lib/notifications.ts` 헤더 | `MAJOR` |
| 앱 버전 표기가 네이티브 `MARKETING_VERSION`을 못 읽음(하드코딩) | `ProfileScreen.rn.tsx:64` | `MINOR` |
| BottomSheet 드래그 dismiss 미구현(그래버 의도적 미표시) | `primitives.tsx:1674`, `ShareCardPicker.tsx:128` | `NITPICK` |
| 신발 스펙 커버리지 71/588 | `data/shoeSpecs.json` | `MINOR` |
| `data/shoeCatalog.json` 미커밋 수정 상태 | git status | `MINOR` |

### 8.4 배포 전 필수 확인

| 항목 | 근거 |
|---|---|
| `aps-environment: development` → production | `SoleMate.entitlements` |
| Functions 환경변수 5종 주입 (`KAKAO_APP_ID`, `NAVER_CLIENT_ID/SECRET`, `NAVER_SEARCH_CLIENT_ID/SECRET`) | 미주입 = 로그인 503 fail-closed |
| Firebase 콘솔 App Check 등록 후 enforce 토글 | `lib/appCheck.ts` 주석 |
| 법적 문서 3종(GitHub Pages) 접근 가능 여부 | `lib/legalLinks.ts` |
| ESLint 경고 338개 허용 중 | `package.json` `--max-warnings 338` |
| `firestore-debug.log` (85KB) 저장소에 커밋돼 있음 | 루트 |
| Android 빌드/권한 흐름 미검증 | `android/` |

### 8.5 아키텍처 부채

- `App.tsx` 151KB — 부팅·인증·동기화·CRUD·라우팅을 전부 소유. 러닝 엔진만 `screens/RunEngine.tsx`로 분리됨(감사 F-03 1단계).
- 화면 4개가 각각 40~91KB(`ProfileScreen` 91KB, `HistoryScreen` 90KB, `RunActiveScreen` 80KB, `ShoesScreen` 58KB).
- `primitives.tsx` 77KB.
- 라우터 라이브러리 부재 → 딥링크·뒤로가기·화면 전환 애니메이션이 구조적으로 어렵다.

---

## 이 앱을 한 문장으로 설명하면

**Keego는 "지금 어떤 러닝화를 신을지"에서 출발해 러닝을 기록하고, 그 거리를 신발 수명에서 자동으로 차감해 언제 어떤 신발로 갈아탈지까지 알려주는 — 러닝 트래커와 러닝화 수명 관리기를 한 몸으로 만든 iOS 앱이다.**
