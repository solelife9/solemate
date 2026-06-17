# bundle E — e1 (retry#2): test_critic 약점 3건 수정 — positive '프리미티브로 렌더' 단언 추가

type: journal
job_name: CTA 단일 Button 프리미티브 통합 — test_critic 수용 테스트 강화
created: 2026-06-18
prev_commit: 9142488 (코드 불변 — 테스트만 강화)

## 배경
code_critic PASS, 코드(9142488)는 정확. 그러나 test_critic 이 audit-hardening
'radius 단일화' 테스트(812–856)의 약점 3건(모두 test_bug)을 정당하게 지적.

## test_critic 지적 → 수정
1. **per-file `import {Button} from './primitives'` 단언이 tautological** — 전환 대상
   5개 파일이 모두 이미 Button 을 import 하므로 특정 CTA 가 실제로 프리미티브를 거치는지와
   무관하게 통과. 아무것도 바인딩하지 않음 → **제거**.
2. **음성 소스 스캔이 `backgroundColor:ACCENT` AND raw `borderRadius:14|16` 둘 다 가진
   객체만 포착** — 토큰 radius 로 손수 만든 오렌지 CTA(`{backgroundColor:ACCENT,
   borderRadius:RADIUS.btn}`)는 '전환됨'으로 통과(false-completeness). '프리미티브 사용'과
   'raw View+radius 상수만 통일'을 구분 못 함 → 보조 가드로 강등(literal r14/r16 만 잡음).
3. **Finding1 대상 6개 CTA 중 어느 것도 positive '프리미티브로 렌더된다' 단언 없음** —
   RunGoal(직전 커밋 전환분)만 그 체크를 받아, 6개 중 하나를 raw 오렌지 버튼으로 부분
   롤백해도 안 잡힘 → **대표 4종 positive 렌더 단언 추가**.

## 추가한 positive 행동 단언(RunGoal 패턴 800–809 미러)
공통 헬퍼 `expectPrimitiveCta(root, label)`: 라벨로 찾은 CTA **서브트리**에 GRAD_TOP→
GRAD_BOT Stop(=GradientFill) + 자기 style 에 shadowColor===ACCENT + borderRadius===RADIUS.btn.
스코프를 버튼 서브트리로 좁혀 타 CTA 그라데이션 누출 차단. raw <View backgroundColor:ACCENT>+
상수 radius 버튼은 GradientFill/glow 부재로 통과 못 함.
- ① ChallengesSection `createBtn`('챌린지 만들기', 폼 열고).
- ② RetirementFlow `btnPrimary`(step0 '여정 돌아보기').
- ③ ShoesScreen 은퇴 키프세이크 CTA(retire-open-flow, '은퇴').
- ④ ProfileScreen `cloudBtnGoogle`('Google로 계속') + logo-google iconNode 가 그 Button
  서브트리 **안에** 렌더됨 단언(별도 손수 오렌지 버튼 아님).
(App retryBtn/run.saveBtn 은 스탠드얼론 렌더 난이도로 보조 소스 스캔만.)

## 검증
- tsc 0. eslint 0 error(line167 사전존재 warning만).
- audit-hardening 전체: 21 pass / 2 todo / 0 fail.
- **뮤테이션 검증**: primitives Button 의 `<GradientFill/>` 를 임시 제거 → 새 테스트가
  gradient stops 단언에서 실패(test:783 → expectPrimitiveCta:856). 즉시 원복. 가드가
  실제로 무는 것 확인(tautological 아님).

## lesson
- '프리미티브로 라우팅됨' 같은 구조 단언은 import 존재가 아니라 그 버튼 서브트리의 관찰
  가능한 렌더 산출물(그라데이션 Stop·글로우 그림자·모서리 토큰)로 단언해야 부분 롤백을
  잡는다. import 단언은 모든 파일이 이미 그 심볼을 쓰면 0의 변별력.
- 음성 소스 스캔(없어야 할 패턴 0)은 literal 만 잡으므로 토큰화된 우회를 못 막는다 —
  positive 렌더 단언이 본 가드, 소스 스캔은 보조.
