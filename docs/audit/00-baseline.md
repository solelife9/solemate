# 00 — 출시 전 전면 재감사 · 기준선 (Baseline)

> 작성 2026-07-29 · 기준 커밋 `743d2ca` (main, 워킹트리 clean)
> **이번 세션은 파악만 한다 — 코드 수정 0.**
> 판정 근거는 **오직 현재 코드**다. 감사 문서·저널·체크리스트가 "수정 완료"라고 적어둔 것도
> 전부 파일을 열어 대조했고, 문서와 코드가 어긋난 곳은 그렇게 표기했다.
> 심각도: `BLOCKER` 출시 불가 · `MAJOR` 이탈/나쁜 리뷰 · `MINOR` 출시 후 · `NITPICK` 취향

## 게이트 실측치 (이 커밋에서 직접 실행)

| 게이트 | 결과 |
|---|---|
| `npx tsc --noEmit` | **0 에러** ✅ |
| `npm run lint` | **0 에러 / 337 경고** (허용 상한 338 — 여유 1) ⚠️ |
| `npm test` | **248 스위트 · 2572 테스트 전부 통과** ✅ (2026-07-30 재측정) |
| `npm run test:rules` | **36/36 통과** (에뮬레이터, 2026-07-30) |
| git 워킹트리 | clean |

> **정정(2026-07-30).** 최초 측정에서 `__tests__/HistoryScreen.shareCard.test.tsx` 1건이
> 실패해 "Iron Law 위반 · main이 red"로 적었으나 **이는 결정적 실패가 아니라 flaky였다.**
> 이후 연속 5회 전량 실행에서 모두 그린이었고(`--silent` 유무와 무관), 리더보드 수정
> 이후 재측정에서도 248/2572 전부 통과했다. **main은 red가 아니다.**
> 다만 그 스위트가 간헐적으로 깨진다는 사실 자체는 유효하다 — 워커 순서·타이밍 의존으로
> 보이며 출시 전에 원인을 잡아야 한다. `MINOR`(상시 red 아님)

---

# [1] 과거 감사 지적 항목 판정표

판정: **[해결됨]** 코드로 확인 · **[미해결]** 코드로 부재 확인 · **[부분]** 일부만 · **[확인불가]** 코드만으로 판정 못 함(실기기/콘솔/외부 의존)

## 1-A. `audit-2026-05-31.md` — 전수 갭 감사

### P0 (10건)

| # | 지적 | 판정 | 근거 (코드) |
|---|---|---|---|
| 1 | 백그라운드 트래킹 부재 (Android 권한·서비스 없음, 화면 off 시 GPS 정지) | **해결됨** | `lib/locationService.ts:65-76` 전역 `TaskManager.defineTask` + `:165-176` `startLocationUpdatesAsync`(`activityType: Fitness`, `pausesUpdatesAutomatically:false`, foregroundService). `android/app/src/main/AndroidManifest.xml:23-25` `FOREGROUND_SERVICE`·`FOREGROUND_SERVICE_LOCATION`·`ACCESS_BACKGROUND_LOCATION`. `ios/SoleMate/Info.plist:115-117` `UIBackgroundModes: location`. **단, 실기기 검증은 별개**(아래 확인불가 항목) |
| 2 | 크래시/킬 시 런 전손 (in-memory only) | **해결됨** | `lib/runPersistence.ts:24` `SNAPSHOT_KEY='active_run_snapshot'`, `:29` `ROUTE_KEY`, `:189 saveSnapshot` / `:210 loadSnapshot` / `:156 isResumable`. `lib/runTracker.ts:355` 일시정지 시 `persist({force:true})` |
| 3 | 저장 네트워크 실패 시 완주 런 소실 | **해결됨** | `App.tsx:867-899 addRun` — 사이드키 영속 → `persistRunToCache` → 낙관적 `setRuns`. 네트워크 왕복이 저장 경로에 없다(REST 제거). 사이드키 write 실패도 `catch`로 삼키고 캐시에 route를 대신 남긴다(`:891-897`) |
| 4 | `pausedMs` 폭주 버그 | **해결됨** | `lib/runTracker.ts:363-370 exitPause` — `pauseStartMs>0`일 때만 누적하고 즉시 `0`으로 리셋(`// guard: never double-count one pause window`) |
| 5 | 거리 하한 3m가 일반 페이스 과소계상 | **해결됨(재튜닝 중)** | `lib/engineConstants.ts:16` `MIN_SEG_DIST_KM=0.001`(1m). 다만 실효 하한은 `:39 PHANTOM_ACC_FLOOR_FACTOR=0.6`에 비례 — 이 값은 0.35→0.8→0.5→0.6으로 세 번 바뀌었고 주석이 **"다음 실측 러닝으로 검증해야 한다"**고 스스로 적어둔 미확정 값이다 |
| 6 | accuracy 미필터 → 유령거리 | **해결됨** | `lib/engineConstants.ts:7` `MAX_FIX_ACCURACY_M=20`, `:10 WARMUP_FIXES=3`, `:13 MAX_SEG_SPEED_MPS=12`, `:42 MAX_SEG_DIST_KM=0.3`. `lib/runTracker.ts:548-612`에서 전부 적용 |
| 7 | 신발 `total_km` 미영속·매 렌더 재계산 (중복 파생) | **해결됨** | `lib/shoe.ts:117-138 shoeHealth(shoe,runs)` 단일 순수함수. 서버 `total_km`과 클라이언트 파생값의 `Math.max`(스테일 방어). 화면 호출부 4곳 전부 이 함수 경유 |
| 8 | 순수 로직 전부 `App.tsx`에 갇힘 | **해결됨** | `lib/` 118개 모듈로 추출(`geo`·`format`·`stats`·`shoe`·`kalman`·`runTracker`·`autoPause`·`stepCadence` 등). 러닝 엔진은 `screens/RunEngine.tsx`로 분리 |
| 9 | 로딩/에러 상태 부재 | **해결됨** | `screens/BootStates.rn.tsx` + `App.tsx:1899-1903` `bootState==='loading'→BootSkeleton` / `'error'→BootError(onRetry)` |
| 10 | 디자인 스케일 부재 (spacing/radius/type 토큰 없음) | **해결됨** | `theme.ts` 26KB — `TYPE`·`RADIUS`·`GUTTER`·`ICON`·`MOTION`·`GLASS` 토큰. `tests/acceptance/slice-3-design.test.ts`가 하드코딩 폰트 회귀를 막는다 |

### P1 — shoe-first 차별점

