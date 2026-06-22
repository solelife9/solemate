# Phase 5b — 신발/런 CRUD REST 제거 → Firestore 정본 (계획)

작성: 2026-06-21 · 상태: **Stage 0–3 + 문서 완료(2026-06-22)**, Stage 4(死코드) 일부 보류 · 위험도: 높음

## 진행 현황(2026-06-22)
- ✅ Stage 0 — REST→Firestore 일회성 이관(`lib/restToFirestoreMigration.ts`).
- ✅ Stage 1 — 클라이언트 id seam(`lib/genId.ts`).
- ✅ Stage 2a/2b — 신발/런 쓰기 Firestore-only(REST add/patch/delete 제거).
- ✅ Stage 3 — 부팅/새로고침 Firestore-only(REST 읽기 + 큐/역등록 死코드 제거). 테스트 16 스위트 마이그레이션.
- ✅ Stage 5(문서) — backend-deploy(deprecated)·firebase-deploy·harness/current.md 갱신.
- ◐ Stage 4(死코드 삭제) **일부 보류**: lib/api 미사용 쓰기 함수(apiAddShoe/apiPatch*/apiDelete*)와
  그 단위테스트, boot 'error' 死 UI(App.bootcache/coldstart 가 참조), runPersistence 큐 함수,
  recordsToBackRegister, deviceId/Stage0 이관 코드는 **무해한 死코드**라 Render 은퇴 시 일괄 정리
  권장(지금 제거하면 pre-existing flaky 스위트로 churn 번짐 — 비용 대비 가치 낮음).

## 목표 / 비목표
- **목표**: 신발/런의 1차 데이터 경로에서 Render REST(`solelife-backend`)를 완전히 제거하고,
  로컬-퍼스트(AsyncStorage 캐시) + Firestore 동기(Phase 2)를 유일 백엔드로 만든다.
- **비목표**: 런 트래킹 엔진/스냅샷 복구(`RunSnapshot`), 알림/리캡, 랭킹(Phase 3 완료),
  UI 변경. 이번엔 데이터 경로만.

## 핵심 통찰
Phase 2 가 이미 **로컬-퍼스트 + Firestore 양방향 머지**(`runCloudSync`→`pull`/`mergeCloudData`/
`push`/`applyBackupPayload`)를 갖췄다. 따라서 5b 의 본질은 *새 시스템 구축이 아니라*
**REST 보일러플레이트 삭제 + 그 빈자리를 기존 cloudSync 로 잇기**다. 위험은 "기능 추가"가
아니라 "정교한 REST 정합 기계(아래)를 안전하게 들어내기"에 있다.

## 현재 REST 결합 표면(제거 대상)
1. **부팅 로드**(`initUser`): `apiAuth(deviceId)→userId` → `apiGetShoes/apiGetRuns` →
   `reconcileFetchedLocalFirst`(서버 누락분 캐시 보존) → `backRegisterMerged`(로컬-only 역등록)
   → `syncPendingRuns`(오프라인 큐 flush).
2. **새로고침**(`refreshData`): initUser 와 동일 로직 축소판.
3. **쓰기 핸들러**: `addShoe`/`updateShoeName`/`updateShoeMaxKm`/삭제·보관(`apiPatchShoe`),
   런 저장(`apiAddRun` via `postRun`)/`apiPatchRun`/`apiDeleteRun`.
4. **정합 상태**: `restShoeIdsRef`/`restRunIdsRef`(서버 실재 id 집합), `userId`/`deviceId`,
   `setCrashUser(userId)`.
5. **동기화 큐**(`lib/runPersistence` 중 REST 부분): `PendingRun`/`enqueuePendingRun`/
   `flushPendingRuns`/`reconcilePendingWithServer`/`overlayPendingRuns`/`matchServerRun`.
   ⚠️ **분리 주의**: 같은 파일의 `RunSnapshot`/`saveSnapshot`/`loadSnapshot`/`isResumable`
   은 *진행중 런 크래시 복구*라 REST 무관 → **유지**.
6. `lib/api.ts` 전체 + `__tests__/lib/api.test.ts`.
7. fetch 를 모킹/단언하는 App 테스트 ~28개(App.runsync/coldstart/bootcache/runrecover/
   updatedAt/addrun/refreshSync/cloudsync/tombstone/deleteUndo/goals/settings/notif …).

## 치명 위험 & 가드(불변식)
- **R1 데이터 유실**: 기존 사용자 데이터가 REST 에만 있고 Firestore 에 아직 없을 수 있다
  (Phase 2 이후 동기 한 번도 안 돈 계정). → **가드: Stage 0 일회성 마이그레이션**(아래).
- **R2 id 생성**: 서버가 주던 신발/런 `id` 를 클라이언트가 안정적으로 생성해야 한다
  (런은 이미 `localId` 존재 → 그걸 정본 id 로 승격). 충돌/중복 머지 금지.
- **R3 미POST 레코드 마스킹**: 현재 `restShoeIdsRef` 미시드 로직(오프라인 부팅 주석)이
  막던 "확정 오인→역등록 영구 마스킹"은 REST 제거로 **개념 자체가 사라짐**(머지는
  updatedAt 최신우선). 제거가 곧 단순화.
