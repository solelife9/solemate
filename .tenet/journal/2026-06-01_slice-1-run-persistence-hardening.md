# slice-1-run-persistence 비평가 수정(retry#1) 완료

type: journal
job_name: 완주 런 손실 방지 — code/test 비평가 결함 수정(dead-key 누수 / 재동기 중복 / App 통합 테스트)
created: 2026-06-01

## 배경
playwright/구조는 통과했으나 code·test 비평가가 실제 결함 3건을 지목. 이전 시도
실패. 본 retry는 비평가 지목 결함만 외과적으로 수정하고 회귀를 테스트로 고정.

## Findings

- **(1) dead-key 누수 수정 [product_bug, code 비평가]**
  - 증상: `addRun`이 `route_<localId>`/`time_<localId>`를 먼저 쓰고, `reconcileSynced`가
    동기 성공 시 `route_<serverId>`/`time_<serverId>`로 re-key하면서 원본 localId 키를
    안 지워 synced 런마다 죽은 (큰) route blob이 AsyncStorage에 영구 누적.
  - 수정: `App.tsx reconcileSynced` — serverId 확정 시 `AsyncStorage.removeItem('route_'+localId)`
    /`'time_'+localId` 호출(serverId!==localId일 때만). 회귀: `__tests__/App.addrun.test.tsx`
    "successful sync ... leaves NO dead route_/time_<localId> keys" — getAllKeys로
    `route_run_*` 잔존 0 + `route_server-99` 존재를 관측.

- **(2) 재동기 중복 런 클라이언트 멱등화 [product_bug, iron-law, code 비평가]**
  - 증상: POST 성공 ↔ removePendingRun 영속 사이 프로세스 킬 시 다음 실행
    flushPendingRuns가 동일 런 재-POST → 중복 행(누적km/신발수명 부풀림). 백엔드
    외부·변경불가.
  - 수정(3중 방어):
    (a) `postRun` body에 `localId`(client idempotency key) 동봉 — forward-compat.
    (b) `lib/runPersistence.ts`에 `serverHasRun`/`reconcilePendingWithServer` 신설.
        flush **전** 이미 로드된 server runs와 시그니처(run_date+shoe_id+거리, tol<0.005km)
        또는 echo된 localId로 매칭되면 재-POST 없이 dequeue 영속. `App.initUser`가
        갓 받은 server runs+user_id로 `syncPendingRuns(reconcile→flush)` 호출.
    (c) `reconcileSynced`가 `removePendingRun`을 다른 작업(route re-key)보다 **먼저**
        영속해 POST↔dequeue 윈도우 최소화.
  - 한계(문서화): 완전 서버 dedup은 백엔드 필요. 클라이언트는 같은 기기 재실행
    중복만 차단(다기기 동시 동기는 범위 밖).
  - 회귀: runPersistence.test.ts(serverHasRun 5 + reconcile 3), App.runsync.test.tsx
    "server already has → no 2nd POST, dequeued".

- **(3) App 통합 테스트 보강 [test 비평가]**
  - `App.runrecover.test.tsx`(audit#2): 영속 snapshot으로 App 마운트 → 복구/버리기
    Alert 노출, **복구**가 dist(3.20)/elapsed(15:00)/goalKm(5)/cadence(172) 렌더 복원 +
    저장 시 복원된 거리·경로(pts) POST를 관측, **버리기**가 clearSnapshot로 SNAPSHOT_KEY
    제거.
  - `App.addrun.test.tsx`(audit#3): local-first 순서 — POST 시점 큐에 이미 enqueue됨을
    'hang' POST로 관측(POST-first 구현이면 실패), 성공 시 serverId 화해+dequeue+dead-key
    정리, 실패 시 route 포함 잔류(iron law).
  - `App.runsnapshot.test.tsx`: 라이브 런 3s 인터벌 스냅샷(dist/shoe/goal 관측) +
    save/discard 시 clearSnapshot(stale 스냅샷 spurious resume 방지). fake timers 사용,
    afterEach `clearAllTimers`로 누수 차단.

- **lint 정리**: `runPersistence.ts`의 미사용 `catch(e)`→`catch` 3건, App.runsync 테스트
  1건 정리. 신규 lint 에러 0(eslint 에러 24→19, 변경/신규 파일 에러 0). 신규 useEffect
  미도입(오히려 `[userId]` flush 효과를 initUser로 통합해 제거).

- **검증**: `npx tsc --noEmit` 클린. `npm test` 190 통과(기존 172+신규 18). 라이브 App
  마운트·구동 통합 테스트가 RN 프런트 렌더 스모크를 겸함(웹/서버 없음). 데이터
  음수/유실/중복 금지 iron law를 관측 테스트로 고정.
