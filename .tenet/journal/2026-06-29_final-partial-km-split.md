# 2026-06-29 — 완주 마지막 부분 km 스플릿 기록 (로드맵 P0 #6 일부)

## 맥락
워치 UDID 미등록 블로커(비전 메모 참조)로 watchOS 심박 검증이 사용자 손에 막혀 대기 중.
그 사이 워치 없이 자율 검증(tsc/lint/test) 가능한 로드맵 항목 진행.

로드맵 `2026-06-25-running-excellence-roadmap.md` 14개 항목을 코드 대비 재판정 → 12 DONE / 3 PARTIAL.
- #11(로테이션 단정 추천): 사용자 결정으로 폐기([[solemate-rotation-recommend-deferred]]) → 손대지 않음.
- #9(coords.heading 활용): 칼만 2D 교체와 묶이는 큰 작업 → 워치 후 진행.
- #6(마지막 부분 km 스플릿 미저장 + mi 스플릿): 순수 로직·격리·명백한 데이터 누락 버그 → 이번에 착수.

## 무엇을
레코더는 정수 km 경계(`Math.floor(dist) > splits.length`)에서만 per-km 스플릿을 남겨,
5.6km 런의 마지막 0.6km 가 '구간' 표시에서 통째 누락됐다. 완주 시 꼬리 구간을 한 줄 추가.

- `lib/splits.ts` 에 순수 함수 `appendFinalSplit(recorded, finalKm, finalElapsed, lastBoundaryElapsed, finalElevGain, lastBoundaryElev)` 추가.
  - 남은 거리 `frac = finalKm - recorded.length`. `frac >= FINAL_SPLIT_MIN_KM(0.1, ±1e-9 부동소수 방어)` 일 때만 추가.
  - `paceSec = round(segTime / frac)` 로 per-km 페이스 정규화(다른 구간과 막대·페이스 비교 일관).
  - `km` 라벨 = 총 거리(소수 2자리, 예 5.6). elev = max(0, 꼬리 누적고도 차).
  - 비파괴: 입력 복제 반환. 비유한·segTime<=0·거리역행이면 원본 그대로.
- `App.tsx finishRun()`: `setFinSplits(splitsRef.current.slice())` → `appendFinalSplit(...)`. 고도 총합을
  `finElevTotal` 로 1회 계산해 스플릿 꼬리·`setFinElev` 양쪽 재사용. import 추가.
  → 꼬리 스플릿이 `splits_<id>` 영속·RunRecap·RunDetail '구간' 표시에 동시에 반영(onSave 한 경로).

## 검증
- `npx tsc --noEmit` 통과.
- `__tests__/lib/splits.test.ts` +10 케이스(5.6km 환산, 비파괴, <0.1 노이즈 제외, 임계 정확, 정수 km,
  1km 미만, 고도하강 클램프, NaN/시간역행/거리역행 방어) — 13/13 통과.
- 기존 lint 2 error(createChallenge/deleteChallenge 미사용)·8 test fail(injury/shoes/cadence)는
  **베이스라인 선존**(stash 후 동일 확인). 이번 변경이 도입한 회귀 0.

## 남음
- #6 의 **mi 단위 스플릿 대응** 미구현 — RunSplits 표시/레코더 경계가 km 고정. 별도 표시계층 작업으로 후속.
- 커밋 안 함(사용자 리뷰 대기). feat/firebase-migration 브랜치.
