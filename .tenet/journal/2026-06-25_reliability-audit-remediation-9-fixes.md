# 선제 신뢰성 감사 — 확인 9건 전부 수정 (2026-06-25)

감사([[../spec/audit-2026-06-24-reliability]], 워크플로우 16에이전트)에서 적대적 검증으로
확인된 9건을 전부 수정. 각 수정은 회귀 테스트 동반(가능한 경우 '수정 없이 실패' 직접 확인).
그룹별 커밋. iron law(데이터 파괴/거리·시간 유실 금지) 우선.

## HIGH
- **#1 GPS 공백 후 거리계 동결** (a9533fe) — 거리 cap(300m) 초과 거부 시 정확·정상속도 fix면
  거리는 미계상하되 lastGood 앵커를 전진(re-anchor). 단 한 번의 긴 공백 뒤 거리계가 런 끝까지
  멈추던 과소계상 해소. `lib/runTracker.ts` + `engineConstants` import.
- **#2 동기 await 중 추가/편집 유실** (847300f) — applyBackupPayload 를 함수형 보존 머지로
  (reconcileLivePreservingLocal). 동기 왕복 중 저장/편집분이 '전체 교체'로 사라지던 유실 차단.

## MEDIUM
- **#3 공백 채택 세그먼트 페이스 왜곡** (a9533fe) — stall 적립을 '거리 채택 여부' 기준으로
  조건화(willCount). 채택된 공백 시간은 elapsed 에서 빼지 않음(거리·시간 일관). 적립을
  auto-pause early-return 앞으로 옮겨 정지 유발 fix 의 직전 공백도 일관 처리.
- **#4 삭제 후 종료 시 부활** (d945a1c) — initUser 가 부팅 라이브를 묘비(동기 영속)로 필터 +
  deleteRun 이 캐시 즉시 제거. 800ms 디바운스 창 종료 시 부활 차단.
- **#5 펜딩 큐 런 삭제 부활** (d945a1c) — deleteRun 이 removePendingRun 호출 + undo 에 담아
  overlayPendingRuns 부활 차단·완전복원.
- **#6 권한 회수 배너 탈출구 무효** (2c4bd8e) — runTracker.resumeFromPermissionRevoked() +
  hasForegroundPermission() + 런 화면 AppState 'active' 재확인 → 재허용 복귀 시 거리 보존
  재개(공백은 pausedMs 흡수, elapsed 점프 없음).
- **#7 watch 실패 시 bg 추적 동반 사망** (96d7137) — watchPositionAsync 를 try/catch 격리해
  실패해도 background updates task 는 반드시 시작.

## LOW
- **#9 editRun 부팅캐시 미갱신** (d945a1c) — editRun 이 persistRunToCache 로 편집본 즉시 upsert.
  (현재 편집 UI 진입점 부재로 통합 구동 불가 — tsc + 동일 캐시 헬퍼로 보증.)
- **#8 REST 이관이 동시 동기 클로버** (323c07d) — 이관 시드를 setDoc 덮어쓰기 대신 syncMerge
  (트랜잭션 union)로 + bootState ready 게이팅. 동시 push 와 경합해도 비파괴.

## 검증
- tsc clean. 변경 파일 신규 eslint 에러 0(잔존 2 = createChallenge/deleteChallenge pre-existing).
- 신규/변경 회귀 테스트 전부 통과. 전체 run 신규 결정적 실패 0(잔존 red 4스위트 =
  injury.warning/ShoesScreen/App.shoefirst/App.shoe 옛 락커 동선 obsolete, 카운트 1/2/1/2 동일).
  합쳐 돌리면 App.goals 등 기존 jest 인프라 flaky — 단독 통과로 확인.

## 메모
- 3개 추적/동기 수정 세트(GPS bg / 부팅 클로버 / AppState flush)에 더해 이번 9건까지 모두
  기기 검증 대기 — 재빌드 후 실주행 + 권한 회수→재허용 + 삭제→재시작 시나리오 확인 필요.
- #9 편집 UI 진입점 복원 시 통합 테스트 추가 권장.
