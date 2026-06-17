# delete-undo-snackbar complete

type: journal
job_name: 런/신발 삭제 undo 스낵바 배선
created: 2026-06-18

## Findings

- **what**: HistoryScreen 런 삭제(deleteRun)·ShoesScreen 신발 삭제(deleteShoe, 은퇴 아님)에 '삭제됨 · 실행취소' 토스트 배선. '실행취소' 시 *완전복원*:
  - **런**: 삭제 직전 레코드 + 사이드키(route_/time_/surface_/splits_) + (미동기였다면)pending 큐 항목을 스냅샷으로 떠두고(사이드키 wipe 전에 읽음), undo 시 사이드키 4종 원복 + 라이브 복귀 + (미동기)큐 재등록.
  - **신발**: 라이브 복귀(신발은 사이드키 없음).
  - **공통**: 묘비 되돌림 = tombstones_v1 store 에서 해당 id 제거 + 라이브 레코드 `deleted:false` + `updatedAt 갱신`(stampUpdatedAt). updatedAt 을 새로 찍어 머지 '최신 우선'이 옛 묘비보다 un-delete 를 최신 사실로 보고 부활(삭제 재적용)을 막는다.
- **부분복원 금지**: 사이드키를 지우기 전에 스냅샷에 담아 '런만 살고 사이드키 유실'을 차단. anti-test가 route_/time_/surface_/splits_ 4종 *전부* 바이트-동일 원복을 단언.
- **iron law**: 새 네이티브 0(기존 lib/toast + ToastHost + AsyncStorage + cloudSync 헬퍼만 사용), 데이터 파괴 금지(soft-delete/완전복원).
- **files**: App.tsx(import showToast/TOAST_UNDO_LABEL; restoreRun/offerRunUndo/restoreShoe/offerShoeUndo 추가; deleteRun 스냅샷 캡처; deleteShoe undo 제안), __tests__/App.deleteUndo.test.tsx(신규, full App 마운트 통합 2건).
- **verify**: tsc clean. jest 133 suites / 1331 pass(+9 todo). 신규 2건 PASS(런 완전복원+사이드키4종, 신발 완전복원). 회귀 0.
