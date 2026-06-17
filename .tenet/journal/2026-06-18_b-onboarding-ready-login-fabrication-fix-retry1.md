# Ready 화면 로그인 진입 날조 신발카드 제거 (묶음 B product_bug 차단 해소, retry #1)

type: journal
job_name: code_critic product_bug 1건 수정 — goLogin→Ready(registered=null) 폴백 신발 노출
created: 2026-06-18
base_commit: 26ed815

## 차단된 버그(code_critic)

직전 커밋 26ed815 에서 `goLogin = () => setIndex(5)` 로 '이미 계정이 있나요? 로그인'
링크가 Ready(index 5) 로 점프하게 했는데, Ready 가 들고 있던 폴백
`registered || {brand:'Nike', model:'Alphafly 3', km:60, max:600}` 가 이전엔
Register.submit 경유로만 도달해 **죽은 코드**였다가, 로그인 진입(registered=null)에서
처음으로 활성화됐다. 결과: 복귀 유저가 **날조 신발카드('추적 시작됨 / Nike Alphafly 3 /
60·600km') + '이제 달릴 준비가 되었습니다' 축하문구** 를 보게 됨 → 날조 금지 iron law 위배.

## 수정 (스펙 옵션 A, 변경 최소)

OnboardingScreen.rn.tsx `Ready`:
- 폴백 신발 객체 제거. `const shoe = registered;` (null 허용). `st/col/remain` 은 shoe
  존재 시에만 계산(없으면 'good'/0 — 카드 미표시라 미사용).
- **신발 요약 카드를 `{shoe && (...)}` 로 감쌈** — 등록한 신발이 있을 때만 렌더.
  로그인 진입(registered=null)엔 '추적 시작됨'·신발명·거리 칩 전부 숨김.
- 헤드라인/본문을 맥락 분기: 등록 있음 → '이제 달릴 준비가 되었습니다 / Keego와 함께…',
  로그인(등록 없음) → '다시 오신 걸 환영합니다 / 로그인하고 이어서 달려보세요.'
- 소셜(카카오/네이버/Google)·이메일 로그인 버튼은 양쪽 다 그대로 노출. 배선(onFinish→
  onDone(registered)) 불변, App 부트/온보딩 종료 콜백 무수정.

## 테스트 보강 (묶음 B 수용 5개 유지 + 단언 추가)

tests/acceptance/audit-hardening.test.ts '온보딩 로그인 링크가 로그인 화면(Ready)으로
진입' 테스트에:
- `renderedText(root)` 헬퍼 신설(findAll 로 모든 Text 문자열 자식 수집).
- registered=null 진입 시 'Alphafly 3'·'추적 시작됨'·'이제 달릴 준비가' 가 **렌더 안 됨**
  단언(`not.toContain`), 대신 '다시 오신 걸' 환영문구가 보임 단언.

## 검증

- tsc --noEmit 통과.
- eslint OnboardingScreen.rn.tsx + 테스트: error 0(inline-style 경고만, 기존 패턴).
- jest 전체: 130 suites / 1313 pass / 9 todo — 직전과 동일 카운트(회귀 0).
- 스모크: react-test-renderer 가 OnboardingScreen 마운트→로그인 링크 press→Ready 렌더를
  에러 없이 통과(이 RN 화면의 렌더 스모크).

## iron law

새 네이티브 0(JSX/로직 분기만), 데이터 파괴 0, 날조 신발카드 로그인 진입 시 비노출 확정.
