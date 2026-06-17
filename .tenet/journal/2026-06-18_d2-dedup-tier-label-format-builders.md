# d2-dedup complete — TIER_LABEL·MM:SS·YYYY-MM(-DD) 단일화

type: journal
job_name: TIER_LABEL·포맷터·날짜빌더 중복 제거 (d2-dedup)
created: 2026-06-18

## Findings

- **what**: 동작 불변 중복 제거 3건.
  1. **TIER_LABEL** — HomeScreen·ProfileScreen·ProgressionScreen 에 byte-동일하게 복붙돼 있던 `Record<RankTier,string>` 티어명 매핑을 `theme.ts` 1곳으로 통합(`export const TIER_LABEL`, TIER_COLORS 바로 옆 — 색/라벨 모두 theme 권위). 3화면은 로컬 정의 제거 후 import. ProgressionScreen 은 더 이상 `RankTier` 타입을 직접 안 써 unused import 도 제거.
  2. **MM:SS 포맷터** — HistoryScreen `fmtDurationInput` 자체 분/초 조립을 lib/format `fmtTime` 재사용으로 교체(빈칸 가드만 유지: 0초→'').
  3. **YYYY-MM(-DD) 빌더** — `lib/format` 에 신규 `ymLocal`(=ymdLocal 의 YYYY-MM 접두, byte-동등) 추가. HallOfFameScreen `yearMonthOf`→`ymLocal`, ProgressionScreen `nowISO`·lib/notifications `localYmd`·challengesExt `shiftDate` 인라인 `getFullYear()+padStart` 빌더→`ymdLocal`.

- **landmine 처리(round-trip 보존)**: 옛 `fmtDurationInput`은 'M:SS'(분 무패딩, 분이 60 초과 가능: 1시간=`65:00`)였다. `fmtTime` 은 1시간↑를 'H:MM:SS'(`1:05:00`)로 표기하므로, 그대로 두면 편집 폼에서 1시간 이상 런을 *수정 없이 저장*해도 `parseDurationInput("1:05:00")=65초` 로 **duration 손상**. 이를 막으려 `parseDurationInput` 을 3분절(H:MM:SS)도 되돌려 읽도록 일반화(2분절 MM:SS 경로는 기존과 동일 계산 유지). 사용자 관찰 불변식(편집→무수정 저장 시 초 보존)은 그대로, 1시간↑ 프리필 문자열만 `65:00`→`1:05:00`(앱 전역 시간 표기와 일치, 개선).

- **iron law**: 새 네이티브 0, 새 의존성 0. 순수 함수 단일화만. 데이터 파괴 0(soft 영역 무관). theme/format 가 단일 소스.

- **files**:
  - src: theme.ts(+TIER_LABEL), lib/format.ts(+ymLocal), HomeScreen.rn.tsx·ProfileScreen.rn.tsx·ProgressionScreen.rn.tsx(TIER_LABEL import), ProgressionScreen.rn.tsx(nowISO→ymdLocal), HistoryScreen.rn.tsx(fmtDurationInput→fmtTime, parseDurationInput H:MM:SS 일반화), HallOfFameScreen.rn.tsx(yearMonthOf→ymLocal), lib/notifications.ts(localYmd→ymdLocal), lib/progression/challengesExt.ts(shiftDate→ymdLocal).
  - tests: __tests__/lib/format.test.ts(+ymLocal, +초→문자열→초 round-trip sub-hour/hour-plus), __tests__/theme.test.ts(+TIER_LABEL canonical+키집합), __tests__/HistoryScreen.durationRoundtrip.test.tsx(신규 — 실제 편집 폼 마운트: 프리필=fmtTime + 무수정 저장 시 onEditRun duration 보존, 0초→빈칸), tests/acceptance/audit-hardening.test.ts(D묶음 `중복제거` todo→실단언).

- **verify**: `tsc --noEmit` clean. eslint 변경 파일 0 errors(기존 inline-style warning만). jest **136 suites / 1362 pass / 5 todo**(중복제거 todo 1건 소진), 회귀 0. 화면 렌더 스모크 = Home/Profile/Progression/History/HallOfFame 테스트 스위트 모두 무에러 렌더.
