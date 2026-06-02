# slice-4-ui-polish (retry 1) — 완주/요약 화면 아이콘 제거 회귀 가드 보강

## 배경
code_critic·playwright는 PASS였으나 **test_critic이 차단**(test_bug).
deliverable ①(지표 위 아이콘 제거)은 **러닝중 + 완주/요약(done) 두 화면**에 적용되지만,
두 지표 행이 **중복 inline JSX**(공유 컴포넌트가 아님)다:
- 요약 행: `App.tsx` phase==='done' 분기 (≈1066–1070)
- 라이브런 행: 동일 파일 일반 return (≈1116–1120)

기존 `__tests__/uiPolish.slice4.test.tsx` 테스트 ①은 **라이브런 화면만** 구동해
요약 행에 아이콘이 재추가돼도 통과해버렸다(요약 행 무가드).

## 조치 — 방법 A(요약 화면 구동 행동 테스트 추가)
코드는 손대지 않음(아이콘은 이미 제거 상태). 가드만 보강.

신규 테스트 `①b 완주/요약 지표 행…` 추가:
- `App.addrun.test.tsx`와 동일한 **미완료-런 스냅샷 복구 경로**로 done/요약 화면을
  결정적으로 시드(GPS 불필요). `SNAPSHOT_KEY` 시드 → 마운트 → '미완료 런 발견'
  Alert의 '복구' 선택 → done 화면.
- 단언:
  - done 화면 도달 확정(`저장하기`/`버리기` 존재 — 라이브런과 구별)
  - `time-outline`/`flash-outline`/`walk-outline` 어느 것도 트리에 없음
    (Ionicons mock은 name을 텍스트로 렌더 → 재추가 시 깨짐)
  - 라벨 `시간`/`평균 페이스`/`케이던스` 보존
  - 값 보존: `fmtTime(900)`, `fmtPace(3.2,900)`, 케이던스 `172`

## 가드 유효성 증명
요약 행에 `<Ionicons name="time-outline"…/>`를 일시 주입 후 실행:
- 테스트 ①(라이브런) → **여전히 PASS**(이 가드만으로는 못 잡음 입증)
- 테스트 ①b(요약) → **FAIL** (회귀 포착)
주입 되돌림 후 전체 그린.

## iron law
- tsc --noEmit: 0 errors
- eslint(App.tsx, 신규 테스트): 0 errors (기존 warning만)
- jest 전체: 61 suites / 550 passed, 6 skipped
- raw hex 0 / 데이터·네이티브 변경 0 (테스트만 추가, App.tsx 무변경)

②기록탭 콤팩트·③신발카드 바 제거 및 기존 테스트 전부 그대로 유지.
