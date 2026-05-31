---
delivery_mode: agile
---

# Spec: SoleMate Pro Overhaul (엔진 정밀화 + 기능 완성 + 디자인 리뉴얼)

Date: 2026-05-31
Feature: pro-overhaul
Mode: Full / agile (3 slices)
Interview: `.tenet/interview/2026-05-31-pro-overhaul.md`
Harness: `.tenet/harness/current.md`
Scenarios: `.tenet/spec/scenarios-2026-05-31-pro-overhaul.md`

## Purpose

**Keego**(구 SoleMate/SoleLife)는 React Native 러닝/신발 관리 앱이다. 브랜드명 Keego = "keep going"의 축약으로, **러닝화 내구도 관리를 잘해서 부상 없이 러닝 생활을 계속 이어가게(keep going) 한다**는 의미를 담는다. **핵심 차별점은 '러닝화 내구도 관리' + shoe-first 흐름**: 사용자가 신발을 고르고 → 바로 러닝을 시작하면 → 그 신발의 누적거리/수명이 자동 차감된다. Nike Run Club·Strava와 경쟁해 출시 시 선택받을 수 있도록, (1) 핵심 러닝 엔진의 정확도/안정성을 업계 수준에 근접시키고, (2) 화면에 보이지만 동작하지 않던 기능을 실제로 작동시키며 신발 중심의 신규 기능을 추가하고, (3) 숙련된 개발자·디자이너가 만든 수준으로 전체 디자인을 리뉴얼한다. 안드로이드만 빌드, 네이티브 최소 변경, 사용자 데이터 파괴 금지가 iron law.

**브랜딩 적용 범위:** in-app 워드마크('SOLEMATE'/'SOLELIFE' → 'Keego')와 카피/톤/디자인 방향에 Keego 정체성("계속 달리게 해준다 — 부상 방지·신발 관리")을 반영한다. 네이티브 앱 표시명/패키지 rename(android strings.xml, applicationId, app.json)은 빌드 영향이 있어 danger zone — 별도 확인 후 진행하고, 우선은 JS 레벨 in-app 브랜딩부터 적용한다.

## Tech Stack (확정, package.json 기준)

- React Native 0.85.2, React 19.2.3, TypeScript 5.8.3 (strict)
- 위치: `react-native-geolocation-service` ^5.3.1 (watchPosition, `coords.accuracy`)
- 센서: `react-native-sensors` ^7.3.6 (accelerometer, 100ms)
- 그래픽: `react-native-svg` ^15.15.4 (이미 설치 — 코스맵 폴리라인/Ring에 사용)
- TTS: `react-native-tts` ^4.1.1 (ko-KR, 음성 안내)
- 아이콘: `react-native-vector-icons` ^10.3.0 (Ionicons)
- 저장: `@react-native-async-storage/async-storage` ^3.0.2
- 네비게이션: 수동 탭 상태(App.tsx) — `@react-navigation/*` 설치돼 있으나 미사용
- 테스트: jest ^29.6.3 + `@react-native/jest-preset` 0.85.2
- Lint: eslint(@react-native/eslint-config), Format: prettier
- Node ≥ 22.11.0. 빌드 타깃: **Android only**(Windows + gradlew). iOS는 코드 호환 유지, 빌드는 추후 Mac.

## 아키텍처 현황 (코드 grounding, [scanned-not-verified])

- 진입점 `App.tsx`가 네비게이션 + 런 트래킹 엔진(`KalmanFilter` 클래스 line 43–53, `calcDist` Haversine line 37–41)을 모두 보유. 화면은 `*.rn.tsx` 파일별 분리.
- 디자인 토큰은 `theme.ts`(13색 + 폰트 Pretendard/Bebas + 분리된 spacing 없음), 프리미티브는 `primitives.tsx`(Ring, TabBar)에 집중.
- 저장: 로컬 우선 AsyncStorage(`route_<id>`, `time_<id>`, `device_id`, `shoe_alert_date`) + 백엔드 REST(`API = https://solelife-backend.onrender.com`).
- **확인된 결함(인터뷰·코드맵 일치):**
  - GPS `coords.accuracy`로 fix 거부 없음(App.tsx:463) → 신호 나쁠 때 거리 튐.
  - GPS 워밍업 폐기 없음(watchPosition 즉시 시작, App.tsx:428–435).
  - 자동 일시정지: 상태/재개 로직 존재하나 **정지 감지 트리거 미연결**(App.tsx:379–381, 438–445) → 사실상 동작 안 함.
  - 케이던스: 가속도 magnitude 피크(임계 12, 250ms 디바운스, 60s 윈도우, App.tsx:436–455) — 동작하나 비적응형.
  - 심박: 필드만 존재, 측정 소스 없음 → 항상 0(App.tsx:225).
  - `ShoesScreen activeIdx={0}` 하드코딩(App.tsx:334) → 선택 신발 미반영.
  - ProfileScreen 설정 4행(목표/알림/단위/계정) 전부 비동작·하드코딩('주 5회'/'켜짐'/'킬로미터', ProfileScreen.rn.tsx:16–21,88–97).
  - AddShoe 사진 업로드 장식용 placeholder(AddShoeScreen.rn.tsx:56–60), 이미지 라이브러리 없음.

