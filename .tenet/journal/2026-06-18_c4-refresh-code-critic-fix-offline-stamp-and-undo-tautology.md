# c4-refresh code_critic 차단 2건 수정 (retry #1)

type: journal
job_name: Home/History 당겨서 새로고침 + 동기화 칩 + 묶음C 수용 교체 (c4-refresh) — code_critic 후속
created: 2026-06-18
base_commit: 9b36a1b

## 배경

직전 커밋 9b36a1b 의 code_critic 가 2건으로 차단(RefreshControl·syncLabel·칩·새로고침
테스트 자체는 통과). 이 둘만 외과적으로 수정.

## Findings

- **버그1 수정(product_bug — 오프라인 새로고침이 동기화 성공으로 거짓표시)**:
  `App.refreshData` 의 catch(오프라인/백엔드 다운) 분기가 `syncPendingRuns` 뒤 무조건
  `setLastSyncAt(Date.now())` 를 불렀다. 그러나 `syncPendingRuns` 는 오프라인에서 throw 하지
  않는다 — `reconcilePendingWithServer`/`flushPendingRuns` 는 빈 큐에서 단락하고,
  `flushPendingRuns` 는 per-run POST 실패를 자체 삼킨다. 결과: 오프라인에서 당겨서 새로고침해도
  lastSyncAt 이 갱신돼 칩이 '방금 동기화'로 거짓표시(칩 계약='마지막 동기화 **성공** 시각' 위배).
  - 수정: `syncPendingRuns` 가 `flushPendingRuns` 의 `{synced,remaining}` 결과를 반환하게
    하고, catch 분기는 **실제로 서버에 밀어낸 POST 가 있을 때만(synced>0)** lastSyncAt 을 찍는다.
    빈 큐/POST 실패(synced 0)인 오프라인 bare 새로고침은 절대 스탬프하지 않는다(성공 try 분기·
    initUser 오프라인 캐시부팅과 대칭). 성공 fetch 경로(try)는 종전대로 무조건 스탬프.

- **버그2 수정(test_bug — 토스트-undo 수용테스트 tautology)**:
  `audit-hardening.test.ts` 의 '토스트…사이드키까지 복원' 테스트가 production
  `App.offerRunUndo/restoreRun` 을 호출하지 않고, 테스트가 직접 onAction 콜백에서 로컬 클로저
  변수(runs/shoeUsedKm)를 변형해 그 변수를 단언 → 복원이 깨져도 통과하는 tautology.
  - 수정: 실제 `<App/>` 를 마운트해 production 경로를 그대로 태운다 — History(tab2)의
    `onDeleteRun('r1')` → `offerRunUndo`(토스트) → 토스트의 `onAction`=`runToastAction`
    → `restoreRun`. 관측 가능한 결과만 단언: ShoesScreen(tab1)의 `shoes.used`(사이드키=신발
    사용거리) 50→0→50 회복, `route_r1`/`time_r1` 로컬키 제거→바이트 그대로 원복, `rawRuns`
    레코드 `deleted` falsy, 토스트 닫힘. (c2 의 `__tests__/App.deleteUndo.test.tsx` 패턴.)
  - 격리: 전역 beforeEach 의 `clearAllMockStorages` 누수로 앞 잡(A/B)의 pending_runs·캐시가
    남아 부팅 집계를 오염시켜 full-suite 순서에서 실패 → 테스트 시작에 명시적 `AsyncStorage.clear()`
    + 부팅 키 재설정(메모리: asyncstorage-mock-clear-quirk).

- **Bug1 회귀 테스트 신설**: `__tests__/App.refreshSync.test.tsx` — `<App/>` 마운트 후
  (a) 오프라인(fetch reject)+빈 큐에서 당겨서 새로고침 → HomeScreen 의 `lastSyncAt` prop 이
  부팅 기준값 V0 그대로(거짓 스탬프 금지), (b) 온라인 새로고침은 lastSyncAt 이 V0 보다 전진.
  단조 Date.now 목으로 동률 충돌 제거. 버그 코드(무조건 스탬프)라면 (a)가 V0 보다 큰 값으로
  바뀌어 실패한다 — 진짜 회귀 가드.

- **iron law**: 새 네이티브/외부 라이브러리 0, JS-only, 데이터 파괴 0, 관측가능 결과만 단언
  (오라클 누출 없음). 묶음 C 수용 describe 의 폼·새로고침 테스트는 그대로 유지.

- **files**: App.tsx(syncPendingRuns 반환·catch 조건부 스탬프),
  tests/acceptance/audit-hardening.test.ts(토스트 undo 를 실 App 마운트로 교체 + 헬퍼),
  __tests__/App.refreshSync.test.tsx(신규 Bug1 회귀).

- **verify**: tsc clean, eslint --quiet clean(에러 0). jest 135 suites / 1351 pass(+6 todo).
  교체 토스트 테스트 + 신규 refreshSync 2건 PASS. 회귀 0.
