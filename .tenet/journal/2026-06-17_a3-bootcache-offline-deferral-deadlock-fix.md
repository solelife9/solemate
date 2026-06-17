# a3-bootcache-offline 역등록 결함 2건 추가 수정 (retry3)

type: journal
job_name: 부팅캐시 쓰기후 갱신 + 오프라인 pending 오버레이 + 클라우드→REST 역등록
created: 2026-06-17
base_commit: 109746e

## 배경

code_critic 가 직전 커밋 109746e 기반으로 **product_bug 2건**(런 영구 deferral deadlock + 오프라인
부팅 seed 오인)으로 재차단. 두 결함만 수정 + 회귀 테스트 추가.

## 버그1(블로킹) — 런 영구 deferral deadlock

- **증상**: 부모 신발(C1)이 back-register 성공해 서버 id(S1)로 re-key + addShoeTombstone(C1) 됐는데,
  **같은 패스에서 자식 런(rC1) POST 가 일시 실패**하면 catch 로 빠지며 런의 live shoe_id 가 옛 cloud
  id(C1)로 남는다(런 re-key 가 run-POST 성공시에만 실행되므로). 다음 패스부터 C1 은 tombstone+known(S1)
  이라 recordsToBackRegister 에서 제외 → restParentShoeIds 가 C1 을 다시 못 얻음 → 게이트
  `if(!restParentShoeIds.has(C1)) continue` 가 영구 false → 런이 매 패스 영영 skip(재-POST 0).
- **수정(App.tsx backRegisterMerged, 신발 성공 re-key 분기)**: 부모 신발 back-register 성공 시 그
  신발의 **모든 자식 런의 live shoe_id 를 즉시 서버 id(S1)로 re-key** 한다 — 각 런의 POST 성공 여부와
  무관하게. stampUpdatedAt 으로 머지 '최신 우선'에서 이 re-key 가 원격의 옛 shoe_id 를 이기므로,
  deferred 런은 다음 패스 merged 에서 shoe_id 가 이미 known REST id(S1)라 게이트를 통과해 정상 재시도된다.
  (이번 패스의 런 POST 는 기존대로 shoeIdMap 으로 S1 에 보낸다; 즉시 re-key 는 실패 경로의 보험.)

## 버그2(부차) — 오프라인 부팅 seed 오인

- **증상**: 오프라인 부팅 catch 분기가 restShoeIdsRef/restRunIdsRef 를 cached.shoes/cached.runs 에서
  seed 했다. 부팅캐시는 매 mutation 마다 full live state 로 재기록되어 applyBackupPayload 가 낙관적으로
  끼운 **미POST cloud-only 레코드**를 포함할 수 있고, 이를 'REST 확정'으로 seed 하면 미POST 레코드가
  확정으로 오인돼 온라인 복귀 후 back-register 가 영구 마스킹(REST 정본에 영영 합류 못 함).
- **수정(App.tsx initUser offline 분기)**: 캐시 기반 seed 2줄 제거. 'REST 확정' 집합은 **실제 REST
  fetch(initUser try 분기, line 459-460)로만** seed 한다. 오프라인 분기에선 두 ref 를 빈 채로 두어,
  REST 도달 가능 시점/다음 sync 의 실제 POST 성공분으로만 채워지게 한다. 옛 cloud id 의 중복 POST 는
  tombstone+멱등 reconcile 이 별도로 막으므로 안전.

## 테스트(__tests__/App.bootcache.test.tsx, 관측가능 결과 단언)

- **버그1**: 신발 C1 POST 성공(S1) + 같은 패스 런 rC1 POST 1차 실패 → 2차 sync 에서 런이 **서버 신발
  id(S1)로 재시도·POST 성공**(runPostAttempts 1→2, 두 POST 모두 shoe_id===S1, C1 폴백 0). 3차 sync
  멱등(재-POST 0) → 영구 deferral 0·고아 0 확정.
- **버그2**: 오프라인 부팅(auth 성공으로 userId 연결, 데이터 GET 실패 → 캐시 폴백)에서 캐시의 미POST
  cloud-only 신발 C9/런 rC9 가 'REST 확정'으로 오인되지 않고, 온라인 복귀(cloud sync) 시 정상
  back-register(C9 신발 POST 1회, 런 rC9 가 서버 id S9 로 re-key 되어 POST).
- 기존 a3 5케이스(오프라인 오버레이·중복방지·역등록 멱등·고아방지·일시실패재시도) 전부 PASS.

## iron law / eval-self

- 데이터 파괴 0(낙관적 표시·tombstone 보존 유지), 새 네이티브 0, REST 정본.
- tsc 0, eslint 0 errors(기존 warning 만), jest 127 suites / 1256 pass(+2) / 20 todo.

## 교훈

- 'live state re-key'와 'REST 확정 ref'를 두 진실원으로 분리한 설계에서, **부모 성공 시 자식의
  live 좌표(shoe_id)를 즉시 옮겨야** defer 가 영구화되지 않는다 — 자식의 성공 여부에 묶지 말 것.
- '낙관적 캐시'를 'REST 확정'으로 재사용하면 미POST 레코드가 마스킹된다. 확정 집합은 반드시 실제
  REST 왕복(fetch/POST)으로만 채울 것.
