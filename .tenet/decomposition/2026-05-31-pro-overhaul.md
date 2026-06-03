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
