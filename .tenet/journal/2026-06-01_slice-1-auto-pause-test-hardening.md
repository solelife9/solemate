# slice-1-auto-pause 테스트 보강 (retry #1) 완료

type: journal
job_name: 자동 일시정지 버그 수정·배선 (slice-1-auto-pause)
created: 2026-06-01

## Findings

- **job**: slice-1-auto-pause (retry #1 — 구현은 이미 통과, 테스트 비평가/lint 보강만 요청됨)
- **commit**: 9b56669
- **result**:
  - `__tests__/App.autopause.test.tsx`에 2개 테스트 추가:
    1. **경과시간(elapsed) 동결 검증(핵심)**: fake timers로 1초 인터벌 + Date.now를
       구동. RUNNING 중 타이머 전진(>0) 확인 → 자동 일시정지 → 30초 wall-time 추가
       경과시켜도 표시 타이머가 동결(이전값 유지)·음수 아님·정수(garbage 아님) 단언.
       audit#4 `elapsed=max(0,now-t0-pausedMs)` + pauseStartRef 가드를 App/UI 레벨에서 검증.
    2. **재개 후 누적 재시작**: 자동 재개 후 이동 fix에서 km()>kmAtPause 단언 →
       라벨만 풀리고 엔진 동결되는 버그 차단.
    - 케이던스: 가속도계(비-GPS) 소관임을 주석으로 범위 명시 + 자동일시정지 경로가
      cadence를 조작하지 않고 '--' 유지함을 readCadence로 단언.
  - `__tests__/lib/autoPause.test.ts`에 상수 고정 단언 추가
    (AUTO_PAUSE_SPEED_MPS=0.6, AUTO_RESUME_SPEED_MPS=1.0, HOLD 6/2) → 동시에
    lint이 지적한 미사용 import(AUTO_PAUSE_HOLD_S/AUTO_RESUME_HOLD_S, :4,:6) 해소.
- **검증**: 두 파일 lint EXIT 0, tsc 두 파일 clean(globalThis 사용), 두 파일 jest 19/19 통과.
- **note(중요)**: 전체 스위트의 4개 실패는 `tests/acceptance/slice-1-engine.test.ts`의
  shoeHealth/retire 케이스로, **본 job 변경 전부터 실패하던 후속 job 소관**(stash 후
  clean tree에서 동일 4건 실패 확인). 본 변경은 신규 실패 0건. 전체 lint의 18 에러도
  primitives.tsx 등 기존 에러로 본 변경 파일과 무관(iron law 위반 0).
