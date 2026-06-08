# slice-7-trigger 완료 eval통과

type: journal
source_job: edc1d130-8e75-485c-8441-c7178f5e2a50
job_name: 추천 트리거 forecast 연결
created: 2026-06-04T13:46:55.615Z

## Findings

- **job**: slice-7-trigger
- **commit**: 68e9308
- **result**: eval 3/3 PASS
- **delivered**: lib/recommendTrigger.ts shouldRecommendNextShoe(forecast)+REPLACE_SOON_WEEKS=3, HomeScreen NextShoeCard 트리거를 forecast 기반으로 전환(forecast 결측시 condition==='교체' 폴백 보존)
- **iron_law**: tsc/lint clean, 747/747 전체, 순수·데이터파괴0·네이티브0
- **note**: App.tsx:646 homeForecast 산출→:870 주입 확인. 테스트 13신규(헬퍼 8 + 홈행동 5, overdue가 condition='양호' 신발에서도 카드 노출로 트리거 격리 증명)
- **next**: slice-7-detail-card (ShoesScreen 신발상세 추천 카드)
