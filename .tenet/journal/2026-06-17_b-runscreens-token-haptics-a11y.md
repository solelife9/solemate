# Run* 화면 토큰 흡수 + 햅틱 배선 + 접근성 (묶음 B 런플로우)

type: journal
job_name: RunActive/RunGoal/RunCountdown 사설 C 제거→theme 토큰, lib/haptics 배선, 접근성
created: 2026-06-17

## Findings

- **what**: RunActiveScreen / RunGoalScreen / RunCountdownScreen 의 사설 색객체(const C)와
  로컬 폰트 별칭(UI/DP)을 전부 제거하고 theme.ts 토큰으로 흡수.
  - 색 매핑(시각 동등·다크+오렌지 유지): bg→BG · surface→CARD · accent→ACCENT ·
    sage→GOOD · amber→WARN · red→DANGER · t1–t4→T1–T4 · sep/hair→SEP ·
    그라데이션 스톱→GRAD_TOP/GRAD_BOT · 신발썸네일→HERO_BG. 액센트/위험 알파 틴트는
    withAlpha(ACCENT|DANGER|T1, a) 로 토큰화(raw rgba 색 desync 방지).
  - 폰트: UI→FONT, DP→DISPLAY.
- **haptics 배선**(lib/haptics 의미 메서드, 새 네이티브 0):
  - RunCountdownScreen: 3·2·1 비트 → countdownBeat, GO → go.
  - RunGoalScreen: '러닝 시작' CTA(런 시작) → tap.
  - RunActiveScreen: 일시정지/재개 → tap, 목표 달성 → impactHeavy, 길게눌러종료 확정 → warning.
- **접근성**: 모든 터치요소 accessibilityRole/accessibilityLabel(+세그/프리셋 selected
  상태), 권한상실 배너 live-region assertive, 라이브 거리/시간/상태/GPS polite live-region
  라벨. 길게눌러종료에 시각적 hold 진행 링(DANGER 호, strokeDashoffset 애니메이션) 추가.
- **tests**:
  - __tests__/RunScreens.tokens.test.ts — 정적 스캔(사설 const C / UI/DP / 인라인
    fontFamily / 팔레트 raw hex 없음, theme import 존재).
  - __tests__/RunScreens.haptics.test.tsx — 행동: 비트/GO/런시작/일시정지/재개/목표달성/
    종료확정 햅틱 호출 + 핸들러(onStart/onStop/onOpenSettings) + 접근성 라벨/live-region/홀드링.
- **eval**: jest 전체 130 suites / 1308 pass (13 todo), tsc 통과, eslint 신규 에러 0.
- **iron law 동일**: 새 네이티브 의존성 0(RN 내장 Vibration 래퍼만), graceful no-op 보존.
