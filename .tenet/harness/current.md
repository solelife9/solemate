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
