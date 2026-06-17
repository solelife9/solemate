# Harness: Quality Contract

## Project Context
**Keego** (구 SoleMate/SoleLife) — React Native 러닝/신발 관리 앱. 브랜드명 Keego = "keep going" 축약(러닝화 내구도 관리로 부상 없이 러닝을 계속 이어가게 한다). 핵심 차별점 = 러닝화 내구도 관리 + shoe-first(신발 고르고 바로 러닝→자동 거리 차감). 경쟁 대상 Nike Run Club·Strava. in-app 워드마크/카피는 Keego로 통일하되 네이티브 앱 표시명/패키지 rename은 빌드 영향 확인 후 별도 진행.
- 핵심 기능: GPS 런 트래킹(Kalman 필터 기반 좌표 보정), 가속도계, TTS 음성 안내, 신발 누적 거리/수명 관리, 주간/기간별 통계.
- 스택: React Native 0.85.2, React 19.2.3, TypeScript 5.8, React Navigation(bottom-tabs).
- 로컬 저장: AsyncStorage. 백엔드 API: https://solelife-backend.onrender.com
- 화면: Home / History / Shoes / Profile / AddShoe / Run (각 `*.rn.tsx`), 진입점 `App.tsx`.
- 빌드 정책: **현재는 Android만 빌드**(Windows + gradlew). iOS는 코드 호환성을 유지하되 빌드/출시는 추후 Mac(Xcode)에서 진행한다. 배포는 `gh release`.
  - JS/TS 코드는 Android·iOS 공유 → iOS 출시 시 코드 재작성 불필요, 빌드만 Mac에서 별도 수행(`pod install` → Xcode).
  - iOS 출시 대비: 권한 문구(`ios/.../Info.plist`의 `NSLocationWhenInUseUsageDescription` 등)와 라이브러리 iOS 지원 여부를 미리 챙긴다.

## Formatting & Linting
formatter: prettier (singleQuote, trailingComma: all, arrowParens: avoid) — `.prettierrc.js`
linter: eslint (@react-native/eslint-config) — `npm run lint`
typecheck: `npx tsc --noEmit`
enforcement: pre-commit + eval gate

## Testing Requirements
test_framework: jest (@react-native/jest-preset) — `npm test`
unit_test_coverage: >= 60% for new code (특히 순수 함수: 거리 계산, 페이스/시간 포맷, 신발 파싱)
- 센서/GPS/TTS 의존 로직은 모킹하여 테스트 (실디바이스 의존 금지).

## Architecture Rules
- 화면 컴포넌트는 `*.rn.tsx` 네이밍 규칙을 유지한다.
- 디자인 토큰(색상/폰트/간격)은 `theme.ts`에서만 가져온다. 화면 내 하드코딩한 색상/폰트 금지.
- 재사용 UI 프리미티브는 `primitives.tsx`에 둔다.
- 비즈니스 로직(거리·페이스 계산, 필터)은 가능한 순수 함수로 분리해 테스트 가능하게 유지한다.
- 영속화는 AsyncStorage를 통하며, 키 네이밍은 기존 규칙을 따른다.
- API 호출은 `API` 상수 기준 절대경로를 사용한다.

## Code Principles
- Prefer composition over inheritance
- Explicit over implicit
- Functions do one thing
- TypeScript strict: `any` 남용 금지, 가능한 타입을 명시한다.
- UI 문구는 한국어(기존 톤 유지).

## Engine Constants (Slice 1 확정, 상수로 추출·테스트)
- `MAX_FIX_ACCURACY_M = 20` (accuracy 초과 fix 거리 누적 제외, 마지막 양호 위치 유지)
- `WARMUP_FIXES = 3` (시작 후 첫 3 fix 거리 미반영)
- `MAX_SEG_SPEED_MPS = 12` (구간 순간속도 초과 시 거부; 기존 세그먼트 3m~300m 인정 유지)
- `AUTO_PAUSE_SPEED_MPS = 0.6`, `AUTO_PAUSE_HOLD_S = 6`, `AUTO_RESUME_SPEED_MPS = 1.0`, `AUTO_RESUME_HOLD_S = 2`
- 판정은 순수 함수(`decideAutoPause`, fix 필터)로 분리해 jest 단위 테스트로 강제.

## Danger Zones (do not modify)
- `android/`, `ios/` — 네이티브 빌드 설정 (명시적 요청 없이 수정 금지). 앱 표시명/패키지 rename도 빌드 영향 확인 후에만.
  - **승인된 예외(Slice 1):** 백그라운드 트래킹을 위해 `android/app/src/main/AndroidManifest.xml`에 `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`(+ 필요시 `ACCESS_BACKGROUND_LOCATION`) 권한과 location 포그라운드 서비스 선언 추가는 사용자 승인됨. 최소 변경·기존 권한 회귀 금지.
- `App.tsx`의 `KalmanFilter` 클래스 및 `calcDist` — GPS 정확도 핵심 로직. 변경 시 반드시 테스트/검증 동반.
- `package-lock.json` — 수동 편집 금지(npm을 통해서만 변경).
- 권한 요청 로직(PermissionsAndroid / Geolocation) — 회귀 시 트래킹 전체가 멈추므로 신중히.

