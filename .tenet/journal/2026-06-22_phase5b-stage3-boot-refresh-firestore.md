# Phase 5b · Stage 3 — 부팅/새로고침 Firestore-only (2026-06-22)

부팅·새로고침의 REST 읽기 경로를 제거하고, 그게 먹이던 死코드(큐/역등록)까지 정리했다.
이로써 신발/런 데이터 경로에서 Render REST 의존이 사라진다(랭킹은 Phase 3/5a 에서 이미 이전).

## 변경(App.tsx)
- `initUser` — REST(apiAuth/apiGetShoes/apiGetRuns) + reconcileFetchedLocalFirst +
  backRegisterMerged + syncPendingRuns 제거. **로컬 캐시 로드 → 'ready'**, 원격 복원은
  runCloudSync(authUser.uid effect)가 pull→merge→push 로 수행(재설치/기기변경 복구 포함).
  레거시 미동기 큐는 overlayPendingRuns 로 보존. boot 'error'(재시도 카드) 상태 도달 불가.
- `refreshData` — REST 재fetch 제거 → `runCloudSyncRef.current()` 재호출(미로그인 no-op,
  lastSyncAt 은 runCloudSync 가 성공 시 stamp).
- 제거된 死코드: `syncPendingRuns`/`postRun`/`reconcileSynced`/`backRegisterMerged`/
  `reconcileFetchedLocalFirst`/`restShoeIdsRef`/`restRunIdsRef`/`userId` state.
- `onCloudMerged` — backRegister 호출 제거(applyBackupPayload 만).
- `setCrashUser` → onAuthStateChanged(authUser.uid)로 이동. 온보딩 신발 등록 가드 userId→authUser.
- 미사용 import 정리(apiAddShoe/apiAddRun, removePendingRun/flushPendingRuns/
  reconcilePendingWithServer, recordsToBackRegister). tsc clean, eslint 0 errors.

## 테스트 마이그레이션(16 스위트)
부팅이 더 이상 REST GET 으로 데이터를 시드하지 않으므로 해당 테스트를 **부팅 캐시 시드**로 옮김:
- 신규 헬퍼 `__tests__/helpers/bootSeed.ts`(jest.config testPathIgnorePatterns 로 스위트 제외).
- 데이터 시드(13): App.shoe/shoebadge/recommend/alerts/shoefirst/tombstone/gps/autopause/
  cadence/foreground/permission/runsnapshot — mount 헬퍼에 seedBootCache 추가.
- 재작성(3): App.runsync(REST 큐 드레인 → "큐 런 REST POST 0 + 유실 0"), App.refreshSync
  (REST refresh → cloudPort 주입 lastSyncAt 성공-only 스탬프), harness(부팅 apiAuth → 없음).
- crosscut.polish: boot LOADING 은 AsyncStorage hang 으로 고정, boot ERROR 테스트 제거(도달 불가).

## 검증
- tsc clean, eslint 0 errors(변경 파일). 16 스위트 함께 실행 71/71 통과. 전체 스위트의 신규
  결정적 실패 0(전체 run 의 HallOfFame 1건은 order-flaky — 단독 3/3 통과). 잔존 red(coldstart/
  bootcache/updatedAt/audit-hardening 등)는 이 브랜치 pre-existing.

## 남음(Stage 4/5)
- 死 UI: boot 'error' 분기/카드(도달 불가) 제거. lib/api.ts 의 미사용 export(apiAddShoe/
  apiPatch*/apiDelete*) 와 runPersistence 큐 함수, deviceId/device_id, Stage 0 이관 코드는
  Render 은퇴 후 정리. 레거시 pending 큐 1회 청소(작은 누수).
