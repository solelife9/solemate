# Decomposition: Audit Hardening (autonomous, 5 묶음 순차)

delivery_mode: autonomous. 묶음 사이 integration_test(report_only) 체크포인트로 게이트. 각 묶음 마지막 dev 잡이 자기 묶음 수용테스트(`tests/acceptance/audit-hardening.test.ts`)의 it.todo를 실제 단언으로 교체.

## ASCII DAG
```
A. P0 데이터(REST 정본)
  a1-updatedat-merge ─→ a2-tombstone ─→ a3-bootcache-offline ─→ a4-fcm-wire ─┐
                                                                    e2e-A (report_only)
B. 런플로우+햅틱+a11y                                                          │
  b1-haptics-lib ─→ b2-runflow-theme ─→ b3-countdown-onboarding ──────────────┤
                                                                    e2e-B      │
C. 폼+피드백                                                                   │
  c1-toast ─→ c2-delete-undo ─→ c3-forms ─→ c4-refresh ───────────────────────┤
                                                                    e2e-C      │
D. 코드품질                                                                    │
  d1-types ─→ d2-dedup ─→ d3-perf ────────────────────────────────────────────┤
                                                                    e2e-D      │
E. 디자인시스템                                                                │
  e1-button ─→ e2-primitives ─→ e3-type-tokens ───────────────────────────────┤
                                                                    e2e-E (FINAL, 전체 수용)
```
각 묶음 e2e는 다음 묶음 첫 dev 잡의 선행. (a4→e2e-A→b1→…→e2e-D→e1→…→e2e-E)

## Interface Contracts
- `updatedAt:number`(epoch ms) — 모든 신발/런 레코드 선택필드. mutation마다 갱신. `cloudSync.recordUpdatedAt`가 읽음.
- `deleted?:boolean` + `updatedAt` — tombstone. `mergeRecords`가 동률/존재 시 최신 deleted를 존중, UI 필터는 `!deleted`.
- `storage_schema_version`(키) — number. 부팅 시 < 목표버전이면 1회 마이그레이션(기존 레코드에 `updatedAt=Date.now()` 시드). 멱등·비파괴, 실패 시 마이그레이션 스킵+로그(데이터 불변, 부팅 비차단).
- `lib/haptics` — `{ tap(), success(), warning(), countdownBeat(), go(), impactHeavy() }` (Vibration 기반, 설정으로 on/off). 호출부는 import 후 의미메서드만 사용.
- `lib/toast` — `showToast({message, actionLabel?, onAction?, durationMs?})` + `<ToastHost/>`(App 루트). undo는 onAction 콜백.
- 클라우드→REST 역등록 멱등성: 머지 후 REST 미존재(id 매칭 실패) 레코드만 `apiAdd*`; 성공 시 서버 id로 reconcile해 재동기화 시 중복 POST 금지.

## Jobs
### 묶음 A — P0 데이터 정합성 (REST 정본)
- **a1-updatedat-merge** (dev, deps: []): 모든 신발/런 mutation(addRun/editRun/addShoe/updateShoeMaxKm/retireShoe 등 App.tsx + lib)에서 `updatedAt=Date.now()` 스탬프. `lib/cloudSync.mergeRecords`의 최신우선 로직이 실데이터에 작동하도록 보장(이미 로직 존재, updatedAt 부재가 원인). `storage_schema_version` 키 + 부팅 1회 마이그레이션(기존 레코드 updatedAt 시드, 멱등·비파괴·실패시 스킵). 단위테스트: 충돌 머지 최신승리, 스탬프 존재, 마이그레이션 비파괴.
- **a2-tombstone** (dev, deps: a1): 삭제를 `deleted:true+updatedAt` 묘비로. `mergeRecords` 합집합이 tombstone 존중(부활 금지), UI는 `!deleted` 필터. 삭제 전파 단위테스트 + 부활방지 anti-test.
- **a3-bootcache-offline** (dev, deps: a2): 모든 mutation 후 부팅캐시(cache_shoes_v1/cache_runs_v1) 갱신(디바운스), 오프라인 부팅 분기가 `loadPendingRuns()` 오버레이. 클라우드 머지에서 REST 미존재 레코드를 `apiAddShoe/apiAddRun`로 역등록(멱등: id 매칭 실패분만, 성공시 reconcile). 테스트: 오프라인 부팅 가시성, 역등록 중복방지.
- **a4-fcm-wire** (dev, deps: a3): 앱측 FCM 토큰 취득(`initPushMessaging`)을 부팅/로그인에 배선 + 포그라운드 핸들러 등록 + onTokenRefresh. 토큰을 `fcm_token_pending` 키에 영속, 등록 엔드포인트 부재 시 graceful no-op(부팅 비차단). **본 잡이 묶음 A 수용 it.todo를 실제 단언으로 교체.** 테스트: 토큰배선 실패가 부팅 안 막음.
- **e2e-A** (integration_test, report_only, deps: a4): 묶음 A 수용 테스트 + 전체 jest 실행, tsc/lint 확인, 보고만.

