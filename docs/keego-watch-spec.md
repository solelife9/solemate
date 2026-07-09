# Keego Watch — 단독 실행 watchOS 앱 스펙 (v1 구현 반영, 2026-07-10)

> 비전(사용자): 워치가 폰의 수신기가 아니라 **워치만 차고 나가도 Keego를 경험**하는 단독 앱.
> 벤치마크: Nike Run Club watchOS · Apple 운동 앱. 승인 후 착수 — `ios/` Danger Zone 작업.

## 1. v1 범위 (단독 러닝 경험의 최소 완성)

1. **시작 화면**: 활성 신발 **전체 목록을 홈처럼 좌우 스와이프**(가로 페이지 + 도트)로 넘기고, 현재 페이지의 신발이 러닝 시작 대상. 마지막 선택 신발 기억(다음 실행 시 그 페이지에서 시작). 폰이 applicationContext 로 목록 푸시(오프라인 캐시) + 파파야 링 "러닝 시작" — shoe-first 유지. *(사용자 확정 2026-07-10 — '활성 신발 1켤레 고정'에서 변경)*
2. **러닝 중**: **링 없음 — km 메인 히어로 + 보조 지표 스택** *(사용자 확정 2026-07-10 — 워치 화면이 작아 진행 링 제거)*. 거리(대형, tabular-nums) + 그 아래 시간·페이스·심박(존 색). 파파야는 km 라벨 등 최소 포인트에만(넓은 면 금지 가드레일). 크라운/세로 스와이프로 심박·페이스·시간 대형 페이지 + 컨트롤 페이지 전환. 자동 일시정지.
3. **종료**: 요약(거리·시간·페이스·심박) → 저장.
4. **동기화**: HKWorkoutSession 으로 워크아웃 기록(워치 GPS+심박) → ① 폰 근처면 WatchConnectivity 로 즉시 전송 ② 아니면 HealthKit 경유로 폰 복귀 시 흡수(기존 `lib/healthkit.ts` 백필 경로 재사용) → 신발 거리 자동 차감.
5. **컴플리케이션**: 신발 남은 수명 % 링(브랜드 순간).

비범위(v2+): 워치 단독 로그인/Firestore, 트랙 모드, 음성 코칭, 온보딩.

## 2. 아키텍처

- **watchOS 네이티브(SwiftUI)** — RN은 watchOS 미지원이라 워치 UI는 Swift 로 새로 작성.
  디자인 정본(DESIGN.md) 값을 Swift 상수로 미러링(`KeegoTheme.swift` — 파파야/무채/타이포 규칙).
- HKWorkoutSession + CLLocation(워치 GPS) + HKLiveWorkoutBuilder(심박 스트림).
- 데이터 계약: 폰 앱이 이미 소비하는 HealthKit 워크아웃 포맷과 동일(메타데이터에 keego 신발 id 태깅).
- 신발 카탈로그/활성 신발: WatchConnectivity `applicationContext` 로 폰이 푸시(오프라인 캐시).

## 3. 마일스톤

| 단계 | 내용 | 필요조건 |
|---|---|---|
| M0 | Xcode 워치 타깃 생성 + 빈 앱 실행 | **페어링된 실물 워치 + 저녁 합동 세션**(서명/프로비저닝) |
| M1 | 러닝 시작→종료 워크아웃 세션 + 거리/시간 | 실물 러닝 검증 |
| M2 | 링 UI + 심박존 + 자동 일시정지 | " |
| M3 | 폰 동기화(신발 차감) + 컴플리케이션 | 폰 코드(lib) 소폭 확장 |

## 4. 리스크·정직 노트

- **7월말 폰 출시를 블록하지 않는 병행 트랙** — 워치는 폰 심사와 독립 제출 가능.
- 타깃 생성은 `ios/` 프로젝트 수술(Danger Zone) — 자율로 안 하고 합동 세션에서.
- 워치 GPS 정확도는 폰보다 낮음 — 칼만 파라미터 별도 튜닝 필요(M1에서 실측).

## 5. 구현 상태 (2026-07-10 — M1~M3 코드 완성, 실기기 검증 대기)

### 된 것 (코드 완성 + 워치 시뮬 빌드 통과)
- **워치 앱** (`ios/SoleMateWatch Watch App/` — 기존 타깃의 synchronized 폴더에 구현):
  - `KeegoTheme.swift` — DESIGN.md/theme.ts 토큰 미러(무채+파파야+심박존 색) + 포맷터.
  - `WatchLink.swift` — 폰 계약 단일 창구(신발 목록/심박존 파라미터 수신·캐시, cmd 라우팅, bpm 스트림, 런 페이로드 전송 — 비도달 시 transferUserInfo 큐).
  - `WorkoutManager.swift` — HKWorkoutSession + HKLiveWorkoutBuilder(심박) + CLLocation(거리: 오차≤30m 게이트·스파이크 컷) + 자동 일시정지(lib/autoPause.ts 상태기계 미러 0.6/3s↔1.0/1s) + 종료 시 keego_shoe_id/keego_run_id 메타데이터 태깅 → HealthKit 저장 → 요약.
  - `StartView`(신발 좌우 스와이프+도트+마지막 선택 기억+파파야 링 시작, 동기화 대기 폴백) · `RunView`(km 히어로+보조 스택, 크라운 세로 페이지: 심박존/페이스/시간/컨트롤) · `SummaryView`(거리·시간·평균 페이스·평균 심박 → 저장=폰 전송) · `ContentView`(phase 라우터).
  - 타깃 설정: `Info.plist` 병합(WKBackgroundModes=workout-processing) + 위치 권한 문구 + WKRunsIndependentlyOfCompanionApp(단독 실행).
- **폰 동기화** (M3): `WatchSessionModule.swift/.m` 확장(onWatchRun 이벤트·updateShoeContext·컨텍스트 병합 유지) + `lib/watchSession.ts`(onWatchRun/updateShoes + 타입) + `App.tsx` 배선(활성 신발/심박존 파라미터 푸시 · 완주 수신 → runId 중복 방어 → addRun 으로 신발 자동 차감) + 계약 테스트 9건.

### 실기기 검증 대기 (저녁 합동 세션 — M0 포함)
- 워치 타깃 서명/프로비저닝 + 실물 워치 페어링 설치(자율 미수행 — Danger Zone 약속대로).
- 실물 러닝: 워치 GPS 거리 정확도(칼만 튜닝 여부 판단), 자동 일시정지 임계 체감, 백그라운드(손목 다운) 세션 유지.
- 폰↔워치 왕복: 신발 목록 도착·스와이프, 완주 페이로드 → 폰 addRun/신발 차감, 비도달 큐 배달.
- 권한 UX 실순서(HealthKit·위치 다이얼로그).

### 비범위로 남긴 것
- 컴플리케이션(신발 수명 % 링) — M3 잔여, 실기기 확인 후.
- 워치 GPS 칼만 필터(현재 게이트+스파이크 컷만 — 실측 후 튜닝), 현재 페이스(순간)·트랙 모드·음성 코칭(v2+).
