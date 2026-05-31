# slice-1-run-persistence 완료

type: journal
job_name: audit#2/#3 진행중 런 스냅샷 영속 + 완주 런 로컬우선/미동기 큐
created: 2026-06-01

## Findings

- **job**: slice-1-run-persistence (audit#2/#3)
- **result**: `lib/runPersistence.ts` 신설 — 두 개의 독립 영속 계층을 AsyncStorage
  단독으로 구현하고 네트워크 try/catch와 완전 분리(부분성공 desync 차단).
  - (audit#2) 진행중 런 스냅샷: `saveSnapshot/loadSnapshot/clearSnapshot`.
    RunActiveScreen이 `dist,elapsed,pts,pausedMs,t0,shoe,goalKm,cadence,location`
    을 시작 즉시 + 3초마다 영속. 앱 시작 시 `loadSnapshot`+`isResumable`로 미완료
    런 감지 → Alert(복구/버리기). '복구'는 done 화면을 스냅샷으로 시드해 검토 후
    저장/버리기(데이터 유실 금지).
  - (audit#3) 완주 런: `addRun`이 **로컬 우선** — `enqueuePendingRun` +
    route_/time_ 로컬키 기록 + 낙관적 setRuns를 네트워크 try 밖에서 먼저 수행한
    뒤 `postRun`을 별도 try로 시도. 성공 시 서버 id로 화해 + 큐 제거(`removePendingRun`),
    실패 시 큐 보존. userId 준비 시 `flushPendingRuns(주입된 postRun)`이 재동기.
- **iron law**: 모든 영속 값은 `nonNeg`(음수/NaN/Infinity→0) + `sanitizePoints`
  (비유한 lat/lon 제거)로 정화. 손상된 blob은 throw 없이 null/[]로 강등.
  네트워크 실패가 route/run을 절대 소실시키지 않음(테스트로 고정).
- **tests**: `__tests__/lib/runPersistence.test.ts`(18) — 모킹 AsyncStorage에
  스냅샷 blob이 실제 기록·라운드트립되는지, 큐 enqueue/idempotent/remove/flush,
  실패 시 큐 보존, 음수 정화를 assert. `__tests__/App.runsync.test.tsx`(2) —
  앱 마운트 시 큐에 남은 런이 /api/runs로 POST되어 큐에서 제거되고, POST 실패 시
  큐에 보존됨(iron law)을 관측 가능한 결과로 검증. 전체 172 통과, tsc 클린.
- **note**: 비-UI 단위검증은 공식 async-storage jest 목으로 수행. 단,
  `clearAllMockStorages()`는 레지스트리 포인터만 비우고 import된 default 인스턴스의
  store는 비우지 않는 quirk가 있어 테스트 격리는 `AsyncStorage.clear()`로 처리.
  ([[tenet-eval-output-buffering]] 무관, 신규 관찰).
