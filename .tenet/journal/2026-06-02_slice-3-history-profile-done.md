# slice-3-history-profile done

type: journal
job_name: HistoryScreen·ProfileScreen 토큰화 + 시각 마감
created: 2026-06-02

## Findings

- **outcome**: HistoryScreen.rn.tsx·ProfileScreen.rn.tsx 하드코딩 색/인라인 fontFamily 0 토큰화 + 시각 마감 완료. slice-3-design.test.ts 35/35 PASS(History/Profile 단언 포함), 전체 jest 483 passed.
- **history**: raw hex(#1C1C1E·#FFFFFF·#000·#2C2C2E) → CARD_DIM/T1/BG/CARD_HI 토큰, iconBtn 테두리 rgba → withAlpha(T1,0.12). svg 코스맵을 CARD_DIM 리세스 well(+SEP 헤어라인)로 정제, 끝점 흰점 T1. 막대차트 인라인 스타일을 StyleSheet(chartTick/chartBar/chartLabel 등)로 추출. 빈 상태 카피 keep-going 톤.
- **profile**: raw hex(#fff) → T1, 인라인 rgba(255,101,0,…)/rgba(255,255,255,…) → withAlpha(ACCENT/T1,…). 신규: 주간 목표 달성 링(Ring primitive, weeklyDoneKm/weeklyPercent) + keep-going 카피('Nkm만 더 — 계속 달려요!' / 100%+ '목표 달성 🎉'), 이번 주 스트릭 카드(월~일 체크 점 + 오늘 대시 점) + 식별 줄 스트릭 Pill, 설정 4행 ACCENT 아이콘 칩 마감.
- **data**: 파괴 0 — ProfileScreen에 optional props(weeklyDoneKm/streakDays/weekDays/weekTodayIdx) 추가, App.tsx가 goalProgress.totalKm·goalStreak·weekBuckets(runs,mon)>0·(now.getDay()+6)%7로 실데이터 주입. 미주입 시 안전 기본값(0/[]/-1). 네이티브 변경 0.
- **tests**: __tests__/ProfileScreen.design.test.tsx(6) — 링 %/거리/keep-going 카피·스트릭 체크 수·스트릭 칩·단위 토글·목표 스테퍼 콜백. __tests__/HistoryScreen.design.test.tsx(3) — 기간 세그먼트 갱신·차트 라벨·빈 상태 카피.
- **gates**: tsc exit 0, eslint 0 errors(인라인스타일/no-void warning만, 기존 패턴), jest 483 passed.
