# e1 TYPE 토큰 수렴 + hero/scrim/gutter 토큰 도입 + 묶음 E todo 교체

type: journal
job_name: theme TYPE 프리셋 전역 적용 + 반px 제거 + hero/screen-padding/scrim 토큰 + E 디자인시스템 todo→단언
created: 2026-06-18

## Findings

- **반px 제거(반올림 ≤0.5px = 시각 동등)**: 소스 전역 `fontSize: N.5` + Stat size props(value/unit/labelSize) 127건을 정수로 반올림(half-up). 결정적 node 스크립트로 일괄(스코프: ts/tsx, tests·__tests__·SVG path 좌표 제외 — fontSize/Size 키만 매칭하므로 d="…" 좌표 28.5/42.5 등은 안전).
- **신규 토큰(theme.ts)**: `HERO={hero:40,heroLg:56,mega:76}`(대형 숫자, TYPE 와 분리 — theme.test 의 display=max(TYPE) 계약 보존), `GUTTER=20`(화면 거터 단일; 기존 최빈값=SPACE.xl 과 동일 → 픽셀 동등), `SCRIM='rgba(0,0,0,0.6)'`(모달 딤 단일).
- **사용처 교체**: SCRIM 2건(HomeScreen goalBackdrop·ProgressionScreen 모달) 전량. HERO HomeScreen(40)·HistoryScreen(56)·RunActiveScreen(76) — 값 동일 무픽셀변화. GUTTER HomeScreen 거터 3곳·HistoryScreen statGrid·HallOfFame empty.
- **묶음 E todo→단언 교체(2건)**: ①Card·SegmentedControl·StatGrid 렌더 단언(Card 단일 CARD_BORDER/RADIUS.lg, Seg accessibilityState.selected+onChange 동작, StatGrid value/unit/label+DISPLAY tabular-nums) + 화면 채택 정적가드. ②TYPE 정수 스케일·HERO 정렬·GUTTER/SCRIM 값 + 정적스캔(반px fontSize 0, raw scrim theme.ts 한정, hero/scrim/gutter 화면 소비 ≥1) + Stat hero 렌더 관찰.
- **기존 테스트 정합**: primitives.segstat 의 Stat 기본 labelSize 11.5→12, History RunDetail 11.5→12 단언 갱신(반px 제거 반영).
- **검증**: tsc 0, jest 137 suites/1398 pass, eslint 0 errors. E 디자인시스템 describe 5 tests green(it.todo 0).
- **lessons**: 정적스캔 strip 은 \r 선제거 후 // 제거(CRLF 풋건). `\bHERO\b` 는 HERO_BG(_=단어문자) 미매칭 → hero 스케일 사용만 카운트. GUTTER 전면 단일화(14/18/22→20)는 시각동등(6px>미세) 위반이라 보류, SPACE.xl=20 기존 토큰 위에 GUTTER 시맨틱 단일소스만 도입.
