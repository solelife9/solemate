# a3-bootcache-offline 역등록 에러경로 결함 2건 수정 (retry2)

type: journal
job_name: 부팅캐시 쓰기후 갱신 + 오프라인 pending 오버레이 + 클라우드→REST 역등록
created: 2026-06-17
base_commit: d4a2f75

## 배경

code_critic 가 deliverable 3(클라우드→REST 역등록)의 **에러경로 결함 2건**으로 차단(deliverable 1·2
부팅캐시 갱신·오프라인 오버레이는 통과). d4a2f75 기반으로 두 결함만 수정 + 회귀 테스트 추가.

## 버그1 — 고아 런 방지(스펙 '신발 id 재키잉으로 런 고아 방지' 위배)

- **증상**: backRegisterMerged 에서 apiAddShoe 가 throw 하면 shoeIdMap 항목이 없어, 런 루프의
  `shoeIdMap.get(rn.shoe_id) ?? String(rn.shoe_id)` 가 **cloud shoe id 로 폴백**해 부모 신발이
  REST 에 없는데도 자식 런을 POST → 영구 고아.
- **수정(App.tsx backRegisterMerged)**: 런은 부모 신발이 REST 에 *실재*할 때만 POST 한다.
  `restParentShoeIds`(= 이미 REST 확정 신발 ∪ 이번 패스 신발 역등록 성공분) 게이트를 추가하고,
  부모가 그 집합에 없으면 그 자식 런은 `continue`(이번엔 defer, 다음 sync 재시도). cloud id 폴백
  POST 경로 제거. 부모 id 가 바뀐(서버 신규 id) 경우만 shoeIdMap 으로 re-key.

## 버그2 — 실패 레코드 in-session 재시도(영구 마스킹 제거)

- **증상**: onCloudMerged 가 applyBackupPayload(merged) 로 cloud-only 레코드를 라이브 state 에
  무조건 insert → 그 id 가 이후 모든 sync 의 knownIds(라이브 state 파생)에 들어가
  recordsToBackRegister 가 제외 → POST 실패해도 앱 재시작 전까지 영구 마스킹.
- **수정**: '알려진=REST 확정' 판정을 낙관적 state 가 아니라 **실제 REST POST 성공분**에 근거하게
  `restShoeIdsRef`/`restRunIdsRef`(Set) 도입. 채우는 지점 = (a) initUser fetch 성공분, (b) addShoe
  성공분, (c) reconcileSynced(postRun 성공) 분, (d) 역등록 성공분만. **실패분은 미반영** → 다음
  sync 의 recordsToBackRegister 가 다시 잡아 재시도. onCloudMerged 의 knownIds 출처를 라이브
  state(shoesRef/runsRef) → REST 확정 집합으로 교체(두 ref 는 dead code 되어 제거). UI 낙관적
  표시(applyBackupPayload)는 유지. 우리 pending 큐(loadPendingRuns localId)는 known 에 합쳐
  syncPendingRuns 와의 이중 POST 방지.

## 테스트(__tests__/App.bootcache.test.tsx, 관측가능 결과 단언)

- **버그1**: 부모 신발(C1) POST 실패 시 자식 런 rC1 은 POST 0(고아 0), 부모(C2) 성공한 런 rC2 만
  서버 신발 id(S2-server)로 re-key 되어 reconcile. `runPosts.some(shoe_id==='C1')===false` 단언.
- **버그2**: 신발 POST 1차 실패 → 2차 sync 에서 재시도(shoePostAttempts 1→2, 마스킹 안 됨) →
  성공 후 자식 런 POST + 3차 sync 멱등(재-POST 0). 빈 REST 정본이라 `onboarded` 플래그 세팅으로
  온보딩 대신 탭 화면 부팅.
- 기존 a3 3케이스(오프라인 오버레이 가시성·중복방지·역등록 멱등)는 그대로 PASS.

## iron law / eval-self

- 데이터 파괴 0(낙관적 표시 유지, tombstone 로만 삭제 전파), 새 네이티브 0, REST 정본.
- tsc 0, eslint 0 errors(기존 warning 만), jest 127 suites / 1254 pass(+2) / 20 todo.

## 교훈

- 빈 REST 정본으로 부팅하면 `!onboarded && shoes.length===0` 게이트가 OnboardingScreen 을 띄워
  탭이 안 보임 → 통합테스트에서 `onboarded` 시드 필요(데이터 있는 기존 테스트엔 불필요했음).
- '낙관적 화면 반영'과 'REST 확정' 두 진실원을 분리한 게 핵심: 가시성은 state, 역등록 선택은 ref.
