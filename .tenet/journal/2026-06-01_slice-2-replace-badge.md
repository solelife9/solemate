# slice-2-replace-badge 완료

type: journal
job_name: 신발 교체 알림 배지 + 임계값
created: 2026-06-01

## Findings

- **outcome**: 구현 완료 — tsc 0 errors, eslint 0 errors, jest 345/345.
- **deliverables**:
  - `lib/shoe.ts`: 순수 추가 — `clampMaxKm`/`MIN_SHOE_MAX_KM`/`MAX_SHOE_MAX_KM`/`SHOE_MAX_STEP_KM`(신발별 수명 범위), `tierBadge(condition)→{label,tone}|null`(양호는 배지 없음), `reconcileShoeAlerts(criticalIds, alreadyNotified)→{toNotify, notified}`(신발별 중복 알림 추적), `KEEP_GOING_REPLACE` 카피 상수.
  - `primitives.tsx`: `TierBadge` 공용 컴포넌트(홈/목록/상세 재사용, testID=`tier-badge-{주의|교체}`, 양호 미노출).
  - `App.tsx`: `checkShoeAlerts` 재작성 — 기존 '하루 1회' 전역 게이트(`shoe_alert_date`)를 신발별 추적(`shoe_alert_notified` JSON 집합 + `reconcileShoeAlerts`)으로 교체. 같은 신발 반복 알림 차단 + 같은 날 새로 임계 도달한 다른 신발은 즉시 알림. Alert 메시지에 keep-going 카피 추가. `updateShoeMaxKm(id, maxKm)` 추가(낙관적 setState + 백엔드 PATCH).
  - `ShoesScreen.rn.tsx`: ShoeCard/ShoeDetail에 TierBadge. ShoeDetail에 신발 수명(max_km) ＋/− 스테퍼(단위 환산) + 교체 임계까지 남은 거리/keep-going 카피.
  - `HomeScreen.rn.tsx`: 히어로에 TierBadge.
- **tests**:
  - `__tests__/lib/shoe.test.ts`: clampMaxKm·tierBadge·reconcileShoeAlerts 단위 테스트 보강.
  - `__tests__/App.shoebadge.test.tsx`(신규 5종): 임계 도달→교체 배지 노출, 주의/양호 배지 구분, keep-going 카피, 신발별 추적(중복 없음·새 신발만), 수명 상향→배지 완화+PATCH.
  - 기존 `__tests__/App.alerts.test.tsx`(임계값 설정/발화) 전부 통과 유지.
- **significance**: shoeHealth tier를 앱 전면 배지로 끌어올리고, 알림 중복을 신발별로 올바르게 추적. 신발별 max_km 조정으로 교체 임계를 개인화. Keego 신발-우선·교체 동선 강화.