- **R4 회귀**: 거리/페이스/시간/신발수명 순수 계산 결과 불변(기존 jest 회귀로 강제).
- **R5 오프라인**: 비행기모드에서 추가/수정/삭제가 로컬 즉시 반영 + 복귀 시 Firestore 로
  손실 없이 동기되어야 한다(현재 cloudSync 디바운스가 이미 수행 — 검증으로 확인).

## 단계(슬라이스) — 각 슬라이스 독립 머지·검증 가능
> 원칙: **삭제 전에 대체 경로를 먼저 켜고**(병행 가동) 검증 후 REST 를 끈다. tsc/lint/test
> 게이트 + 오프라인/재설치 시나리오 수동검증을 슬라이스마다.

### Stage 0 — 일회성 REST→Firestore 마이그레이션 (R1 가드, 먼저)
- 부팅 1회: Firestore 가 비어 있고(`pull()` 빈 결과) REST 에 데이터가 있으면, REST 로
  1회 로드 → `applyBackupPayload` → `push`(Firestore 시드). 스토리지 버전 키로 1회성 보장
  (`storageMigration` 패턴). 이미 Firestore 에 있으면 no-op.
- 산출: 모든 기존 사용자 데이터가 Firestore 에 안전 이관됨을 보장(이후 단계가 REST 를 꺼도 안전).
- 검증: REST-only 시드 계정 / Firestore-기존 계정 / 신규 계정 3종 부팅 테스트.

### Stage 1 — 클라이언트 id 생성 seam (R2 가드)
- 새 신발/런 id 를 클라이언트에서 생성(런은 `localId` 승격, 신발은 동일 규칙의 신규 id).
- 아직 REST 도 호출(병행) — id 만 클라가 정하고 서버엔 그 id 로 upsert. 동작 불변, 위험 0.
- 검증: 새 신발/런이 안정 id 를 갖고 머지가 중복을 안 만든다(기존 tombstone/updatedAt 테스트).

### Stage 2 — 쓰기 경로 Firestore-only
- `addShoe`/`update*`/삭제·보관/런 저장·수정·삭제에서 `api*` 호출 제거. 로컬 state +
  `stampUpdatedAt`/`markDeleted` + 캐시 기록만(이미 낙관적 갱신 존재) → cloudSync 디바운스가
  Firestore 로 push. `userId` 가드(`if(!userId) return`) → `if(!authUser) 로그인 유도`로 교체.
- 검증: App.addrun/shoe/runedit/deleteUndo/tombstone 테스트를 fetch 단언 → Firestore/캐시
  단언으로 재작성. 오프라인 추가→복귀 동기 수동검증(R5).

### Stage 3 — 부팅/새로고침 경로 Firestore-only
- `initUser`: REST 블록 제거 → 캐시 로드 + `runCloudSync`(pull/merge/push)로 복원.
  `reconcileFetchedLocalFirst`/`backRegisterMerged`/`syncPendingRuns`/REST id ref 제거.
  `refreshData`: `runCloudSync` 재호출로 축소.
- `setCrashUser`: `authUser.uid` 로 교체.
- 검증: App.coldstart/bootcache/runrecover/refreshSync/runsync/updatedAt 재작성. 콜드부팅·
  오프라인부팅·재설치복원 수동검증.

### Stage 4 — 동기화 큐 제거 + 死코드 삭제
- `runPersistence` 의 REST 큐(`PendingRun`/enqueue/flush/reconcilePending/overlay/matchServer)
  제거(스냅샷 복구는 유지). 큐 역할은 캐시+cloudSync 로 대체됨을 Stage 2/3 에서 입증한 뒤 삭제.
- `lib/api.ts`, `__tests__/lib/api.test.ts`, `userId`/`deviceId` state, REST id ref 삭제.
- `lib/cloudSync` 의 `recordsToBackRegister`/REST 역등록 보조도 미사용이면 정리.
- 검증: 死코드 임포터 0 확인, 전체 게이트.

### Stage 5 — 문서/마무리
- `docs/backend-deploy.md`(Render) → deprecated 표기, `firebase-deploy.md` 단일화.
- Render 서비스 종료는 **사용자 액션**(마이그레이션 충분 기간 후). 앱은 더 이상 의존 안 함.

## 테스트 전략
- 순수 로직/엔진 테스트는 그대로 green(거리/페이스/수명 불변 — R4).
- fetch 기반 App 테스트 ~28개는 **삭제가 아니라 의미 보존 재작성**: "REST 로 POST 했나" →
  "로컬 state/캐시/Firestore(목)에 반영됐나". jest.setup 의 firestore 인메모리 목 재사용.
- 신규: Stage 0 마이그레이션 3-시나리오 테스트, 오프라인 쓰기→동기 테스트.

## 롤백
- 슬라이스별 커밋이라 각 단계 `git revert` 가능. Stage 2/3 는 REST 제거가 핵심이라,
  문제 시 해당 슬라이스만 되돌리면 REST 병행 가동 상태로 복귀.

## 예상 규모
중간~대(슬라이스 6개, App 코어 + 테스트 ~28개 재작성). 위험 높음 → 슬라이스마다
오프라인/재설치 수동검증 동반 권장. 단계적·증분 진행이 안전.
