# slice-3 HomeScreen 행동 테스트 추가 (retry 1)

## 배경
구현(HomeScreen.rn.tsx 토큰화·Keego 워드마크·shoe-first 히어로·Button CTA)은 커밋
f1f39ec로 정상 적용·통과 상태였으나, test_critic이 "인터랙티브 요소 무테스트"로 차단.
구현은 그대로 두고 **행동 테스트만** 신설.

## 추가물
- `__tests__/HomeScreen.test.tsx` (react-test-renderer) — 관찰 가능한 동작 단언:
  1. **CTA→Button 배선 보존**: '러닝 시작' Button press → `onStart`가 선택된
     activeIdx(1, 0)로 호출됨. Button primitive 교체로 onPress 배선이 끊겼는지
     회귀 가드.
  2. **activeIdx 실값 히어로 연결**: activeIdx=0/1을 주면 `testID="home-hero"`
     서브트리의 신발명·수명 링 %가 그 신발로 바뀜(Pegasus 80% ↔ Clifton 20%).
     out-of-range(99) → 마지막 신발로 clamp(크래시 없음).
  3. **KeegoWordmark 고정**: HomeScreen 직접 렌더 시 svg `<Text>` children이
     정확히 'Keego'(형제 화면 some() substring 아님).
  4. **오렌지 절제**: QuickStats '평균 페이스' 라벨 color가 T3 토큰에 바인딩됨.
- HomeScreen.rn.tsx: 히어로 래퍼 View에 `testID="home-hero"` 1줄만 추가
  (동작/로직/데이터 변경 없음 — 테스트가 히어로 서브트리를 격리 단언하기 위함).

## 검증
- `npx tsc --noEmit`: exit 0
- `npm run lint`: 0 errors (기존 warning만)
- `npx jest __tests__/HomeScreen.test.tsx`: 7/7 green
- 전체: 452 passed. 유일한 실패 suite는 `tests/acceptance/slice-3-design.test.ts`의
  ShoesScreen/RunScreen/ProfileScreen/HistoryScreen/AddShoeScreen raw-hex 검사 —
  아직 토큰화 안 된 **형제 화면**들로 본 잡과 무관. HomeScreen.rn.tsx는 해당
  raw-hex/fontFamily/워드마크 검사 모두 통과.
