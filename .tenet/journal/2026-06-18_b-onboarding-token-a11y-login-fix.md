# Onboarding 사설 팔레트 흡수 + 로그인 링크 버그 수정 + a11y (묶음 B 마무리)

type: journal
job_name: OnboardingScreen 사설 KG 제거→theme 토큰, DISP→DISPLAY, 로그인 링크 버그, a11y, B 수용 todo 교체
created: 2026-06-18

## Findings

- **theme 흡수(시각 동등)**: OnboardingScreen.rn.tsx 의 사설 팔레트 `const KG = {...}` 와
  디스플레이 폰트 별칭 `DISP = 'BebasNeue-Regular'`, 본문 별칭 `UI` 를 전부 제거하고
  theme.ts 토큰으로 흡수.
  - 색 매핑: bg/bgDeep→BG · card→CARD · orange→ACCENT · orangeSoft→ACCENT_2 ·
    green→GOOD · amber→WARN · red→DANGER · text→T1 · dim→T3 · faint→T4 ·
    line→SEP · line2→withAlpha(T1,.14). STATUS 칩 배경 rgba 는 withAlpha(GOOD|WARN|DANGER,.14)
    로 토큰 파생(raw rgba desync 차단). CONFETTI_COLORS 도 토큰화.
  - 폰트: `fontFamily: DISP`→DISPLAY, `fontFamily: UI`→FONT (둘 다 Pretendard, 핸드오프 정합).
  - 시네마틱 그라데이션 스톱(카드 표면 '#1A1A1F' 등 장식)만 인라인 유지 — 의미색 아님.
- **버그 수정 — 로그인 링크**: Welcome 의 '이미 계정이 있나요? 로그인' 링크가 `goNext()` 를
  불러 *로그인이 아니라 온보딩 다음 단계(Shoes Matter)* 로 넘어가던 버그를 수정. 오케스트레이터에
  `goLogin = () => setIndex(5)` 를 추가해, 기존 계정 사용자가 온보딩 투어(1~4)를 건너뛰고
  곧장 마지막 인증 화면(Ready=index 5, 소셜/이메일 로그인) 으로 점프한다.
- **접근성 보강**: 로그인 링크에 accessibilityRole=button + accessibilityLabel('이미 계정이
  있나요? 로그인') + testID + hitSlop. '이메일로 계속하기' 에 accessibilityLabel + testID.
  KmSlider 를 accessibilityRole="adjustable" 로 승격(accessibilityValue min/max/now/text +
  increment/decrement 액션 → 스크린리더 조절 지원).
- **B 수용 todo → 실단언 교체**(tests/acceptance/audit-hardening.test.ts, '런플로우/온보딩+햅틱+a11y'):
  4개 it.todo 를 5개 실제 테스트로 교체(JSX 없이 React.createElement 렌더):
  1. theme 수렴 정적스캔 — Run*/Onboarding 소스에 `const C`/`const KG`/BebasNeue 0, theme import 존재.
  2. 햅틱(동기) — 런시작=tap · 일시정지=tap · 목표달성=impactHeavy · 종료확정=warning(+onStop).
  3. 햅틱(카운트다운) — 3·2·1 비트 countdownBeat×3, GO→go (fake timers + 안전 teardown).
  4. a11y — 런 컨트롤 + 온보딩 시작/로그인 링크가 role/label 보유.
  5. 로그인 링크 행동 — 누르면 Ready(카카오/이메일 로그인) 가 뜨고 '다음' CTA 는 안 뜸(=goNext 아님 증명).
  - codeOnly 스캐너 CRLF 버그(`.` 가 `\r` 미매치 → `$` 빗나감) 발견·수정(\r 선제거).
- **eval**: jest 전체 130 suites / 1313 pass (9 todo; 직전 1308/13 대비 +5 pass −4 todo).
  tsc 통과, eslint 신규 에러 0(inline-style 경고만, 기존 패턴).
- **iron law 동일**: 새 네이티브 의존성 0(시각 동등 토큰 치환·기존 lib/haptics 래퍼만 사용),
  로그인 링크는 기존 Ready 화면 인증 경로로 진입(새 화면/네이티브 0).
