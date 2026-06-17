# bundle E — e1: 단일 Button(CTA) 프리미티브 통합

type: journal
job_name: CTA 단일 Button 프리미티브 통합 (MockupButton/인라인 그라데이션/사각 ACCENT 버튼 제거)
created: 2026-06-18

## Findings

- **primitives.Button 정비**: 그라데이션은 GradientFill(GRAD_TOP/GRAD_BOT 토큰 단일 정의) +
  주황 글로우 그림자(shadowColor=ACCENT, MockupButton 값) + RADIUS.btn(18) 단일 모서리 토큰 +
  pressed scale(.97). overflow 를 base 에 두지 않아 iOS 에서도 글로우가 안 잘린다(그라데이션
  Rect 가 rx 로 자체 라운딩). disabled/ghost 는 CARD_HI flat 표면 + dim(T3) 라벨로 떨어진다.
  기존 `icon`(Ionicons 문자열) 유지 + `iconNode`(커스텀 SVG/MaterialCommunityIcons) 추가.
- **통합 대상 교체**: MockupButton.rn.tsx 삭제(FirstShoe·AddShoe → Button), RunGoalScreen 인라인
  SVG CTA → Button, OnboardingScreen PrimaryButton → Button 위임, HomeScreen emptyBtn/goalDone,
  HistoryScreen saveBtn, RunCountdown startNow → Button. ProfileScreen dataBtn·AddShoe cta 는
  이미 dead 스타일이라 제거(radius 14/18 혼재 정리). RunControlButton(원형 컨트롤)은 모양이
  달라 Button 으로 합치지 않되, 인라인 raw hex(#FF7A2E/#F25E00) → GRAD_TOP/GRAD_BOT 토큰화.
- **radius 단일화**: theme RADIUS 에 btn:18 토큰 추가(md16<btn18<lg20). 화면별 14/16/18/999
  사각 버튼 모서리 제거 → 전부 RADIUS.btn.
- **중복 그라데이션 정의 제거**: CTA 정지점 hex(#FF7A2E/#F25E00/#EE5800)는 이제 theme.ts 에만
  존재(다른 소스 0). 수용 테스트가 소스 스캔으로 이를 강제.
- **테스트**: primitives.test 에 단일 Button 행동/렌더 단언(GRAD_TOP/BOT 정지점·ACCENT 글로우·
  RADIUS.btn·pressed scale·disabled→flat+dim·disabled onPress 차단·iconNode passthrough).
  theme.test RADIUS shape 갱신. 수용 it.todo('CTA: 단일 Button…') → 실제 test 교체
  (MockupButton 부재+import 0 / CTA hex 단일소스 / Button·RunGoal 렌더가 토큰 그라데이션+글로우+
  RADIUS.btn). tsc 0, jest 136 suites / 1379 pass (3 todo→2).
- **lessons**: crosscut.polish 의 'CTA 44pt' 가드는 accessibilityRole=button 노드의
  paddingVertical 을 읽으므로 패딩을 Pressable(=그 노드)에 유지해야 한다 → 그라데이션도 같은
  Pressable 직속(absoluteFill)으로 두고 overflow 만 제거해 글로우를 살렸다.
- **next**: e2(Card/SegmentedControl/StatGrid 프리미티브·단일 보더 토큰), e3(TYPE 반px 제거·
  hero/scrim/screen-padding 토큰) — 묶음 E 잔여 todo 2건.
