# slice-2-profile-settings — 프로필 설정 4행 실동작

type: journal
job_name: ProfileScreen 설정 4행 실동작(목표/알림/단위/계정)
created: 2026-06-01

## Findings

- **outcome**: 구현 완료 — tsc(0 errors), eslint(0 errors), jest 301/301.
- **deliverables**:
  - `lib/settings.ts`(신규): AppSettings/AlertSettings 타입, 키(settings_unit/goal_weekly_km/settings_alerts),
    순수 파서(parseUnit/parseGoal/clampGoal/clampThreshold/parseAlerts) + AsyncStorage 영속(loadSettings/saveUnit/saveGoal/saveAlerts).
    손상/누락 영속값은 모두 기본값으로 정규화(데이터 안전).
  - `lib/units.ts`: unitKorean('킬로미터'|'마일'), displayNum(km→표시단위 반올림) 추가.
  - `ProfileScreen.rn.tsx`: 하드코딩 '주5회'/'켜짐'/'킬로미터' 제거. 설정 4행이 실제 구동 —
    목표 설정(주간 km 스테퍼+달성률), 알림(on/off 토글+임계값 스테퍼), 단위(km↔mi 즉시 토글), 계정(기기/가입/버전).
  - `App.tsx`: 설정 상태 소유 + loadSettings 복원 + 변경 시 즉시 영속. unit을 전 탭 화면에 주입해
    거리 표기를 환산(km은 항등 — 기존 출력 불변). checkShoeAlerts가 alerts(on/off·임계값)를 따른다.
    주간 목표 달성률은 weeklyProgress(lib/goals)로 계산해 홈에 표시.
  - HomeScreen/HistoryScreen/ShoesScreen: unit prop으로 거리·차트 눈금 환산. 비율(수명 ring)·
    cost-per-km(원/km)은 km 절대값 유지(단위 불변/의미 보존).
- **tests**:
  - `__tests__/lib/settings.test.ts`: 파서 정규화 + AsyncStorage 라운드트립.
  - `__tests__/App.settings.test.tsx`(통합): 단위 토글→settings_unit 영속+전화면 'mi 남음' 반영,
    재마운트 복원, 목표 스테퍼→홈 달성률 50%→60% 갱신, 알림 토글→settings_alerts.enabled 영속.
- **scope note**: 단위 환산은 4개 탭 화면(홈/기록/신발/프로필)에 적용. 라이브 런 화면/RunStart는
  per-run goalKm 의미와 GPS 엔진 정확도 때문에 km 유지(후속).
- **lesson**: Shoe.used를 어댑터에서 mi로 환산하면 costPerKm(원/km)이 오염된다 — 단위 환산은
  '표시 경계(스크린)'에서만 하고, 로직이 재사용하는 km 절대값은 건드리지 않는다.
