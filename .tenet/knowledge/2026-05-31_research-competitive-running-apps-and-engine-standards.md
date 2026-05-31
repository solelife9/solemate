# research-competitive-running-apps-and-engine-standards

type: knowledge
source_job: eafe3cdf-c6c4-4d2b-9279-04c942fe4a94
job_name: eval-mptuqw82
confidence: scanned-not-verified
created: 2026-05-31T14:09:09.574Z

## Findings

- **differentiator**: SoleMate의 출시 경쟁 무기 = 러닝화 내구도 관리 + shoe-first 흐름(신발 고르고 바로 러닝 시작, 자동 누적거리 차감). 경쟁: Nike Run Club, Strava.
- **strava_gear**: Strava Gear: 신발 등록(브랜드/모델), 활동마다 신발 선택→자동 마일리지 누적, 기본 알림 임계 250mi(최대 800mi=약 400~1287km), 임계 초과 시 매 런 알림, 은퇴(retire) 시 선택목록서 제거하되 기록 보존. → SoleMate는 이 'Gear'를 곁다리가 아닌 1순위로. 우위 포인트: 신발 선택이 런 시작 동선에 직결, 한국어, 신발 수명 시각화/배지.
- **nrc_ux**: Nike Run Club UX 강점: 흰 배경+볼드 블랙 텍스트+경량 타이포+여백+네온 액센트(우리는 다크+오렌지로 대비), 실시간 거리/페이스, 깔끔한 루트/스플릿 요약, 게이미피케이션(스트릭/챌린지/리더보드), 안전기능(날씨/위치공유). 약점: 고급 지표 부족. → 우리는 스트릭+신발수명 게이미피케이션, 깔끔한 런 화면, 루트 시각화로 NRC 수준 마감 지향.
- **autopause_standard**: Strava auto-pause: 기본 임계 약 1.6 km/h, 10~15초 미만 이동 제거. 최신은 가속도계 jerk 변화로 running 모션 감지(GPS 없이도, 제자리 뛰기/터널 대응). 우리 인터뷰 결정값 0.6 m/s(2.16km/h)/6초 hold, 재개 1.0m/s/2초 → 업계와 정합. 코드엔 이미 가속도계 movement 감지(App.tsx:438 mag>10.5)가 있으나 auto-pause 미연결 → GPS 속도 + 가속도계 결합으로 구현.
- **gps_accuracy**: 도심 멀티패스 대비 accuracy 컷오프 표준 관행. 인터뷰 결정 MAX_FIX_ACCURACY_M=20, WARMUP_FIXES=3, MAX_SEG_SPEED_MPS=12 적용. 마지막 양호 위치 유지로 경로 연속성 보존.
- **course_map**: react-native-svg(이미 설치 ^15.15.4)로 폴리라인 렌더 — 네이티브 추가 0. route_<id>에 [{lat,lon}] 최대 200점 이미 저장됨. react-native-maps는 네이티브 최소변경 정책상 도입 안 함.
- **sources**: Strava Gear/Notifications support, Strava Engineering auto-pause(Medium), Nike Run Club reviews/design case studies
