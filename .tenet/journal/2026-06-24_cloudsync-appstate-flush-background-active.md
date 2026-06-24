# 클라우드 동기 빈틈 닫기 — 앱 이탈/복귀 시 동기 flush (2026-06-24)

부팅 클로버 수정([[2026-06-24_cloudsync-boot-race-local-run-clobber-fix]]) 후 남은 빈틈:
동기 트리거가 (a) 부팅, (b) 데이터 변경 1.2s 디바운스, (c) 당겨서 새로고침뿐이라 —
런 저장 직후 화면을 끄거나 앱을 종료해 1.2s 창을 놓치거나, 그때 오프라인이면 push 가
안 걸린 채 남았다(다음 부팅까지). warm resume(앱이 종료 안 되고 백그라운드만)에선 부팅
effect 가 재발화 안 해 복귀해도 동기가 안 됐다.

## 수정 (App.tsx)
- 새 useEffect: `AppState 'change'` 구독.
  - `'background'`(이탈 직전): runCloudSync flush — 저장 직후 이탈해도 push 가 한 번 걸린다.
    Firestore 오프라인 영속이 mutation 을 durable 큐잉하므로, 직후 suspend 돼도 다음 연결에
    서버로 올라간다(유실 방지).
  - `'active'`(복귀): 타 기기 변경 pull + 직전 실패(오프라인) push 재시도. warm resume 보장.
  - `'inactive'`(제어센터/통화 배너 등 일시 상태)는 제외 — 과호출 방지.
- runCloudSync 의 ready·authUser·busy 가드 덕에 호출은 항상 안전(미충족이면 no-op).
- 리스너는 runCloudSyncRef 정의 이후 별도 effect 로 둠(기존 notif AppState effect 와 분리,
  선언 순서/TDZ 문제 회피).

## 테스트 (회귀)
- `__tests__/App.cloudsync.test.tsx`: 로컬-전용 런 + 원격 빈 상태에서 mount→settle 후
  AppState 'background' 발화 → push 호출이 추가로 늘어야 통과. captureAppStateHandlers 로
  'change' 리스너를 모아 발화. **effect 무력화 시 실패 / 복원 시 통과** 직접 확인(✕→✓).

## 검증
- tsc clean. 변경 파일 신규 eslint 에러 0(잔존 2 = createChallenge/deleteChallenge pre-existing).
- App.cloudsync 3/3 통과. 디바운스/부팅 동기 회귀 없음.

## 메모
- Firestore(@react-native-firebase) 오프라인 영속은 기본 on 이라, push(setDoc)만 한 번 걸리면
  네트워크 복구 시 SDK 가 자동 재전송한다 — 별도 앱레벨 재시도 큐는 불필요(앱상태 트리거로 충분).
- 3개 동기/추적 수정(GPS bg / 부팅 클로버 / 앱상태 flush) 모두 기기 검증 대기
  ([[solemate-gps-background-tracking]]).
