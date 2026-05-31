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
