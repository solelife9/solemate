# 클라우드 동기 부팅 레이스 — 로컬-전용 런 클로버(데이터 유실) 수정 (2026-06-24)

GPS 백그라운드 버그([[2026-06-24_gps-background-tracking-foreground-perm-fix]]) 재빌드 후
앱을 열자 **오늘 런이 로컬 캐시에서 사라짐**(기기 컨테이너 재추출: cache_runs_v1 6→5,
`run_1782303333085` 소멸, Firestore에도 없음). 두 번째 독립 버그.

## 근본 원인 (데이터 유실 레이스)
- `backupData.runs`(App.tsx 907)는 메모리 `runs` 상태에서 만들어진다.
- 부팅 동기 effect(`[authUser?.uid]`)는 **bootState 준비를 안 기다린다**. Firebase auth 복원이
  initUser 의 캐시 로드(migrateStorageSchema→loadSettings→loadBootCache, 다수 await)보다 먼저
  끝나 → 동기가 `runs=[]`(빈 로컬)로 remote 와 머지 → 결과=remote-only → `applyBackupPayload`가
  setRuns(remote) + 부팅캐시 영속 effect가 그걸 cache_runs_v1 에 써서 **아직 클라우드에 안 올라간
  로컬-전용 런을 영구 삭제**. 그 런은 머지 입력에 없었으니 push 도 안 됨(양쪽에서 소멸).
- 즉 "동기 안 된 런"은 다음 부팅마다 이렇게 사라질 수 있었다(좋은 런도 위험).

## 수정 (App.tsx)
- `runCloudSync` 최상단 가드에 `bootState!=='ready'` 추가 — hydrate 전 동기 전면 차단(주 방어).
  ready 시 setShoes/setRuns/setBootState가 같은 배치라 runs/shoes 가 항상 hydrate된 상태.
- 부팅 동기 effect를 `[authUser?.uid,bootState]` 의존 + ready 가드로 바꿔, auth 가 먼저 와도
  캐시 로드 후에만 1회 동기가 돌게 함(짝 맞춤). 디바운스 effect는 cloudDataSig 변화로 자연히 재발동.

## 테스트 (회귀)
- `__tests__/App.cloudsync.test.tsx`: 로컬 부팅캐시에 동기 안 된 GPS 런 + 원격엔 없음 →
  부팅/settle 후 **모든 push 페이로드가 그 런을 포함**(every(hasRun))해야 통과.
- **fix 없이 실패 / fix 있으면 통과**를 가드 임시 원복으로 직접 확인(✕→✓). 타우톨로지 아님.

## 검증
- tsc clean. 변경 파일 신규 eslint 에러 0(잔존 2 = createChallenge/deleteChallenge pre-existing).
- 동기 스위트 전부 개별 통과(cloudsync 2 / refreshSync 2 / runsync 1 / bootcache 7 /
  ProfileScreen.cloud 11). 합쳐 돌리면 기존 jest 인프라 flaky(async 에러 보고 크래시)로 죽어
  개별 실행으로 확인.

## 메모
- 사라진 0.39km 런 데이터는 `/tmp/keego_container`(최초 추출 스냅샷)에 route 포함 보존 —
  깨진 런이라 복구 가치 낮음. 일반 동기는 정상(로그인·규칙·userBackups 문서 존재).
- 후속 후보(별개): 런 저장 후/백그라운드 진입·종료 시 동기 + 실패 push 재시도(현재 1.2s
  디바운스 + 부팅만). 이번 수정과 독립.
