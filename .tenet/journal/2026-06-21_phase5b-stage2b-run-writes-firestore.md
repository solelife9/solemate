# Phase 5b · Stage 2b — 런 쓰기 Firestore-only (2026-06-21)

런 저장/편집/삭제에서 REST 제거. Stage 2 의 최대 난관(크래시-세이프티 재설계).

## 크래시-세이프티 재설계(핵심)
기존 addRun 은 `enqueuePendingRun`(동기 큐)으로 800ms 디바운스 캐시 전 크래시 윈도우를
막았다(audit#3). REST 큐를 제거하면서 그 보장을 **부팅 캐시에 즉시 durable 기록**으로 대체:
- `persistRunToCache(record)` — 낙관적 `setRuns` *전에* CACHE_RUNS_KEY 에 prepend(멱등).
  크래시 시에도 런이 캐시에 남아 다음 부팅 복원 + cloudSync push. 큐 불필요.
- localId(genRunId)가 런의 **영구 id** — 서버 재키잉 없음 → 머지 키 안정.

## 변경(App.tsx)
- `addRun` — enqueue/postRun/reconcileSynced(REST) 제거. record 에 source/location/heart_rate
  포함(이전엔 REST 왕복으로만 보존되던 필드 — 이제 Firestore 에 유실 없이 올림). 사이드키
  route_/time_ 유지 + persistRunToCache + setRuns. _pending 플래그 제거.
- `editRun` — apiPatchRun + _pending 큐 분기 제거. setRuns + stampUpdatedAt 만.
- `deleteRun` — apiDeleteRun 제거. 항상 로컬-퍼스트(라이브 제거 + 묘비 + 사이드키 정리).
- 미사용 import 제거: apiPatchRun/apiDeleteRun(lib/api), updatePendingRun(runPersistence).
- (postRun/reconcileSynced/syncPendingRuns/back-register 의 런 경로는 Stage 3 까지 잔존 —
  부팅 REST 읽기/큐 드레인이 거기 묶여 있어 함께 제거.)

## 테스트 재작성(의미 보존)
- App.addrun — 큐+POST 단언 → "저장 즉시 부팅 캐시 durable + REST POST 없음 / route_·time_
  키는 영구 run_ id / 백엔드 down 이어도 영속". 3/3.
- App.runrecover — 복구 저장 POST 단언 → 부팅 캐시에 복원 거리/route/duration/신발 durable
  + REST POST 없음. 3/3.
- App.runedit — DELETE/POST/PATCH 단언 → "REST 쓰기 0 + 관찰 행동(신발 km 감소/재계산,
  수동런 source=manual 캐시 기록)". (이 스위트의 3개 nav 실패는 baseline 동일 pre-existing.)

## 검증
- tsc clean, eslint 0 errors. 신규/재작성 테스트 통과. 전체 47 fail(flaky 밴드) — audit-hardening
  6·runedit 3·surface 1 등은 baseline 과 **동일**(pre-existing nav/scan flaky). 신규 결정적 회귀 0.

## 다음
- Stage 3 — 부팅/새로고침 Firestore-only: initUser/refreshData 의 REST 읽기 + reconcileFetched
  LocalFirst + backRegisterMerged + syncPendingRuns 제거 → 캐시 로드 + runCloudSync 복원.
  setCrashUser(authUser.uid). 이때 큐/postRun/reconcileSynced 도 死코드화.
