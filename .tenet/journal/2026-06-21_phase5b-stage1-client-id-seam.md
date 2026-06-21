# Phase 5b · Stage 1 — 클라이언트 id 생성 seam (2026-06-21)

Stage 2(쓰기 Firestore-only)의 안전한 발판. 서버가 id 를 발급하지 않는 Firestore 정본에서
신발/런이 안정적인 클라이언트 id 를 갖도록, id 생성을 단일 출처로 추출한다.

## 핵심 제약(설계 근거)
영구 클라이언트 id 와 "REST-가-레코드-소유"는 공존 불가다 — 서버가 자체 id 를 발급하고
PATCH/DELETE 가 그 id 를 타깃하므로. 따라서 **신발의 클라 id 채택은 서버 쓰기 제거(Stage 2)
와 한 묶음**이다. Stage 1 은 위험 0 으로 가능한 것만 한다: seam 추출 + 런 채택(형식 동일).

## 추가/변경
- `lib/genId.ts` (신규) — `genClientId(prefix, now?, rand?)` + `genRunId`/`genShoeId`.
  형식 `${prefix}_${now}_${rand.toString(36).slice(2,9)}` = 기존 런 localId 와 **바이트 동일**.
  now/rand 주입으로 결정적 테스트.
- App.addRun — 인라인 `'run_'+ts+'_'+random` → `genRunId(stampedAt)`. 형식 동일 →
  동작·머지 키·route_/time_ 키잉 전부 불변(런 저장/동기 테스트 그대로 green).
- `genShoeId` 는 Stage 2 에서 신발 생성이 Firestore 정본이 될 때 사용(지금은 미사용 export).

## 테스트
- `__tests__/lib/genId.test.ts` — 형식·기존 localId 동등성·prefix·고유성·기본인자. 5건.

## 검증
- tsc clean, eslint 0 errors. App.addrun/runsync 통과(행동 보존 확인). 전체 실패 수 45 는
  기존 flaky 밴드 내, total +5(신규). 신규 결정적 회귀 0.

## 다음
- Stage 2 — 쓰기 경로 Firestore-only: addShoe/update*/삭제·보관/런 저장·수정·삭제에서
  api* 제거, 신발은 genShoeId 로 클라 id, 캐시+cloudSync 가 영속. userId 가드 → 로그인 가드.
  fetch 단언 App 테스트(addrun/shoe/runedit/deleteUndo/tombstone)를 로컬/Firestore 단언으로 재작성.
