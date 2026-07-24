# CLAUDE.md — Keego (구 SoleMate)

> Claude Code가 세션 시작 시 자동으로 읽는 진입점 지침이다.
> **작업 전 반드시 아래 문서들을 먼저 읽어라. 충돌 시 이 파일이 아니라 아래 문서가 우선한다.**
> - `MISSION.md` — 🧭 **프로젝트 헌법(미션·엔지니어링 원칙). 모든 결정의 최상위 기준.**
> - `BRAND.md` — 🔥 **브랜드 정본(Why·비전·포지셔닝·보이스·시그니처). 사용자향 말·서사의 단일 기준.**
> - `DESIGN.md` — 🎨 **디자인 정본(재질·타이포·간격·컴포넌트·톤). 비주얼 결정의 단일 기준.**
> - `.tenet/harness/current.md` — 품질 계약(빌드/테스트/Danger Zone/Iron Law)

## 프로젝트
Keego(= keep going) — React Native 러닝/신발 관리 앱. 차별점 = **러닝화 내구도 관리 + shoe-first**(신발 고르고 바로 러닝 → 자동 거리 차감). 경쟁: Nike Run Club·Strava.
스택: RN 0.85.2 · React 19 · TS 5.8 · React Navigation. 저장: AsyncStorage(로컬-퍼스트) + **Firestore(정본)**.

## 작업 모드 — 그냥 Claude (Tenet 제거됨 2026-07-09)
이 프로젝트는 **터미널 Claude Code로 직접** 개발한다. 과거 Tenet MCP 방법론 하니스는 제거했다 — 매 변경마다 저널·status·harness·DESIGN 동기화가 따라와 느렸기 때문. (`.mcp.json`에서 tenet 비활성화. `.tenet/` 문서는 삭제하지 않고 **참고 정본**으로 유지.)
- **작업 루프:** `MISSION.md`·`CLAUDE.md` 읽기 → 짧게 계획 → 승인 → 구현 → `tsc`·`lint`·`test` → 커밋(한국어).
- **문서 갱신은 최소로.** 구현 변경(색·간격·버그)은 **코드 + 테스트만** 바꾼다. 문서(`CLAUDE.md`·`MISSION.md`·`DESIGN.md`)는 **규칙·방향이 실제 바뀔 때만** 갱신. `.tenet/`(저널·status·harness)는 **자동 갱신하지 않는다**.
- **git 히스토리 = 작업 기록**(Tenet status/journal 대체). 커밋 메시지를 성실히 쓴다.
- 규칙·품질 기준(빌드 게이트·Danger Zone·디자인 원칙)은 그대로 유효하다 — 없앤 건 '프로세스'지 '기준'이 아니다.

## 빌드/품질 게이트 (Iron Law — 어기면 머지 금지)
- 머지 전 **전부 통과**: `npx tsc --noEmit` · `npm run lint` · `npm test`
- 새 코드 테스트 커버리지 **≥ 60%**. 센서/GPS/TTS는 모킹(실디바이스 의존 금지).
- 런 트래킹 중 거리/시간 데이터 유실·음수 금지.
- 사용자 데이터(신발·런 기록) 파괴적 변경/마이그레이션 금지.
- 시크릿/키 하드코딩 금지.

## Danger Zones (명시적 요청 없이 수정 금지)
- `android/`, `ios/` — 네이티브 빌드 설정. 앱 표시명/패키지 rename도 빌드 영향 확인 후.
- `App.tsx`의 `KalmanFilter` 클래스·`calcDist` — GPS 정확도 핵심. 변경 시 테스트/검증 필수.
- `package-lock.json` — npm 통해서만(수동 편집 금지).
- 권한 요청 로직(PermissionsAndroid / Geolocation) — 회귀 시 트래킹 전체 정지.
- **네이티브 의존성 — 사전 승인제(2026-07-09 갱신).** 새 네이티브 모듈은 자율 검증이 어려우므로 **사용자 승인 후에만** 추가한다(무단 추가 금지). 현재 승인된 네이티브 의존성: `react-native-maps`(러닝 라이브 지도·코스맵), `@kingstinct/react-native-healthkit`(심박), `@react-native-firebase/*`(app·auth·firestore·messaging·crashlytics), `@react-native-google-signin`, `@react-native-seoul/kakao-login`·`naver-login`(소셜 로그인), `expo-location`·`expo-sensors`·`react-native-sensors`(GPS·센서), `react-native-svg`. 햅틱=`lib/haptics`(RN Vibration), 토스트=`lib/toast`, 새로고침=내장 `RefreshControl`.

## 아키텍처 규칙
- 화면 컴포넌트 = `*.rn.tsx` 네이밍.
- **색·폰트·간격은 `theme.ts` 토큰에서만.** 화면 내 색/폰트 하드코딩 0.
- 재사용 UI 프리미티브는 `primitives.tsx`.
- 비즈니스 로직(거리·페이스 계산·필터)은 **순수 함수**로 분리(입력 불변, throw 금지, 테스트 가능).
- UI 문구는 **한국어**(기존 톤 유지).