## Backend API (기존, `API` 상수 절대경로)

| Method | Path | Auth | Description |
| :-- | :-- | :-- | :-- |
| POST | `/api/auth` | device_id | 디바이스 인증 → `user_id` 반환 |
| GET | `/api/shoes?user_id=` | user_id | 신발 목록 |
| POST | `/api/shoes` | user_id | 신발 생성 |
| PATCH | `/api/shoes/<id>` | user_id | 신발 이름/속성 수정 |
| DELETE | `/api/shoes/<id>` | user_id | 신발 삭제 |
| GET | `/api/runs?user_id=` | user_id | 런 기록 목록 |
| POST | `/api/runs` | user_id | 런 기록 저장 |

> 신규 기능은 **가능한 한 기존 엔드포인트와 로컬 저장으로** 구현한다(백엔드 스키마 변경 최소화). 신규 설정/목표/알림 임계값 등 클라이언트 상태는 AsyncStorage로 영속화. 백엔드 신규 필드가 꼭 필요하면 slice 진입 시 확인.

## 데이터 모델 (엔티티)

**Shoe** (백엔드 + 로컬 캐시)
| Column | Type | Constraints |
| :-- | :-- | :-- |
| id | number | PK |
| name | string | not null |
| total_km | number | ≥ 0, 런 저장 시 자동 누적 |
| target_km | number | 수명 임계값(교체 알림 기준), 기본값 신발별 설정 |
| created_at | string(ISO) | |

**Run** (백엔드 + 로컬 캐시)
| Column | Type | Constraints |
| :-- | :-- | :-- |
| id | number | PK |
| shoe_id | number | FK→Shoe (런 시작 시 선택된 신발) |
| distance_km | number | ≥ 0 (음수 금지 iron law) |
| duration_s | number | ≥ 0, 운동 시간(자동 일시정지 구간 제외) |
| pace | number/string | 파생(거리/시간) |
| cadence | number | spm |
| heart_rate | number | 보존만(표시 숨김, 데이터 파괴 금지) |
| date | string(ISO) | |
| route | json `[{lat,lon}]` | AsyncStorage `route_<id>`, 최대 200점 |

**로컬 설정 (신규, AsyncStorage)**
| Key | Type | Description |
| :-- | :-- | :-- |
| `settings_unit` | 'km' \| 'mi' | 단위 설정 |
| `settings_alerts` | json | 신발 교체 알림 on/off + 임계값 |
| `goal_weekly_km` | number | 주간 거리 목표 |
| `goal_streak` | json | 스트릭 계산 캐시 |
| (기존 유지) `route_<id>`,`time_<id>`,`device_id`,`shoe_alert_date` | | 파괴 금지 |

## Design Direction

**LOCKED (2026-05-31 초기 계획 체크포인트 승인).** 산출물: `.tenet/visuals/2026-05-31-00-architecture.html`, `-01-final-product.html`, `-02~04-slice-{1..3}.html`, `-05-prototype-walkthrough.html`. 디자인 시스템 상세는 `.tenet/DESIGN.md`.

