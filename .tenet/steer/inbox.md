# Steer Inbox

## ✅ RESOLVED 2026-07-09 — 재베이스라인 + MISSION.md 통합 완료

아래 요청 전부 처리(미커밋). 결과:
- **⭐ MISSION.md 통합:** `harness/current.md` 최상단에 "🧭 최상위 기준 — 프로젝트 헌법(`/MISSION.md`)" 섹션 추가(품질계약보다 위, 충돌 시 우선). CLAUDE.md도 진입점에서 MISSION.md 참조(외부 편집 반영됨).
- **재스캔·동기화:** status.md 재베이스라인 배너 + journal `2026-07-08_rebaseline-tenet-drift-reconcile.md` (223커밋 밖 랜딩 기록, HEAD `bb1faae`, tsc PASS).
- **B-1**(네이티브 deps 금지 규칙) → 판정 **규칙 갱신**: CLAUDE.md 사전 승인제 + 현재 승인 목록 명시.
- **B-2**(러닝 중 지도) → 판정 **정식 승인**: RunActiveScreen:37 주석 Apple Maps 현실로 재작성, maps 승인 목록 포함. 재검토상 옛 규칙↔코드는 '반전' 아님(러닝중=링/일시정지=지도, 메모 일치).
- **B-3**(하드코딩 색) → 판정 **전수 토큰화**: 5개 화면 raw hex 전부 theme.ts 토큰 승격(RARITY_COLORS·HALL_*·CELEB_*·ONBOARD_*·SPORT_VIOLET_SOFT·BLACK 등, 값 무변). tsc 클린 + 1775 테스트 통과.
- **C**(문서 낡음) → 즉시 정리: DESIGN.md 색테이블·DISPLAY, harness `#0A0A0C→#0A0A0A` 동기화.
- **D**(디자인 품질) → 보류 유지(설정 오렌지 버튼·Strava색 겹침·신발 비주얼 — CLAUDE.md 열린 논의).

→ 새 작업 명세 시작 가능.

---

## 2026-07-08 — 재베이스라인 요청 (Tenet 밖 작업 후 동기화)

한동안 Tenet 밖(그냥 Claude / Mac)에서 작업해 코드가 많이 바뀜. **새 기능 전에 재베이스라인 먼저.**

**⭐ 최우선:** 루트에 **`MISSION.md`(프로젝트 헌법 — 미션 + 엔지니어링 원칙)** 신규 추가됨(2026-07-09, 사용자 작성). 이걸 **모든 결정의 최상위 기준**으로 삼고, `harness/current.md`가 이를 최상위로 참조하도록 통합할 것. 핵심: "world's best running platform · Keego is all I need · 차별화는 탁월함 위에 · 기능 더 만들지 말고 더 나은 제품 · 10년 유지보수 관점 · 임시방편/해킹/우회 금지, 근본원인 해결".

**순서:**
1. git HEAD 기준 코드베이스 **재스캔** → `status/`·`journal/`을 현실과 맞춤(reconcile).
2. 루트 `MISSION.md`(헌법) + `CLAUDE.md`(진입점 + 열린 디자인 논의) 읽기.
3. 아래 **B 항목을 하나씩 "규칙 갱신 vs 코드 수정" 사용자에게 질문.** 규칙을 코드에 맞춰 자동으로 덮어쓰지 말 것.
4. C(문서 낡음)는 바로 정리, D(디자인)는 보류.
5. 위 정리 끝난 뒤에야 새 작업 명세 시작.

---

### A. 새로 생긴 것 (규칙 위반 아님 — 재스캔으로 status 동기화)
- 라이브 지도: `react-native-maps ^1.27.2` + `RunLiveMap.tsx`(2026-07-08 신규)
- HealthKit 심박: `@kingstinct/react-native-healthkit`
- 대회 매칭("어떤 대회였나요?"), GAP(경사보정 페이스), 심박 존, 트랙/랩 모드
- 화면: `MedalArchiveScreen`, `HallOfShoes`, `CelebrationScreen`, `RetirementCard`

### B. 규칙 ↔ 코드 충돌 (★ 판정 필요)
- **★ B-1. "새 네이티브 의존성 추가 금지" 규칙 다수 위반.** 현실: react-native-maps, react-native-healthkit, google-signin, firebase(×5), react-native-sensors 등 설치됨. → 규칙을 "승인 시 추가 가능 + 현재 목록 명시"로 갱신할지 판정.
- **★ B-2. "러닝 중 지도 없음" 규칙 반전.** `RunActiveScreen.rn.tsx:37` 주석은 "지도 두지 않는다"인데 같은 파일 277·446줄에서 `<RunLiveMap>` 렌더. Apple Maps 전환으로 옛 우려(구글맵 타일 실패) 해소됐을 가능성 → 지도 도입 정식 승인 + 주석/규칙 갱신 검토.
- **B-3. 화면 하드코딩 색 (iron: "화면 하드코딩 색 0" 위반 후보):** HallOfShoes(10) · CelebrationScreen(9) · RetirementCard(8) · OnboardingScreen(4) · App.tsx(4). 은퇴카드 등 키프세이크는 의도적 예외일 수 있음 → 토큰화 대상 vs 예외 구분.

### C. 문서 낡음 (코드는 맞음 — 문서만 수정)
- DESIGN.md의 "DISPLAY = BebasNeue → Pretendard로 교체" 서술: 이미 완료됨(`theme.ts` DISPLAY=Pretendard).
- 배경색 표기 불일치: DESIGN.md `#000000`/`#0A0A0A`, harness `#0A0A0C`, 실제 `theme.ts` = `#0A0A0A`(정본).

### D. 디자인 품질 (규칙 아님 — 별도 결정, 보류)
- 설정 화면 오렌지 솔리드 버튼 3개 ↔ "오렌지 절제" 원칙(`ProfileScreen`).
- 오렌지=Strava 색 겹침 · 신발 비주얼 부재(실루엣×컬러웨이 / 사진→무대 파이프라인) — 상세는 `CLAUDE.md` 열린 논의 참고.
