# Decomposition for pro-overhaul (Keego)

delivery_mode: agile — 슬라이스별 1회 분해. 본 파일은 slice마다 append.

## Slice 1: 핵심 러닝 엔진 정밀화 + 신뢰성

목표 상태: 화면 추가/리뉴얼 없이, **믿을 수 있는 엔진 + 테스트 가능한 구조 + 정직한 신발 데이터**. use-checkpoint에서 사용자가 실제로 달려 백그라운드·자동정지·정확도·복구를 확인 가능.

### ASCII DAG

```
                       ┌────────────────────────────────────────────┐
slice-1-extract-libs ──┼─> slice-1-fix-filter ──┬─> slice-1-background-track ─┐
   (순수함수 추출)      │     (정확도/워밍업/      │                              │
                       │      속도/하한 게이트)   └─> slice-1-permissions ─────┤
                       ├─> slice-1-auto-pause ───────────────────────────────┤
                       ├─> slice-1-cadence ──────────────────────────────────┤
                       ├─> slice-1-shoe-health ──────────────────────────────┤
                       └─> slice-1-run-persistence ──────────────────────────┤
slice-1-jest-mocks ──────────────────────────────────────────────────────────┤
slice-1-theme-tokens ─────────────────────────────────────────────────────────┤
                                                                              ▼
                                                                     slice-1-e2e
                                                              (수용테스트 실행·보고)
```

### Job 상세

