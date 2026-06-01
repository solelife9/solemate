# slice-3-run (retry 1) — heart_rate/bpm 보존 컴파일 가드

- **date**: 2026-06-02
- **job**: slice-3-run (retry #1)
- **trigger**: test_critic 지적 2건 중 1건만 실제 작업 — iron law #17 heart_rate 보존 가드 부재.

## 문제 (test_bug)
`bpm`/`heart_rate` 가 형제 테스트(HistoryScreen.share/coursemap, App.runsync, runPersistence)에서
전부 `as any` 픽스처 또는 단언 없는 값으로만 등장 → `Run`/`PendingRun` 타입에서 해당 필드를 지워도
tsc·전체 테스트가 통과해 파괴를 막는 가드가 없었다.

## 한 일
`__tests__/heartRatePreserved.test.tsx` 신설 — 캐스트(`as any`) 없는 타입드 픽스처로 두 레이어를 강제:
1. **저장 레이어**: `const PENDING: PendingRun = {…, heart_rate: 152}` (캐스트 없음) →
   `enqueuePendingRun`→`loadPendingRuns` 실제 AsyncStorage 큐 라운드트립 후 `heart_rate === 152` 단언.
2. **프레젠테이션 레이어**: `const RUN: Run = {…, bpm: 152}` (캐스트 없음) → `HistoryScreen` 렌더 +
   상세 진입 후 화면 텍스트에 `평균 심박`/`152`/`bpm` 노출 단언(실제 소비자 RunDetail).

## 가드 검증 (실측)
`theme.ts` 의 `Run.bpm` 을 임시 제거 후 `npx tsc --noEmit` → 본 테스트 파일 84행에서
`TS2353 'bpm' does not exist in type 'Run'` 발생 확인(+ App.tsx/HistoryScreen 동반 실패) → 즉시 복원.
즉 필드를 타입에서 지우면 반드시 tsc 가 실패한다. 데이터/네이티브/저장소는 일절 미변경.

## scope_conflict (판정 완료, 추가 작업 없음)
라이브런 글랜서블 위계·심박 숨김은 `App.tsx` RunActiveScreen 소관(Slice 1 엔진에서 기구현,
pauseLabel/pauseColor/cadence/pace/time, 심박 UI 없음)이며 RunScreen.rn.tsx(목표-입력) 범위 밖.
App.tsx 는 slice-3-design SCREENS 스캔 목록에 없어 본 잡 토큰화 대상 아님.

## 검증
- `npx tsc --noEmit` exit 0.
- `npm run lint` 0 errors(잔존 warning은 coverage/ 및 기존 파일 — 본 변경 무관).
- `npx jest` 471 passed / 신규 가드 2건 green. 잔존 실패 2건은 `slice-3-design` 의
  ProfileScreen·HistoryScreen raw hex — 형제 잡 소관(본 잡 RunScreen 단언은 전부 green).
- 110c28f(RunScreen 토큰화·Metric·Button·RunStart 4건)은 code_critic·playwright 통과로 유지.
