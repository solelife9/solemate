# CLAUDE.md — Keego (구 SoleMate)

> Claude Code가 세션 시작 시 자동으로 읽는 진입점 지침이다.
> **작업 전 반드시 아래 두 정본을 먼저 읽어라. 충돌 시 이 파일이 아니라 아래 문서가 우선한다.**
> - `.tenet/harness/current.md` — 품질 계약(빌드/테스트/Danger Zone/Iron Law)
> - `.tenet/DESIGN.md` — 디자인 시스템(색·타이포·컴포넌트·톤)

## 프로젝트
Keego(= keep going) — React Native 러닝/신발 관리 앱. 차별점 = **러닝화 내구도 관리 + shoe-first**(신발 고르고 바로 러닝 → 자동 거리 차감). 경쟁: Nike Run Club·Strava.
스택: RN 0.85.2 · React 19 · TS 5.8 · React Navigation. 저장: AsyncStorage(로컬-퍼스트) + **Firestore(정본)**.

## 작업 모드 — Tenet vs 그냥 Claude (중요)
이 프로젝트는 **Tenet**(MCP 서버, `.mcp.json`의 `tenet serve`) 방법론 하니스로 개발한다. Tenet은 인터뷰→명세→슬라이스 분해→구현→저널→상태추적을 강제하고, 모든 작업을 `.tenet/journal/`·`.tenet/status/`에 기록한다.
- **큰 기능 작업 → Tenet 사용** (명세·저널·추적 필요).
- **작고 독립적인 수정 → 그냥 Claude 가능.** 단 이 파일 + 위 두 정본을 반영하고 커밋 컨벤션을 지킬 것.
- ⚠️ **그냥 Claude로 한 작업은 Tenet의 `status/`·`journal/`에 자동 기록되지 않는다** → 추적 불일치(drift)를 막으려면, 의미 있는 변경은 사람이 상태를 동기화하거나 이후 Tenet 세션에서 재정리한다.
- 이 Mac에는 tenet이 설치돼 있지 않다(iOS 빌드용 머신). 여기 작업은 기본적으로 "그냥 Claude" 모드다. 주 개발은 Windows + gradlew(Android).

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
- **새 네이티브 의존성 추가 금지**(자율 검증 불가). 햅틱=`lib/haptics`(RN Vibration), 토스트=`lib/toast`, 새로고침=내장 `RefreshControl`.

## 아키텍처 규칙
- 화면 컴포넌트 = `*.rn.tsx` 네이밍.
- **색·폰트·간격은 `theme.ts` 토큰에서만.** 화면 내 색/폰트 하드코딩 0.
- 재사용 UI 프리미티브는 `primitives.tsx`.
- 비즈니스 로직(거리·페이스 계산·필터)은 **순수 함수**로 분리(입력 불변, throw 금지, 테스트 가능).
- UI 문구는 **한국어**(기존 톤 유지).

## 커밋
- 커밋 메시지 **한국어**, **main에 직접 커밋**(프로젝트 워크플로우).

## 디자인 원칙 (요약 — 정본은 `.tenet/DESIGN.md`)
- **정체성:** 다크(`BG #0A0A0A`, 카드 `#1C1C1E`/`#2C2C2E`) + KEEGO 오렌지 `#FF6500`, 단일 액센트.
- **오렌지 절제:** 오렌지는 CTA·선택 상태·핵심 수치에만. 라벨·보조 텍스트는 T3 회색(`#8E8E93`).
- **타이포:** Pretendard 단일 패밀리, `tabular-nums`, 800 헤딩 / regular 본문.
- **톤 벤치마크:** Apple Fitness · WHOOP · PS 트로피 · Spotify Wrapped. **유치/밈/RPG 금지.**
- **Truth only:** 모든 숫자는 실제 집계. 가짜 경쟁자·미달성 업적 날조 금지.
- **shoe-first:** 홈은 신발 히어로 유지.

## 열린 디자인 논의 (2026-07-08 — ⚠️ 미확정, 기록용)
> 확정 규칙 아님. 진행 중 검토이며 위 DESIGN.md의 **확정 결정과 충돌할 수 있음**. 반영하려면 DESIGN.md를 정식 수정해야 함.
- **브랜드 시그니처 격차:** 화면 완성도는 높으나 "로고 가리면 식별 안 되는" 브랜드 개성 부족 평가. 검토점:
  - 액센트 오렌지 `#FF6500`가 **Strava 색과 겹침** → 소유 가능한 색 교체 검토 (DESIGN.md는 오렌지로 확정 상태).
  - Pretendard 단일 = 타이포 개성 부족 논의 (DESIGN.md는 단일로 확정).
  - 설정 화면의 큰 오렌지 솔리드 버튼 3개 → iOS 토글로 톤다운 제안(효과 큼).
- **신발 비주얼 전략 (신규·미해결):** 신발을 시각적 주인공으로 세우는 법.
  - 모델별 실사진 = 저작권 + 일관성(짝짝이) + 유지보수로 **비현실적**(결론).
  - 방안 A: **카테고리 실루엣 × 컬러웨이**(그림 3~5종 + 실제 색) — day1 폴백. 단, 정확히 그 모델은 아님.
  - 방안 B(주력): **사용자 사진 → iOS 온디바이스 피사체 오려내기(`VNGenerateForegroundInstanceMaskRequest`) → keego 무대(동일 백드롭·그림자)**로 제품컷화. 원본 사진은 노출 안 함(사용자 촬영 실력 무관).
  - 장기: 크라우드소스로 모델별 대표컷 라이브러리(해자). 사용자기여=ToS로 사용권.
  - 실루엣 아트는 전문 일러스트/3D/AI 필요(코드로 못 그림).

## 참고 문서
- 로드맵: `docs/keego-toptier-roadmap.md` · `.tenet/spec/2026-06-25-running-excellence-roadmap.md`
- 리서치(경쟁앱·신발 내구도): `.tenet/knowledge/`
- 작업 히스토리: `.tenet/journal/`