- **slice-1-extract-libs** (dev, deps: none): App.tsx의 순수 로직을 `lib/`로 추출·named export하고 App.tsx가 import하도록 동작보존 리팩터. 모듈: `lib/engineConstants.ts`, `lib/geo.ts`(calcDist·acceptSegment·segmentSpeedMps·route단순화), `lib/format.ts`(fmtPace·fmtTime·ymdLocal·getMonday), `lib/stats.ts`(sumKm·summaryOf·maxDayStreak·주월년 버킷, **로컬 날짜 사용 audit#11**), `lib/shoe.ts`(parseShoeName·shoeHealth·isRetired), `KalmanFilter` export. 각 모듈 단위테스트. tsc/lint/test 통과.
- **slice-1-jest-mocks** (dev, deps: none): `jest.setup.js` 작성 + jest.config 연결. AsyncStorage 공식 mock, `react-native-geolocation-service`(watchPosition stub), `react-native-sensors`(accelerometer stub), `react-native-tts`, `global.fetch` 모킹. 기존 `__tests__/App.test.tsx`가 모킹 하에 통과하도록.
- **slice-1-theme-tokens** (dev, deps: none): `theme.ts`에 `SPACE`, `RADIUS`, `TYPE`(size/weight/letterSpacing) 스케일 토큰 추가. **DISPLAY(Bebas) 별칭을 Pretendard로 전환할 토큰 준비**(실제 화면 적용은 Slice 3). 기존 export 깨지 않게.
- **slice-1-fix-filter** (dev, deps: extract-libs): `acceptSegment({distKm,dtSec,accuracyM,fixIndex})` 구현 — accuracy>20 거부, 첫 3 fix 워밍업 제외, 속도>12m/s 거부, 하한 ~1m(MIN_SEG_DIST_KM)·상한 300m. App.tsx watchPosition 경로에 통합(마지막 양호 위치 유지). 단위테스트.
- **slice-1-auto-pause** (dev, deps: extract-libs): `decideAutoPause(state,speedMps,dtSec)` + `initAutoPauseState` 순수함수, pausedMs guard·음수금지, App.tsx에 트리거 배선(정지감지→일시정지, 재개). elapsed 수식 정리. 단위테스트.
- **slice-1-cadence** (dev, deps: extract-libs): 케이던스 spm 정규화(초기 윈도우 보정), 순수함수 분리, App.tsx 통합. 단위테스트.
- **slice-1-shoe-health** (dev, deps: extract-libs): `shoeHealth(shoe,runs)→{usedKm,remainingKm,percentUsed,condition('양호'|'주의'|'교체')}` 단일 소스(중복 제거), 카테고리 수명 기반 75%/90% 티어. retire/archive(런 비-cascade 보존) 로직·UI 토글. 단위테스트.
- **slice-1-run-persistence** (dev, deps: extract-libs): 진행중 런 스냅샷을 주기적으로 AsyncStorage 영속 + 앱 시작 시 미완료 런 복구 프롬프트. 완주 런 로컬 우선 저장 + 미동기 큐(네트워크 실패 비차단). 저장 try/catch 격리. 비-UI 검증(스냅샷 기록 assert).
- **slice-1-background-track** (dev, deps: fix-filter): `react-native-geolocation-service` 포그라운드 서비스 모드 + `AndroidManifest.xml`에 FOREGROUND_SERVICE/FOREGROUND_SERVICE_LOCATION 권한·서비스·notification. 화면off/백그라운드 트래킹 지속. 기존 권한 회귀 금지.
- **slice-1-permissions** (dev, deps: fix-filter): 권한 거부/주행중 회수 graceful(한국어 안내+설정 딥링크, 크래시 금지), iOS `requestAuthorization('whenInUse')`, GPS 死구간 배너(시간만 누적 방지 신호).
- **slice-1-e2e** (integration_test, report_only, deps: 위 dev 전부): `npm test -- tests/acceptance/slice-1-engine.test.ts` + 신규 lib 단위테스트 + `npx tsc --noEmit` + `npm run lint` 실행, pass/fail 보고. 코드 수정 안 함.

### Interface Contracts (dev 잡들이 맞춰 구현)

- `lib/engineConstants.ts`: `MAX_FIX_ACCURACY_M=20`, `WARMUP_FIXES=3`, `MAX_SEG_SPEED_MPS=12`, `MIN_SEG_DIST_KM=0.001`, `MAX_SEG_DIST_KM=0.3`, `AUTO_PAUSE_SPEED_MPS=0.6`, `AUTO_PAUSE_HOLD_S=6`, `AUTO_RESUME_SPEED_MPS=1.0`, `AUTO_RESUME_HOLD_S=2`.
- `lib/geo.ts`: `calcDist(aLat,aLon,bLat,bLon):number(km)`; `segmentSpeedMps(distKm,dtSec):number`; `acceptSegment({distKm,dtSec,accuracyM,fixIndex}):boolean`.
- `lib/autoPause.ts`: `initAutoPauseState():State`; `decideAutoPause(state,speedMps,dtSec):{state,paused,justPaused,justResumed}` (state.pausedMs≥0 불변).
- `lib/shoe.ts`: `shoeHealth(shoe,runs):{usedKm,remainingKm,percentUsed,condition}`; `isRetired(shoe):boolean`. used = start_km + Σ(해당 shoe_id run.km).
- `lib/format.ts`: `fmtPace(km,sec):string`('--' 가드), `fmtTime(sec):string`.

수용 테스트: `tests/acceptance/slice-1-engine.test.ts` (@slice-1). 통과 시 Slice 1 done.

## Slice 2: 미완성 UI 연결 + shoe-first 신규 기능 + 신발 인텔리전스

Slice 1 승인(2026-06-01) 후 진입. 백그라운드 트래킹 = **expo-location** 채택. 제품 기본값 확정(svg 코스맵·앱내 배지·주간km+스트릭·텍스트 Share·134모델 DB). slice-1-e2e-r3 통과를 의존 기준으로.

### Job 상세 (15 jobs)
- **slice-2-shoe-db**(dev): `data/shoeModels.ts`(시드 `shoe-database-2026-05-31.md`의 134모델, 타입) + `getRecommendedLifespanKm({brand,model?,category?,weightKg?})`·`categoryLifespanKm` 순수함수 + 단위테스트. App.tsx의 BRANDS와 통합(단일 소스).
- **slice-2-units-goals**(dev): `lib/units.ts`(km↔mi `kmToDisplay`/`displayToKm`/`fmtDistance`) + `lib/goals.ts`(`weeklyProgress`/`currentStreak`/`personalRecords`) 순수함수 + 테스트.
- **slice-2-types-errboundary**(dev): `types.d.ts`에 BackendShoe/BackendRun 타입 + `ErrorBoundary` 컴포넌트로 Main 래핑(백스크린 방지).
- **slice-2-expo-location**(dev, native): expo-location+expo-task-manager를 bare RN 0.85에 통합(install-expo-modules), GPS 소스를 expo-location으로 교체(또는 백그라운드만), 포그라운드 서비스+TaskManager 백그라운드 태스크로 화면off 기록, 제거했던 권한/Manifest 복원. 엔진 순수로직(fix필터/자동정지) 재사용. 실기기 검증.
- **slice-2-addshoe**(dev, deps shoe-db): AddShoe 모델 자동완성을 shoeModels DB로 + 모델 선택 시 권장 수명 자동(고정 chip 대체) + 사진 업로드 실동작(image picker, 실패 시 비차단 저장).
- **slice-2-shoe-intel**(dev, deps shoe-db,units-goals): activeIdx 하드코딩 제거(선택 신발 반영) + "오늘 이 신발" 추천(최근 미착용/휴식 로테이션) + per-shoe 마지막 착용/타임라인 + cost-per-km(구매가 입력).
- **slice-2-shoe-run-cta**(dev, deps shoe-intel): ShoeDetail "이 신발로 달리기" CTA + 신발 락커 카드 play 어포던스 + shoe-first 동선.
- **slice-2-profile-settings**(dev, deps units-goals): ProfileScreen 설정 4행(목표·알림·단위·계정) 실동작 + AsyncStorage 영속 + 단위 전 화면 반영.
- **slice-2-goals-streak-ui**(dev, deps units-goals): 홈/통계에 주간 목표 달성 링 + 스트릭 UI(실데이터).
- **slice-2-replace-badge**(dev, deps shoe-db): 신발 교체 알림 앱내 배지 + 임계값 표시/설정(shoeHealth 기반).
- **slice-2-course-map**(dev): 런 상세에 `route_<id>` 좌표를 react-native-svg 폴리라인 코스맵으로 렌더.
- **slice-2-export**(dev): RN `Share`로 거리/페이스/시간/신발명 한국어 텍스트 요약 공유.
- **slice-2-run-edit-manual-pr**(dev, deps units-goals,types-errboundary): 개별 런 편집/삭제(신발 수명 재계산) + 수동 런 입력 + PR(개인기록) 표시.
- **slice-2-states-onboard**(dev, deps types-errboundary): 로딩/에러 상태(skeleton+재시도) + 권한 priming/온보딩 + 서버 truth(shoe total_km·run_time 영속).
- **slice-2-e2e**(integration_test, report_only, deps 위 전부): tsc/lint/test + slice-1·2 수용 테스트 실행·보고.

수용 테스트: `tests/acceptance/slice-2-features.test.ts`(@slice-2). 통과 시 Slice 2 done → use-checkpoint.

## Slice 3: 전체 디자인 리뉴얼 & 마감 polish

목표 상태: NRC/Strava와 나란히 놓아도 손색없는, 누가 봐도 깔끔하고 완성된 Keego. **디자인 방향 = 기존 다크(#000)+오렌지(#FF6500) 유지**(2026-06-02 사용자 확정 — light redirect 철회, 탐색 목업 `2026-06-02-04-slice-3-design-revision-1.html`은 미채택). 타이포는 Pretendard 단일 통일(Bebas 제거). 모든 화면 하드코딩 색/폰트 0, theme 토큰만 사용. shoe-first 요소가 시각적 주인공. 심박 UI 숨김(데이터 보존).

> **DAG 주의**: slice-2-e2e 노드는 취소된 slice-2-expo-location 의존으로 dispatch 불가 상태(북키핑 잔재). 실제 Slice 2 검증은 ad-hoc report-only job 8522a9b6로 완료됨(수용 30/30 PASS). 따라서 Slice 3 첫 잡은 slice-2-e2e에 의존하지 않고 deps [] 로 시작한다(데드락 회피).

### ASCII DAG

```
slice-3-theme-primitives ──┬─> slice-3-home ───────────┐
  (UNIFY_DISPLAY_FONT=true  │   slice-3-shoes-addshoe ──┤
   + primitives 확장         │   slice-3-run ────────────┼─> slice-3-polish-a11y ─> slice-3-e2e
   Button/Card/Badge/Metric  │   slice-3-history-profile ┘    (a11y·死deps·상태카피)   (수용 sweep)
   /Ring/KeegoWordmark)      │
```

### Jobs

- **slice-3-theme-primitives**(dev, deps []): `theme.ts`에서 `UNIFY_DISPLAY_FONT=true`로 flip(DISPLAY→Pretendard, Bebas 토큰레벨 제거). `primitives.tsx` 확장·정제: Button(CTA 오렌지 그라데이션 + ghost), Card(CARD/SEP/radius), Badge/Pill(양호=GOOD·주의=WARN·교체=DANGER 반투명), Metric(`value`+`unit` baseline 정렬로 "0.0km" cramping 해소·tabular), Ring(기존), KeegoWordmark, SectionTitle, 상태색 helper. primitives 자체 raw hex 3건 토큰화. spacing/radius/type 토큰 활용. tsc/lint/test green.
- **slice-3-home**(dev, deps theme-primitives): `HomeScreen.rn.tsx` raw hex(~35)/인라인 fontFamily 전부 theme 토큰·primitives로 치환. Keego 워드마크 노출. shoe-first 히어로(선택 신발 수명 링) 시각 주인공화, 오렌지 절제(라벨 T3·강조는 수치/CTA). SOLEMATE/SOLELIFE 잔존 제거.
- **slice-3-shoes-addshoe**(dev, deps theme-primitives): `ShoesScreen.rn.tsx`(~47) + `AddShoeScreen.rn.tsx`(~16) 토큰화. 교체 배지=Badge primitive, 신발 상세 내구도 링 + 교체 내러티브(keep-going 보이스). 인라인 fontFamily/Bebas/구 워드마크 제거.
- **slice-3-run**(dev, deps theme-primitives): `RunScreen.rn.tsx`(~10) 토큰화. 거리 1개 히어로 + 글랜서블 보조(페이스/시간/케이던스) 위계, 자동 일시정지 상태 명확. **심박(bpm/heart_rate) UI 숨김 — 데이터 필드는 보존(iron law #17)**. Metric primitive 적용.
- **slice-3-history-profile**(dev, deps theme-primitives): `HistoryScreen.rn.tsx`(~40) + `ProfileScreen.rn.tsx`(~21) 토큰화. 코스맵(svg)·주간 차트 정제, 목표 달성 링·스트릭·설정 4행 시각 마감, keep-going 카피. 구 워드마크 제거.
- **slice-3-polish-a11y**(dev, deps home,shoes-addshoe,run,history-profile): 횡단 마감 — WCAG 대비(소형 텍스트), 색 단독 상태표시 보완(아이콘/형태), accessibilityLabel(SR), 44pt 터치타깃, 일관 press 피드백, safeArea(`paddingTop:60` 하드코딩 제거), 빈/로딩/에러 카피(keep-going), 死deps(@react-navigation/* · rxjs · react-native-screens 미사용 시) 정리. `tests/acceptance/slice-3-design.test.ts`(@slice-3) 통과 보장(7화면 hex 0·DISPLAY===FONT·Keego 노출·SOLEMATE 0).
- **slice-3-e2e**(integration_test, report_only, deps polish-a11y): tsc/lint/test + slice-1·2·3 수용 테스트(@slice-1/2/3) 실행·보고. criteria #14(토큰화)·#15(시각 완성도 측정가능분)·#17(heart_rate 보존) 확인. 차단 결함은 tenet_report_blocking_finding.

수용 테스트: `tests/acceptance/slice-3-design.test.ts`(@slice-3, 이미 존재·TDD). 통과 시 Slice 3 done → 최종 use-checkpoint(실기기 GPS 백그라운드 최종확인 포함).

## Slice 4: 차별점 강화 + 백업 + 공유카드 + 개인챌린지 (Phase 2, 2026-06-03)

목표 상태: shoe-first 차별점(부상예방·로테이션)을 살리고, 백업·공유카드·개인챌린지로 출시 경쟁력을 더한다. 전부 JS/UI라 텐넷 자율 + 검증 게이트로 완주. **네이티브 변경 0**(공유카드는 react-native-svg `toDataURL`로 해결).

> **그린 게이트 규약**: 순수 로직 4모듈 스텁(`lib/injury|rotation|backup|challenges.ts`)과 `tests/acceptance/slice-4-features.test.ts`(4 describe 모두 `.skip`)가 이미 커밋됨(tsc green·12 skip). 각 dev 잡은 자기 lib 모듈을 실제 구현하고 **자기 describe 블록의 `.skip`을 제거**한다. → 슬라이스 진행 내내 `npm test` green, `slice-4-e2e`가 잔존 `.skip` 0 + 전부 green 검증.
> **직렬 체인**: 화면 파일 공유(HomeScreen·ProfileScreen·App.tsx 등) 충돌 방지를 위해 dev 잡을 선형 의존으로 직렬화한다.

### ASCII DAG

```
slice-4-injury-prevention → slice-4-rotation → slice-4-addshoe-browse → slice-4-ui-polish
  → slice-4-backup → slice-4-share-card → slice-4-challenges → slice-4-e2e
```

### Jobs

- **slice-4-injury-prevention**(dev, deps []): `lib/injury.ts` 구현(`assessInjuryRisk(percentUsed)`: <0.75 safe·0.75~0.9 caution·>0.9 high, 0..1 클램프, keep-going 한국어 문구). shoeHealth(percentUsed)와 연결해 홈 히어로/신발 상세에 위험·주의 경고 노출(안전은 차분, 경고 없음). 행동 테스트(렌더 단언) 동반. 수용 `@slice-4 부상예방` describe `.skip` 제거.
- **slice-4-rotation**(dev, deps injury-prevention): `lib/rotation.ts` 구현(`recommendRotation({shoes,runs,runType?})`: <2활성→[], retired 제외, 휴식(폼 회복) 우선·같은 카테고리 묶음·마모 분산, reason 문구; 카테고리는 `data/shoeModels` 매칭, 커스텀 모델은 브랜드 폴백). 홈/러닝시작에 추천 칩/카드(1켤레 숨김, runType 미선택 시 휴식·분산 기본). 행동 테스트. 수용 `@slice-4 신발 로테이션 추천` `.skip` 제거.
- **slice-4-addshoe-browse**(dev, deps rotation): `AddShoeScreen` 모델 입력칸 포커스+빈 입력 시 해당 브랜드 전체 모델을 **알파벳순** 스크롤 리스트로 표시→선택. 입력 시 기존 필터 동작 유지(두 방식 병행). 정렬·포커스 분기 행동 테스트.
- **slice-4-ui-polish**(dev, deps addshoe-browse): ① `App.tsx` 러닝중/요약 화면 지표(시간/평균페이스/케이던스) 위 Ionicons 제거(숫자+라벨만) ② `HistoryScreen` 상단(기간 선택+거리/횟수/페이스/시간 요약) 세로 높이·여백 축소→최근 기록 리스트 가시성↑ ③ `ShoesScreen` 신발 카드 하단 중복 진행바(`track/trackFill`) 제거, 원형 링 유지 + 남는 공간에 맞게 링/텍스트 비율 재조정. 토큰만 사용(raw hex 0), 다크+오렌지 유지. 회귀 방지 행동/스냅 테스트.
- **slice-4-backup**(dev, deps ui-polish): `lib/backup.ts` 구현(`serializeBackup`/`parseBackup`: 버전드 JSON, shoes/runs/settings 라운드트립, 손상·미지원 버전 throw). `ProfileScreen`에 내보내기(RN Share/파일)·가져오기(복원 전 검증, 실패 시 기존 데이터 보존). 단위+행동 테스트. 수용 `@slice-4 데이터 백업/복원` `.skip` 제거.
- **slice-4-share-card**(dev, deps backup): 런 상세 공유를 **이미지 카드**로 — 거리/페이스/시간/신발/미니 코스맵을 `react-native-svg`로 그리고 `toDataURL`(ref)로 PNG dataURL 생성→RN Share. **새 네이티브 의존 추가 금지**. 카드 구성 순수/렌더 테스트. (기존 텍스트 공유는 유지/대체 결정은 worker가 spec 정렬로)
- **slice-4-challenges**(dev, deps share-card): `lib/challenges.ts` 구현(`challengeProgress`: distance=기간내 거리합, streak=연속일, pct 캡·completed). 챌린지 생성/목록 + 진행률 링 + 달성 뱃지 UI(홈 또는 프로필), AsyncStorage 영속(신규 키). 단위+행동 테스트. 수용 `@slice-4 개인 챌린지` `.skip` 제거.
- **slice-4-e2e**(integration_test, report_only, deps challenges): `npx tsc --noEmit` + `npm run lint` + `npm test` 실행, @slice-1/2/3/4 수용 전부 통과 확인, `tests/acceptance/slice-4-features.test.ts`에 잔존 `.skip` 0 확인, 데이터 파괴·네이티브 변경 0 확인. 코드 수정 금지(report-only), 차단 결함은 `tenet_report_blocking_finding`.

### Interface Contracts (dev 잡 준수)
- `lib/injury.ts`: `assessInjuryRisk(percentUsed:number):{level:'safe'|'caution'|'high';percentUsed:number;message:string}`.
- `lib/rotation.ts`: `recommendRotation({shoes,runs,runType?}):RotationPick[]` (RotationPick={shoe,score,reason}).
- `lib/backup.ts`: `serializeBackup(payload):string`; `parseBackup(json):BackupV1`(throw on invalid).
- `lib/challenges.ts`: `challengeProgress(challenge,runs):{current,target,pct,completed}`.

수용 테스트: `tests/acceptance/slice-4-features.test.ts`(@slice-4, 스텁+`.skip` 커밋됨). 통과 시 Slice 4 done → use-checkpoint(에뮬/실기기 화면 확인). 이후 Slice 5(Firebase·BLE) 별도 분해.

---

## Slice 5 (Firebase 부분): 계정/클라우드 동기 (네이티브 — 실연동 사용자 실기기)

순서: Firebase 먼저 → BLE(별도 후속 fire). "안전한 것부터" — google-services.json 불요의
순수로직(synclogic)을 먼저, 그 다음 네이티브 통합(빌드 검증)·UI·수용. 호환성: @react-native-
firebase v24 가 RN 0.84+/Expo 54+ 를 `forceStaticLinking` 으로 지원(우리 RN0.85.3+Expo56, JDK17+).

### ASCII DAG

```
slice-5-fb-synclogic ──▶ slice-5-fb-native ──▶ slice-5-fb-ui ──▶ slice-5-fb-e2e
   (순수로직, 파일불요)     (네이티브, google-      (로그인/동기 UI)    (수용, 코드+모킹)
                            services.json 필요)
```

### Jobs

- **slice-5-fb-synclogic**(dev, deps []): `lib/cloudSync.ts` 본 구현(현재 throw 스텁 교체). `nextAuthState`(signedOut↔signingIn↔signedIn/error, 부정전이는 현재유지), `mergeCloudData(local,remote)`(shoes/runs id 합집합 무손실·충돌 시 updatedAt 최신·settings 얕은병합·remote null이면 local 보존), `migrateDeviceToAccount`(최초 로그인 기기→계정 무손실 이관). **iron law: 데이터 파괴 금지**. firebase SDK 는 포트(인터페이스) 뒤로 추상화만(여기선 import 금지·순수 유지). 단위 테스트 + 수용 `@slice-5 인증 상태머신`·`클라우드 병합 무손실`·`기기→계정 마이그레이션` describe `.skip` 제거. **google-services.json 불요 — 지금 실행 가능.**
- **slice-5-fb-native**(dev, deps synclogic): `@react-native-firebase/app`+`/auth`+`/firestore` 설치, RN0.85/Expo56 용 `forceStaticLinking` 설정(각 모듈 등록), android `com.google.gms.google-services` gradle 플러그인 + `android/app/google-services.json`(패키지 `com.solemate`) 배선. firebase 포트의 실제 구현(synclogic 인터페이스 충족)을 auth/firestore 로 연결. **전제: google-services.json 사용자 제공.** 없으면 깨진 빌드를 만들지 말고 대기·보고(iron law: 빌드 깨지면 머지 금지, 네이티브 되돌림). 오케스트레이터가 `npx react-native run-android`(emulator-5554)로 gradle 빌드 1차 검증. jest 는 firebase 모듈 목으로 green 유지.
- **slice-5-fb-ui**(dev, deps native): `ProfileScreen` 로그인(Google/Apple)·로그아웃·동기상태(마지막 동기시각)·"클라우드 백업/복원" 행 추가, 로그인 상태에서 데이터 변경 시 동기 트리거(수동 버튼 포함). 목 firebase 로 로그인→동기→상태 반영 행동 테스트(백엔드 호출 없이 props/포트 주입). 다크+오렌지 토큰만.
- **slice-5-fb-e2e**(integration_test, report_only, deps ui): `npx tsc --noEmit`+`npm run lint`+`npm test`, @slice-1/2/3/4/5 수용 통과, `tests/acceptance/slice-5-cloud.test.ts` 잔존 `.skip` 0, 동기 라운드트립·기기→계정 마이그레이션 데이터 무손실/격리, 기존 신발/런/설정 키 바이트 보존 확인. 코드 수정 금지(report-only), 차단결함은 `tenet_report_blocking_finding`. 실연동(실제 로그인/Firestore)·gradle 빌드는 사용자 실기기 use-checkpoint.

### Interface Contracts (dev 잡 준수)
- `lib/cloudSync.ts`: `nextAuthState(cur:AuthState,ev:AuthEvent):AuthState`; `mergeCloudData(local:BackupPayload,remote:BackupPayload|null):BackupPayload`; `migrateDeviceToAccount(local,remote):BackupPayload`. (BackupPayload={shoes,runs,settings} — lib/backup 재사용.)
- firebase 포트(예: `CloudPort{ signIn(provider), signOut(), pull():Promise<BackupPayload|null>, push(data):Promise<void> }`)는 native 잡이 정의·구현, synclogic 은 포트에 비의존(순수).

수용 테스트: `tests/acceptance/slice-5-cloud.test.ts`(@slice-5, 스텁+`.skip` 커밋됨, google-services.json 불요). 네이티브/실연동은 사용자 실기기. BLE 심박은 Firebase use-checkpoint 후 별도 fire(가민 워치 브로드캐스트=표준 BLE 0x180D 실검증, 애플워치 범위밖).

---

## Slice 5 (Google 로그인 완성): @react-native-google-signin 배선

Firebase 부분(synclogic/native/ui/e2e) 완료 후, 실 Google 네이티브 로그인을 활성화. 전제(사용자):
디버그 SHA-1(5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25)을 Firebase 콘솔에
등록 + Google 공급자 켜기 + google-services.json 재다운로드(oauth_client/web client id 채워짐).

### Jobs

- **slice-5-google-signin**(dev, deps slice-5-fb-ui): **착수 즉시 호환성 확인** — `@react-native-google-signin/google-signin` 최신 버전이 RN 0.85.3/React 19.2.3/Expo SDK 56 에서 동작하는 조합 확인(불가/빌드불가면 깨진 네이티브 커밋 금지, 되돌려 tenet_report_blocking_finding). 작업: 패키지 설치(--legacy-peer-deps 일관), `GoogleSignin.configure({webClientId})` — webClientId 는 google-services.json oauth_client(client_type 3, web) 또는 google-services 플러그인이 생성하는 `default_web_client_id` 문자열 리소스에서 취득(하드코딩 금지). `resolveGoogleCredential` 구현: GoogleSignin.hasPlayServices → signIn() → idToken 취득 → firebase `GoogleAuthProvider.credential(idToken)` 반환. 이 리졸버를 App 의 createFirebaseCloudPort 에 주입해 ProfileScreen 'Google로 계속' 버튼이 실제 동작(미설정 시 기존 정직한 에러 유지). jest 는 @react-native-google-signin 을 jest.setup 에서 목 처리, 행동 테스트: 버튼 press→GoogleSignin.signIn 호출→idToken→port.signIn('google', credential)→signedIn 반영, PlayServices 없음/취소 시 에러 안내. 오케스트레이터가 gradle assembleDebug + 에뮬레이터 실행(Google 계정 picker 표출)로 검증. iron law: tsc/lint/test green, react-native config exit 0(Metro 무결성 — 이전 forceStaticLinking 교훈), 데이터/시크릿 0. Apple 로그인은 iOS 영역이라 이번 범위 밖(Android Google 우선).

### Interface Contracts
- `resolveGoogleCredential: () => Promise<FirebaseAuthTypes.AuthCredential>` — firebaseCloudPort 가 이미 주입 수용. App 에서 생성 시 주입.
- webClientId 출처: google-services.json `client[].oauth_client[client_type==3].client_id` 또는 R.string.default_web_client_id. 코드에 평문 하드코딩 금지.

검증: 코드+모킹은 텐넷, 실 Google 로그인→Firestore 동기는 사용자 실기기(SHA-1 등록+json 갱신 후). Metro/gradle/run-android 는 오케스트레이터.

---

## Slice 6 (Phase 3): 진짜 마모 모델 + 교체 예측

순수 lib(네이티브 0). 계수 근거 = `.tenet/knowledge/2026-06-03_research-shoe-wear-factors.md`(휴리스틱, '추정' 톤). 기존 자산 재사용: `lib/shoe.ts`(shoeHealth·usedKm·DEFAULT_MAX_KM), `data/shoeModels.ts`(categoryLifespanKm·DEFAULT_LIFESPAN_KM=700), `lib/settings.ts`(weightKg/body_weight_kg 기본65 — 신규 키 추가 금지), `lib/format.ts`. 원본 데이터(total_km/distance_km) 불변 — 실효마모는 파생 표시값.

```
slice-6-wear-model ──> slice-6-forecast ──> slice-6-ui ──> slice-6-e2e (report_only)
```

### Jobs

- **slice-6-wear-model** (dev, deps: 없음): `lib/wearModel.ts` 순수함수 신설.
  - `runEffectiveWear(run, opts)` = `distance_km × surfaceFactor(surface) × paceFactor(paceSecPerKm)`. surfaceFactor: treadmill .85 / track .9 / road 1.0(기본) / trail 1.15. paceFactor: paceSecPerKm≥360→1.0(easy), 300–360→1.0(normal), 240–300→1.05(tempo), <240→1.10(race); pace 결측/0 → 1.0. pace 는 run.duration_s/run.distance_km 에서 도출(있으면), 없으면 1.0.
  - `effectiveWearKm(shoe, runs, opts)` = Σ runEffectiveWear × `weightFactor(opts.weightKg)` + `ageWearKm(shoe, now)`. weightFactor = clamp(weightKg/70, 0.8, 1.6); weightKg 결측 → 1.0. ageWearKm = monthsOwned × (targetKm/24); monthsOwned 는 shoe.created_at/purchase_date 에서(결측 → 0, 음수 → 0). targetKm = shoe.target_km(유한·>0)이면 그것, 아니면 모델 category→categoryLifespanKm, 최종 DEFAULT_LIFESPAN_KM(700).
  - `targetKmFor(shoe)` 헬퍼(위 폴백 규칙 단일화).
  - 노면 영속 유틸: `lib/settings.ts`(또는 `lib/wearModel.ts`)에 `getRunSurface(runId)`/`setRunSurface(runId, surface)` (AsyncStorage `surface_<runId>`, 검증·기본 road). 순수 계산부와 분리(IO는 얇게).
  - **엣지(A6-2)**: NaN/Infinity/음수 절대 금지 — 모든 결측·0·음수 입력에 graceful 기본값. 빈 runs → ageWearKm만. targetKm=0 → DEFAULT 사용.
  - 테스트(`__tests__` 또는 `lib/__tests__`): S6-1(체중85>70 실효↑, 미설정 1.0), S6-2(trail>road, race>easy, 노면 미태그=road), S6-3(저주행+오래됨→ageWearKm 누적), A6-1(원본 불변), A6-2(엣지 무NaN). 라인 커버리지 ≥60%, 크리티컬 패스 ≥1.
  - iron law: 순수·네이티브0·백엔드0·tsc/lint/test green. **기존 weightKg 재사용**(신규 체중 키/UI 금지).

- **slice-6-forecast** (dev, deps: slice-6-wear-model): `lib/replacementForecast.ts` 순수함수 신설.
  - `forecastReplacement(shoe, runs, opts={weightKg, now, surfaceOf?})` → `{ kmRemaining, weeksRemaining|null, etaISO|null, confidence:'high'|'low', reason:'ok'|'overdue'|'no_recent' }`.
  - kmRemaining = targetKmFor(shoe) − effectiveWearKm(...). remaining≤0 → reason'overdue'(weeks=0, eta=now). 최근28일 실효주행 합=0 → reason'no_recent'(weeks/eta=null). 그 외: recentRatePerWeek = (최근28일 실효km)/4; agePerWeek = (targetKm/24)/4.345; weeksRemaining = kmRemaining/(recentRatePerWeek+agePerWeek); etaISO = now + weeks. confidence = 최근28일 런수≥3 ? 'high' : 'low'.
  - effectiveWearKm·targetKmFor·runEffectiveWear 는 wearModel 에서 import(중복 구현 금지).
  - 테스트: S6-4(정상 forecast weeks·eta·confidence, overdue, no_recent), A6-2(엣지 무NaN/음수), A6-3(추정 톤은 UI 책임이나 함수는 null 명확 반환).
  - iron law 동일.

- **slice-6-ui** (dev, deps: slice-6-forecast): 기존 토큰화 화면에 표시 추가(레이아웃 신설 최소, theme 토큰만).
  - **신발 상세(ShoesScreen.rn.tsx 의 상세/확장 영역)**: "실효 마모 {effective}km / 권장 {target}km" + 교체 예측 라인 — reason별 카피(keep-going·추정 톤): ok="이 페이스면 약 {N}주 후 교체 권장 · 예상 {M월 D일}", overdue="지금 교체하면 부상 없이 계속 달릴 수 있어요", no_recent="최근 기록이 없어 예측할 수 없어요". '약'/'예상' 추정 톤 필수(A6-3).
  - **홈(HomeScreen.rn.tsx) 교체임박 카드**: 기존 교체 경고/배지에 forecast ETA 한 줄 보강(있을 때).
  - **런 노면 태그**: 런 편집/수동입력 경로(App.runedit 관련 — 실제 위치는 코드서 확인)에 노면 선택(road/trail/track/treadmill, 기본 road) → setRunSurface 영속. 선택 UI는 토큰화 컴포넌트(칩/세그먼트).
  - 체중은 ProfileScreen 기존 설정 재사용(여기서 추가 입력 UI 만들지 말 것). UI는 settings.weightKg 를 읽어 wearModel/forecast opts 로 전달.
  - 행동 테스트(react-test-renderer, props-driven, 백엔드 호출 없이, 기존 jest.setup 모킹): 신발 상세에 예측 라인 텍스트 렌더(ok/overdue/no_recent 분기), 홈 카드 ETA 렌더, 체중 변경이 실효마모 표시에 반영, 노면 선택 press→setRunSurface 호출. (steer 8992e6cc: 토큰화 정적스캔만으론 test_critic 불충분 — 행동 단언 필수.)
  - iron law: theme 토큰만(하드코딩 색/폰트 0), 데이터 파괴 0, 네이티브 0, 다크+오렌지 유지, tsc/lint/test green.

- **slice-6-e2e** (integration_test, report_only, deps: slice-6-ui): `npx tsc --noEmit` + `npm run lint` + `npm test` green 확인, Slice 6 시나리오(S6-1..S6-5 + A6-1..A6-4) 커버리지 확인(wearModel/forecast 단위 + 신발상세/홈 행동 테스트 존재·통과), 기존 신발/런/설정 AsyncStorage 키 보존, 원본 total_km/distance_km 불변 확인. 코드 수정 금지(report-only), 차단결함은 `tenet_report_blocking_finding`.

### Interface Contracts (dev 잡 준수)
- `lib/wearModel.ts`: `runEffectiveWear(run:RunLike, opts?:{surface?:Surface}):number`; `effectiveWearKm(shoe:ShoeLike, runs:RunLike[], opts?:{weightKg?:number, now?:Date, surfaceOf?:(runId)=>Surface}):number`; `targetKmFor(shoe:ShoeLike):number`; `ageWearKm(shoe:ShoeLike, now?:Date):number`; `type Surface='road'|'trail'|'track'|'treadmill'`. RunLike/ShoeLike 는 lib/shoe.ts 타입 재사용/확장.
- `lib/replacementForecast.ts`: `forecastReplacement(shoe, runs, opts?):ReplacementForecast` (위 반환형). wearModel 함수 import.
- 노면 IO: `getRunSurface(runId:string):Promise<Surface>` / `setRunSurface(runId:string, s:Surface):Promise<void>` (AsyncStorage `surface_<runId>`, 기본 road).
- 체중: `lib/settings.ts` 기존 `weightKg`(K_WEIGHT='body_weight_kg', 기본 DEFAULT_WEIGHT_KG=65) 재사용. 신규 키 금지.

수용 테스트 컨벤션: 이 레포는 Slice 1~5와 동일하게 **dev 잡이 co-located 테스트(`__tests__/*.test.tsx`, `lib` 단위 테스트)를 직접 작성**하고 slice-6-e2e 가 `npm test` 스위프로 검증한다(별도 tests/acceptance 스텁 미사용 — 미존재 모듈 import 가 tsc strict 를 깨 동시 잡 eval 을 오염시키므로). 각 dev 잡 프롬프트에 담당 시나리오(S6-x/A6-x)를 명시함.

---

## Slice 7 (Phase 3): 수익화 — 교체 시점 어필리에이트 신발 추천 (감사·갭보완)

> **현황(2026-06-04 감사 완료)**: Slice 7 핵심은 커밋 3703b9c로 **약 70% 이미 구현됨** — `lib/affiliate.ts`(`recommendNextShoes`·`buildShopLinks`[쿠팡+네이버]·`categoryLabelKo`·`AFFILIATE_DISCLOSURE`), `HomeScreen.rn.tsx`의 `NextShoeCard`(condition==='교체' 시 노출·`Linking.openURL` 동작), `__tests__/lib/affiliate.test.ts`·`__tests__/HomeScreen.nextShoe.test.tsx`, `data/shoeModels.ts` 134모델 7카테고리 매핑. **시크릿 0**(AFFILIATE 태그는 빈 기본값 주입 지점, buildShopLinks 는 빈 값이면 순수 검색 URL). → **재구축 금지, 아래 4개 갭만 보완.**

스펙 대비 실제 갭: (1) 추천 카드가 홈에만 있고 **신발 상세(ShoesScreen)엔 없음**(스펙='신발상세/홈'), (2) 추천 트리거가 `condition==='교체'`(percent 90%) 기반이고 **Slice 6 forecast(교체임박/overdue) 미연결**(스펙='교체임박(Slice 6 forecast) 시'), (3) 쇼핑 링크가 **쿠팡+네이버만, 무신사/29CM 미포함**(스펙=쿠팡파트너스/무신사/29CM), (4) 위 항목 테스트.

> **직렬 체인**: 화면 파일(HomeScreen·ShoesScreen) 공유 충돌 방지 + lib 헬퍼 선구현 위해 선형 의존.

### ASCII DAG

```
slice-7-shoplinks → slice-7-trigger → slice-7-detail-card → slice-7-e2e (report_only)
  (lib/affiliate     (forecast 트리거    (ShoesScreen 신발상세    (tsc/lint/test +
   무신사/29CM 확장)   헬퍼 + 홈 재배선)    추천 카드)              S7 커버리지·시크릿0)
```

### Jobs

- **slice-7-shoplinks** (dev, deps []): `lib/affiliate.ts` 의 `buildShopLinks` 를 **무신사·29CM 검색 링크 추가**로 확장(재구축 금지 — 기존 쿠팡/네이버 항목·정렬·시그니처 보존). 무신사 `https://www.musinsa.com/search/musinsa/integration?q={q}`, 29CM `https://www.29cm.co.kr/search?keyword={q}` (q=encodeURIComponent). `AFFILIATE` 주입 객체에 `musinsa:''`·`twentyninecm:''` 추가(빈 기본값·시크릿 0, 태그 있으면 그때만 쿼리 부착, 빈 값이면 순수 검색 URL). `__tests__/lib/affiliate.test.ts` 확장: 4개 쇼핑몰 링크 생성·URL 인코딩·**AFFILIATE 빈 값 시 태그 미부착(시크릿 0)** 단언. iron law: 순수·네이티브0·tsc/lint/test green.

- **slice-7-trigger** (dev, deps slice-7-shoplinks): 추천 노출 트리거를 **Slice 6 forecast 에 연결**. `lib/affiliate.ts`(또는 신규 `lib/recommendTrigger.ts`)에 순수 헬퍼 `shouldRecommendNextShoe(forecast: ReplacementForecast): boolean` 신설 — `forecast.reason==='overdue'` 또는 교체임박(`reason==='ok'` && `weeksRemaining!=null` && `weeksRemaining <= REPLACE_SOON_WEEKS`(예 3)) 시 true, `no_recent`/여유 충분 시 false. `lib/replacementForecast.ts` 의 `forecastReplacement` 결과를 입력으로(중복 계산 금지·import 재사용). `HomeScreen.rn.tsx` 의 `NextShoeCard` 노출 조건을 기존 `active.condition==='교체'` 에서 이 헬퍼(App 이 주입하는 forecast 기반)로 전환 — **단 기존 percent 기반도 폴백 보존**(forecast 없을 때 회귀 방지). 단위 테스트(overdue·임박·여유·no_recent 분기) + 홈 행동 테스트(forecast overdue/임박 시 카드 노출, 여유 시 숨김). iron law: 데이터 파괴0·네이티브0·tsc/lint/test green.

- **slice-7-detail-card** (dev, deps slice-7-trigger): **신발 상세(ShoesScreen.rn.tsx)에 '다음 러닝화' 추천 카드 추가**(현재 홈에만 존재). `recommendNextShoes`·`buildShopLinks`·`AFFILIATE_DISCLOSURE`·`categoryLabelKo` 재사용(재구현 금지), `shouldRecommendNextShoe`(slice-7-trigger) 로 교체임박 신발에서만 노출. 카드: 추천 모델 3개(브랜드·모델·카테고리 라벨) + 4개 쇼핑몰 버튼(press→`Linking.openURL`) + `AFFILIATE_DISCLOSURE` 고지. theme 토큰만(하드코딩 색/폰트0·다크#000+오렌지#FF6500). 행동 테스트(교체임박 신발 상세→카드 렌더·추천모델 텍스트·링크 press→openURL 호출, 여유 신발→미노출). iron law: 네이티브0·데이터 파괴0·tsc/lint/test green.

- **slice-7-e2e** (integration_test, report_only, deps slice-7-detail-card): `npx tsc --noEmit` + `npm run lint` + `npm test` green 확인, Slice 7 커버리지 확인(affiliate 단위 + 홈/신발상세 추천카드 행동 테스트 존재·통과, 4개 쇼핑몰 링크, forecast 트리거 연결), **시크릿 0 확인**(`lib/affiliate.ts` 의 AFFILIATE 객체 전부 빈 기본값·평문 태그 미커밋), 네이티브/백엔드 변경 0, 데이터 파괴 0(추천은 읽기 전용 파생). 코드 수정 금지(report-only), 차단결함은 `tenet_report_blocking_finding`.

### Interface Contracts (dev 잡 준수)
- `lib/affiliate.ts`: 기존 `recommendNextShoes`/`AFFILIATE_DISCLOSURE`/`categoryLabelKo` 보존. `buildShopLinks(m:{brand,model}):ShopLink[]` 는 4개 항목(쿠팡·네이버쇼핑·무신사·29CM) 반환으로 확장. `AFFILIATE:{coupang,naver,musinsa,twentyninecm}` 전부 빈 문자열 기본(시크릿 0).
- 트리거 헬퍼: `shouldRecommendNextShoe(forecast:ReplacementForecast):boolean` (overdue 또는 weeksRemaining≤REPLACE_SOON_WEEKS). forecast 는 `lib/replacementForecast.ts` 의 `forecastReplacement` 산출물 재사용.
- 추천 카드는 홈·신발상세 **공통 트리거**(shouldRecommendNextShoe) + 공통 빌더(recommendNextShoes/buildShopLinks) 사용 — 두 화면 동작 일치.

수용 테스트 컨벤션: Slice 6 과 동일(dev 잡 co-located 테스트 직접 작성, slice-7-e2e 가 `npm test` 스위프 검증). 통과 시 Slice 7 done → use-checkpoint(실기기에서 교체임박 신발의 추천 카드·쇼핑몰 열기 확인). 실제 제휴 파트너 태그(쿠팡파트너스/무신사/29CM ID)는 **코드 불요·사용자가 레포밖에서 AFFILIATE 에 주입**(없으면 순수 검색 링크로 동작).

---

## Slice 8 (Phase 3): 리텐션 — 푸시 알림(FCM) + 주간/월간 리캡 (2026-06-09 use-checkpoint approve)

네이티브 포함 슬라이스(FCM messaging). **위험 격리 전략**: 순수 lib(notifications·recap)를 먼저 착지(네이티브 0·완전 테스트 가능)시키고, 위험한 네이티브 FCM 잡을 격리한 뒤, UI 잡을 마지막에. 기존 자산 재사용: `lib/replacementForecast.ts`(forecast·shouldRecommendNextShoe), `lib/goals.ts`(weeklyProgress·currentStreak·personalRecords), `lib/stats.ts`(summaryOf·sumKm·avgPaceLabel), `lib/wearModel.ts`(effectiveWearKm), `lib/shareCard.ts`(captureCardDataUrl·shareRunCard — svg toDataURL, Slice 4 패턴), `lib/settings.ts`(기존 `AlertSettings`/`K_ALERTS` 인앱배지는 **보존**, 푸시용 `notif_settings`는 신규 키). `@react-native-firebase/app/auth/firestore` 24.0.0 이미 존재.

> **직렬 체인 근거**: notif-ui·recap-ui 가 둘 다 ProfileScreen 을 만지고, fcm-native·notif-ui 가 App.tsx 를 만질 수 있어 화면/부트 파일 충돌 방지로 선형화. 순수 lib 두 개(notif-logic·recap-logic)만 시작점에서 병렬.

### ASCII DAG

```
slice-8-notif-logic ──> slice-8-fcm-native ──> slice-8-notif-ui ──┐
  (lib/notifications     (messaging 통합·권한·     (ProfileScreen 알림     │
   순수 결정+설정IO)       jest mock·gradle검증)     설정·권한·App배선)      ├──> slice-8-e2e
                                                                  │     (report_only)
slice-8-recap-logic ──────────────────────────> slice-8-recap-ui ┘
  (lib/recap 순수 요약)                            (리캡 보기+공유카드)
```

### Jobs

- **slice-8-notif-logic** (dev, deps []): `lib/notifications.ts` 순수 결정 로직 + 설정 IO(네이티브 0).
  - `dueNotifications(state, now): NotificationIntent[]` — state = `{ shoesWithForecast:{shoe, forecast}[], weekly:WeeklyProgress, lastRunISO:string|null, settings:NotifSettings }`. 반환 의도 타입: `'shoe_replacement'`(forecast `reason==='overdue'` 또는 임박[shouldRecommendNextShoe]인 신발마다·신발명 포함), `'weekly_goal'`(now가 금요일 이후이고 weekly.percent<100일 때 진척 안내), `'run_reminder'`(settings.reminderTime 시각이고 오늘 런 없음[lastRunISO≠오늘]일 때). 각 타입은 `settings`의 해당 토글이 off면 제외(끄기 가능). 각 Intent = `{ type, title, body, key }`(key=중복 방지용 안정 식별자, 같은 날 같은 종류 1회).
  - 설정 타입·IO: `NotifSettings = { shoeReplacement:boolean, weeklyGoal:boolean, runReminder:boolean, reminderTime:string('HH:MM') }`, `DEFAULT_NOTIF_SETTINGS`(전부 true, reminderTime 예 '19:00'). `getNotifSettings():Promise<NotifSettings>`/`setNotifSettings(s):Promise<void>`(AsyncStorage `notif_settings` json, 검증·결측 graceful 기본값). 순수 계산부와 IO 분리(IO 얇게). **기존 `K_ALERTS`/`AlertSettings`(인앱 배지) 건드리지 말 것 — 신규 키 `notif_settings`만 추가**(A8-1).
  - forecast/임박 판단은 `lib/replacementForecast.ts`(`forecastReplacement`·`shouldRecommendNextShoe`) import 재사용(중복 계산 금지). weekly 는 `lib/goals.ts` `weeklyProgress` 산출물 입력으로 받음.
  - **엣지(A8-5/A4식 graceful)**: 신발 0·런 0·lastRunISO null·forecast no_recent 에서 빈 목록 반환, NaN/예외 없음. 같은 알림 중복 금지(key 안정·당일 1회, A8-4).
  - 테스트(`lib/__tests__` 또는 `__tests__`): S8-1(각 타입 트리거/비트리거), S8-2(토글 off→제외), A8-4(중복 키 1회), A8-5(엣지 빈 목록). 라인 커버리지 ≥60%, 크리티컬 패스 ≥1.
  - iron law: 순수·네이티브0·백엔드0·tsc/lint/test green. 시크릿 0.

- **slice-8-recap-logic** (dev, deps []): `lib/recap.ts` 순수 요약(네이티브 0).
  - `weeklyRecap(runs, shoes, opts?)` / `monthlyRecap(runs, shoes, opts?)` → `Recap = { periodLabel:string, totalKm:number, runCount:number, avgPaceLabel:string, mostWornShoe:{name,km}|null, perShoeWear:{name,effectiveKm}[], prs:PersonalRecords, isEmpty:boolean }`. `lib/stats.ts`(summaryOf·sumKm·avgPaceLabel·durationLabel), `lib/goals.ts`(personalRecords), `lib/wearModel.ts`(effectiveWearKm — 신발별 실효마모) 재사용. 기간 필터(주=최근 월요일~, 월=해당 월) 순수 계산. now 는 opts 주입(테스트 결정성).
  - **엣지(A8-5)**: 런 0개→isEmpty true·0값 graceful, mostWornShoe null, NaN/Infinity 0. 원본 데이터 불변(읽기 전용 파생).
  - 테스트: S8-5(총거리·런수·평균페이스·최다착용·신발별마모·PR), A8-5(빈 데이터 graceful·무NaN), A8-1(원본 불변). 커버리지 ≥60%.
  - iron law: 순수·네이티브0·tsc/lint/test green.

- **slice-8-fcm-native** (dev, deps [slice-8-notif-logic]): `@react-native-firebase/messaging` 네이티브 통합 + 권한 + 얇은 RN 래퍼(`lib/pushMessaging.ts`).
  - **착수 즉시 호환 확인(최우선, steer 31a3080c)**: `@react-native-firebase/messaging`를 기존 firebase 24.0.0(app/auth/firestore)·RN 0.85 와 **동일/호환 버전(24.0.0 권장)** 으로 추가. 통합 후 gradle/메트로/tsc/lint/test 를 green 으로 만들 수 없으면 **절대 깨진 네이티브 상태를 커밋하지 말 것** — 네이티브 변경(package.json·android)을 되돌려 빌드 원상복구하고 비호환 내용(버전·에러)을 `tenet_report_blocking_finding`/최종출력에 남기고 중단(A8-2, iron law).
  - 통합 범위(최소): messaging 의존 추가 + Android POST_NOTIFICATIONS 권한 선언(AndroidManifest) + 권한 런타임 요청 헬퍼(거부 graceful·비차단, S8-3) + 포그라운드 메시지 핸들러/토큰 취득을 `lib/pushMessaging.ts`(네이티브 호출 격리·모킹 가능)로 래핑. **로컬 알림 표시**: `dueNotifications`(slice-8-notif-logic) 결과를 앱 포그라운드 진입 시 표시하는 경로를 래퍼에 둠. OS 타이머 기반 정밀 스케줄(notifee 등)은 **네이티브 최소 원칙상 이번 범위 밖** — 새 네이티브 스케줄 라이브러리 추가 금지(필요하다고 판단되면 임의 추가 말고 보고). google-services.json 등 시크릿은 레포 밖(A8-4).
  - `jest.setup.js`(또는 after)에 `@react-native-firebase/messaging` 모킹 추가 — 단위/행동 테스트가 네이티브 없이 green.
  - 테스트: pushMessaging 래퍼의 권한 거부 graceful(throw 안 함)·토큰/메시지 핸들러 모킹 동작. tsc/lint/test green.
  - **오케스트레이터 추가 검증(eval 게이트 밖)**: 이 잡 완료 후 오케스트레이터가 별도로 `npx react-native run-android`(emulator-5554, ANDROID_HOME 설정됨)로 gradle 빌드+에뮬 설치 무결성을 확인한다. 깨지면 빌드 에러를 enhanced_prompt 로 retry(또는 비호환이면 되돌림 보고).
  - iron law: 네이티브 최소·빌드 깨지면 머지 금지·데이터 파괴0·시크릿0·tsc/lint/test green.

- **slice-8-notif-ui** (dev, deps [slice-8-fcm-native]): ProfileScreen 알림 설정 UI + 권한 흐름 + App 배선.
  - ProfileScreen 설정 섹션에 **푸시 알림 설정**(기존 인앱 '알림' 행[배지 임계값]과 별개·공존): 종류별 토글 3개(교체임박/주간목표/러닝리마인더) + 리마인더 시각 선택, `getNotifSettings`/`setNotifSettings` 배선(S8-2). 권한 미허용 시 권한 요청 진입 + 거부 graceful 안내(비차단, S8-3).
  - `App.tsx` 배선: 포그라운드 진입 시 `dueNotifications`(현재 신발 forecast·weekly·lastRun·settings 조합)를 계산해 `lib/pushMessaging.ts` 표시 경로로 전달. **기존 온보딩/부트 플로우(OnboardingScreen·ONBOARD_KEY)·신발 등록 경로와의 상호작용 인지**(steer f4ae2048) — 비차단·기존 흐름 보존.
  - theme 토큰만(하드코딩 색/폰트0·다크#000+오렌지#FF6500). 행동 테스트(react-test-renderer, props-driven, jest.setup 모킹): 토글 press→`setNotifSettings` 올바른 인자 호출, 설정행이 실제 `notif_settings` 값 반영, 권한 거부 시 비차단(크래시 없음·나머지 동작). (steer 8992e6cc: 정적스캔만으론 test_critic 불충분 — 행동 단언 필수.)
  - iron law: 데이터 파괴0(기존 `AlertSettings` 보존)·theme 토큰·tsc/lint/test green.

- **slice-8-recap-ui** (dev, deps [slice-8-notif-ui, slice-8-recap-logic]): 리캡 보기 + 공유카드.
  - ProfileScreen(또는 홈)에 **리캡 진입**(주간/월간 토글) → `weeklyRecap`/`monthlyRecap` 결과 렌더(총거리·런수·평균페이스·최다착용·PR). 빈 데이터 graceful 카피(keep-going 보이스, A8-5).
  - **공유카드**: `lib/shareCard.ts` 의 svg toDataURL 패턴 재사용(Slice 4) — 리캡 요약 카드 SVG → `captureCardDataUrl`/`shareRunCard` 류로 공유. **새 네이티브 의존 추가 금지**(A8-3). 필요 시 `lib/shareCard.ts` 에 리캡용 빌더만 추가(기존 런카드 시그니처 보존).
  - theme 토큰만(다크+오렌지). 행동 테스트: 리캡이 실데이터로 렌더(주/월 분기), 공유 press→공유 함수 호출, 빈 데이터 graceful 렌더.
  - **주의**: notif-ui 와 같은 ProfileScreen 을 만지므로 deps 로 직렬화됨(충돌 방지). 기존 백업/내보내기·설정 행 보존.
  - iron law: 네이티브0(공유카드 svg)·데이터 파괴0·theme 토큰·tsc/lint/test green.

- **slice-8-e2e** (integration_test, report_only, deps [slice-8-notif-ui, slice-8-recap-ui]): `npx tsc --noEmit` + `npm run lint` + `npm test` green 확인, Slice 8 커버리지(S8-1·S8-5 순수 단위 + S8-2·S8-3·S8-6 UI 행동 테스트 존재·통과), `notif_settings` 영속·기존 `settings_alerts` 보존 확인(A8-1), jest.setup messaging 모킹 존재, **시크릿 0**(messaging 서버키/google-services 미커밋), 새 네이티브 스케줄/뷰샷 의존 미추가(A8-3) 확인, 데이터 파괴 0(리캡·알림은 읽기전용 파생). 코드 수정 금지(report-only), 차단결함은 `tenet_report_blocking_finding`. **단, FCM 실제 푸시 수신·OS 타이머 정밀 스케줄은 사용자 실기기 검증 사항으로 범위 밖**(use-checkpoint 에서 안내).

### Interface Contracts (dev 잡 준수)
- `lib/notifications.ts`: `type NotifSettings={shoeReplacement:boolean,weeklyGoal:boolean,runReminder:boolean,reminderTime:string}`; `DEFAULT_NOTIF_SETTINGS`; `type NotificationIntent={type:'shoe_replacement'|'weekly_goal'|'run_reminder',title:string,body:string,key:string}`; `dueNotifications(state,now:Date):NotificationIntent[]`; `getNotifSettings():Promise<NotifSettings>`; `setNotifSettings(s:NotifSettings):Promise<void>`. forecast/weekly 는 기존 lib import 재사용.
- `lib/recap.ts`: `type Recap={periodLabel,totalKm,runCount,avgPaceLabel,mostWornShoe:{name,km}|null,perShoeWear:{name,effectiveKm}[],prs,isEmpty}`; `weeklyRecap(runs,shoes,opts?):Recap`; `monthlyRecap(runs,shoes,opts?):Recap`. stats/goals/wearModel import 재사용.
- `lib/pushMessaging.ts`: 네이티브 messaging 호출 격리 래퍼 — `requestPushPermission():Promise<boolean>`(거부 graceful), `presentDue(intents:NotificationIntent[]):Promise<void>`(포그라운드 표시), 토큰/핸들러 셋업. jest.setup 모킹.
- 기존 보존: `lib/settings.ts` 의 `AlertSettings`/`K_ALERTS`(인앱 배지)는 불변, 푸시 설정은 신규 `notif_settings` 키. `lib/shareCard.ts` 기존 런카드 시그니처 보존(리캡 빌더만 추가).

수용 테스트 컨벤션: Slice 6·7 과 동일(dev 잡 co-located 테스트 직접 작성, slice-8-e2e 가 `npm test` 스위프 검증, 별도 tests/acceptance 스텁 미사용). 네이티브 잡(slice-8-fcm-native)은 eval 게이트(tsc/lint/test)에 더해 오케스트레이터의 `npx react-native run-android` gradle 빌드 검증을 추가로 받는다. 통과 시 Slice 8 done → use-checkpoint(실기기에서 실제 푸시 수신·리캡 공유 확인).