| 지적 | 판정 | 근거 |
|---|---|---|
| 은퇴/보관 (cascade 삭제 자기모순) | **해결됨** | `lib/shoe.ts:140 isRetired` · `RetirementFlow.rn.tsx`(31KB) · `ShoeArchiveScreen.rn.tsx` · `App.tsx:2095` 보관함에서 `retireShoe(id,false)` 복원 |
| 검증 수명 기반 비례 교체 경고 | **해결됨** | `lib/shoe.ts:71-84 wearTier` 4단계(50/80/90%) + `:103 conditionForPercent` 3단계 + `:164-181 weightDurabilityFactor`(체중 65kg 기준 보정) |
| "오늘은 이 신발" 로테이션 추천 | **해결됨** | `lib/rotation.ts`(runType→카테고리 매칭) · `lib/shoeRecommend.ts` · `RotationInsightPanel.tsx` |
| 신발 상세 → 바로 "이 신발로 달리기" | **해결됨** | `ShoesScreen.rn.tsx:633 onStartRun?: (id:string)=>void` 배선 |
| per-shoe 마지막 착용·cost-per-km·구매일 | **해결됨** | `App.tsx:1766-1773` `lastWornDate`→`shoeTotals.lastWorn`, `:789` 원/km 계산(가격 있을 때만) |
| 개별 런 편집/삭제 + 수동 런 입력 | **해결됨** | `HistoryScreen.rn.tsx:164-220` 단일 폼(추가/편집), `:922-934 onAddRun/onEditRun/onDeleteRun`. `App.tsx:900+ addManualRun(source='manual')` |
| PR(개인기록) · 런 타입 | **해결됨** | `lib/records.ts:29 personalRecords`·`:80 detectPRs`, `lib/distancePBStore.ts`, `lib/bestEfforts.ts`. 런 타입은 `lib/rotation.ts:66-80 RunType(easy/tempo/long/recovery/race)` |

### P1 — 엔진/UX

