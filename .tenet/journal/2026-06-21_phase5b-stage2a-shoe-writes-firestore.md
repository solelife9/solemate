# Phase 5b · Stage 2a — 신발 쓰기 Firestore-only (2026-06-21)

신발 쓰기 5개 핸들러에서 REST 제거. (런 쓰기는 동기화 큐/사이드키와 얽혀 Stage 2b 로 분리.)

## 발견(설계 분기)
`backRegisterMerged`(부팅/새로고침/onCloudMerged)가 로컬-only 레코드를 REST 로 역등록하며
**서버가 새 id 를 발급·재키잉**한다(라인 1175-1187). 클라이언트 id 신발을 만들면 다음 부팅에
서버 id 로 바뀌어 클라 소유 id 가 깨진다 → 역등록에서 **클라이언트 id(shoe_/run_) 제외 가드**
필요. 이 결합 때문에 신발 쓰기 전환은 back-register 가드와 한 묶음.

## 변경(App.tsx)
- `addShoe` — `apiAddShoe` 제거. `genShoeId()` 로 클라 id + stampUpdatedAt 로컬 생성(로컬-퍼스트).
  `if(!userId)` → `if(!authUser?.uid)` 로그인 가드. 영속은 캐시 + cloudSync push.
- `updateShoeName`/`updateShoeMaxKm`/`retireShoe` — `apiPatchShoe` 제거. 로컬 상태 + stampUpdatedAt 만.
- `deleteShoe` — `apiDeleteShoe` 제거. 로컬 제거 + 묘비(soft-delete, cloudSync 전파).
- `backRegisterMerged` — `recordsToBackRegister(...).filter(!isClientId)` 가드(shoe_/run_ 제외).
- import 에서 미사용 `apiPatchShoe`/`apiDeleteShoe` 제거.

## 테스트
- App.shoe — retire/delete/restore 의 REST-쓰기 단언을 "REST 신발 엔드포인트 쓰기 0 +
  관찰가능 행동(보관됨/런 보존/복원 startable)"으로 재작성. 8/8 통과.
- App.updatedAt addShoe — 서버 id('srv-shoe-1') 조회 → 이름 조회 + 클라 id(shoe_…) 단언.
- App.bootcache 역등록 테스트(C1/rC1 등 비-클라id)는 가드 무영향 → 그대로.

## 검증
- tsc clean, eslint 0 errors. App.shoe·App.tombstone green. 전체 45 fail(flaky 밴드 저점) —
  updatedAt/bootcache/deleteUndo 는 baseline 과 **동일**(pre-existing onTab flaky), refreshSync
  단독 green(주문 flaky). 신규 결정적 회귀 0.

## 다음
- Stage 2b — 런 쓰기 Firestore-only: addRun 의 postRun/reconcileSynced(REST) 제거, localId
  영구 id 화. 동기화 큐(enqueue/route_/time_ 사이드키)와 크래시-세이프티 재설계가 핵심 —
  캐시 동기 기록 + cloudSync 로 대체. apiPatchRun/apiDeleteRun(런 편집/삭제)도 제거.
