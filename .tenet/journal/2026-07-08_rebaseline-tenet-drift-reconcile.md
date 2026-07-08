# rebaseline tenet drift reconcile

type: journal
source_job: 00000000-0000-0000-0000-000000000000
job_name: unknown
created: 2026-07-08T15:08:52.449Z

## Findings

- **date**: 2026-07-09
- **trigger**: steer/inbox.md '재베이스라인 요청' — Tenet 밖 작업 후 status/journal 동기화
- **drift_summary**: journal 마지막=2026-06-29, status.md=2026-06-12 스냅샷(419/425). 그 사이 HEAD bb1faae(2026-07-08)까지 223개 커밋이 Tenet 밖에서 랜딩. tsc --noEmit PASS 확인.
- **work_built_outside_tenet**: ["트랙/랩 모드 배선(자동랩·첫랩GPS보정·리캡) — cfcd4c3, f13982f, cbbc94c","출시 감사 폴리싱 스윕(카피톤·저대비·토큰·보라색 난이도 제거) — 0fb834c, bff4d63","Android/iOS 빌드 크래시 수정(versionCode·번들·VIBRATE권한·워드마크 폴백)·워치앱 제거 TestFlight — 9f7bec5, 793cc4a, d94bb2a, d2c6611, 0194f6f","온보딩 4화면 재설계 + 2열 분할 러닝화 피커 — 37ffd52, ef3e48f, 0ddbf57","러너 스펙 A안(거리 PB 메인·VO₂max 강등) — ae30acf","코스맵 iOS 애플지도 폴백 — c4339ed","메달 아카이브 전체 스위트(데이터모델·OCR파서·갤러리·기록흐름·감지배너·Firebase동기·카메라·자랑카드) — ff0e7ed→90898ae 다수","러닝 중 화면 프리미엄 재설계(얇은 링·거대 타이포·6칸 일시정지) — b9cac83, f130248, 463842e, 7500d3c","라이브 지도(react-native-maps): 일시정지 시 지도 패널+전체화면 인터랙티브 — 851ad15, e74a54d, 8d29deb, d0ccd4c, 2abfbf7","폰→애플워치 워크아웃 자동시작(심박 흐름) — 15aa1e3","전역 반응형 스케일(rv) + theme 토큰 배선 — 0b97ccb, eb5aeea, 3d4e381, d382636","전역 타입 스케일 규칙화 — 5b60d1e","정확성/데이터안전 감사 수정(평균페이스 거리가중·완주기록 손실 방지·NaN가드) — 0ca09d5, 547ce22, 83ddc29","스마트 레이스 감지 3티어(오탐0·위치+날짜 확정) + 국내 대회 82개 캘린더 시드 — dae24e8, 482f7d8","홈 폴리싱(인사말 1줄·날짜 제거·코너 다크 수정) — 2abb7fb, de67c3f, 1957f8e","CLAUDE.md 작업지침 진입점 추가 — bb1faae"]
- **new_files**: ["MedalArchiveScreen.rn.tsx","HallOfShoes.rn.tsx","CelebrationScreen.rn.tsx","RetirementCard.tsx","RunLiveMap.tsx"]
- **new_native_deps_vs_rule**: CLAUDE.md '새 네이티브 의존성 추가 금지'와 충돌: react-native-maps ^1.27.2, @kingstinct/react-native-healthkit ^14.0.2 신규. 기존 설치분(firebase×5, google-signin, kakao, naver, sensors×2, expo-location, svg)도 규칙 문언상 미승인. 전체 deps 37개.
- **drift_verdicts_pending_user**: {"B-1":"네이티브 의존성 금지 규칙 → 승인목록으로 갱신 vs 유지 (사용자 판정 대기)","B-2":"RunActiveScreen.rn.tsx:37 주석 '러닝 중 지도 없음' — 재검토 결과 실제 반전 아님. RunLiveMap은 일시정지(277)·전체화면(446)에서만 렌더 → 메모 solemate-run-screen-pause-map(러닝중=링/일시정지=지도)와 일치. 단 주석의 옛 근거(구글맵 타일 실패)는 Apple Maps 전환으로 무의미 → 주석 문구 갱신 + react-native-maps 정식 승인 여부 사용자 판정 대기","B-3":"화면 하드코딩 색: HallOfShoes(11)·CelebrationScreen(10)·RetirementCard(8)·OnboardingScreen(4)·App.tsx(4). 키프세이크(은퇴카드 등) 의도적 예외 vs 토큰화 대상 구분 사용자 판정 대기"}
- **C_docs_stale**: ["DESIGN.md 'DISPLAY=BebasNeue→Pretendard 교체' 서술: 이미 완료(theme.ts DISPLAY=Pretendard)","배경색 표기 불일치: DESIGN.md #000000/#0A0A0A, harness #0A0A0C, 실제 theme.ts=#0A0A0A(정본)"]
- **D_design_deferred**: ["설정화면 오렌지 솔리드 버튼 3개 ↔ 오렌지 절제 원칙","오렌지=Strava 색 겹침·신발 비주얼 부재 — CLAUDE.md 열린 논의"]
- **next**: B-1/B-2/B-3 사용자 판정 → C 문서 정리 → 그다음 새 작업 명세 시작