**실물 화면 진단(스크린샷 기반).** 기존 앱은 뼈대가 양호(다크 #000+오렌지, shoe-first 카피 "오늘은 어떤 신발로 달려볼까요?", 발자국 모티프, 업적 배지, 런 화면 링). 갈아엎지 않고 정제한다. 개선점:
- **타이포 = Pretendard로 통일(사용자 승인).** `theme.ts`의 `DISPLAY=BebasNeue` 제거 — 큰 숫자(거리/페이스/목표/통계)도 Pretendard로, tabular(고정폭) 숫자 + 두께 위계(예: 400/600/800)와 타이트 트래킹으로 모던·차분하게(Toss/Apple Fitness/Strava 톤). **네이티브 폰트 추가 없음**(Pretendard 이미 번들).
- **오렌지 절제:** 기록 화면의 라벨 오렌지 과다 → 라벨은 T3 회색, 강조는 숫자/CTA에만. 신발 카드 오렌지 과다 → 수명 충분 시 차분, 닳을수록 WARN/DANGER로 변하는 상태 색.
- **숫자/단위 정렬:** "0.0km"류 cramped 정리(간격·baseline).
- **워드마크 SOLEMATE → Keego**, keep-going 보이스.

**설계 권한(사용자 부여):** 에이전트가 탑티어 개발자·디자이너 관점에서 UX/IA/기능을 **재설계할 권한**을 가진다. 기존 화면 구조에 얽매이지 않고 사용성·완성도를 NRC/Strava 경쟁 수준으로 끌어올린다. 단 iron law(데이터 파괴 금지, 네이티브 최소 변경, tsc/lint/test 통과, 시크릿 금지)는 불변. 핵심 재설계 원칙:
1. **shoe-first를 앱의 척추로**: 홈은 "어떤 신발로 달릴까?"를 한 번의 탭으로 결정하게 하고, 신발 내구도를 시각적 주인공으로. 런 시작 흐름에 선택 신발을 명확히 연결(activeIdx 버그 제거).
2. **내구도를 감정적 훅으로(keep going)**: "이 신발로 312km 더 달릴 수 있어요", "지금 교체하면 부상 없이 계속 달릴 수 있어요" — 교체를 잡일이 아니라 부상 예방·지속 동기로 프레이밍.
3. **런 화면 인지부하 최소화**: 거리 1개 히어로 지표 + 글랜서블 보조(페이스/시간/케이던스), 자동 일시정지 상태를 명확히 피드백.
4. **동기 루프**: 런 종료 → 축하 + 해당 신발 마모 반영 + 주간 목표/스트릭 진행을 한 화면에서.
5. **마찰 없는 설정**: 즉시 반영되는 실제 컨트롤(죽은 행 제거).
- 유지 방향성: 다크 배경(#000)+오렌지 액센트(#FF6500/#FF9F4A), Pretendard(본문)/Bebas(숫자·헤드라인). NRC의 여백·타이포 위계, 명료한 실시간 지표를 참고하되 **Keego의 shoe-first** 정체성(신발 카드/수명 링/교체 배지)을 시각적 주인공으로.
- **브랜드 표현(Keego = keep going):** 워드마크 'Keego'로 통일, 카피/문구에 "계속 달리게 — 부상 없이" 톤 반영(빈 상태·달성·교체 알림 메시지 등). 수명 링이 다 닳기 전 교체를 유도하는 게 곧 'keep going'을 돕는 행위라는 내러티브를 시각/문구로 연결.
- theme.ts에 **spacing/타이포 스케일 토큰 추가**(현재 색·폰트만 존재), 전 화면 하드코딩 색/폰트 0.

## Auth Flow

1. 앱 시작 → AsyncStorage `device_id` 조회(없으면 생성·저장).
2. `POST /api/auth {device_id}` → `user_id` 수신, 메모리 보관.
3. 이후 모든 신발/런 API에 `user_id` 사용.
4. 권한: 런 시작 시 위치 권한 요청(PermissionsAndroid/Geolocation). 거부 시 한국어 사유 + 설정 딥링크, 트래킹 차단(크래시 금지, 기존 권한 로직 회귀 금지 = danger zone).

## Success Criteria (measurable)

엔진(Slice 1):
1. `coords.accuracy > MAX_FIX_ACCURACY_M(20)` fix는 거리 누적에서 제외(단위 테스트로 강제). 마지막 양호 위치는 유지해 경로 연속성 보존.
2. 트래킹 시작 후 `WARMUP_FIXES(3)` 이내 fix는 거리 미반영(단위 테스트).
3. 구간 순간속도 `> MAX_SEG_SPEED_MPS(12)`면 거부(단위 테스트). 기존 3m~300m 세그먼트 인정 유지.
4. 자동 일시정지가 실제 작동: 속도 `< 0.6 m/s`가 연속 6초→일시정지, `> 1.0 m/s` 연속 2초→재개. 순수 판정 함수 `decideAutoPause(state, speed, dt)`로 분리·테스트. 일시정지 동안 거리/시간 누적 중단.
5. 케이던스 알고리즘 개선(적응형 임계 또는 검증된 고정값) — 순수 함수로 분리·테스트.
6. 핵심 순수 함수(거리 계산/누적, 페이스·시간 포맷, GPS fix 필터, 자동 일시정지, 신발 수명 `shoeHealth`) 각 ≥1 단위 테스트, 신규 모듈 라인 커버리지 ≥ 60%. App.tsx 순수 로직이 `lib/*`로 추출돼 import·테스트 가능.
6a. **백그라운드 트래킹**: 화면 off/앱 백그라운드에서도 거리·시간 기록 지속(포그라운드 서비스). 권한 미보유 시 graceful.
6b. **데이터 손실 방지**: 진행중 런이 주기적으로 영속화돼 강제종료 후 재실행 시 복구 가능. 완주 런은 네트워크 실패해도 로컬 보존+재동기. 자동 일시정지/재개 전환에서 시간·거리 음수·유실 없음(단위 테스트).

기능(Slice 2):
7. ProfileScreen 설정 4행이 모두 실제 동작(목표·알림·단위·계정), 하드코딩 값 제거하고 실제 상태 표시.
8. AddShoe 사진 업로드 실동작(실패 시 사진 없이 저장, 비차단).
9. 신발 교체 알림: 앱내 배지 + 신발 목록/상세 임계값 표시(임계값 설정 가능).
10. 러닝 목표 & 달성률(주간 거리 목표 + 스트릭) 실데이터로 작동.
11. 코스 지도(react-native-svg 폴리라인)가 저장된 route로 렌더.
12. 기록 내보내기/공유(RN `Share` 텍스트 요약) 작동.
13. `activeIdx` 하드코딩 제거 → 선택 신발 반영, 신발 선택→런 시작→해당 신발 거리 자동 차감의 shoe-first 흐름이 매끄럽게 동작.

디자인(Slice 3):
14. 화면 내 하드코딩 색상/폰트 0(theme 토큰만 사용), 전 화면 일관된 간격/타이포 스케일.
15. 전 화면 시각 완성도 상향(NRC/Strava 대비 손색없는 마감), shoe-first 요소가 시각적 주인공.

전역(iron law):
16. `npx tsc --noEmit`, `npm run lint`, `npm test` 모두 통과.
17. 사용자 데이터(신발·런 기록) 파괴적 변경 없음(heart_rate 등 기존 필드 보존, 표시만 숨김).
18. 시크릿/키 하드코딩 없음. 커밋 한국어, main 직접 커밋.

## Test Strategy & Runtime

- **Unit (live):** jest + `@react-native/jest-preset`. 신규 순수 모듈(`lib/geo|format|stats|shoe`, 엔진 상수, 단위/목표/PR 계산) 라인 커버리지 ≥60%, 크리티컬 패스 각 ≥1. 명령 `npm test`.
- **네이티브 의존 모킹(필수):** `jest.setup.js`에서 `@react-native-async-storage/async-storage`(공식 mock), `react-native-geolocation-service`(watchPosition stub), `react-native-sensors`(accelerometer stub), `react-native-tts`, `global.fetch` 모킹. 실디바이스 의존 테스트 금지.
- **Integration (mocked):** 화면 컴포넌트는 RN Test Renderer + 모킹된 저장/네트워크로 상태 전이(로딩/에러/empty, 신발 차감) 검증. 백엔드는 모킹(실 onrender 호출 금지 — 콜드스타트/불안정).
- **E2E surface = 모바일 앱(Android RN).** Playwright Layer 2 = **not applicable / skipped (reason: 브라우저 UI 아님, RN 네이티브 앱).** 시각 검증은 사용자 use-checkpoint에서 실기기/에뮬레이터 캡처로 대체.
- **GPS/백그라운드/포그라운드 서비스 등 디바이스 거동:** 단위 테스트로 순수 판정 로직 검증 + 실기기 수동 확인(비-UI 검증: 진행중 런 스냅샷이 AsyncStorage에 기록되는지 assert).
- **Lint/Typecheck:** `npm run lint`, `npx tsc --noEmit` 통과(iron law).
- **Runtime:** 시작 `npx react-native start` + `npm run android`(연결 기기/에뮬레이터). 백엔드 `API=https://solelife-backend.onrender.com`(외부, 키 불필요·device_id 인증). 외부 호출 크레덴셜 없음. Node ≥22.11.0.

## Out of Scope

- 심박(BPM) 실측 — 폰 단독 불가. UI/저장 필드 숨김(데이터 보존). 향후 BLE 워치/벨트 연동은 별도 작업.
- iOS 빌드/출시(코드 호환만 유지, 빌드는 추후 Mac).
- `react-native-maps` 도입(네이티브 추가 회피). 코스맵은 svg 폴리라인.
- OS 푸시 알림(네이티브 영향 큼) — 신발 알림은 앱내 배지로. 추후 확장.
- 소셜/리더보드/친구(NRC식 커뮤니티) — 이번 범위 아님.
- GPX/CSV·이미지 카드 내보내기 — 1차는 텍스트 공유, 확장 후보.
- 백엔드 대규모 스키마 변경 — 가능한 기존 엔드포인트/로컬 저장으로 처리.
- **수익화(신발 교체 제휴/어필리에이트) — Phase 2 로드맵.** 이번 3-slice는 코어에 집중. 단 추천 엔진 토대가 될 시드DB·내구도 로직은 Slice 1~2에서 구축.
- 계정 로그인·멀티디바이스 동기, 런타입별 기본신발, 공유카드 — Phase 2.
- **백그라운드 트래킹은 이번 범위에 포함**(Slice 1, AndroidManifest 포그라운드 서비스 권한 추가 — 사용자 승인).

## Slice plan

Total slices: 3

### Slice 1: 핵심 러닝 엔진 정밀화 + 신뢰성 (감사 P0 전부 포함 — 사용자 승인)
- **Adds (정확도)**: GPS 정확도 기반 fix 필터(accuracy>20m 거부)·워밍업(첫 3 fix)·속도 이상치 게이트(>12m/s), **거리 하한 게이트 완화(3m→~1m, 일반 페이스 과소집계 수정, audit#5)**, 자동 일시정지 버그 수정(정지 감지 트리거 연결 + pausedMs guard, audit#4), 케이던스 알고리즘 개선(초기 윈도우·spm 정규화).
- **Adds (신뢰성 P0)**: **백그라운드 트래킹**(react-native-geolocation-service 포그라운드 서비스 + AndroidManifest FOREGROUND_SERVICE/LOCATION 권한·notification — 화면off/백그라운드에서도 기록), **진행중 런 스냅샷 영속 + 재실행 복구**(크래시/킬 시 런 전손 방지, audit#2), **완주 런 로컬 우선 저장 + 미동기 큐**(네트워크 실패 시 소실 방지, audit#3), 권한 거부/주행중 회수 graceful 처리(+iOS requestAuthorization), GPS 死구간 배너.
- **Bundled with (기반 추출)**: `App.tsx` 순수 로직 모듈 추출 — `lib/geo.ts`(calcDist·fix필터·route단순화), `lib/format.ts`, `lib/stats.ts`, `lib/shoe.ts`(`shoeHealth(shoe,runs)` 단일화 — total_km 파생 중복 제거, audit#7), 엔진 상수 모듈(`MAX_FIX_ACCURACY_M` 등), `KalmanFilter` export. **jest.setup 네이티브 모킹**(GPS/센서/TTS/AsyncStorage) + 신규 모듈 ≥60% 커버리지·크리티컬 패스 단위 테스트. `theme.ts` spacing/radius/type 토큰 추가(리뉴얼 선행). 신발 retire(보관) + 검증수명 기반 비례 교체 경고(시드DB 카테고리 %티어).
- **User can**: 주머니에 넣고 달려도(백그라운드) 거리가 정확히 기록되고, 앱이 죽어도 런이 복구되며, 신호 나빠도 거리가 안 튀고, 멈추면 자동 일시정지되는 — **진짜 믿을 수 있는** 러닝 트래킹. 닳은 신발은 카테고리 수명 기준으로 교체 경고를 받고, 신발을 기록 손실 없이 보관(retire)한다.
- **Out of slice**: 신규 화면, 디자인 전면 적용, ProfileScreen 설정, 코스맵, 시드DB 134모델 UI 반영(데이터는 준비됨).
- **네이티브 변경 승인**: 백그라운드 트래킹용 AndroidManifest 권한/서비스 추가는 사용자 승인됨(danger zone 예외).

### Slice 2: 미완성 UI 연결 + shoe-first 신규 기능 + 신발 인텔리전스
- **Adds (shoe-first 차별점 심화)**: **신발 모델 DB 134개 반영**(`data/shoeModels.ts` 추출 + AddShoe 모델 선택 시 검증 권장수명 자동·수정가능, 시드=`shoe-database-2026-05-31.md`), **"오늘은 이 신발" 추천**(최근 미착용/휴식 로테이션 칩), **신발 상세에서 바로 "이 신발로 달리기" CTA**(shoe-first 동선), per-shoe 마지막 착용/타임라인, cost-per-km(구매가 입력), `activeIdx` 하드코딩 제거.
- **Adds (미완성 UI 실동작)**: ProfileScreen 설정 4행(목표·알림·단위·계정), AddShoe 사진 업로드(실패 시 비차단), 러닝 목표&달성률(주간 km+스트릭), 신발 교체 알림(앱내 배지+임계값), 코스 지도(svg 폴리라인), 기록 내보내기(Share 텍스트), **개별 런 편집/삭제·수동 런 입력**(GPS 오측정이 신발 수명 왜곡 방지), PR(개인기록).
- **Adds (신뢰성)**: 로딩/에러 상태(콜드 백엔드 skeleton+재시도), 권한 priming/온보딩, 서버 truth(shoe total_km·run_time 영속), ErrorBoundary.
- **Bundled with**: 설정 영속화(AsyncStorage 신규 키), 단위(km/mi) 환산 유틸·목표/스트릭/PR 계산 순수 함수·테스트, BackendShoe/Run 타입.
- **User can**: 신발 고르고 바로 러닝→자동 차감, 모델 선택 시 검증 권장수명 자동, "오늘 이 신발" 추천, 신발 상세에서 바로 달리기, 교체 배지·코스맵·목표·스트릭·PR 확인, 런 편집·수동입력으로 신발 수명을 정확히 관리, 기록 공유 — 출시 경쟁력 있는 shoe-first 경험.
- **Out of slice**: 전면 디자인 토큰 적용·접근성·시각 polish(Slice 3), BLE 심박, OS 푸시, 소셜, 수익화 제휴(Phase 2).
- **slice 진입 확인 필요(잠정 기본값)**: 코스맵=svg, 알림=앱내 배지, 목표=주간 km+스트릭, 내보내기=텍스트 Share, 런타입(이지/템포/롱) 포함 여부.

### Slice 3: 전체 디자인 리뉴얼 & 마감 polish
- **Adds**: theme.ts 토큰 **전 화면 적용**(하드코딩 색/폰트/spacing 제거→토큰화), **타이포 Pretendard 통일·Bebas 제거**(tabular 숫자+두께 위계), `<Metric value unit/>` 프리미티브("0.0km" cramping 해소), 오렌지 절제(라벨 T3·상태색 단계), shoe-first 요소를 시각적 주인공으로 한 전 화면 완성도 상향, 심박 UI 숨김(데이터 보존), **in-app 워드마크/카피 Keego 교체**(keep going 톤), RunActive 글랜서블 위계.
- **Adds (접근성/폴리시)**: WCAG 대비 개선(소형 텍스트 색), 색상 단독 상태표시 보완(아이콘/형태), SR 라벨, 44pt 터치타깃, 일관 press 피드백, 빈/에러 카피(keep-going 보이스), safeArea(paddingTop:60 제거), 死deps(@react-navigation/rxjs/screens) 정리.
- **Bundled with**: primitives 확장(Button/Card/Badge/Metric), 빈/로딩/에러 상태 마감, 마이크로 인터랙션, 신발 전용 아이콘.
- **User can**: NRC/Strava와 나란히 놓아도 손색없는, 누가 봐도 깔끔하고 완성된 Keego를 쓴다.
- **Out of slice**: 신규 기능(앞 slice), 수익화(Phase 2), 네이티브 표시명 rename.

### (로드맵) Phase 2 — 수익화 & 확장 (이번 빌드 범위 외)
- **신발 교체 추천 + 제휴 수익**: 내구도 마모/교체 시점에 검증 시드DB 기반으로 다음 러닝화 추천(같은 카테고리 최신/패턴 맞춤) → 쿠팡파트너스 등 어필리에이트. 가드레일: 배너광고 지양, 커미션보다 러너 최선·투명성, 코어 신뢰 확보 후. 추천 엔진 자산 = 이미 구축한 134모델 시드DB.
- 기타: BLE 심박, OS 푸시, 계정 로그인/멀티디바이스 동기, 런타입별 기본신발, 공유카드, 네이티브 앱 표시명 rename.
