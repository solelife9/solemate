# Slice 4 — 개인 챌린지 retry1: test_critic 차단 해소(테스트만 보강)

날짜: 2026-06-03
잡: slice-4-challenges (retry 1)

## 왜 재시도

code_critic·playwright는 PASS였으나 **test_critic이 test_bug로 차단**했다.
deliverable(2)의 '신규 키 `challenges_v1` 영속 + 기존 키 격리(데이터 보존 iron law)'와
streak UI 렌더를 검증하는 테스트가 하나도 없었다 → 키 오타·미영속·기존 키 덮어쓰기
회귀가 나도 전 테스트가 통과해 데이터 손실을 못 잡는 상태.

**코드 로직/UI는 그대로 두고 테스트만 보강**(지시대로).

## 보강한 테스트

### `__tests__/App.challenges.test.tsx` (신규 — 영속·격리 통합)
- **영속 라운드트립**: <App/> 마운트 → 프로필에서 챌린지 생성 → AsyncStorage
  `challenges_v1`에 well-formed 챌린지가 기록됨을 단언, 재마운트 시 같은 챌린지가
  다시 로드돼 '50km 도전' 카드로 렌더됨을 단언. (키 오타·미영속 회귀 가드.)
- **데이터 격리(iron law)**: settings_unit/goal_weekly_km/settings_alerts/route_r1/
  time_r1/shoe_alert_notified를 미리 심은 상태에서 생성·삭제해도 그 키들이 바이트
  단위로 보존됨을 단언. 삭제는 challenges_v1만 `[]`로 둘 뿐 키 제거/clear가 아님.
- **challenges_v1 부재 로드**: 신규 키 없이 마운트해도 기존 키가 손상/리셋되지 않고
  빈 목록으로 안전 시작함을 단언.

### `__tests__/ChallengesSection.test.tsx` (보강)
- **streak UI 렌더(distance와 대칭)**: kind='streak' 챌린지 + runs를 주면 진행률 %·
  달성 뱃지가 `challengeProgress` 결과대로 렌더됨을 단언(연속 3일 달성=100%+뱃지,
  연속 2일=67%+미노출).
- **빈 상태**: challenges=[] 면 빈 안내를 렌더하고 카드가 0개임을 단언.

## 유지(불변)
lib/challenges 로직·ChallengesSection·App 배선·기존 테스트·수용 .skip 제거 상태 전부
그대로. 코드 변경 0.

## 검증
- `npx tsc --noEmit` clean.
- `npx eslint` (신규 테스트 2파일) — 0 errors(기존 no-void 경고 1건은 기존 코드).
- `npx jest` — 69 suites / 614 tests 전부 통과(회귀 0). iron law green. 네이티브 0.
