# slice-2 단위/목표/스트릭/PR — eval 실패 재시도(버그+테스트갭 수정)

type: journal
job_name: slice-2-units-goals (retry #1)
created: 2026-06-01

## 배경
- 이전 커밋 400752b가 eval에서 제품 버그 1 + 테스트 갭 다수로 실패.

## Findings
- **product_bug 수정**: `lib/goals.ts currentStreak`가 km 무관하게 모든 run_date를 day-set에
  넣어 0km(비런) 날을 스트릭에 포함. 정책("0km 날은 비런으로 끊김")대로 day-set 구성 시
  `km>0`인 런만 포함하도록 필터. `currentStreak([{km:5},{km:0}],'2026-06-02')` 2→0.
- **방어 강화**: `weeklyProgress`는 0km/음수 km를 합산에서 제외(`r.km<=0 continue`),
  `personalRecords.longest`도 `km>0`만 자격 인정(음수 km 영향 차단).
- **test_bug 보강(tests/acceptance/slice-2-features.test.ts)**:
  - displayToKm: 항등(km)·mi 환산(×1.60934)·round-trip 명시 검증(신규 3 단언).
  - currentStreak: (a) 오늘 0km이면 0, (b) 중간 gap이면 1, (c) `toBe(2)` 정확 단언(loose 제거).
  - weeklyProgress: mondayISO 주 경계(이전 일요일/다음 월요일 런) 제외를 `toBe(12)`로 단언
    — mondayISO 무시 시 212가 되어 실패하도록.
  - fmtDistance: 라벨 + 환산 숫자(`'3.1 mi'`)까지 단언.

## 검증
- `npx tsc --noEmit` exit 0, `npm run lint` 0 errors(기존 warning만), `npx jest` 265/265 GREEN.
- 로컬 날짜는 mondayISO/todayISO 인자 주입 방식 유지([[global-globalthis]]).
