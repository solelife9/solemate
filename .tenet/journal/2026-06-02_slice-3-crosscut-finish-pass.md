# Slice 3 — 전 화면 횡단 마감 패스 (accessibility · safeArea · copy · 死deps)

날짜: 2026-06-02
잡: slice-3-crosscut-finish-pass

## 목표
7개 화면 + App 전반에 걸친 마감 패스. 데이터/네이티브 빌드/다크 방향 무손상.

## 한 일

### (1) 접근성
- **TabBar**(전 화면 공용): `accessibilityRole="tab"` + `accessibilityLabel`(홈/기록/신발/프로필)
  + `accessibilityState={{selected}}` — 색(오렌지)만이 아니라 SR로도 활성 탭 전달.
  filled↔outline 아이콘 형태 차이로 색상 단독 의존 제거. `hitSlop` + pressed 피드백.
- **Button/Pill primitive**: `accessibilityLabel`(=label) 노출. Pill은 `accessible` +
  라벨 → 상태 배지(교체/주의 tier 색)도 SR가 읽음(색 단독 표시 보완, 아이콘 동반).
- 화면별 아이콘 버튼(닫기/뒤로/편집/보관/삭제/추가/play/스테퍼/키패드/세그먼트/칩/CTA)에
  `accessibilityRole`+`accessibilityLabel` 부여, `hitSlop`으로 38/34/36pt 타깃을 44pt 이상으로
  확장, 일관된 pressed opacity 피드백 추가.
- 토글류(알림 스위치=`switch`+`checked`, 단위/목표/알림/계정 행=`button`+`expanded`,
  프리셋/브랜드/기간=`selected`)에 상태 전달.

### (2) safeArea
- 하드코딩 `paddingTop:60` 전부 제거(Home/Shoes/Run/Profile/History/AddShoe + App boot/온보딩).
  `useSafeAreaInsets()`로 상단 inset 흡수(스크린 루트 `paddingTop:insets.top` + 헤더 base 12).
- TabBar 하단도 `insets.bottom` 흡수(제스처바/홈 인디케이터 회피). inset 0 단말은 기존 24 유지(회귀 0).

### (3) 빈/로딩/에러 카피 (keep-going 보이스)
- 기존 카피 다수가 이미 keep-going 톤(테스트가 문자열 고정). 비고정 빈 상태만 보강:
  Home 빈 화면 "첫 러닝화를 등록해볼까요? … 계속 달릴 수 있어요", 신발 상세 기록 0건
  "아직 기록이 없어요 — 이 신발로 첫 걸음을 떼어볼까요?". 고정 문자열(첫 러닝이 여기 쌓여요/
  목표 달성/계속 달려요/다시 시도/사진을 불러오지 못했어요)은 그대로 보존.

### (4) 死deps 정리
- import 검색으로 미사용 확인 후 제거: `@react-navigation/bottom-tabs`, `@react-navigation/native`,
  `react-native-screens`(소스/안드로이드 autolink 참조 0 — 앱은 자체 TabBar+탭 state 사용).
- `rxjs`는 **직접 import 0**이나 `react-native-sensors`의 hard dependency(`"rxjs":">= 6"`)라
  package.json 직접 선언만 제거 → 트랜지티브로 계속 설치됨(가속도계 동작 무손상). lockfile에는
  sensors 하위 의존으로 잔존(정상).
- package-lock.json 동기(`--package-lock-only`): 루트 미사용 2종 prune(−242줄). node_modules는
  물리적으로 유지되어 현 빌드/테스트 무영향.

### WCAG 대비
- `T3` 토큰 `#8E8E93`→`#9C9CA3` 소폭 상향. CARD 표면 소형 텍스트 대비 ~5.2→~6.3:1 (AA 통과 여유
  확보). 여전히 muted 보조 톤 — 다크 방향 유지. (theme.test/HomeScreen.test는 토큰 참조 비교라 무영향.)

## 검증
- tsc --noEmit: green
- eslint: 0 errors (107 warnings, 기존 수준 +1 inline-style)
- jest: 494 passed / 55 suites (기존 483 + 신규 11). slice-3-design 인수 테스트 그대로 통과
  (raw hex 0 · 인라인 fontFamily 0 · BebasNeue 0 · SOLEMATE/SOLELIFE 0 · DISPLAY===FONT · Keego 노출).
- 신규 behavioral 테스트: `__tests__/crosscut.a11y.test.tsx` — TabBar role/label/selected,
  Button/Pill 라벨, 6개 화면 paddingTop:60 부재(safeArea), Home 빈 상태 keep-going 카피.
- 스모크: `react-native bundle`(android, dev=false) → exit 0, 1.6MB 번들 생성, 제거 deps 참조 0건.
