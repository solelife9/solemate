# Slice 3 — HistoryScreen 심박 UI 숨김 (차단 결함 후속)

REPORT-ONLY 잡("통합검증: Slice 3 디자인 수용 sweep")이 보고한 차단 결함을 해소.

## 결함
HistoryScreen.rn.tsx(구 line 281)가 run-detail stats 배열에 `{ l: '평균 심박', ...dash(run.bpm,'bpm') }`
를 넣어 무조건 렌더 → '평균 심박 152 bpm' 또는 '평균 심박 --'가 노출.
spec #15(심박 UI 숨김)·iron law #17(표시만 숨김, 데이터는 보존) 위반.
게다가 `__tests__/heartRatePreserved.test.tsx`가 이 위반 UI 존재를 단언하여 결함을 잠그고 있었음.

## 조치 (최소 범위)
1. HistoryScreen 상세 stats 배열에서 '평균 심박' 행 제거. `Run.bpm` 타입·저장 필드는 그대로 보존(파괴 금지).
2. heartRatePreserved.test.tsx 프레젠테이션 단언 반전:
   - 상세 화면에 '평균 심박' 라벨·'bpm' 단위가 **없음**을 단언.
   - 캐스트 없는 `Run` 리터럴(bpm:152)은 유지 → bpm 타입 제거 시 tsc 실패(데이터 타입 보존 컴파일 가드).
   - 저장 레이어 가드(PendingRun enqueue→load 라운드트립 + 캐스트 없는 PendingRun 리터럴)는 그대로 유지.
3. RunScreen(RunStart) 목표 화면에도 심박 UI('심박'/'bpm')가 없음을 단언하는 가드 1건 추가.

## 게이트
- tsc --noEmit: exit 0
- eslint: 0 errors (기존 inline-style/no-void 경고만 잔존)
- jest: 511/511 passed (+1)
- tests/acceptance: 60/60 passed

데이터 파괴 없음, 다크 테마 유지.