### 묶음 B — 런플로우/온보딩 통합 + 햅틱 + 접근성
- **b1-haptics-lib** (dev, deps: e2e-A): `lib/haptics`(RN Vibration 래퍼, 의미메서드, 설정 on/off) 신설 + 단위/스파이 테스트. 새 네이티브 의존성 금지.
- **b2-runflow-theme** (dev, deps: b1): RunActiveScreen/RunGoalScreen/RunCountdownScreen 사설 팔레트(`C`) 제거→`theme.ts` 토큰(red/green/bg/font 단일화, 값보존), 햅틱 배선(카운트다운 비트/GO/시작/일시정지/재개/목표달성/길게눌러종료), a11y 라벨·role·live-region. 다크+오렌지 시각 동등 유지. 행동/정적스캔 테스트.
- **b3-countdown-onboarding** (dev, deps: b2): OnboardingScreen 사설 팔레트(`KG`)→theme, `BebasNeue`→DISPLAY, "이미 계정이 있나요? 로그인" 링크 동작버그 수정(실제 로그인 경로 또는 적절 처리), a11y. **본 잡이 묶음 B 수용 교체.** 정적스캔(C/KG/BebasNeue 0)+행동 테스트.
- **e2e-B** (integration_test, report_only, deps: b3): 묶음 A+B 수용 + 전체 jest, 보고만.

### 묶음 C — 폼 + 피드백
- **c1-toast** (dev, deps: e2e-B): `lib/toast`+`<ToastHost/>`(커스텀 Animated 오버레이, undo 액션, 라이브러리 0) App 루트 배선 + 테스트.
- **c2-delete-undo** (dev, deps: c1): 런/신발 삭제를 undo 토스트로(undo 시 레코드+사이드키 route_/time_/surface_/splits_ 완전 복원, updatedAt 보존, tombstone 되돌림). 부분복원 anti-test.
- **c3-forms** (dev, deps: c2): RunForm(HistoryScreen)·AddShoe에 `KeyboardAvoidingView` + 입력 마스킹(`MM:SS`,`YYYY-MM-DD`) + 인라인 검증(Alert 대신 필드 헬퍼텍스트). 네이티브 피커 금지(JS-only). 행동 테스트.
- **c4-refresh** (dev, deps: c3): Home/History `RefreshControl`(동기화 재시도) + 마지막 동기화 시각 칩. **본 잡이 묶음 C 수용 교체.** 테스트.
- **e2e-C** (integration_test, report_only, deps: c4): A+B+C 수용 + 전체 jest, 보고만.

### 묶음 D — 코드 품질
- **d1-types** (dev, deps: e2e-C): `lib/api.ts`(Promise<any>→BackendShoe/BackendRun, 페이로드 PendingRun) + `lib/stats.ts`(any[]→RunRow) 타입화. 동작 불변, 타입 테스트.
- **d2-dedup** (dev, deps: d1): `TIER_LABEL`→`theme.ts` 단일화(3화면 복붙 제거), `MM:SS` 포맷터→`lib/format.fmtTime` 재사용, `YYYY-MM(-DD)` 빌더→`lib/format` 단일화. 호출부 갱신. 회귀 테스트.
- **d3-perf** (dev, deps: d2): HistoryScreen 런 리스트 `FlatList`(keyExtractor), ProfileScreen 렌더마다 `JSON.stringify(backupData)` 제거(memo/경량 시그니처), sanitizer `any→unknown`. **본 잡이 묶음 D 수용 교체.** 테스트.
- **e2e-D** (integration_test, report_only, deps: d3): A~D 수용 + 전체 jest, 보고만.

### 묶음 E — 디자인 시스템 통합
- **e1-button** (dev, deps: e2e-D): 단일 `Button`/CTA 프리미티브(그라데이션·glow·radius 토큰화), `MockupButton`·인라인 CTA 그라데이션·`backgroundColor:ACCENT` 사각형 제거, 전 CTA 호출부 교체. 시각 동등.
- **e2-primitives** (dev, deps: e1): `Card` 프리미티브 채택 + 단일 보더 토큰(withAlpha(T1,.07)), `SegmentedControl`·`StatGrid` 프리미티브 신설 후 4개 탭스트립/스탯그리드 교체.
- **e3-type-tokens** (dev, deps: e2): `TYPE` 프리셋 앱 전역 적용, 명명된 hero 사이즈 + screen-padding + scrim 토큰 도입, 반px 사이즈 제거. **본 잡이 묶음 E 수용 교체.** 정적스캔 테스트.
- **e2e-E** (integration_test, report_only, deps: e3, FINAL): 전체 수용(A~E) + 전체 jest + tsc/lint, 최종 보고.

총 17 dev + 5 integration_test = 22 잡.
