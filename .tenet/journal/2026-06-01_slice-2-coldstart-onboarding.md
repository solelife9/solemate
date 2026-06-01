# slice-2-coldstart-onboarding 완료

type: journal
job_name: 콜드 백엔드 로딩/에러 상태 + 권한 priming + 온보딩 + 서버 truth
created: 2026-06-01

## Findings

- **outcome**: tsc/lint(0 errors)/jest 43 suites · 388 tests 통과
- **deliverables**:
  - **부팅 상태기계(audit#9/#10)**: `BootState='loading'|'ready'|'error'`. `initUser`가 fetch 시작 전 'loading'(스켈레톤), 성공 시 'ready', fetch 실패 시 'error'(재시도 카드). **빈-신규(성공+빈배열)와 fetch 실패를 구분** — 신규는 온보딩, 실패는 keep-going 톤 재시도 카드(`BootError`, `다시 시도`→initUser 재진입).
  - **스켈레톤(스피너 아님)**: `BootSkeleton` — 히어로/주간통계3칸/신발줄 자리표시 회색 블록. testID `boot-skeleton`.
  - **권한 priming**: 라이브 런 진입 직전(`startActiveRun`) `locPrimed` 미설정 시 '위치 권한 안내' Alert(이유)를 **OS 다이얼로그 전에** 띄우고, '계속' 누르면 `loc_perm_primed` 영속 후 런 진입 → RunActiveScreen이 실제 OS 권한 요청.
  - **첫 실행 온보딩**: 신발 0개 + 미완료 시 `Onboarding`(신발 등록→달리면 수명 차감→교체 알림 3스텝). '신발 등록하고 시작'→add 화면, `onboarded` 영속.
  - **서버 truth**: `BackendShoe.total_km`/`run_time` 추가. `shoeHealth`가 `total_km` 유한·음수아님이면 usedKm으로 우선 채택(없으면 start_km+Σruns 폴백). App `shoeTotals`가 서버 `run_time`(초)→`durationLabel`로 누적 시간 표시(폴백 totalTimeLabel). stats에 `durationLabel(sec)` 추출.
  - **테스트**: `__tests__/App.coldstart.test.tsx`(로딩→skeleton / 에러→재시도카드+복구 / 빈-신규≠에러 / priming 순서 / 온보딩 라우팅 5케이스). shoe.test.ts 서버 truth 5케이스, stats.test.ts durationLabel 4케이스.
- **gotcha**: 권한 priming/온보딩이 기존 20+ 통합테스트(생 마운트→Home/런 진입)를 깰 위험. 해결: `jest.setup.after.js` 글로벌 beforeEach에서 `onboarded`/`loc_perm_primed`를 '1'로 시드(=기본 픽스처는 '재방문 사용자'). 콜드스타트 테스트만 키를 지워 first-run 옵트인. 단 async-storage jest mock은 default export가 모듈 자체 → `require(...).default` 아님(.default 빼야 함). runsnapshot은 afterEach에서만 clear라 시드 생존.
- **next**: 남은 audit 슬라이스 계속. expo-location 네이티브 백그라운드 추적은 여전히 사용자 결정 대기.
