# d3-code-quality: dataSig maxUpdated 세그먼트 계약 테스트 (test_critic 보강)

날짜: 2026-06-18 · 기반 커밋: 611d014 · 테스트 전용(구현 변경 0)

## 문제 (test_critic)
ProfileScreen `dataSig` 4세그먼트 `shoes.len:runs.len:max updatedAt:settings` 중
**`max updatedAt` 세그먼트가 미검증**이었다. 모든 픽스처에 `updatedAt` 필드가 없어
`maxUpdated()`가 항상 0 → 시그니처에서 `Math.max(maxUpdated(...))` 항을 통째로 지워도
전 스위트 green. 즉 "카운트 불변·런 편집(updatedAt 증가) 시 재동기" 계약이 오라클로
고정돼 있지 않았다.

## 처치
`__tests__/ProfileScreen.cloud.test.tsx`에 변경감지(dataSig) describe 안으로 테스트 1건 추가
(test1/3 클론 패턴 — `renderWithRenderer`/`updateProps`/`flushAutoSync` 재사용):

- signedIn + flush → push 1회.
- 개수(신발1·런1)·settings 동일, **기존 런 1건의 `updatedAt`만 1000→2000 으로 bump**한
  backupData 로 재렌더 + flushAutoSync.
- 단언: `port.push` 2회로 증가, 마지막 payload 가 갱신된 런(`updatedAt===2000`)을 반영
  (remote=null → merge 가 로컬 그대로 push 하므로 관측 가능).

## 검증
- 시그니처에서 `Math.max(maxUpdated(...))` 항 제거 → 이 테스트만 깨짐(1 failed, 10 passed). 복원.
- tsc --noEmit: 0 errors. eslint(test): 0 errors(line24 no-void 경고는 기존).
- 전 스위트: 136 suites / 1370 passed / 3 todo. 새 네이티브 0.
- 비동기 타이머 패턴 특유의 일시적 flake 우려로 cloud 스위트 38연속 반복 실행 → 38/38 green.

iron law 충족: 관측가능 결과(port.push 호출횟수·payload) 단언, 기존 테스트 전부 유지, 구현 불변.
