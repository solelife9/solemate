# 부상 가이드 — 비의료성 프레이밍 + 콜드스타트 ACWR (2026-06-24)

부상위험 카드/상세를 '진단'이 아니라 '오늘 컨디션 가이드' 톤으로 바꾸고, 가입 직후
(이력 2~3주) 만성 부하 과소평가로 ACWR이 거짓으로 치솟던 콜드스타트 버그를 고쳤다.
베타 노출 안전성(의료성 단정 회피) + 신규 유저 첫 경험(거짓 경고 방지) 두 축.

## 비의료성 프레이밍 (lib/injuryRisk.ts, 카드/상세)
- `RISK_LABEL` 단일 소스 추가: safe '오늘은 좋은 흐름' / caution '오늘은 살펴볼 때' /
  high '오늘은 쉬어갈 때'. 카드·상세에 흩어져 있던 `LEVEL_LABEL`('부상위험 낮음/주의/높음')
  제거 → 단정적 의료 표현('부상위험') 화면에서 퇴출.
- `RISK_DISCLAIMER = '참고용 가이드예요 · 의학적 조언은 아니에요'` 추가. 카드/상세 모두
  하단에 항상 노출(T4 톤). 카드의 옛 hint('평소 = 최근 4주 평균…')를 고지로 교체.
- accessibilityLabel 도 새 라벨 사용.

## 콜드스타트 ACWR (lib/trainingLoad.ts)
- 만성을 항상 4주로 나누던 것을 **보유 주수(1..4)**로 나눈다(`weeksSpan = min(4, ceil((oldestAgo+1)/7))`).
  3주 꾸준 10km가 옛 로직에선 만성 과소→ACWR 1.33(거짓 주의)였으나 이제 ACWR≈1(safe).
- ACWR 신뢰 게이트를 `weeksSpan >= 3`으로 명시(`confident = canACWR`). 그 미만은 신뢰 안 함.
- 이력 2주(콜드스타트)는 ACWR 대신 **지난주 대비 거리 증가율(10% 룰, ramp)**로 판정 →
  급증(+150%)을 high로 잡는다. 진짜 첫 주(비교 대상 없음)는 기존대로 격려만(safe).
- `loadRatioPhraseKo` 평어 분기 확장: ACWR 신뢰 시 '평소의 N.N배', 콜드스타트 시
  '지난주보다 +N%', 첫 주 '기록 쌓는 중'. 약자/원시 숫자는 여전히 0.

## 테스트
- trainingLoad: 콜드스타트 ramp 폴백(+150%→high) / 거짓 high 방지(3주 꾸준→safe, ACWR≈1) 추가.
- 카드·상세: 새 라벨('오늘은 좋은/쉬어갈') 단언, 고지('의학적 조언은 아니에요') 노출,
  '부상위험' 미노출, 'ACWR' 미노출 회귀 강화.

## 검증
- tsc clean. eslint 변경 7파일 0 errors(잔존 warning은 inline-style/no-void 기존 패턴).
- 변경 스위트 3종 20/20 통과. 전체 run 신규 결정적 실패 0.
- 잔존 red 4스위트(App.shoe/App.shoefirst/ShoesScreen/injury.warning 의 'Bondi 8' 1건)는
  옛 락커 복원 동선 pre-existing(obsolete·보류, HEAD 동일). App.tombstone/HistoryScreen
  durationRoundtrip 는 ToastHost 타이머 누수 order-flaky(단독 통과).
