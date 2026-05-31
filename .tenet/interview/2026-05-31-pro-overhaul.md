# Interview: SoleMate Pro Overhaul (엔진 정밀화 + 기능 완성 + 디자인 리뉴얼)

Date: 2026-05-31
Mode: Full
Rounds: 2

## Clarity Score
- Goal: (validated externally via tenet_validate_clarity)
- Constraints: (validated externally)
- Success criteria: (validated externally)
- **Total: pending tenet_validate_clarity (>= 0.8 required)**

## Round 1

### Questions Asked
1. 이번 세션에서 무엇을 작업할까요? (작업 성격 → 실행 모드)
   > 새 기능 추가 → 이후 범위가 확장됨 (아래 참조)

2. 어떤 새 기능을 추가할까요? (후보: 러닝 목표&달성률 / 신발 교체 알림 / 코스 지도 / 기록 내보내기)
   > "다 해줄 수 있어?" → 네 개 모두, 추천 순서대로 진행하기로 함.

3. (사용자 추가 요청) 개발 초기 단계라 전반적으로 마음에 안 듦. "진짜 숙련된 개발자·디자이너가 만든, 누가 봐도 깔끔하고 멋진 앱"으로 만들어 달라.
   > 전체 디자인/완성도 리뉴얼이 핵심 목표로 추가됨.

4. (사용자 추가 요청) Claude로 UI를 대충 만들어 놨는데, 화면에 보이는 기능 중 실제로 동작 안 하는(미구현) 것들을 실제 작동하게 해야 한다.
   > "미완성 UI 연결/구현"이 작업 갈래로 추가됨. (audit 수행: 아래 Decisions 참조)

5. (사용자 추가 요청) 비개발자라 GPS·케이던스·심박 등 러닝 핵심 기능이 제대로 구현됐는지 모르겠음. 나이키 런 클럽 등 타 러닝 앱과 비교해 손색없는 정확도/품질이면 좋겠음. 제대로 개발됐는지 확인해 달라.
   > 핵심 러닝 엔진 품질 검증·개선이 작업 갈래로 추가됨. (코드 직접 분석 수행: 아래 참조)

6. 심박(BPM)은 스마트폰 단독 측정 불가. 어떻게 처리할까요?
   > "지금은 심박 제거/숨김" — HR UI/필드를 깔끔히 숨기고 폰으로 정확히 되는 지표에 집중. 향후 BLE 워치/벨트 연동은 별도 작업으로 남김.

7. 전체 작업 순서는?
   > "엔진 → 기능 → 디자인" (추천안 채택).

### Decisions Made

**범위 (4개 작업 갈래, agile slice 단위):**
- Slice 1 — 핵심 러닝 엔진 정밀화: GPS 정확도(정확도 기반 fix 필터링/워밍업/이상치 제거), 자동 일시정지 버그 수정, 케이던스 알고리즘 개선. 나이키/스트라바 수준 근접이 목표.
- Slice 2 — 미완성 UI 연결 + 신규 기능:
  - ProfileScreen 설정 영역 전체 실동작화 (목표 설정 / 알림 / 단위 / 계정 설정 — 현재 onPress·상태 없음, 하드코딩 '주 5회'/'켜짐'/'킬로미터')
  - 신규: 러닝 목표 & 달성률(+스트릭), 신발 교체 알림 확장(현 하루1회 Alert → 임계값 설정/앱내 표시), 코스 지도 기록(route 좌표 이미 저장됨 → 시각화), 기록 내보내기/공유
  - AddShoe 사진 업로드(현재 장식용 placeholder) 실동작화
  - App.tsx activeIdx={0} 하드코딩 → 선택 신발 반영
