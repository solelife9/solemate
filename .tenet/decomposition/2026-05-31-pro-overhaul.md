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
