# bundle E — e1 (retry#1): 라이브 사각 ACCENT CTA 전환 완료 + gloss 모서리 클립 + 혼재 가드

type: journal
job_name: CTA 단일 Button 프리미티브 통합 — code_critic 3건 수정
created: 2026-06-18
prev_commit: e0a8c88

## 배경
직전 커밋 e0a8c88(MockupButton/인라인 그라데이션/일부 사각 ACCENT 제거)은 유지하되,
code_critic 이 정당하게 지적한 3건을 추가 수정. 이전 커밋은 화면 일부만 전환해
"backgroundColor:ACCENT 사각형 버튼들이 전부 통합된다"는 주석이 과대주장이었고,
gloss 광택이 모서리 밖으로 삐지는 시각 회귀가 있었으며, 수용 테스트가 잔존을 못 막았다.

## Findings(수정)

- **Finding 1 (radius 단일화 미완성)**: 라이브 렌더되는 사각 ACCENT CTA 6곳을 단일 Button 으로
  교체. App `retryBtn`(r14, 부트에러 재시도)·`run.saveBtn`(r16, 완주 저장) / ChallengesSection
  `createBtn`(r14, 챌린지 만들기) / ShoesScreen 인라인 이름편집 `저장`(r14)·`retireFlowBtn`(은퇴, r14)
  / ProfileScreen `cloudBtnGoogle`(r14, Google 로그인 → iconNode 로 logo-google) / RetirementFlow
  `btnPrimary` 4스텝(다음/확정/완료). 아이콘 있는 건 icon/iconNode prop 사용. 페어 보조 버튼
  (discard/취소/계속사용/ghost)의 모서리도 RADIUS.btn 으로 통일(14/16/RADIUS.md 혼재 제거).
  원형 런 컨트롤(App run.ctrlPrimary, RADIUS.pill)은 사각 CTA 가 아니므로 통합 대상에서 제외 —
  primitives.tsx 주석에 제외 사유 명시(과대주장 수정).
- **Finding 2 (gloss 모서리 클립 회귀)**: btn.base 가 글로우 보존 위해 overflow:hidden 을 안 거는데,
  btn.gloss(full-width 1px plain View)는 위쪽 모서리가 안 잘려 흰 사각 픽셀이 둥근 모서리 밖으로
  삐졌다. gloss 에 borderTopLeftRadius/borderTopRightRadius(=RADIUS.btn) 부여 — 삭제된 MockupButton 의
  inner clip 레이어 역할을 gloss 가 직접 떠맡는다. GradientFill 주석의 "rx 자체 라운딩"은 SVG
  gradient 에만 참이고 plain View gloss 엔 거짓이라던 비평을 주석에 반영.
- **Finding 3 (수용 테스트 혼재 미가드)**: audit-hardening E 에 소스 스캔 테스트 2개 추가.
  (a) 전환 대상 5파일이 단일 Button import + 어떤 스타일 객체도 `backgroundColor:ACCENT` & raw
  `borderRadius:14|16` 동시 보유 0(주석 제거 후 innermost-object 스캔). (b) Button gloss 가
  위쪽 모서리 RADIUS.btn 을 갖고 disabled 면 gloss 0(렌더 트리 단언). false completeness 제거.

## 검증
tsc 0. jest 136 suites / 1381 pass (e0a8c88 의 1379 +2 신규). eslint 0 error(기존 inline-style
경고만). 시각 동등(다크+오렌지): 사각 ACCENT CTA 가 전부 GRAD_TOP→GRAD_BOT + ACCENT 글로우 +
RADIUS.btn 단일 Button 으로 수렴, 모서리 삐짐 해소.

## lessons
- RN 의 <View> 는 composite+host 두 인스턴스로 findAll 에 잡힌다 → gloss 노드 length 단언은
  toBe(1) 이 아니라 ≥1 + forEach 로 모든 매칭 노드의 모서리 검사.
- "전부 통합된다"류 절대 주장은 원형/브랜드색 등 의도적 예외를 함께 적어야 과대주장이 아니다.
