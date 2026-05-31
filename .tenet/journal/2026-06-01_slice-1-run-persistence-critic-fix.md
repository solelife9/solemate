# slice-1-run-persistence code_critic 결함 2건 수정(retry#2) 완료

type: journal
job_name: 완주 런 손실 방지 — code_critic 라인근거 실제결함 2건만 수정
created: 2026-06-01

## 배경
구조·테스트 대부분 양호. test_critic의 "App 통합테스트 3종 없음"은 오판
(App.runrecover/addrun/runsnapshot.test.tsx는 be3aa8b에 실재 — Glob 확인,
재생성 금지·기존 유지). code_critic이 라인근거로 지목한 실제 결함 2건만 외과 수정.

## Findings

- **(1) reconcile 경로 dead-key 누수 [product_bug]**
  - 증상: `reconcilePendingWithServer`가 server-match로 런을 dequeue할 때
    `addRun`이 기록한 `route_<localId>`/`time_<localId>` 키를 안 지움. POST 경로
    `reconcileSynced`(App.tsx:220-223)는 정리하지만 이 dedup 경로는 누락 →
    모든 dedup마다 큰 route blob이 AsyncStorage에 영구 적체.
  - 수정: `reconcilePendingWithServer`가 `{stillPending, dropped}` 반환하도록
    변경. `App.syncPendingRuns`가 dropped 각 런마다
    `removeItem('route_'+localId)`/`'time_'+localId` 호출.
  - 회귀: App.runsync "server ECHOES → dequeue WITHOUT POST + dead route_/time_
    keys purged" — getAllKeys로 `route_run_*`/`time_run_*` 잔존 0 관측.

- **(2) serverHasRun 시그니처 매칭 안전화 [product_bug, iron-law 유실 금지]**
  - 증상: (shoe_id,run_date,km±0.005) 매칭에 1:1 소비·확정성 구분이 없어 ① 서버
    1행이 동일 시그니처 큐 런 여러 개 드롭(나머지 유실) ② 우연 동일 시그니처
    미동기 런을 POST 없이 드롭(유실). 백엔드가 localId echo 안 하므로 시그니처
    경로만 활성 → 실제 유실 위험.
  - 수정(critic 권고): `matchServerRun(pending,serverRuns,consumed)` 신설 —
    (a) 1:1 소비(consumed Set: 서버 1행은 최대 1개 큐 런 매칭), (b) echo localId
    매칭은 'echo'(확정), 시그니처는 'signature'(휴리스틱)로 구분. reconcile은
    **echo 매칭일 때만 dequeue(드롭)**; 시그니처-only/미매칭은 **큐 유지(재-POST)**.
    근거: 중복은 보이고 교정가능, 유실은 복구불가 → iron-law상 유실 회피 우선.
    잔여 중복 윈도우는 기존 '성공 시 removePendingRun 조기 영속'으로 최소화.
  - 회귀(lib): matchServerRun 4건(echo/signature 구분·echo 우선·1:1 소비),
    reconcile 6건(echo-only 드롭, 시그니처-only 유지, 동일시그니처 2건 둘 다 유지,
    1:1). App.runsync "signature-only → 재-POST(드롭 금지)".
  - (권장) App.runrecover에 복구 POST `shoe_id==='s1'` 단언 추가(신발 정체성).

## 검증
- `npx tsc --noEmit` 클린.
- `npm test` 198 통과(신규 회귀 가드 포함).
- 변경 파일(runPersistence.ts/App.tsx) 신규 lint 에러 0(App.tsx 19→19 동일,
  runPersistence.ts 0). 잔여 에러는 기존 catch(e)/useEffect로 본 작업 범위 밖.
- RN 프런트엔드: App 마운트 통합테스트(runsync/runrecover)가 렌더 스모크 겸함.
