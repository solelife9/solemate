# Slice 4 — 개인 챌린지 (challengeProgress + UI + 영속)

날짜: 2026-06-03
잡: slice-4-challenges

## 무엇을 했나

개인(혼자) 전용 챌린지를 끝에서 끝까지 구현했다. 계정/서버 없이 동작하고,
진행률은 런 기록에서만 파생한다(저장하지 않음 — 단일 진실원). 네이티브 의존 0.

### (1) lib/challenges.ts — 스텁 → 실제 구현
- `challengeProgress(challenge, runs): {current, target, pct, completed}`
- **distance**: 기간 `[startDate,endDate]`(양끝 포함, 'YYYY-MM-DD' 사전식 비교) 내 런
  `dist` 합 → `current`. `target=targetKm`, `pct=min(1,current/target)`,
  `completed = target>0 && current>=target`. 음수/0/NaN dist 는 0으로 방어.
- **streak**: 기간 내 거리>0인 '달린 날'의 고유 날짜를 정렬해 끊김 없는 **최대 연속일
  수**를 `current` 로 산출(같은 날 중복=1일, 로컬 자정 차로 일수 계산 → DST 안전).
  `target=targetDays`, 캡/달성 규칙 동일.
- 런 없으면 `current 0 · completed false`.

### (2) UI + 영속
- `ChallengesSection.tsx` (신규 presentational): 진행률 **Ring**(기존 primitive 재사용,
  달성 시 GOOD 색) + `%` 표시 + 현재/목표 + 기간, 달성 시 **'달성!' 뱃지**(Pill trophy).
  생성 폼(종류 거리/연속 · 목표 스테퍼 · 기간 7/30일 · 만들기). 빈 상태 안내.
- `ProfileScreen.rn.tsx`: 데이터 섹션 아래에 챌린지 섹션 배선(프로필).
- `App.tsx`: `challenges` 상태 + **신규 AsyncStorage 키 `challenges_v1`** 로 영속
  (기존 키와 격리 → 데이터 파괴 위험 0), 런→`{date,dist}` 매핑, 생성/삭제 핸들러,
  `todayISO` 주입(생성 결정성).

### (3) 테스트
- `__tests__/lib/challenges.test.ts` — distance(합산/기간경계/방어/캡/미달성),
  streak(최대연속/달성/중복1일/기간밖/빈입력).
- `__tests__/ChallengesSection.test.tsx` — 진행률 % 반영, 달성 뱃지 노출/미노출,
  생성(거리/스트릭 well-formed Challenge), 삭제 콜백.

### (4) 수용
- `tests/acceptance/slice-4-features.test.ts` 의 `@slice-4 개인 챌린지` `describe.skip`
  → `describe` 활성화 후 통과.

## 검증
- `npx tsc --noEmit` clean.
- `npx jest` — 68 suites / 608 tests 전부 통과(회귀 0). iron law green.
