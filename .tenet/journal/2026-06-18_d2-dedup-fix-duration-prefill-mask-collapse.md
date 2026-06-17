# d2-dedup 후속 수정 — 시간 프리필 MM:SS-total 복원(편집 duration 손상 회귀 차단)

type: journal
job_name: TIER_LABEL·포맷터·날짜빌더 중복 제거 (d2-dedup) — code_critic 차단 2건 수정
created: 2026-06-18
base_commit: 44e2b72

## 차단 사유(code_critic 2건)

- **버그1(product_bug) — 1h+ 런 편집 시 duration 손상**: d2-dedup 이 HistoryScreen 의 시간 입력
  프리필 포맷터 `fmtDurationInput` 을 `lib/format.fmtTime`(H:MM:SS, 1시간↑ '1:05:00')으로 단일화.
  그러나 입력 필드 `onChangeText` 의 `maskDuration` 은 MM:SS(콜론 1개, 최대 99:59)만 처리한다.
  → 60~99분 런을 편집 폼에서 열고 시간 필드를 첫 타건하면 마스크가 `'1:05:00'`→digits`'10500'`→
  slice(0,4)`'1050'`→`'10:50'`(650s)으로 **collapse**, duration 손상. 무편집 저장은
  `parseDurationInput` 의 H:MM:SS 일반화로 살았지만 **편집 경로**가 깨졌다.
- **버그2(test_bug)**: `HistoryScreen.durationRoundtrip.test` 가 무편집 저장(프리필을 state 에
  직접 둔 채 저장)만 검증 → 편집 경로 손상을 은폐.

## 근본 진단

입력 프리필 포맷터(MM:SS-total, maskDuration 호환·왕복 안정)와 `fmtTime`(H:MM:SS 표시용)은
**출력 포맷이 다른 별개 함수**다 — 병합이 부적절했다. 둘은 단일화 대상이 아니다.

## 수정

- **`fmtDurationInput` 을 MM:SS-total 전용 헬퍼로 되돌림**(옛 동작 복원): `${Math.floor(sec/60)}:`
  `${String(sec%60).padStart(2,'0')}` — 분 무패딩·60 초과(3900s→`'65:00'`), 0 이하면 빈칸.
  `'65:00'`→maskDuration→digits`'6500'`→`'65:00'` 으로 **마스크 왕복 안정**. fmtTime 으로 대체 안 함.
- `fmtTime` import 제거(HistoryScreen 에서 더 이상 호출 안 함 → unused import 정리).
- `parseDurationInput` 의 H:MM:SS(3분절) 수용 일반화는 **무해하므로 유지** — 사용자가 시간 단위가
  붙은 문자열을 손으로 넣어도 라운드트립이 깨지지 않는다. MM:SS(2분절) 계산은 기존과 동일.
- **TIER_LABEL→theme, ymLocal/ymdLocal 단일화는 그대로 유지**(되돌리지 않음). 이 둘은 code_critic
  통과 항목이라 손대지 않았다.

## 테스트

- `HistoryScreen.durationRoundtrip.test.tsx`:
  - 프리필 단언을 MM:SS-total 로 정정(3000s→`'50:00'`, 3900s→`'65:00'`).
  - **편집-후-저장 왕복 테스트 신규 추가**(sub-hour·hour-plus 각각): 시간 필드 `onChangeText`
    (=maskDuration 경유)를 한 번 거친 뒤 저장해도 duration 보존을 단언. hour-plus 는 수정 전
    프리필 `'1:05:00'`→`'10:50'` collapse 로 값 안정 단언부터 실패한다(회귀 가드).
  - 0초→빈칸 케이스 유지.
- `tests/acceptance/audit-hardening.test.ts` D묶음 (2): 버그를 인코딩하던 "fmtDurationInput 이
  fmtTime 재사용" 단언을 정정 — `fmtDurationInput` 본문이 fmtTime 을 호출하지 **않고**
  MM:SS-total 을 직접 조립(`padStart(2,'0')`)함을 단언. 왕복 행동은 durationRoundtrip 이 보장.

## verify (iron law)

- `tsc --noEmit` clean. eslint 변경파일 0 errors(기존 inline-style warning만).
- jest **136 suites / 1364 pass / 5 todo**, 회귀 0. 동작 불변(거리/시간 계산 결과 불변).
- 새 네이티브 0, 새 의존성 0. 데이터 파괴 0.
- 스모크: HistoryScreen 편집 폼 마운트→상세→편집→저장 경로가 테스트에서 무에러 렌더.

## files

- src: `HistoryScreen.rn.tsx`(fmtDurationInput→MM:SS-total 전용 헬퍼 복원, fmtTime import 제거,
  주석 정정), parseDurationInput H:MM:SS 일반화는 유지.
- tests: `__tests__/HistoryScreen.durationRoundtrip.test.tsx`(프리필 단언 정정 + 편집-후-저장
  왕복 테스트 추가), `tests/acceptance/audit-hardening.test.ts`(D묶음 MM:SS 단언 정정).
