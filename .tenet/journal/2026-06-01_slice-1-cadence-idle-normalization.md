# 케이던스 정규화 분모 오류 수정 (audit#14b) — slice-1-cadence (retry #1)

type: journal
job_name: 케이던스 알고리즘 개선 (slice-1-cadence)
created: 2026-06-01

## 배경 (이전 시도 평가)

코드 비평가가 순수함수 구조/피크검출은 양호하다고 보았으나 `computeSpm`의 정규화
**분모가 실제 버그**라고 지적. retry #1은 그 분모만 정확히 교정한다.

## Findings / 수정 내용

- **[product_bug] computeSpm 분모 오류 (핵심) 수정**
  - 이전: `elapsed = nowMs - startMs`(런 시작 기준)로 나눔 → 첫 스텝 전 idle
    (GPS 워밍업·출발선 대기)이 분모에 섞여 케이던스 **과소표시**. audit#14가
    고치려던 과소표시의 재발이었음.
  - 수정: 분모를 **관측된 스텝 구간**으로 —
    `spm = steps_in_window * 60000 / min(CADENCE_WINDOW_MS, nowMs - firstStepMsInWindow)`.
    `firstStepMsInWindow = steps[0]`(60s 윈도우에 남은 가장 오래된 스텝; steps는
    도착순 보존이라 [0]이 최古). window 내 step이 0이면 0 반환.
  - 3s 미만 **withholding 게이트도 스텝 구간(now-firstStep) 기준**으로 이동(런
    시작 기준 아님) → idle은 게이트에도 분모에도 영향 없음.
  - 부수정리: 더 이상 쓰이지 않는 `startMs` 필드를 `CadenceState`·`initCadenceState`
    ·`feedAccelSample`에서 제거(죽은 상태 제거). App.tsx 호출부 2곳
    (`initCadenceState()`)도 시그니처에 맞춰 갱신.

- **[test_bug] idle-before-first-step 테스트 추가** (`__tests__/lib/cadence.test.ts`)
  - 신규 describe `audit#14b` 3개:
    1. 30s idle 후 진짜 ~180spm → 표시 160-180(과거 ~26으로 과소표시되던 경로).
    2. 10s idle + 10s 180spm → ~90으로 끌려내려가지 않음(>150).
    3. 큰 startMs 오프셋에서도 분모 언더플로 없이 spm 양수·유한(데이터 무결성).
  - 기존 `runStrikes`는 항상 t=startMs에서 시작해 이 경로를 안 탔으므로,
    startMs를 idle 오프셋으로 띄워 첫 strike가 한참 뒤에 발생하는 케이스를 구성.
  - 경계 테스트(`begins reporting…at CADENCE_MIN_WINDOW_MS`)도 새 시맨틱에 맞춰
    `firstStep + CADENCE_MIN_WINDOW_MS` 기준으로 갱신(-1ms는 0, 정각은 >0 단언).

- **(권장) App 통합 테스트 추가** (`__tests__/App.cadence.test.tsx`, 신규 2개)
  - 실제 App을 라이브 런 화면까지 구동 → `accelerometer.subscribe` 콜백으로
    합성 가속도 피크(STEP_PEAK_THRESHOLD 교차)를 fake timer+setSystemTime로
    ~170spm에 주입 → 화면 케이던스 메트릭을 단언. accel→feedAccelSample→
    setCadence→UI end-to-end 배선 검증.
    1. ~170spm 트레이스: 3s 전 '--', ~12s 후 160-180 정수 렌더.
    2. 30s idle 후 스트림 시작해도 과소표시 없이 160-180 렌더(audit#14b 회귀).

## 검증 (정확한 수치 보고)

- `npx jest __tests__/lib/cadence.test.ts` → **18/18 통과** (이전 15 → +3 idle/무결성;
  경계 테스트는 신규가 아닌 수정). *이전 보고의 '17'은 오기, 실제 기준은 15였음.*
- `npx jest __tests__/App.cadence.test.tsx` → **2/2 통과** (신규 통합).
- `npx eslint lib/cadence.ts __tests__/lib/cadence.test.ts __tests__/App.cadence.test.tsx`
  → **EXIT 0** (신규 에러 0). App.tsx의 기존 18 lint 에러는 본 변경과 무관
  (touched 라인 309/401은 에러 목록에 없음).
- `npx tsc --noEmit` → 변경/신규 파일에 에러 0(globalThis 사용 유지).
- 전체 `npx jest` → 126 passed / 4 failed. **4건 모두 `tests/acceptance/slice-1-engine.test.ts`의
  `isRetired`/`shoeHealth`** — `lib/shoe.ts` 주석에 "다른 job 소관, 의도적 미구현"으로
  명시된 **선행 무관 실패**. 본 변경 신규 실패 0건.
- 데이터 무결성: `firstStep ≤ now` 보장(분모 `Math.max(0, …)` + steps 존재 시에만 계산)
  → 음수/유실/언더플로 없음.

## 커밋

main 직접 커밋(한국어). SHA는 최종 출력 참조.