## 커밋
- 커밋 메시지 **한국어**, **main에 직접 커밋**(프로젝트 워크플로우).

## 디자인 원칙 (요약 — 정본은 루트 `DESIGN.md`, 2026-07-09 승격)
- **정체성(2026-07-09 확정):** 다크(`BG #0A0A0A`, 카드 `#1C1C1E`/`#2C2C2E`) + **무채 글래스 베이스**, `ACCENT #FFFFFF`(흰=강조, 모노크롬 시스템). 프리미엄은 재질·타이포·절제(Apple급). 브랜드색 **Keego Ember `RING_ACCENT #FF8000`** 허용 범위 = 러닝 링 + 워드마크 서명 + 러닝 에너지·진행 지표(DESIGN.md §1 'B 서명+진행' 확정 — 2026-07-24 문서 단일화, 구 '링 전용' 문구 폐기. 링 그라데이션 `#FFB458→#E56600`, 구 'McLaren 파파야' 호칭 폐기 — BRAND.md §4). 바이올렛 전역 액센트(`#8B5CF6`)는 "남발돼 튄다" 실기기 피드백으로 당일 폐지.
- **액센트 절제:** 브랜드색(파파야)은 러닝 링에만. 그 외 강조는 무채(흰/회), 색은 의미에만(조건색 GOOD/WARN/DANGER, 토글 ON=GOOD). 라벨·보조는 T3 회색(`#9C9CA3`). HoF Legend는 골드/오렌지 유지(성취 도메인).
- **타이포:** Pretendard 단일 패밀리(+유일 예외: 초대형 숫자 전용 `NUM`=Jost, 2026-07-14 확정), `tabular-nums`, 800 헤딩 / regular 본문. 행간·Dynamic Type·터치 44pt 등 접근성 조항은 DESIGN.md §6.7(2026-07-24 신설).
- **톤 벤치마크:** Apple Fitness · WHOOP · PS 트로피 · Spotify Wrapped. **유치/밈/RPG 금지.**
- **Truth only:** 모든 숫자는 실제 집계. 가짜 경쟁자·미달성 업적 날조 금지.
- **shoe-first:** 홈은 신발 히어로 유지.

## 열린 디자인 논의 (2026-07-08 — ⚠️ 미확정, 기록용)
> 확정 규칙 아님. 진행 중 검토이며 위 DESIGN.md의 **확정 결정과 충돌할 수 있음**. 반영하려면 DESIGN.md를 정식 수정해야 함.
- **브랜드 시그니처 격차:** 화면 완성도는 높으나 "로고 가리면 식별 안 되는" 브랜드 개성 부족 평가. 검토점:
  - ~~액센트 오렌지 `#FF6500`가 **Strava 색과 겹침** → 소유 가능한 색 교체 검토~~ → **해소(07-09):** 무채 베이스 + 러닝 링 전용 파파야로 확정(위 디자인 원칙 참조).
  - Pretendard 단일 = 타이포 개성 부족 논의 (DESIGN.md는 단일로 확정).
  - ~~설정 화면의 큰 오렌지 솔리드 버튼 3개 → iOS 토글로 톤다운~~ → **해소(07-09):** 무채화 스윕으로 토글 ON=GOOD·솔리드 버튼=글래스 전환.
- ~~**신발 비주얼 전략**~~ → **해소(2026-07-10 사용자 확정): 비주얼 없음.** 사진·실루엣 전면 폐기, 신발=글리프+수명 링+타이포 추상 표현(정본 DESIGN.md §4). 아래 방안 A/B/크라우드소스는 기록용.
  - 모델별 실사진 = 저작권 + 일관성(짝짝이) + 유지보수로 **비현실적**(결론).
  - 방안 A: **카테고리 실루엣 × 컬러웨이**(그림 3~5종 + 실제 색) — day1 폴백. 단, 정확히 그 모델은 아님.
  - 방안 B(주력): **사용자 사진 → iOS 온디바이스 피사체 오려내기(`VNGenerateForegroundInstanceMaskRequest`) → keego 무대(동일 백드롭·그림자)**로 제품컷화. 원본 사진은 노출 안 함(사용자 촬영 실력 무관).
  - 장기: 크라우드소스로 모델별 대표컷 라이브러리(해자). 사용자기여=ToS로 사용권.
  - 실루엣 아트는 전문 일러스트/3D/AI 필요(코드로 못 그림).

## 참고 문서
- 로드맵: `docs/keego-toptier-roadmap.md` · `.tenet/spec/2026-06-25-running-excellence-roadmap.md`
- 리서치(경쟁앱·신발 내구도): `.tenet/knowledge/`
- 작업 히스토리: `.tenet/journal/`