| 지적 | 판정 | 근거 |
|---|---|---|
| 권한 거부/주행중 회수 graceful 처리 | **해결됨** | `lib/locationService.ts:106 hasForegroundPermission`·`:117 isPermissionError`, `screens/RunEngine.tsx:426-427` AppState active에서 재확인 후 `runTracker.resumeFromPermissionRevoked()` |
| iOS 권한요청 자체 없음 | **해결됨** | `lib/locationService.ts:84-101 requestRunPermissions` + `LocationPrimeScreen.rn.tsx` 사전 안내 화면 |
| GPS 死구간 시간만 누적 | **해결됨** | `lib/engineConstants.ts:95-99 GPS_STALL_THRESHOLD_MS=8000` + `lib/runTracker.ts:497-498 stalledMs` 적립, `:159 NO_FIX_WARN_SEC=60` 무신호 안내 |
| 케이던스 60s 윈도우 초기 과소·라벨 모호 | **해결됨** | `lib/engineConstants.ts:136-140` `CADENCE_WINDOW_MS`/`CADENCE_MIN_WINDOW_MS=3000` + 분당 정규화(주석 audit#14) |
| **200점 route 단순 데시메이션(RDP 권장)** | **미해결** | `lib/geo.ts:86-91 simplifyRoute` — 여전히 **균등 스트라이드**(`Math.floor(i*(len-1)/(max-1))`). RDP 아님. `screens/RunEngine.tsx:747`에서 200점으로 호출. 코너가 많은 코스에서 경로 모양이 뭉개진다 `MINOR` |
| 주간 통계 UTC/로컬 날짜 불일치 | **해결됨** | `lib/format.ts:41 ymdLocal`(로컬 시각 파생, 주석에 `audit#11 fix` 명시) → `lib/stats.ts:108-127`이 이걸 쓴다 |
| 접근성: SR 라벨 전무 | **부분** | `accessibilityLabel`이 20개 파일에 분포(ProfileScreen 32·HistoryScreen 26·RunGoal 10 …). 반면 `CelebrationScreen`·`ChallengesSection`·`FuelGauge`·`DialogHost`는 1개뿐 — 커버리지가 화면마다 크게 다르다 `MINOR` |
| 접근성: Dynamic Type 미지원 | **해결됨** | `lib/text.tsx` — RN `Text` 래퍼가 폰트 스케일 상한을 씌운다(ESLint로 직접 `Text` 사용 금지 강제) |
| 접근성: T3 `#8E8E93` 대비 미달 | **해결됨** | `theme.ts` T3 = `#9C9CA3`로 상향(CLAUDE.md 디자인 원칙과 일치) |
| 숫자+단위 cramping → `<Metric>` | **해결됨** | `primitives.tsx:1168 export function Metric` |
| 런 버리기 무확인 | **해결됨** | `lib/dialog.ts:63 showDialog` + `DialogHost.tsx` 커스텀 확인 다이얼로그 |
| safeArea 대신 `paddingTop:60` | **해결됨** | `react-native-safe-area-context ^5.7.0` 채택, `lib/responsive.ts` |

### P2 — 폴리시/정리

| 지적 | 판정 | 근거 |
|---|---|---|
| 죽은 deps (`@react-navigation/*`·`react-native-screens`·`rxjs`) | **해결됨** | `package.json`에 전부 부재. 회귀 가드 `__tests__/crosscut.polish.test.tsx:249` |
| ErrorBoundary 없음 | **해결됨** | `ErrorBoundary.tsx` + `App.tsx:15,224-226` 루트 래핑 |
| `console.log`로 실패 은폐 | **해결됨** | 프로덕션 소스 전체 2건. `babel-plugin-transform-remove-console` 적용 |
| `lib/api.ts`·`lib/stats.ts` `any` 남용 | **해결됨** | `lib/api.ts` 파일 자체가 삭제됨(REST 제거). `lib/stats.ts`에 `: any`/`as any` **0건** |
| `TIER_LABEL` 중복 정의 | **해결됨** | `theme.ts:161` 단일 정의, 사용처는 import만 |
| `substr` deprecated | **미해결** | `App.tsx:701` `Math.random().toString(36).substr(2,9)` 1건 잔존 `NITPICK` |
| 프로필 이름 하드코딩 '러너' | **부분** | `ProfileScreen.rn.tsx:62` `DEFAULT_PROFILE.name='러너'`. 다만 이제 사용자 입력 이름(`profile_name`)이 있고 `:550,563`에서 `profile?.name || '러너'` 폴백 — **가짜 어포던스가 아니라 정직한 기본값**이므로 실질 해소 |
| AddShoe 기본 max=500 | **해결됨** | `lib/shoe.ts:85 DEFAULT_MAX_KM=600` + `:148-153 clampMaxKm(100~2000)` 단일 출처 |

---

## 1-B. `2026-06-17-audit-hardening.md` — Success Criteria 10개

> ⚠️ **이 스펙의 최상위 전제가 지금 무효다.** "단일 진실원천 = REST 백엔드, Firestore는
> 백업 전용으로 강등" (§핵심 아키텍처 결정)은 2026-07-17 완전히 뒤집혔다 — REST는 코드째
> 삭제되고 Firestore가 정본이 됐다. 그래서 아래 판정은 "메커니즘이 살아 있는가"로 읽어야 한다.

| # | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | 모든 mutation이 `updatedAt` 기록, 충돌 시 최신 승리 | **해결됨** | `lib/cloudSync.ts:59 stampUpdatedAt`·`:211 mergeRecords`(updatedAt 큰 쪽 채택). `App.tsx`에 `updatedAt` 17회 |
| 2 | 삭제 레코드가 머지 후 부활 안 함 (tombstone) | **해결됨** | `lib/cloudSync.ts:75 markDeleted`·`:105 partitionTombstones`·`:158 unionTombstones`. 동률이면 tombstone 우선(`:233`) |
| 3 | 백엔드 다운 중 추가한 런이 강제종료 후에도 보임 | **해결됨** | `lib/runPersistence.ts:266 overlayPendingRuns`·`:293 loadPendingRuns` + 부팅캐시 |
| 4 | `lib/haptics` 존재 + 런 경로 배선 | **해결됨** | `lib/haptics.ts` + 8개 프로덕션 파일이 import(App·RunEngine·RunActive·RunGoal·Celebration·Profile·primitives·watchSession) |
| 5 | Run*/Onboarding에 사설 팔레트(`C`/`KG`)·`BebasNeue` 0 | **해결됨** | 프로덕션 소스에 `BebasNeue` 0건(`theme.ts:194` 히스토리 주석뿐). 회귀 가드 `tests/acceptance/audit-hardening.test.ts:349` |
| 6 | 삭제 액션이 undo 토스트 + 복원 | **해결됨** | `lib/toast.ts` + `ToastHost.tsx`, `App.tsx:963` 삭제 시 `removePendingRun`을 undo에 포함 |
| 7 | `lib/api.ts`·`lib/stats.ts` `any` 0, `TIER_LABEL` 1곳 | **해결됨** | 1-A P2 참조 |
| 8 | HistoryScreen 런 리스트 `FlatList` | **해결됨** | `HistoryScreen.rn.tsx` `FlatList` 5회 |
| 9 | 단일 `Button` 프리미티브, `MockupButton` 제거 | **해결됨** | `MockupButton.rn.tsx` 파일 부재, `primitives.tsx:541` 주석이 통합 이력 기록 |
| 10 | `tsc` 0 · `lint` 0 error · `test` green | **미해결** | tsc·lint는 통과. **test 1건 red**(위 게이트 표) |

---

## 1-C. `audit-2026-06-24-reliability.md` 9건 + 저널의 "전부 수정" 주장 대조

> 저널 `2026-06-25_reliability-audit-remediation-9-fixes.md`는 9건 전부 수정을 주장한다.
> 전부 코드에서 직접 확인했다 — **주장과 코드가 일치한다.**

| # | 지적 | 저널 주장 | 코드 판정 | 근거 |
|---|---|---|---|---|
| 1 (HIGH) | GPS 공백 후 300m 초과 거부로 거리계 영구 동결 | 수정(a9533fe) | **해결됨** | `lib/runTracker.ts:589-601` — cap 초과여도 정확·정상속도 fix면 거리는 버리되 `lastGood`/`lastGoodMs`를 전진(re-anchor). 주석에 `(#1)` 명시 |
| 2 (HIGH) | `applyBackupPayload`의 전체 교체로 동기 중 추가/편집 유실 | 수정(847300f) | **해결됨** | `lib/cloudSync.ts:173 reconcileLivePreservingLocal` + `App.tsx:1077,1082` 함수형 updater로 호출 |
| 3 (MED) | 공백 채택 세그먼트 페이스 과대 | 수정(a9533fe) | **해결됨** | `lib/runTracker.ts:484-498` — `willCount` 선판정 후 **거부된 공백만** `stalledMs` 적립 |
| 4 (MED) | 삭제 후 800ms 내 종료 시 부활 | 수정(d945a1c) | **해결됨** | `App.tsx:162 K_TOMBSTONES`·`:743` 부팅 라이브를 동기 영속 묘비로 필터, `:1068-1069 partitionTombstones` |
| 5 (MED) | 펜딩 큐 런 삭제 시 `removePendingRun` 미호출 | 수정(d945a1c) | **해결됨** | `App.tsx:963` `if(q.some(...)) await removePendingRun(sid)` |
| 6 (MED) | 권한 회수 배너 탈출구 무효 | 수정(2c4bd8e) | **해결됨** | `screens/RunEngine.tsx:426-427` AppState active → `hasForegroundPermission()` → `resumeFromPermissionRevoked()` |
| 7 (MED) | 포그라운드 watch 실패가 백그라운드까지 죽임 | 수정(96d7137) | **해결됨** | `lib/locationService.ts:153-161` `watchPositionAsync`를 try/catch 격리, 주석에 `(#7)` 명시 |
| 8 (LOW) | REST→Firestore 이관 `setDoc`이 동시 push 클로버 | 수정(323c07d) | **무효화(해결됨)** | REST 이관 코드 자체가 삭제됨. `lib/api.ts` 부재, `App.tsx:1208-1209`는 `port.syncMerge` 트랜잭션 경로 |
| 9 (LOW) | `editRun`이 부팅캐시 미갱신 | 수정(d945a1c) | **해결됨** | `App.tsx:923` `persistRunToCache(stampUpdatedAt({...target,...fields},editedAt))`. 저널이 "편집 UI 진입점 부재로 통합 구동 불가"라 적었으나 **지금은 진입점이 있다**(`HistoryScreen.rn.tsx:1091`) |

---

## 1-D. `docs/release-checklist.md` — 출시 게이트

| 항목 | 판정 | 근거 |
|---|---|---|
| 백엔드 Render 배포 | **무효화** | REST 전면 제거 확인(`lib/api.ts` 부재, `onrender.com` 프로덕션 소스 0건). 체크리스트 본문도 이미 해소로 표기 |
| 개인정보 처리방침 공개 URL | **확인불가** | `docs/privacy.html` 존재, `lib/legalLinks.ts`가 `solelife9.github.io/keego-legal/*`를 가리킨다. **GitHub Pages 실제 응답 여부는 코드로 판정 불가** `BLOCKER` |
| 실기기 QA 1회전 | **확인불가** | 코드 영역 아님 |
| Android 릴리스 서명 키 | **부분** | `.gitignore:34-35` `*.keystore` 제외(`debug.keystore`만 허용). 실제 `KEEGO_UPLOAD_*` 주입 여부는 `~/.gradle` — 확인불가 |
| iOS 권한 사용 설명 | **해결됨** | `ios/SoleMate/Info.plist:75-90` 8종 전부 한국어로 존재 |
| APNs/Push capability | **미해결** | `ios/SoleMate/SoleMate.entitlements` `aps-environment` = **`development`**. App Store 빌드는 `production` 필요 `BLOCKER`(Xcode 자동 서명이 치환하는지 실빌드로 확인 필요) |
| 시크릿 하드코딩 금지 | **해결됨** | `git ls-files -v`로 확인 — `lib/socialConfig.ts`·`lib/googleWebClientId.generated.ts`는 **skip-worktree(S)**이고 `git show HEAD:lib/socialConfig.ts`의 키는 전부 빈 문자열. 로컬 워킹 사본에만 실키가 있다 ✅ |
| 크래시 복구 '이어 달리기' 실기기 | **확인불가** | 엔진 시드는 `lib/runPersistence.ts`로 확인, GPS 재가동 연속성은 실기기 필수 |

---

# [3] 아키텍처 전환(REST → Firestore)이 만든 사각지대

기존 감사 3건은 전부 **"정본 = REST 백엔드(solelife-backend), Firestore = 암호화 백업 전용"**
전제로 쓰였다(`2026-06-17-audit-hardening.md` §핵심 아키텍처 결정에 명문화). 2026-07-17
그 전제가 통째로 뒤집혔다. 아래는 **어떤 기존 감사도 커버한 적 없는 영역**이다.

## 3-1. `BLOCKER` — 사용자 전체 데이터가 Firestore **문서 1개**에 들어간다 (1MB 하드 리밋)

REST 시절엔 신발·런이 각각 행(row)이었다. 지금은 다르다.

```
lib/firebaseCloudPort.ts:91-95
function payloadToDoc(data: BackupPayload) {
  const doc = { shoes: data.shoes, runs: data.runs, settings: data.settings };
  ...
}
```

`userBackups/{uid}` **단일 문서**에 신발 전량 + 런 전량이 배열로 들어가고, 그 런 레코드에는
**`route`(GPS 경로 JSON 문자열)가 포함**된다(`App.tsx:874` `route:route||''`).

- Firestore 문서 상한 = **1MiB**. 초과하면 write가 `INVALID_ARGUMENT`로 **실패**한다.
- 경로는 `simplifyRoute(...,200)`로 200점 캡(`screens/RunEngine.tsx:747`) → 런 1건당 대략 6~10KB.
  **런 100~150건이면 1MB에 닿는다.** 진지한 러너는 1년 안에 도달한다.
- 코드 어디에도 **크기 가드·분할·경고가 없다.** `lib/firebaseCloudPort.ts:141` 주석은 1MB 상한을
  *알고* 있으면서 시계열(runDetails)만 사이드카로 뺐고, **route는 본문에 남겼다.**
- 실패 시 동선: `App.tsx:1219` `catch(e){reportIssue('cloud sync',e);}` — **조용히 삼킨다.**
  사용자는 백업이 죽은 줄 모른 채 계속 달린다. 기기를 바꾸는 날 알게 된다.

> 기존 감사가 이걸 못 잡은 이유: REST에는 문서 크기 개념이 없었다. 이 결함은 전환으로 **새로 생겼다.**

## 3-2. ~~`BLOCKER`~~ **해결됨(2026-07-30, `767032e`)** — 진입점 없는 리더보드가 개인정보를 전원 공개 컬렉션에 계속 쓴다

> **조치:** `lib/featureFlags.LEADERBOARD_PUBLISH_ENABLED=false` 로 발행 차단(구현·화면은
> 삭제하지 않음), `firestore.rules` 읽기 전면 차단(`allow read: if false`), 이미 쌓인 문서
> 전량 삭제(`firebase firestore:delete` → REST API 로 잔량 0 검증), 규칙 배포 후 라이브
> 룰셋이 로컬 파일과 바이트 동일함까지 확인. 회귀 가드 `__tests__/leaderboardPublishFlag.test.ts`.
> **1.1 재개봉 조건:** 진입점 복원 + 명시적 옵트인 동의 + 처리방침 제3자 공개 조항 — 셋 다.
> 플래그만 켜면 규칙이 읽기를 막으므로 화면이 아무것도 못 읽는다(의도된 안전장치).
>
> 아래는 발견 당시 기록이다.

- `App.tsx:1219` — 클라우드 동기가 돌 때마다 **무조건** `publishMyRankingNow(merged)` 실행.
- 쓰는 내용: `nickname`, `rankTier`, `equippedTitle`, 월간 `distance`, `consistency`,
  `shoeHealth`, `collection`, `progressPoints` (`lib/progression/firestoreRankingStore.ts:143-167`).
- 규칙: `firestore.rules:64-71` — `allow read: if signedIn()` → **로그인한 아무나 전원 엔트리를 읽는다.**
- 그런데 **그 리더보드를 볼 화면이 앱에 없다.** `App.tsx:2083-2084`:
  `// 리더보드는 죽은 공간이다. onOpenHallOfFame 미주입이면 진척 화면이 버튼을 숨긴다.`
- 즉 **사용자가 존재조차 모르는 기능을 위해, 동의받지 않은 닉네임+운동량이 공개 저장소에 쌓인다.**

## 3-3. ~~`BLOCKER`~~ **해결됨(2026-07-30, `767032e`)** — 탈퇴해도 리더보드 엔트리는 영원히 남는다

> **조치:** `firestore.rules` 를 `allow delete: if signedIn() && request.auth.uid == uid` 로
> 바꿔 본인 삭제를 허용하고, `deleteAccount` 가 최근 24개월 엔트리 경로를 순회 삭제하도록
> 했다(읽기를 막아 목록 조회가 불가하므로 경로를 만들어 지운다 — 없는 문서 delete 는 no-op).
> 규칙 테스트 3건 신규(본인 삭제 허용·타인 삭제 거부·비로그인 삭제 거부).
> 참고: 기존 `if false` 의 명분이던 "순위 조작 방지"는 **원래도 작동하지 않았다** — 점수가
> 클라이언트 계산이라 update 로 덮어쓰면 그만이었다. 삭제 금지가 막던 건 조작이 아니라
> 파기였다. 실제 조작 방어는 1.1 의 서버 재계산 몫.
>
> 아래는 발견 당시 기록이다.

- `firestore.rules:70` — `allow delete: if false`. **본인도 못 지운다**(주석: "리더보드 무결성").
- `lib/firebaseCloudPort.ts:177-207 deleteAccount` — `userBackups/{uid}` + `runDetails` 하위 문서 +
  Firebase 계정은 지우지만 **`leaderboards/*/entries/{uid}`는 손대지 않는다.**
- `docs/privacy.html:102` — 「계정 정보(식별자·닉네임·이메일) — **회원 탈퇴 시까지**」.
- 결과: 탈퇴 후에도 닉네임+운동 통계가 남고, 규칙상 삭제 경로 자체가 없다.
  **공개된 처리방침 위반**이자 개인정보보호법 파기 의무 이슈다.
- 추가로 `docs/privacy.html`은 이 데이터가 **다른 이용자에게 공개된다**는 사실을 어디에도 고지하지 않는다
  (제3자 제공/공개 조항 없음).

## 3-4. `MAJOR` — 카탈로그·신호 컬렉션 3종은 어떤 감사에도 없었다 (**미고지 수집분 해결됨** 2026-07-30, `a020663`)

> **조치(고지 부분):** `search_misses`·`shoe_requests` 를 `docs/privacy.html` §2 수집 항목과
> §3 보유기간에 추가하고, 계정 식별자와 연결된다는 사실을 별도 문단으로 고지했다(바로 앞
> "앱 사용 기록은 계정 식별자와 연결하지 않는다" 문단과 모순되지 않도록). 공개 저장소
> `solelife9/keego-legal` 에 푸시해 라이브 반영까지 확인(시행일 2026-07-30).
> `docs/store-privacy-labels.md` 의 App Privacy/Play 답안에도 반영 — 초안이 "검색 기록
> 수집 안 함"으로 적어둬 그대로 제출하면 허위 신고가 될 상태였다.
>
> **남은 것:** `shoes` 카탈로그 컬렉션이 **프로덕션에 존재하지 않는다**(2026-07-30 REST 조회로
> 확인 — 루트 컬렉션은 `userBackups` 하나뿐). 원격 카탈로그 갱신 기능이 사실상 죽어 있고
> 앱은 번들 목록만 쓴다. `lib/shoeCatalogRemote.ts` 는 24시간마다 조회하지만 받을 게 없다.

전부 2026-07 신설. 기존 감사 3건은 이 존재를 모른다.

| 컬렉션 | 규칙 | 클라이언트 | 사각지대 |
|---|---|---|---|
| `shoes/{shoeId}` | `firestore.rules:85-88` read=signedIn, **write=false** | 읽기 `lib/shoeCatalogRemote.ts`, 쓰기 `services/shoes.ts`(admin 전용) | 쓰기가 admin SDK 스크립트 전제 — **운영 절차가 문서에만 있고 코드 게이트가 없다.** 앱에서 부르면 조용히 거부되고 `catch`로 삼켜진다 |
| `search_misses` | `:96-103` create only, read/update/delete 전부 금지 | `ShoePicker.tsx:118 logSearchMiss` | **사용자 검색어가 서버로 전송된다.** `docs/privacy.html` 제2조 수집항목 표에 이 항목이 **없다.** 미고지 수집 |
| `shoe_requests` | `:104-116` create only + `source ∈ {not_found, manual_add}` | `ShoePicker.tsx:79,128 requestShoe` | 사용자가 입력한 브랜드/모델 + `userId`가 전송된다. 마찬가지로 처리방침 미기재 |

추가로 `lib/shoeCatalogRemote.ts`는 24h 간격 증분 동기(`SYNC_INTERVAL_MS`)로 비용을 통제하지만,
**`shoes` 컬렉션 읽기가 `signedIn()`을 요구**한다 — 로그인 게이트가 있으니 지금은 문제없지만
익명 로그인을 켜는 순간(3-6) 재검토 대상이다.

## 3-5. `MAJOR` — 동기 실패가 전부 무음이다

REST 시절엔 HTTP 상태코드로 실패를 알 수 있었고 pending 큐가 UI에 노출됐다. 지금은:

- `App.tsx:1219` `catch(e){reportIssue('cloud sync',e);}` — 사용자에게 아무 신호가 없다.
- `lib/shoeCatalogRemote.ts` 설계 원칙 2 = "실패는 조용히 삼킨다"(의도적, 카탈로그는 부가기능이라 타당).
- `lib/firebaseCloudPort.ts:194-196` deleteAccount의 백업 삭제 실패도 삼킨다 —
  **탈퇴했는데 클라우드 데이터가 남는 경로**가 열려 있다.
- `lib/pushMessaging.ts:208` `if(!endpoint) return 'queued'` — 항상 성공처럼 보인다.

Firestore 오프라인 persistence 설정 코드는 **없다**(`lib/firebaseCloudPort.ts`·`index.js`에 부재).
RNFirebase 기본값(iOS 활성)에 암묵 의존 중 — 명시되지 않은 전제다.

## 3-6. `MAJOR` — 익명 로그인 경로가 코드엔 있고 화면엔 없다 (전환기 유산)

- `lib/firebaseCloudPort.ts:146-150` — `signInAnonymously` 구현 완비.
- `LoginScreen.rn.tsx` — 노출 버튼은 kakao/naver/google/apple **4종뿐**(`testID: login-*`). 익명 없음.
- 결과: 첫 화면부터 소셜 로그인 강제. `App.tsx:1894-1895`가 `authUser===null`이면 무조건 LoginScreen.
- 전환 전 REST는 `device_id` 기반으로 로그인 없이 동작했다(`App.tsx:701` device_id 생성 코드 잔존).
  **로컬-퍼스트 앱이 로그인 필수 앱이 된 것이 의도된 제품 결정인지, 전환의 부작용인지 코드로는 판정 불가.**

## 3-7. `MAJOR` — Firestore 보안 규칙은 배포 상태를 코드로 알 수 없다

- `firestore.rules`는 2026-07-26 심사에서 **런 상세 백업 전량을 거부하고 있었다**(파일 헤더 §47-51 자백).
  테스트가 firestore를 목으로 대체해 2052 그린인데 프로덕션이 죽어 있었다.
- 지금 규칙 파일은 재귀 와일드카드로 고쳐져 있다(`:58-60`). 하지만 **파일이 고쳐진 것과 배포된 것은 다르다.**
- `npm run test:rules`(에뮬레이터)가 있으나 **CI가 아니라 수동**이고, 이번 세션 미실행.
- 리더보드 점수는 클라이언트 계산이라 규칙만으로 위조를 막을 수 없다(규칙 주석 `:16-18`이 자인).

## 3-8. `MINOR` — 전환으로 무효화된 문서들이 아직 정본 행세를 한다

| 문서 | 어긋난 내용 |
|---|---|
| `CLAUDE.md` 프로젝트 절 | "React Navigation" 스택 명시 — **실제로 라우터 라이브러리가 없다**(`App.tsx:1891~` early-return 사다리가 라우터) |
| `.tenet/spec/2026-06-17-audit-hardening.md` | "단일 진실원천 = REST" — 무효 |
| `docs/backend-deploy.md` | Render 배포 절차 — 역사 문서인데 그 표시가 파일 안에 없다 |
| `docs/release-checklist.md` | "2026-06-17 기준, 1200+ 테스트" — 실제 2567. Android 우선 출시 권고도 이후 iOS 단독 권고로 뒤집힘 |

---

# [2] 현재 구조

## 2-1. 화면 (25개)

**라우팅에 라이브러리가 없다.** `App.tsx` 렌더 함수의 early-return 사다리가 곧 라우터이자 z-order다:

```
App.tsx:1891  authUser===undefined  → BootSkeleton
App.tsx:1894  authUser===null       → LoginScreen         ← 로그인 강제 게이트
App.tsx:1899  bootState==='loading' → BootSkeleton
App.tsx:1902  bootState==='error'   → BootError(onRetry)
App.tsx:1905  overlay==='add'       → AddShoeScreen
App.tsx:1911  previewOnboard        → OnboardingScreen    ← __DEV__ 전용
App.tsx:1914  !onboarded && 신발0    → OnboardingScreen
App.tsx:1921  locPrimeGoal!=null    → LocationPrimeScreen
App.tsx:1929  overlay==='goal'      → RunGoalScreen
App.tsx:1942  overlay==='countdown' → RunActiveScreenView(카운트다운)
App.tsx:1958  overlay==='run'       → RunEngine
App.tsx:2074  celebration           → CelebrationScreen
App.tsx:2076  showHallOfFame        → HallOfFameScreen    ← 진입점 미주입(2083-2084)
App.tsx:2085  showProgression       → ProgressionScreen
App.tsx:2092  showHallOfShoes       → HallOfShoes
App.tsx:2095  showArchive           → ShoeArchiveScreen
App.tsx:2103  medalFlow             → RaceMedalScreen
App.tsx:2112  showMedalArchive      → MedalArchiveScreen
App.tsx:2131  runRecap              → RunRecapScreen
              그 외                 → 탭 4개
```

Android 하드웨어 뒤로가기가 이 사다리에 붙어 있지 않다 → Android 출시 시 `MAJOR`.

| 탭 | 화면 | 파일(크기) | 역할 |
|---|---|---|---|
| 0 | 홈 | `HomeScreen.rn.tsx` (41KB) | shoe-first 히어로 캐러셀 → 바로 러닝, 주간 진척, 교체 예측, 훈련 부하 |
| 1 | 신발 | `ShoesScreen.rn.tsx` (58KB) | 목록/상세, 수명 링, 마모 분석, 은퇴, 다음 신발, 비교 |
| 2 | 기록 | `HistoryScreen.rn.tsx` (90KB) | 런 목록·상세(스플릿/페이스곡선/심박존/코스맵), 수동 추가·편집·삭제 |
| 3 | 마이 | `ProfileScreen.rn.tsx` (91KB) | 프로필·PB·배지, 설정 5섹션, 백업·복원, 계정 삭제, 진척/전당/메달 진입 |

기타 전체화면: `LoginScreen` · `OnboardingScreen`(40KB) · `AddShoeScreen` · `FirstShoeScreen` ·
`RetirementFlow`(31KB) · `NextShoeScreen`(30KB) · `ShoeCompareScreen` · `ShoeArchiveScreen` ·
`HallOfShoes`(24KB) · `LocationPrimeScreen` · `RunGoalScreen`(34KB) · `RunActiveScreen`(80KB) ·
`screens/RunEngine.tsx` · `RunRecapScreen`(40KB) · `CelebrationScreen`(25KB) ·
`ProgressionScreen`(26KB) · `HallOfFameScreen`(도달불가) · `RaceMedalScreen`(21KB) ·
`MedalArchiveScreen`(19KB) · `screens/BootStates.rn.tsx`

부품/카드: `ShoePicker` · `SpeedPlanPanel` · `RunLiveMap` · `CourseMap` · `MedalCamera` ·
`ShareCard` · `ShareCardPicker` · `MedalShareCard` · `RecapShareCard` · `RunnerSpecShareCard` ·
`RetirementCard` · `TrainingLoadCard` · `RotationInsightPanel` · `FuelGauge` · `ChallengesSection` ·
`RunSplits` · `DialogHost` · `ToastHost` · `ErrorBoundary` · `primitives.tsx`(77KB)

## 2-2. Firestore 컬렉션 (`firestore.rules` 전수)

| 경로 | 권한 | 필드 | 용도 |
|---|---|---|---|
| `userBackups/{uid}` | 본인 read/write (`:55-57`) | `shoes[]` · `runs[]`(**route 포함**) · `settings` · `progression` · `medals` | 클라우드 정본. **단일 문서 — 3-1 참조** |
| `userBackups/{uid}/{**}` | 본인 read/write (`:58-60`) | 하위 `runDetails/{runId}`: `splits`·`paceTrack`·`hrTrack`·`gapTrack`·`track` | 런 상세 사이드카(`lib/runDetailSync.ts`, `DETAIL_SERIES_CAP=10800`) |
| `leaderboards/{ym}/entries/{uid}` | read=**로그인 전원**, create/update=본인+형태검증, **delete=false** (`:64-71`) | `uid`·`nickname`·`rankTier`·`rankColor`·`equippedTitle`·`distance`·`consistency`·`shoeHealth`·`collection`·`progressPoints`·`updatedAt` | 월간 랭킹. **3-2·3-3 참조** |
| `races/{raceId}` | read=signedIn, write=false (`:76-79`) | `id`·`name`·`date`·`region`·`venue`·`startLat`·`startLon`·`distances[]` | 대회 카탈로그. 로컬 시드 `data/races.json` 82건 폴백 |
| `shoes/{shoeId}` | read=signedIn, write=false (`:85-88`) | `types/shoe.ts ShoeDoc` — `id`·`brand`·`model`·`category`·`weight`·`drop`·`stackHeight`·`plate`·`releaseYear`·`defaultLifespanKm`·`discontinued`·`searchAliases[]`·`verified` | 신발 카탈로그(admin SDK만 쓰기) |
| `search_misses/{docId}` | **create only**, 나머지 전부 deny (`:96-103`) | `query`(1~100자)·`userId`·`createdAt` | 검색 0건 신호 |
| `shoe_requests/{docId}` | **create only** (`:104-116`) | `brand`·`model`(≤60자)·`userId`·`createdAt`·`source∈{not_found,manual_add}` | 신발 등록 요청 |
| 그 외 | `:119-121` 전부 deny | — | — |

**로컬(AsyncStorage)이 실질 1차 저장소**: `cache_shoes_v1`/`cache_runs_v1`(route 제외 경량 미러) ·
`route_<runId>` · `splits_`/`paceTrack_`/`hrTrack_`/`gapTrack_`/`track_`/`surface_`/`time_`/`runphoto_<runId>` ·
`pending_runs` · `medals_v1`/`challenges_v1`/`tombstones_v1` · `settings_*` · `body_*` ·
`goal_weekly_km`/`profile_name`/`profile_photo` · `notif_settings` · `cloud_account`/`device_id` ·
`keego.shoeCatalogRemote.v1` · `storage_schema_version`

**번들 데이터**: `data/shoeCatalog.json`(588켤레) · `data/shoes.json`(351켤레/19브랜드, 앱 등록화면 소스) ·
`data/shoeSpecs.json`(**71켤레만** — 커버리지 12%) · `data/shoeModels.ts` · `data/races.json`(82)

## 2-3. 외부 의존성 (`package.json` 실측)

- **Firebase v24**: `app 24.0.0`(고정) · `auth 24.0.0`(고정) · `firestore 24.0.0`(고정) · `analytics ^24` · `app-check ^24` · `crashlytics ^24` · `messaging ^24`
- **소셜**: `@react-native-google-signin ^16.1.2` · `@react-native-seoul/kakao-login ^5.4.2` · `@react-native-seoul/naver-login ^4.2.4` · `expo-apple-authentication ~56.0.4`
- **센서/위치**: `expo-location ~56.0.22` · `expo-sensors ~56.0.0` · `expo-task-manager ~56.0.23` · `react-native-sensors ^7.3.6` · `@kingstinct/react-native-healthkit ^14.0.2`
- **미디어/UI**: `react-native-maps ^1.27.2` · `react-native-svg ^15.15.4` · `react-native-vector-icons ^10.3.0` · `@react-native-community/blur ^4.4.1` · `react-native-safe-area-context ^5.7.0` · `expo-camera`/`image-picker`/`image-manipulator`/`media-library`/`file-system`/`asset`
- **기타**: `react-native-tts ^4.1.1` · `expo-audio` · `expo-notifications ~56.0.22` · `expo-keep-awake` · `expo-crypto` · `@react-native-ml-kit/text-recognition ^2.0.0` · `@react-native-async-storage/async-storage ^3.1.1` · `react-native-nitro-modules ^0.36.1`
- **코어**: RN `0.85.3` · React `19.2.3` · TS `~6.0.3` · Node `≥24`(2026-08-07 정정 — 22 는 테스트가 매달린다)
  ⚠️ `CLAUDE.md`는 "RN 0.85.2 · TS 5.8"이라 적어 실제와 다르다.

**외부 API/서비스**

| 대상 | 호출 위치 | 비고 |
|---|---|---|
| Cloud Functions `api` (asia-northeast3) | `lib/socialConfig.ts:23 SOCIAL_BACKEND` | `POST /auth/kakao`·`POST /auth/naver`·`GET /shop/price`·`GET /health` |
| 카카오 토큰 검증 | `functions/index.js:84 KAKAO_APP_ID` | app_id audience 검증, 미설정 시 503 fail-closed |
| 네이버 OAuth refresh 교환 | `functions/index.js:123-124`, `functions/naverAuth.js` | `NAVER_CLIENT_ID/SECRET` |
| 네이버 쇼핑 검색 | `functions/index.js:156-157` | `NAVER_SEARCH_CLIENT_ID/SECRET` — `lib/shoePrice.ts` 현재가 |
| Apple HealthKit | `lib/healthkit.ts` | 심박·안정시심박 읽기, 워크아웃 쓰기 |
| 쇼핑몰 링크 | `lib/shoeStore.ts` → `Linking.openURL` | 네이버쇼핑·무신사·29CM (**쿠팡 제외**) |
| 법적 문서 | `lib/legalLinks.ts` | `solelife9.github.io/keego-legal/{privacy,terms,delete-account}.html` |

**Cloud Functions**: Node 22, `firebase-functions ^6.6.0`, `firebase-admin ^12.7.0`, `express ^4.19.2`.
함수 1개(`exports.api`). per-IP rate limit 인메모리(`functions/index.js:47-48`, 기본 20req/60s).
**필수 환경변수 5종 미주입 = 카카오/네이버 로그인 503.** `BLOCKER`(배포 절차 의존)

## 2-4. iOS 권한과 요구 시점

| 키 | 요구 시점 | 코드 |
|---|---|---|
| `NSLocationWhenInUseUsageDescription` (`Info.plist:81`) | 첫 GPS 런 — LocationPrime '계속' | `lib/locationService.ts:88` |
| `NSLocationAlwaysAndWhenInUse…` (`:75`) | 위와 같은 순간, 포그라운드 승인 **직후 연쇄**. 거부해도 비치명 | `lib/locationService.ts:95` |
| `NSMotionUsageDescription` (`:83`) | LocationPrime '계속' 선요청 + RunEngine 시작 | `App.tsx:1925`, `screens/RunEngine.tsx:624` |
| `NSHealthShare/UpdateUsageDescription` (`:77,79`) | 마이탭 → 애플 건강 연동 토글 ON | `lib/healthkit.ts:70` |
| `NSPhotoLibraryUsageDescription` (`:87`) | 신발/프로필 사진 등록 | `lib/photo.ts:59` |
| `NSPhotoLibraryAddUsageDescription` (`:85`) | 공유 카드 '사진에 저장'(writeOnly) | `lib/shareCard.ts:370` |
| `NSCameraUsageDescription` (`:89`) | 신발·메달 촬영, 기록증 OCR | `lib/photo.ts:94,110`·`MedalCamera.tsx` |
| 알림(푸시) | **첫 러닝 리캡을 닫는 순간** 커스텀 다이얼로그 프라이밍 → 수락 시 OS 요청 | `App.tsx:628 maybePrimePush` |

의도적 부재: `NSMicrophoneUsageDescription` (`Info.plist:91-93` 주석 + 회귀 가드 `__tests__/nativePermissions.test.ts`)

**Entitlements**(`ios/SoleMate/SoleMate.entitlements`): `applesignin: Default` · `healthkit: true` ·
**`aps-environment: development`** ← 스토어 빌드는 `production` `BLOCKER` ·
`application-groups: group.com.solemate.keego`

**Android**(`AndroidManifest.xml`): `INTERNET`·`CAMERA`·`VIBRATE`·`ACTIVITY_RECOGNITION`·
`ACCESS_FINE/COARSE_LOCATION`·`FOREGROUND_SERVICE`·`FOREGROUND_SERVICE_LOCATION`·
`ACCESS_BACKGROUND_LOCATION`·`RECEIVE_BOOT_COMPLETED`·`POST_NOTIFICATIONS`

## 2-5. 백그라운드 동작

`UIBackgroundModes`: `location`, `audio` (`Info.plist:115-117`)

| 동작 | 구현 | 조건 |
|---|---|---|
| 화면 꺼짐/주머니 GPS | `expo-task-manager` 전역 `defineTask`(`locationService.ts:65-76`) + `startLocationUpdatesAsync`(`:165-176`) | 러닝 중. **포그라운드 권한만으로 동작**('항상 허용' 불필요) |
| 음성 코칭 | `react-native-tts` + `audio` 백그라운드 모드 | 러닝 중, 음성 ON |
| Live Activity | `ios/RunActivity/` + `LiveActivityModule.swift` ← `lib/liveActivity.ts` | iOS 16.1↑, 모듈 부재 시 전량 no-op |
| 워치 세션 | `WatchSessionModule.swift` ↔ `lib/watchSession.ts` | 워치 단독 런의 심박/런/정지 수신, 콜드런치 버퍼 재생 |
| 홈/잠금 위젯 | `ios/RunActivity/` (App Group) | 활성 신발 수명 |
| 워치 앱 | `ios/SoleMateWatch Watch App/` `WKBackgroundModes: workout-processing` | 단독 러닝 후 폰 전송 |

**앱이 완전히 종료됐을 때:**
- **정정(2026-07-30). 원래 여기 "OS 스케줄 로컬 알림이 사실상 없다 `MAJOR`"라고 적었는데 틀렸다.**
  `lib/localReminder.ts`의 `scheduleNotificationAsync` 경로는 "옵셔널 모듈 인터페이스 형태"로만
  존재하는 게 아니라 **실제로 배선돼 동작한다** — `App.tsx:117`이 `syncRunReminder`를 import 하고
  `:1038-1039`가 호출한다(설정·시각·오늘 런 여부가 바뀔 때마다 7일치 원샷 체인 갱신).
  옵셔널 require 는 jest·시뮬처럼 네이티브가 없는 환경을 위한 방어이지 미배선의 증거가 아니었다.
  **코드를 열어보지 않고 파일 헤더 주석만 읽어 옮긴 판정이었다.**
- 실제 구조는 **두 갈래**다:
  · **러닝 리마인더** — expo-notifications OS 스케줄. 앱이 닫혀 있어도 정해둔 시각에 울린다.
    이미 달린 날은 건너뛴다(`reminderFireDates`의 `ranToday`).
  · **교체 임박 · 주간 목표** — OS 스케줄이 아니다. `lib/notifications.ts:177 dueNotifications`가
    순수 계산을 하고 `App.tsx:591-596` AppState `'active'`에서 `presentDue`로 표시한다.
    발화 시점의 상태(진척·예측)를 미리 알 수 없어 억지 스케줄이 곧 노이즈이므로 **의도된 설계**다.
- 남은 실제 문제는 '알림이 안 온다'가 아니라 **카피가 그 둘을 뭉갠 것**이었고, 이는 해결됐다
  (2026-07-30 `923e182`): 권한 프라이밍이 셋을 나란히 약속하던 것을 실제 동작대로 갈랐고,
  회귀 가드 `__tests__/notifCopyHonesty.test.ts`를 뒀다. `MINOR`(카피 문제였음)
- **원격 푸시를 보낼 수단이 없다.** `lib/pushMessaging.ts:173 FCM_REGISTER_ENDPOINT=''` →
  `:208 if(!endpoint) return 'queued'`. 토큰은 발급·로컬 큐잉만 하고 서버 등록을 안 한다. `MAJOR`

## 2-6. 인증

```
index.js:14        → activateAppCheck(__DEV__)     ← 다른 Firebase 사용보다 먼저
App.tsx            → onAuthStateChanged → authUser
  undefined        → BootSkeleton
  null             → LoginScreen (강제 게이트, 우회 불가)
  {uid}            → initUser → bootState
```

| 제공자 | 경로 |
|---|---|
| 카카오 | 네이티브 SDK → access token → Functions `/auth/kakao`(app_id 검증) → 커스텀 토큰 → `signInWithCustomToken`. uid=`kakao:<회원번호>` |
| 네이버 | 네이티브 SDK → **refresh token** → Functions `/auth/naver`(client_id/secret 교환으로 audience 증명) → 커스텀 토큰 |
| 구글 | `@react-native-google-signin` → credential → `signInWithCredential` |
| 애플 | `expo-apple-authentication` → credential → `signInWithCredential` (iOS만) |
| 익명 | `lib/firebaseCloudPort.ts:146-150` **구현됨 · LoginScreen 미노출** (3-6) |

**계정 삭제**(`lib/firebaseCloudPort.ts:177-207`): `runDetails` 순회 삭제 → `userBackups/{uid}` 삭제 →
`deleteUser`. `requires-recent-login`은 한국어 에러로 전파. **리더보드 엔트리는 미삭제**(3-3).

**App Check**(`lib/appCheck.ts`): 개발=debug provider, 프로덕션=App Attest. 실패해도 앱을 막지 않음.
**콘솔 enforce 토글은 아직 안 켠 상태를 전제**로 주석에 명시(`:16-18`).

## 2-7. 미완성 표시

`TODO`/`FIXME`/`HACK` 주석은 코드베이스 전체 **0건**. 아래는 코드를 읽어 찾은 실질 미완성이다.

**진입점이 막힌 완성 기능**

| 항목 | 위치 | 상태 |
|---|---|---|
| 명예의 전당(리더보드) | `App.tsx:2083-2084` | `onOpenHallOfFame` 미주입 → 버튼 숨김. 화면·규칙·publish 전부 완성. **publish는 계속 돈다**(3-2) |
| 익명 로그인 | `lib/firebaseCloudPort.ts:147` | 구현됨, 미노출 |
| 제휴/쇼핑 링크 | `HomeScreen.rn.tsx:319` | 프로덕션 숨김(2026-07-20 사용자 요청) |
| 부상위험 상세 화면 | `App.tsx:2098` 주석 | "홈 진입점이 사라져 도달 불가"로 제거 |

**개발 전용 코드가 프로덕션 경로에**

| 위치 | 내용 | 가드 |
|---|---|---|
| `App.tsx:312` | `previewOnboard = __DEV__ && !JEST_WORKER_ID` — 개발 빌드는 항상 온보딩부터 | `__DEV__` |
| `App.tsx:737` | 개발 시드 주입(`devSeedShoes`/`devSeedRuns`) | `__DEV__` && `NODE_ENV!=='test'` && 신발0 |
| `lib/devSeed.ts` | 시드 파일이 번들에 포함 | — (릴리스에 죽은 코드로 남음) `NITPICK` |

**코드가 스스로 밝힌 기능 공백**

| 항목 | 위치 | 심각도 |
|---|---|---|
| 프로필/신발 사진 클라우드 백업 안 됨 — 재설치 시 영구 소실(화면이 그 사실을 고지) | `ProfileScreen.rn.tsx:1130` | `MAJOR` |
| FCM 등록 엔드포인트 부재 | `lib/pushMessaging.ts:173` | `MAJOR` |
| ~~알림이 앱 실행 중에만 표시~~ **오판정 — 러닝 리마인더는 OS 스케줄로 실제 발화**(§5.2 정정). 남은 건 카피 문제였고 해결됨(`923e182`) | `lib/localReminder.ts` · `App.tsx:1038` | ~~`MAJOR`~~ 해결 |
| 앱 버전 표기가 네이티브 `MARKETING_VERSION`을 못 읽음(하드코딩) | `ProfileScreen.rn.tsx:64` | `MINOR` |
| 신발 스펙 커버리지 — 숫자는 맞았지만 **원인 진단이 없었다**(2026-07-30 규명). 스펙이 **두 곳에 따로** 쌓이고 있었다: `data/shoeSpecs.json` 71켤레(→'다음 신발'이 읽음) · `data/shoeCatalog.json` 491/624켤레(→'신발 비교'만 읽음). 즉 커버리지가 낮았던 게 아니라 **423켤레가 연결되지 않았던 것**. `8a45f59` 에서 폴백으로 연결 → '다음 신발' 축이 71→494켤레에서 뜬다 | `lib/shoeSpecModel.ts` | 해결 |
| 경로 단순화가 RDP 아닌 균등 스트라이드 | `lib/geo.ts:86-91` | `MINOR` |
| BottomSheet 드래그 dismiss 미구현 | `primitives.tsx:1674` | `NITPICK` |
| `substr` deprecated 1건 | `App.tsx:701` | `NITPICK` |

**저장소 위생**

| 항목 | 근거 |
|---|---|
| `firestore-debug.log`(85KB)가 **git에 추적되고 있다** | `git ls-files` 확인, 마지막 커밋 `2f5a629` |
| ESLint 경고 337개를 상한 338로 허용 중(여유 1) | `package.json` `--max-warnings 338` |
| `TEMPlint.txt`(14KB)·`keego-logos.html`이 루트에 잔존 | 루트 |

**아키텍처 부채**
`App.tsx` 151KB(부팅·인증·동기화·CRUD·라우팅 전부 소유) · 화면 4개가 40~91KB ·
`primitives.tsx` 77KB · 라우터 부재로 딥링크/뒤로가기/전환 애니메이션이 구조적으로 어렵다.

---

## 다음 세션이 먼저 볼 것 (기준선이 말하는 순서)

> 2026-07-30 갱신 — 3-2·3-3·3-4(고지분)와 1번 오판은 처리됐다. 남은 순서는 아래와 같다.

1. **3-1 단일 문서 1MB** — 남은 것 중 가장 무겁다. `userBackups/{uid}` 한 문서에 신발·런
   전량이 들어가고 런에는 `route` 문자열이 포함된다. 런 100~150건이면 1MiB 상한에 닿고,
   초과하면 write 가 실패하는데 `catch` 가 조용히 삼킨다. 사용자는 기기를 바꾸는 날 안다.
   구조 결정이 필요하다(런 서브컬렉션화 vs route 사이드카화).
2. **`aps-environment: development`** — 스토어 빌드 전 실빌드로 확인.
3. ~~**Functions 환경변수 5종**~~ **확인 완료(2026-07-30) — 5종 전부 주입돼 있다.**
   배포된 함수를 직접 찔러 판정했다. 요령은 **일부러 잘못된 토큰**을 보내는 것 —
   환경변수가 없으면 `503`(fail-closed)이고, 있으면 `401`(토큰이 틀림)이다.
   `GET /health` → 200 · `POST /auth/kakao` → **401**(503 아님 = `KAKAO_APP_ID` 있음) ·
   `POST /auth/naver` → **401**(= `NAVER_CLIENT_ID/SECRET` 있음) ·
   `GET /shop/price` → 200 + 실제 네이버쇼핑 결과(= `NAVER_SEARCH_CLIENT_ID/SECRET` 있음).
   → 카카오·네이버 로그인이 503 으로 죽을 위험은 없다.
   (Firestore 규칙 배포 상태도 2026-07-30 확인 완료 — 라이브 룰셋 = 로컬 파일 바이트 동일.)
4. **`shoes` 카탈로그가 프로덕션에 없다**(3-4 남은 부분) — 원격 카탈로그 갱신이 죽어 있다.
   시드하든가, '원격 카탈로그' 문서 표현을 실제에 맞추든가.
5. **flaky 스위트** — `HistoryScreen.shareCard.test.tsx` 간헐 실패. 상시 red 는 아니지만
   출시 전에 원인을 잡아야 한다(게이트 신뢰도 문제).
6. **사진 클라우드 미백업 · FCM 등록 엔드포인트 부재** — §2-7 의 `MAJOR`.
   (같이 묶여 있던 'OS 스케줄 알림 부재'는 **오판정**이었다 — §5.2 정정 참조. 남은 카피
   문제는 2026-07-30 해결.) 둘 다 "어떻게 동작해야 하는가"가 먼저라 제품 결정이 필요하다.
