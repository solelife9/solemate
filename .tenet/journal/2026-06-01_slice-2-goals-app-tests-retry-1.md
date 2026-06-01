# slice-2 홈 목표 링/스트릭 — App 통합 테스트 보강 (retry #1)

type: journal
job_name: 목표 달성률 + 스트릭 UI (test-only retry)
created: 2026-06-01

## 배경
- 제품 코드(커밋 eb7aa3f)는 code_critic·playwright 통과로 정상. test_critic가
  `__tests__/App.goals.test.tsx`에 식별력 없는(vacuous) 갭 4건(test_bug) 지적.
- 구현은 건드리지 않고 **실 App 마운트 + 백엔드형 run 데이터** 통합 케이스만 추가해
  핵심 의미를 실제로 증명.

## 추가한 케이스 (전부 ymdLocal 기준 상대 날짜 → 결정적)
1. **주간 윈도우 제외**: 이번 주 오늘 15km(→50%) + 주간 밖 isoOffset(10) 21km. 홈이
   `50%`만 반영하고 전체합 `120%`(36/30)는 **아님**, 링 진행도도 0.5. → weeklyProgress가
   전체합이 아니라 mondayISO 윈도임을 잡음.
2. **스트릭 중간 gap**: 오늘 + 그제(어제 빠짐) → `1일 연속`(2/3일 아님). gap 너머로
   distinct day를 세지 않음을 단언.
3. **초과 >100%**: 45km/30km=150% → 표시 정책상 `150%`는 그대로 노출하되 Ring
   진행도가 1.0에서 클램프(goalRingProgress≈1)되고 원시 strokeDashoffset이 음수가
   아님(over-fill 아님)을 단언.
4. **100% GOOD 전환**: 30km=30km에서 진행 호 그라디언트 Stop이 GOOD(녹색) 포함 +
   ACCENT 미포함 → 단순 채움이 아닌 상태색 전환을 증명(gradient id 역추적).
5. (보너스) **단위 불변**: settings_unit='mi'로 로드해도 `2일 연속` 유지(절대 일수).

## 식별력 검증(non-vacuous)
- 임시 뮤턴트로 확인: weeklyProgress 윈도 제거 / currentStreak를 days.size로 / Ring
  클램프 제거 / GoalRing color를 ACCENT 고정 → 추가 케이스 1~4가 **전부 실패**, 복구
  후 9/9 GREEN. test_critic의 oracle-leakage 우려 차단.

## 선택자/날짜 규칙
- Ring 식별은 기존 방식 재사용(strokeWidth===8 && strokeDasharray!=null = goal ring).
- 색 검증은 진행 호 stroke=`url(#id)`의 id로 LinearGradient를 역추적해 Stop stopColor 수집.
- 날짜는 isoOffset(상대)·ymdLocal 동일 규칙([[global-globalthis]]) → 실행 요일 무관.

## 검증
- `npx tsc --noEmit` 0, `npm run lint` 0 errors(기존 warning만, 신규 0),
  `npx jest` 329/329 GREEN, App.goals 9/9.
- 스테이징: `__tests__/App.goals.test.tsx` + 본 저널만.
