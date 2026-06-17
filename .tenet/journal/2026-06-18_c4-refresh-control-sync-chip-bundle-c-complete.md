# c4-refresh-control + sync-chip + bundle-C 수용 교체 complete

type: journal
job_name: Home/History 당겨서 새로고침 + 동기화 칩 + 묶음C 수용 교체 (c4-refresh)
created: 2026-06-18

## Findings

- **what**: HomeScreen·HistoryScreen 의 메인 ScrollView 를 RN 내장 `RefreshControl` 로 감싸 당겨서 새로고침 시 동기화를 재시도한다. Home 인사 영역에 '마지막 동기화' 칩('방금 동기화'/'N분 전'/'N시간 전'/'N일 전')을 노출.
- **새로고침 진입점(App.refreshData)**: 콜드 부팅 스켈레톤을 띄우지 않고(bootState 미변경) 조용히 REST 재fetch(apiAuth→apiGetShoes/apiGetRuns) + `syncPendingRuns`(reconcile→flush) 재시도. 성공 시 'REST 확정' id 집합·로컬 캐시(CACHE_SHOES/RUNS_KEY)·`lastSyncAt` 갱신. 실패(오프라인)는 던지지 않고 큐 flush 만이라도 시도 후 조용히 무시(비차단) — 화면은 기존 데이터 유지, 스피너만 내림. deviceId 미연결 시 풀 `initUser` 로 위임.
- **동기화 칩**: `lib/syncStatus.syncLabel(lastSyncAt, nowMs)` 순수 함수가 라벨 생성(null→'동기화 안 됨', <60초→'방금 동기화', <60분→'N분 전', <24시간→'N시간 전', else 'N일 전'). 칩은 `onRefresh` 배선 시에만 노출(표시 전용). `initUser` 성공 시점에도 `lastSyncAt` 을 찍어 첫 부팅 직후 칩이 의미를 갖는다.
- **스피너 상태**: 각 화면 내부 `refreshing` state + `handleRefresh` — `onRefresh` 가 동기/비동기 어느 쪽이든 `finally` 로 스피너를 반드시 내려 '멈춤'으로 끼지 않게 한다(에러도 삼킴).
- **묶음 C 수용 교체**: tests/acceptance/audit-hardening.test.ts 의 `C. 폼 + 피드백` it.todo 3건을 실제 관찰 단언으로 교체(=묶음 C 수용 통과):
  1. **토스트 undo**: lib/toast 계약으로 App.offerRunUndo/restoreRun 패턴 검증 — 삭제 시 '러닝 기록 삭제됨 · 실행취소' 스낵바가 뜨고(getCurrentToast), undo(runToastAction) 가 onAction 을 실행해 레코드 + 사이드키(신발 사용거리)를 완전복원하고 토스트가 닫힌다.
  2. **폼**: maskDuration/maskDate/validateRunForm 순수 단언 + HistoryScreen 실렌더로 '수동 기록 추가'→RunForm 이 KeyboardAvoidingView 로 감싸지고, 거리 빈값 제출 시 '거리 오류' 인라인 헬퍼텍스트가 뜨며 onAddRun 미호출.
  3. **새로고침**: syncLabel 순수 단언 + Home/History 실렌더로 RefreshControl.onRefresh 핸들러를 직접 호출해 onRefresh(재시도 진입점)가 불리고, Home 에 '방금 동기화' 칩이 렌더됨.
- **iron law**: 새 네이티브/외부 라이브러리 0(RN 내장 RefreshControl + 기존 lib/toast·inputMask 만), JS-only. 미주입(`onRefresh` 없음)이면 RefreshControl·칩 미장착으로 기존 화면 100% 하위호환.
- **files**: lib/syncStatus.ts(신규), HomeScreen.rn.tsx(RefreshControl+sync 칩+props), HistoryScreen.rn.tsx(RefreshControl+props), App.tsx(lastSyncAt state·refreshData·initUser 시각 스탬프·Home/History 배선), tests/acceptance/audit-hardening.test.ts(C 묶음 todo→실단언, 헬퍼 pressableByText/refreshHandler 추가).
- **verify**: tsc clean. jest 134 suites / 1349 pass(+6 todo=D·E 묶음만 잔존). C 묶음 3건 신규 PASS. 회귀 0.
