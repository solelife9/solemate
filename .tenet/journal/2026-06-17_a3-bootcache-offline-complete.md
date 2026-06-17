# a3-bootcache-offline complete (retry1)

type: journal
job_name: 부팅캐시 쓰기후 갱신 + 오프라인 pending 오버레이 + 클라우드→REST 역등록
created: 2026-06-17

## Findings

- **what (3 parts)**:
  1. **부팅캐시 상시 갱신(디바운스)** — App.tsx 에 `[shoes,runs,bootState]` 의존 useEffect 추가:
     `bootState==='ready'` 일 때만 800ms 디바운스로 현재 라이브 상태를 `cache_shoes_v1/
     cache_runs_v1` 에 덮어쓴다. 기존엔 initUser 서버 fetch 성공 직후에만 캐시를 써서, 그 뒤
     mutation 이 캐시에 안 들어가 오프라인 재부팅 시 낡은 데이터만 보였다. 'loading' 가드로
     빈 초기상태가 캐시를 지우지 않게 한다(쓰기 실패 비차단).
  2. **오프라인 부팅 pending 오버레이** — initUser catch(백엔드 다운) 분기에서 loadBootCache
     결과 위에 `loadPendingRuns()` 를 오버레이. 캐시 런 id 집합에 없는 localId 만 `_pending`
     런으로 변환해 앞에 합쳐, 아직 서버로 못 간 런까지 UI(이번 주 거리)에 보이게 한다(중복방지:
     localId==id 면 스킵).
  3. **클라우드→REST 역등록(멱등)** — `lib/cloudSync.recordsToBackRegister(merged, knownIds)`
     순수 함수 추가(live·id있음·knownIds 미포함만 선별, tombstone 제외). App 의 `onCloudMerged`
     (ProfileScreen 자동 동기 콜백)이 머지 적용 *전* 로컬 id(refs 로 최신 커밋 읽음)를 기준으로
     REST 미존재 신발/런만 `apiAddShoe/apiAddRun` 로 역등록. 성공 시 서버 id 로 reconcile +
     옛 클라우드 id 묘비(addShoeTombstone/addRunTombstone) → 재동기화 시 (a) 새 id 가 knownIds 에
     들고 (b) 옛 id 묘비가 원격 부활/재-POST 를 막아 **중복 POST 0**. 신발 cloudId→serverId 매핑으로
     런 shoe_id 재키잉(고아 방지). userId 미연결이면 graceful skip(유실 0).

- **iron law**: 데이터 파괴 0 — 캐시/오버레이/역등록 모두 기존 레코드 보존, tombstone 으로만 삭제 전파.

- **테스트**:
  - `__tests__/lib/cloudSync.test.ts` — recordsToBackRegister 5 케이스(미존재만 선별, known 스킵,
    tombstone 제외, id없음 제외, reconcile 후 멱등).
  - `__tests__/App.bootcache.test.tsx` — (1) 오프라인 부팅 시 캐시 런+pending 런 합산 가시성(9.2km),
    (2) 캐시에 이미 든 런 중복방지, (3) 클라우드 머지 역등록(클라우드-only 만 POST, 기존 REST 레코드
    제외) + 재동기화 중복 POST 0. 테스트 seam `globalThis.__KEEGO_CLOUD_PORT__`(devSeed 게이트 패턴).

- **eval-self**: jest 127 suites / 1252 pass(20 todo). tsc 0, eslint 0 errors(신규 no-shadow 제거).

- **retry1 원인/교훈**: 최초 시도 14ms 즉시실패(신호없음). 통합테스트가 다른 테스트와 함께 돌 때
  `clearAllMockStorages` 누수로 직전 테스트의 `pending_runs` 가 새어 boot 재동기 POST 가 한 번 더
  잡혀 run POST=2 로 실패 → 각 테스트 시작에 `await AsyncStorage.clear()` 추가(메모리 노트
  asyncstorage-mock-clear-quirk 와 일치). 또 onCloudMerged 의 shoes/runs stale 클로저 가드로 refs 도입.

- **next**: a4-fcm-wire (묶음 A 수용 it.todo 교체 포함). FuelGauge.tsx eslint(a2 carryover)은 이미 2f29b64 에서 정리됨.
