# Phase 5a — REST 랭킹 경로 제거 (2026-06-21)

Phase 3 에서 명예의 전당을 Firestore 정본으로 전환하면서 REST(Render) 랭킹 코드가
완전히 고아(orphan)가 됐다. 이 슬라이스에서 죽은 REST 랭킹 경로를 제거한다.
(신발/런 CRUD REST 의존은 별도 Phase 5b — 코어 데이터 경로라 위험·계획 후 진행.)

## 제거
- `lib/progression/rankingProvider.ts` — keegoRankingProvider(REST) + ensureBackendSynced
  + fetchMyProfile. 임포터 0(HallOfFame 은 firestoreRankingStore 사용).
- `lib/progression/remoteRanking.ts` + `__tests__/lib/progression/remoteRanking.test.ts`.
- HallOfFameScreen: `deviceUserId`/`sync`/`reloadKey`(REST link+recalc 마운트 훅) 제거.
  로드 effect 는 category/yearMonth 변화로만 돈다(발행은 App 동기가 담당).
- App.tsx: HallOfFameScreen 에 넘기던 `deviceUserId={userId}` 제거.
- HallOfFameScreen.test: "deviceUserId→sync 호출" 테스트 삭제, sync prop 주입 제거.

## 유지(의도)
- `lib/api.ts` 와 신발/런 CRUD(apiAddShoe/apiAddRun/apiAuth …)는 그대로 — Phase 5b.
- `getFirebaseIdToken`(firebaseCloudPort) — REST 전용 아님(범용 토큰 헬퍼), 보존.

## 검증
- tsc clean, eslint 0 errors. 남은 deleted-module 참조 0(주석 1건만 문구 수정).
- HallOfFame/ranking 테스트 통과. 전체 스위트 실패 수는 기존 flaky 밴드(46~50) 내,
  total 은 삭제한 테스트만큼 감소(신규 결정적 실패 0).

## 후속
- Phase 5b: App.tsx 신발/런 CRUD 를 REST → Firestore-only(로컬-퍼스트 + 동기)로. 코어
  데이터 경로·데이터 유실 위험 → 별도 계획/단계적 진행 필요(apiAuth/userId 개념 제거 포함).
