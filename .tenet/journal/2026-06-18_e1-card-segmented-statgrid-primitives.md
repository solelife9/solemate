# e1 design-system: Card 보더 토큰 통일 + SegmentedControl + StatGrid/Stat 신설·교체

type: journal
job_name: Card 채택·CARD_BORDER 단일화·SegmentedControl 신설(4탭스트립)·StatGrid/Stat 신설(스탯그리드 교체)
created: 2026-06-18

## Findings

- **(1) 카드 보더/반경 단일화**: theme 에 `CARD_BORDER = withAlpha(T1,0.07)` 신설(값은 SEP 과 동일한 흰 7% → 시각 동등). 6종 혼재(SEP·withAlpha(T1,0.07)·borderWidth 1 vs hairline·radius 22 vs lg)를 카드 외곽선 한 토큰으로 수렴. stray radius 22 제거(History card, Profile badge → RADIUS.lg). primitives `Card.base` 보더도 CARD_BORDER 로. 적용: History(card·runCard), Profile(card·badge), RunGoal(shoeSel), Progression(hero·guide·tcard·ach·modalCard·modalReqBox·statCard). 분리선/리세스드 웰(divider·mapWell·settingBorder 등)은 의미상 SEP(line) 유지.
- **(2) SegmentedControl 신설**: 선택상태·a11y(role/selected/label)·press 를 단일 책임. variant 4종(neutral=History 기간, raised=Progression 섹션, accentTint=RunGoal 모드, accentSolid=Profile recap)이 현재 4개 스트립 외형을 토큰으로 1:1 재현(시각 동등). block=false 면 hug(profile recap 인라인), 기본 flex 균등. testIDFor/labelFor 로 기존 testID(tab-*, recap-toggle-*)·a11y 라벨 보존.
- **(3) StatGrid/Stat 신설**: 한 셀=값(DISPLAY·tabular-nums·T1)+위첨자 단위(T3)+라벨(T3). 색/패밀리/tabular/구조는 토큰 단일소스, 크기·굵기·자간만 사용처 타입스케일 prop. divider(좌 헤어라인, 첫칸 제외)·columns(wrap 그리드)·align·top(아이콘 슬롯). 교체: Profile(누적·개인기록·recap 요약 3종), Progression(stat-row), History(RunDetail 2×3).

## Verification

- 신규 행동 테스트 `__tests__/primitives.segstat.test.tsx` 12개 PASS(onChange 키·selected 단언·variant 선택칩 색·block flex·testID/role/label·값/단위/라벨 분리노드·tabular·divider·columns·top 슬롯).
- 전체 `jest`: 137 suites / 1393 pass(+2 todo). `tsc --noEmit` 0. eslint 변경파일 신규 error 0(인라인스타일 경고는 기존 동일).

## Lessons

- jest preset 에서 RN View 는 testID 당 composite+host 두 노드를 낸다 → 스타일 단언은 host(`typeof n.type==='string'`) 노드를 골라야 안정적.
- 4개 스트립은 선택칩 표면이 제각각(흰9%/CARD_HI/주황틴트+보더/주황채움)이라 단일 컴포넌트+variant 프리셋으로 외형을 박아 시각 동등 달성. SEP 와 CARD_BORDER 는 값은 같되 의미(분리선 vs 카드외곽선)로 구분 유지.

## Next

- 남은 e1: TYPE 스케일 적용 점검(있으면). 화면별 baseline 메트릭행(History 요약·PR)은 Metric 프리미티브 후보(이번 범위 외).