## Iron Laws
- 빌드가 깨지면 안 된다: `npx tsc --noEmit`, `npm run lint`, `npm test` 모두 통과해야 머지한다.
- 런 트래킹 중 거리/시간 데이터가 유실되거나 음수가 되어선 안 된다.
- 사용자 데이터(신발 기록, 런 기록)는 마이그레이션 없이 파괴적으로 변경하지 않는다.
- 시크릿/키를 코드에 하드코딩하지 않는다.
- 커밋 메시지는 한국어로 작성하고 main에 직접 커밋한다(프로젝트 워크플로우 준수).

## Progression & Retirement feature (slices A–D, 2026-06-12) — 추가 규약
- **순수 엔진 분리**: 진척/랭크/타이틀/업적/은퇴 로직은 `lib/progression/*.ts` 순수 함수로 둔다(입력 불변, NaN/음수/누락 → 0, throw 금지). UI는 이 selector만 호출.
- **날조 금지(iron)**: 실제 충족된 기준만 업적/타이틀/하이라이트로 노출한다. 달성하지 않은 마일스톤을 만들어내지 않는다.
- **신규 영속 키 격리**: `progression_v1` 한 키만 추가한다. 기존 run/shoe/challenge/settings 키는 절대 건드리지 않는다. 은퇴 기록은 로컬 우선 저장(runPersistence 패턴), 클라우드 동기는 best-effort·논블로킹.
- **네이티브 0**: A–D는 새 네이티브 모듈/`android/`·`ios/` 변경 없이 순수 JS+기존 svg/storage로 구현한다(자율 검증 가능). 새 네이티브가 필요해 보이면 중단·보고.
- **랭크 색상 토큰화**: 티어 색은 `theme.ts`의 `TIER_COLORS`에서만 가져온다(하드코딩 금지). 권위 값: Bronze #CD7F32 / Silver #C0C0C0 / Gold #FFD700 / Platinum #14B8A6 / Diamond #3B82F6 / Master #9333EA / Legend #FF6500.
- **레벨/RPG 금지**: 단일 Rank(합성점수)만. Lv.1/Lv.50 식 경험치 레벨·과한 게임 메커니즘 금지. 톤은 premium·collectible.
- **가짜 경쟁자 금지**: 백엔드 부재 시 Hall of Fame/랭킹은 개인/“coming soon” 상태만 보인다. 타 사용자 데이터를 날조하지 않는다(크로스유저는 별도 백엔드 run).
- **행동 테스트 동반**: primitives로 교체/추가하는 인터랙티브 요소(타이틀 equip, 은퇴 버튼, 카드/공유)는 react-test-renderer 행동 테스트를 처음부터 동반한다(press→핸들러·상태 반영·렌더 단언). 정적 스캔만으로 test_critic 통과 못 함.
- **성능 예산**: 1000런/30신발 풀 재계산 < 50ms(perf 테스트), 공유 이미지 생성 < 2s.

## Danger Zones (progression 추가)
- 기존 AsyncStorage 키(run/shoe/challenge/settings/profile) — progression 작업 중 읽기만, 쓰기·삭제 금지.
- `OnboardingScreen.rn.tsx` / `App.tsx` 부트·신발 등록 경로 — 홈/프로필 배선 시 온보딩 상호작용 인지(사용자 추가분).

## Audit Hardening 배치 (2026-06-17) — 추가 규약
- **단일 진실원천 = REST 백엔드.** 신발/런 정본은 REST(solelife-backend). Firestore는 백업/복원 전용. 클라우드 머지에서 REST 미존재 레코드는 `apiAddShoe`/`apiAddRun`로 역등록.
- **새 네이티브 의존성 추가 금지**(자율 검증 불가). 햅틱=RN 내장 `Vibration` 래퍼(`lib/haptics`), 토스트=커스텀 `Animated` 오버레이(`lib/toast`+ToastHost), 당겨서 새로고침=내장 `RefreshControl`. react-native-haptic-feedback·@react-native-community/datetimepicker·gesture-handler·reanimated·toast-message **설치 금지**(후속·사용자 액션).
- **데이터 형태**: 신발/런에 선택적 `updatedAt:number`·`deleted?:boolean` 추가는 비파괴·하위호환. 부팅 1회 마이그레이션으로 기존 레코드 `updatedAt` 시드(스토리지 스키마 버전 키). 기존 값 손상 금지.
- **순수 로직 불변**: 햅틱/토스트/포맷/타입/디자인 변경이 거리·페이스·시간·신발수명 계산 결과를 바꾸면 안 된다(기존 jest 회귀로 강제).
- **다크(#0A0A0C)+오렌지(#FF6500) 정체성 유지**: 런플로우/온보딩 theme 흡수는 값 보존(시각 동등), 색/폰트 깨짐 금지.
- **솔레라이프 백엔드 repo는 이 run에서 변경하지 않는다**(별도 repo·danger zone). 백엔드측 작업(updatedAt 컬럼·FCM 등록 엔드포인트)은 문서화된 후속.
