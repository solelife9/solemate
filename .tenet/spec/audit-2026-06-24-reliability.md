# 선제 신뢰성 감사 — 핵심 경로 (2026-06-24)

워크플로우(keego-reliability-audit, 16 에이전트) 결과. 5개 차원 병렬 감사 → 각 발견 적대적 검증.
확인 9건(거짓양성/중복 2건 기각). 이미 고친 3버그(GPS bg / 부팅 클로버 / AppState flush)와 별개.
미수정 — 우선순위는 사용자 결정.

## HIGH
1. **GPS 공백 후 300m 초과 세그먼트 영구 거부 → 거리 런 끝까지 동결** (run-lifecycle)
   `lib/runTracker.ts:319-336` + `lib/geo.ts:50` + `engineConstants.ts:19`. 거리 cap(0.3km) 초과로
   거부 시 lastGood 가 전진하지 않아(주석 'other rejections preserve last-good'), 주자가 계속 멀어지면
   매 fix 가 영구 300m 초과 → 거리계 정지. 회원님이 겪은 과소계상의 형제. **Fix:** cap 거부 시
   거리만 버리고 lastGood 앵커는 새 fix 로 전진.
2. **동기 왕복(syncMerge await) 중 추가/편집/삭제한 런이 머지 덮어쓰기로 영구 유실** (cloud-sync)
   `App.tsx:1022/928`. applyBackupPayload 가 setRuns(rPart.live) '전체 교체'(비함수형)라, await 도중
   prepend 된 신규 런이 사라짐. busy 가드로 구제도 안 됨. 부팅 클로버(고침)와 별개. **Fix:**
   setRuns/setShoes 를 함수형으로 — merged 에 없는 신규 로컬 id 보존.

## MEDIUM
3. **공백 가로지른 세그먼트가 채택돼 거리는 더해지는데 그 시간은 stall 로 빠져 페이스 비현실적 과대**
   (run-lifecycle) `runTracker.ts:277-280 vs 319-329, getElapsed 365`. 거리·시간 비일관. **Fix:** stall
   적립을 채택 결과 이후로, 거리 0(거부)인 공백만 stalledMs 적립.
4. **삭제 후 800ms 디바운스 창 안에 종료/크래시 → 삭제한 런·신발이 재부팅 시 부활** (data-integrity)
   `App.tsx:624-637/844-864/758-766/497-508`. 부팅캐시가 묘비 미적용. **Fix:** deleteRun/deleteShoe 가
   부팅캐시를 동기 갱신하거나, initUser 가 tombstones 로 부팅 라이브를 필터.
5. **레거시 pending 큐 런 삭제 시 removePendingRun 미호출 → 부팅 overlay 로 부활** (data-integrity)
   `App.tsx:844-864/626-628`. **Fix:** deleteRun 에서 pending 이면 removePendingRun 호출 + undo 에 포함.
6. **권한 회수 배너의 유일 탈출(설정 재허용)이 무효 — 재허용 후 돌아와도 추적 미재개** (perm)
   `App.tsx:1879-1916,2151`. **Fix:** 런 화면 AppState 'active' 에서 권한 재확인 → granted 면 permLost
   해제 + 트래킹 재무장.
7. **포그라운드 watch 실패 시 백그라운드 추적까지 통째로 죽는 경로 무검증 — 버그#1 형제** (tests-false-green)
   `locationService.ts:134`. **Fix:** watchPositionAsync 를 try/catch 로 감싸 실패해도 background task
   는 시작. 테스트 케이스(watch reject→bg task 시작) 추가.

## LOW
8. **REST→Firestore 일회성 이관 setDoc 전체 덮어쓰기가 동시 runCloudSync push 클로버 → progression/settings 유실** (cloud-sync)
   `App.tsx:1055/1071`. **Fix:** 이관 push 도 syncMerge 로, 또는 이관 완료/bootState ready 후로 게이팅.
9. **editRun 이 부팅캐시 동기 갱신 안 함 → 편집 후 800ms 내 종료 시 편집 유실** (data-integrity)
   `App.tsx:828-832/497-508`. **Fix:** editRun 도 부팅캐시 동기 반영(persistRunToCache 교체판).

## 권장 수정 순서
HIGH 2건(#1 거리동결, #2 동기 클로버) → 데이터 부활/유실 MEDIUM(#4,#5,#9) → UX 막다른길(#6) →
페이스 왜곡(#3) → 테스트 빈틈(#7) → 이관 경합(#8). 전부 회귀 테스트 동반(수정無→실패 확인).