- Slice 3 — 전체 디자인 리뉴얼 & 마감 polish: 일관된 theme 토큰/타이포/간격/primitives, 전 화면 시각 완성도 상향. 기존 다크+오렌지(#FF6500)·Pretendard/Bebas 방향성 유지하며 정교화.

**심박 처리:** 측정 미구현이 사실 → 관련 UI/저장 필드 깔끔히 제거·숨김. 데이터 파괴 없이(기존 heart_rate 값 보존, 표시만 숨김).

**브라운필드 코드 분석 결과 (constraints/context, [scanned-not-verified]):**
- 엔진(App.tsx): Haversine `calcDist` + 간이 1D Kalman(`Q=3`). 거리 인정 구간 3m~300m. **정확도(acc) 기반 fix 거부 없음** → 신호 나쁠 때 거리 튐. GPS 워밍업 폐기 없음.
- **자동 일시정지: 상태/재개 로직은 있으나 "정지 감지" 트리거 미연결 → 사실상 동작 안 함 (버그).**
- 케이던스: 가속도계 magnitude 피크(고정 임계값 12, 250ms 디바운스, 60s 윈도우 step수). 동작하나 비적응형.
- 심박: 필드/저장만 존재, 측정 소스 없음(BLE 라이브러리 없음) → 항상 0.
- 화면 상태: Home/History/Shoes/Run 정상 동작. ProfileScreen 설정 영역 전체 비동작. AddShoe 사진 placeholder.
- route 좌표는 `route_<id>`에 `[{lat,lon}]` 샘플(최대 200점) JSON으로 이미 저장됨 → 코스 지도는 데이터 존재, 시각화만 필요.
- 코스 지도 렌더링 방식(react-native-svg 폴리라인 vs react-native-maps)은 Slice 2 decomposition에서 확정 (네이티브 최소 변경 정책상 svg 우선 후보).

**성공 기준 (measurable):**
- 엔진: tsc/lint/test 통과. 거리 계산·페이스·포맷 등 순수 함수 단위 테스트 ≥60%. 정확도 낮은 GPS fix가 거리에 반영되지 않음(테스트로 검증). 자동 일시정지가 정지 시 실제 작동.
- 기능: ProfileScreen 설정 4개 행이 모두 실제 동작(목표·알림·단위·계정), 하드코딩 값 제거하고 실제 상태 표시. 사진 업로드 동작. 목표/달성률·신발 알림·코스 지도·내보내기 각 기능이 실데이터로 작동.
- 디자인: 화면 내 하드코딩 색상/폰트 0 (theme 토큰만 사용), 전 화면 일관된 간격/타이포 스케일.
- 전역: 빌드 깨짐 없음(tsc/lint/test 모두 통과), 사용자 데이터(신발·런 기록) 파괴적 변경 없음, 시크릿 하드코딩 없음.

### Remaining Ambiguities
- 코스 지도 렌더링 라이브러리 선택 (svg vs maps) — Slice 2 진입 시 확정.
- 신발 교체 알림을 앱내 표시/배지로 둘지 OS 푸시까지 갈지 — Slice 2 진입 시 확정(네이티브 영향 고려).
- 목표 단위(주간/월간, 거리/횟수/시간)와 표시 위치 — Slice 2 진입 시 사용자 확인.
- 내보내기 형식(이미지 카드 vs 텍스트 vs GPX/CSV) — Slice 2 진입 시 확정.

## Round 2 — 구체화(정량 목표·실패 시나리오·잠정 기본값)

clarity 검증(0.74)에서 "수치/실패모드 미정의, 일부 제품 선택 미확정" 갭이 지적됨. 사용자는 비개발자이므로 GPS 정확도 임계값 등 **엔지니어링 수치는 개발자 판단으로 업계 표준에 맞춰 확정**하고, 제품 선택지는 **잠정 기본값**을 두되 각 slice 진입 use-checkpoint에서 사용자에게 최종 확인한다(agile 설계와 일치). 아래 값은 모두 코드 상수로 추출해 단위 테스트로 검증한다.

### A. GPS 엔진 정량 목표 (Slice 1, 결정됨 [decision-only])
- **정확도 기반 fix 거부:** `react-native-geolocation-service`의 `coords.accuracy`(수평 정확도 m)를 사용. **accuracy > 20m 인 fix는 거리 누적에서 제외**(상수 `MAX_FIX_ACCURACY_M = 20`). 도심 멀티패스/콜드 픽스의 거리 튐을 제거하는 안전 컷오프. 단, fix는 폐기하되 마지막 양호 위치는 유지해 경로 연속성 보존.
- **워밍업 폐기:** 트래킹 시작 후 **첫 3개 fix 또는 첫 3초 이내 fix는 거리에 미반영**(`WARMUP_FIXES = 3`). 초기 GPS 락이 가장 부정확하기 때문.
- **이상치/속도 게이트:** 기존 세그먼트 3m~300m 인정 유지 + **구간 순간속도 > 12 m/s(≈43km/h, 인간 러닝 상한 초과)면 거부**(`MAX_SEG_SPEED_MPS = 12`). 점프 좌표 차단.
- **목표치:** 알려진 경로에서 총거리 오차 ±5% 이내를 지향(실측 불가하므로 필드 보증 대신, "낮은 정확도 fix가 거리에 기여하지 않음"·"워밍업 fix 제외"·"속도 이상치 제외"를 **단위 테스트로 강제**).

### B. 자동 일시정지 정량 기준 (Slice 1, 결정됨 [decision-only])
- **정지 감지 → 자동 일시정지:** 이동 속도가 **0.6 m/s 미만이 연속 6초** 지속되면 자동 일시정지(`AUTO_PAUSE_SPEED_MPS = 0.6`, `AUTO_PAUSE_HOLD_S = 6`). 신호등/휴식 감지.
- **자동 재개:** 속도가 **1.0 m/s 초과로 연속 2초** 지속되면 재개(`AUTO_RESUME_SPEED_MPS = 1.0`, `AUTO_RESUME_HOLD_S = 2`). 히스테리시스로 깜빡임 방지.
- 일시정지 구간 동안 거리/시간 누적 중단(시간은 "운동 시간" 기준), 데이터 음수/유실 금지(iron law).
- 순수 판정 함수 `decideAutoPause(state, speed, dt)`로 분리해 테스트.

### C. 실패 시나리오 처리 (전 slice, 결정됨 [decision-only])
- **위치 권한 거부:** 런 시작 시 한국어 사유 안내 + 설정 딥링크 유도, 트래킹 시작 차단(크래시 금지). 이미 있는 권한 로직 회귀 금지(danger zone).
- **GPS 완전 불가(신호 없음):** 일정 시간 fix 미수신 시 한국어 안내 배너 표시, 가비지 거리 기록 금지, 수동 종료 허용. 기존 기록 보존.
- **사진 업로드 실패:** 신발은 사진 없이 저장(비차단), 재시도 제공, 에러 토스트. 데이터 유실 금지.
- **TTS 사용 불가:** 음성 안내 실패해도 트래킹은 정상 지속(무음 폴백).

### D. 기술 스택/버전 (확정, harness와 일치 [scanned-not-verified])
- RN 0.85.2 / React 19.2.3 / TS 5.8.3 / jest @react-native/jest-preset 0.85.2 (package.json 고정).
- 위치: `react-native-geolocation-service` ^5.3.1, 센서: `react-native-sensors` ^7.3.6, **그래픽: `react-native-svg` ^15.15.4 이미 설치됨**.

### E. 테스트 커버리지 기준 (확정 [decision-only])
- 신규 순수 함수 모듈 라인 커버리지 ≥ 60%.
- **크리티컬 패스는 각 함수당 최소 1개 단위 테스트 필수**: 거리 계산(`calcDist`/누적), 페이스·시간 포맷, GPS fix 필터(정확도/워밍업/속도 게이트), 자동 일시정지 판정, 신발 누적/수명 파싱.

### F. Slice 2 제품 선택 — 잠정 기본값(각 slice 진입 시 사용자 최종 확인 [decision-only])
- **코스 지도:** `react-native-svg` 폴리라인 렌더(네이티브 추가 0). `react-native-maps`는 도입 안 함(네이티브 최소 변경 정책). → Slice 2 진입 확인.
- **신발 교체 알림:** 앱내 배지 + 신발 목록/상세 임계값 표시(임계값 설정 가능). OS 푸시는 네이티브 영향이 커 보류. → Slice 2 진입 확인.
- **러닝 목표:** 1차 기본값 = **주간 거리 목표(km/주) + 스트릭**. 월간/횟수/시간 옵션은 확장. → Slice 2 진입 확인.
- **내보내기:** 1차 기본값 = RN 내장 `Share` API 기반 **텍스트 요약 공유**(네이티브 추가 0). 이미지 카드(view-shot)·GPX/CSV는 확장 후보. → Slice 2 진입 확인.

### 결정 요약
- 엔지니어링 수치(A·B·C·E)는 본 라운드에서 확정 — slice 진입 시 재질문하지 않음(테스트로 검증).
- 제품 선택(F)은 잠정 기본값으로 진행 가능하나 각 slice use-checkpoint에서 사용자 확인.

## Delivery Mode Decision
- Prompt shown: "작업을 어떤 방식으로 진행할까요? (Full 모드 전달 방식)" — agile(갈래별 확인: 초기 계획 확인 + 각 slice 후 use-checkpoint) vs autonomous(한번에 끝까지) 두 옵션을 명시적으로 제시.
- User response: "agile (갈래별 확인)"
- Selected delivery_mode: agile
- Selection basis: explicit_user_choice

## Summary
SoleMate(러닝/신발 관리 RN 앱)를 "숙련된 개발자·디자이너가 만든 수준"으로 끌어올린다. agile 3-slice: ①핵심 러닝 엔진 정밀화(GPS 정확도·자동 일시정지 버그·케이던스), ②미완성 UI 연결 + 신규 기능(목표&달성률, 신발 교체 알림, 코스 지도, 내보내기 + Profile 설정 실동작화 + 사진 업로드), ③전체 디자인 리뉴얼·마감. 심박은 하드웨어 한계로 현재 제거/숨김(향후 BLE 연동 별도). 안드로이드만 빌드, 네이티브 최소 변경, 데이터 파괴 금지, tsc/lint/test 통과를 iron law로 유지. 각 slice 완료 시 사용자 use-checkpoint로 확인 후 진행.
