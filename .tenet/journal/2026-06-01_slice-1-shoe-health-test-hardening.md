# slice-1-shoe-health — 테스트 비평가 4건 보강 (retry #1)

날짜: 2026-06-01

## 배경
구현 자체는 정확(code_critic·playwright pass, 147 tests). 테스트 비평가가 4건의
`test_bug`를 지적해 **테스트만** 보강했다. 구현 코드(App.tsx / ShoesScreen.rn.tsx /
lib/shoe.ts)는 한 줄도 손대지 않음(iron law: 데이터 파괴 금지).

## 무엇이 문제였나 (4건)
1. **Iron law 미검증**: `App.shoe.test.tsx`의 mock fetch가 HTTP method를 무시 →
   retire(PATCH)와 delete(DELETE), 그리고 run 동반삭제(cascade) 여부를 구분하지 못했다.
2. **retire 쓰기경로 미검증**: mock 데이터에 `retired:true`를 미리 박아둬, 실제 retire
   액션이 어떤 verb로 무엇을 쓰는지(PATCH retired=true) 검증하지 못했다.
3. **restore(복원) 미검증**: retired→hidden 한 방향만 봤고, 복원 시 flag가 풀려 홈
   picker에 다시 startable로 돌아오는지 검증이 없었다.
4. **ShoesScreen 미마운트**: 3단계 색(양호/주의/교체)과 보관/복원 버튼 플로우가 실제
   렌더로 검증되지 않았다.

## 한 일
`__tests__/App.shoe.test.tsx` 재작성(테스트만):
- **mock fetch가 `{method, url, body}`를 기록**하도록 교체. 쓰기경로의 verb/바디를 단언.
- 실제 App을 구동해 탭 이동→신발상세→보관/삭제/복원 버튼을 눌러 **관측가능 행동**으로 검증:
  - retire: `/api/shoes/{id}` 에 **PATCH retired=true**, **DELETE 없음**, run 기록 보존(상세에
    "아직 기록이 없어요" 미표시), 보관됨 칩 표시.
  - delete: `/api/shoes/{id}` 에 **DELETE 1회**, `/api/runs` 에 **DELETE 0회**(cascade 금지),
    삭제 후에도 History에 run 잔존("삭제된 신발" + 거리).
  - restore: **PATCH retired=false**, 복원 후 홈 picker에 신발 복귀 + "러닝 시작" CTA 노출.
- `ShoesScreen`을 직접 마운트해 3단계 색(DANGER/WARN/GOOD) 단언 + 보관(archive)→onRetire(id,true),
  복원(undo)→onRetire(id,false) 버튼 플로우 검증.

## 검증
- `npm test`: 16 suites / **152 tests** 통과(신규 5건 포함, 기존 3건 유지·강화).
- `npx tsc --noEmit`: clean.
- `npm run lint`: 신규 에러 0(App.shoe.test.tsx 무경고·무에러). 남은 19 error는 모두
  기존 파일(primitives.tsx 등) 선재 문제로 이 작업과 무관.

## 메모(다음 사람용)
- RN jest 프리셋에서 `root.findAllByType(Pressable)`는 0을 반환한다(Pressable이 래핑됨).
  대신 `root.findAll(n => typeof n.props?.onPress === 'function')` + 텍스트 매칭으로 버튼을 찾았다.
- Ionicons mock이 아이콘 이름을 Text로 렌더하므로 `archive-outline`/`arrow-undo-outline`/
  `trash-outline`/`chevron-back`/탭 아이콘으로 버튼을 고유 식별할 수 있다.
- `ShoeDetail` 화면에는 TabBar가 없다 — 탭 이동 전 `chevron-back`으로 locker로 돌아와야 한다.
