# slice-2-profile-settings (retry #1) — cost-per-km 단위버그 + 테스트 갭 4

type: journal
job_name: ProfileScreen 설정 4행 실동작(목표/알림/단위/계정) — 재시도
created: 2026-06-01
parent_commit: f896f61

## 왜 재시도였나
이전 구현(f896f61)이 eval에서 **product_bug 1 + test_bug 4**로 실패. 구조(lib/settings·
ProfileScreen)는 유지하고 아래만 수정.

## 1) product_bug 수정
- **ShoesScreen.rn.tsx:183** cost-per-km 힌트가 사용거리를 `${shoe.used}km`로 하드코딩 →
  같은 ShoeDetail의 hero '남은 수명'·'사용 중'·'총 누적 거리'는 `usedDisp`+`unit`으로 환산되는데
  이 힌트만 km → 한 화면 두 단위(스펙 '단위 토글→전 화면 즉시 환산' 위반).
- 수정: `${usedDisp}${unit} 사용 · 1km당 ${fmtWon(cpk)}원`. **비용 비율('1km당 N원')은
  의도적으로 km 기준 유지**(환산 금지) — 표시거리만 환산.
- ShoeDetail 안 다른 거리표시(hero remain/condSub/totals/run dist)는 이미 환산됨 — 누락은
  이 힌트 하나뿐임을 확인.

## 2) test_bug 보강
- **`__tests__/lib/units.test.ts`(신규)**: 환산 수학 직접 검증(이전 0개).
  KM_PER_MI=1.60934, kmToDisplay/displayToKm 라운드트립, displayNum digits 0·1·2
  (595km→370/369.7/369.72mi), fmtDistance.
- **`App.settings.test.tsx` 보강**:
  - 단위 토글 후 라벨뿐 아니라 **환산된 숫자값** 단언(홈 595km→370mi, km 원숫자 사라짐).
  - 토글 전 km 원숫자(595) 기준점 단언.
  - **신발 화면(전 화면 환산)**도 토글 시 환산 수치(600km→373mi) 단언(Profile+Home 외 1개 더).
  - **계정 행 렌더**: 기기 ID/버전/APP_VERSION 값 단언.
  - **cost-per-km 회귀 테스트**: mi+구매가 영속 후 상세 진입 → '298mi 사용' + '1km당 250원'
    동시 단언, '480km 사용' 미존재(버그 회귀 방지). 수정 전이면 실패 = 버그를 잡는다.
- **`App.alerts.test.tsx`(신규)**: checkShoeAlerts 실제 효과 검증(이전엔 영속 플래그/라벨만).
  - enabled=false + 95% 신발 → 알림 미발생.
  - enabled=true + 95% → 발생(메시지에 신발명).
  - **새 임계값 75%에서 발화**: 80% 신발이 기본 90%에선 조용, 75%에선 발화(메시지 '75%').
  - 알림 패널 임계값 +스텝 → settings_alerts.thresholdPct=95 영속.

## 검증
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors(기존 inline-style 경고만).
- `npm test`: 35 suites / **320 tests GREEN**.

## lesson
단위 환산 버그는 '한 화면 안의 두 단위'로 드러난다 — 표시 경계(스크린) 거리표시를 한 곳씩
점검할 것. 비율/비용(원/km) 같은 km-고정 지표는 환산하면 안 되므로, 회귀 테스트는
'거리는 환산됐는가'와 '비율은 km 유지인가'를 **동시에** 단언해야 한다.
