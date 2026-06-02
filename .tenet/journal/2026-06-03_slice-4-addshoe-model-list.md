# Slice 4 — AddShoeScreen 모델 선택 개선 (전체 목록 + 필터 병행)

## 요구
브랜드 선택 후 모델 입력칸 포커스 시, 입력이 비어 있으면 해당 브랜드의 **전체 모델을
알파벳순(오름차순)**으로 스크롤 가능한 리스트로 노출 → 탭 선택(권장수명 자동).
글자를 입력하면 **기존 필터 동작 유지**(두 방식 병행). 단일 소스 = `data/shoeModels`의
`modelsForBrand`, 정렬 = `localeCompare`. 리스트가 길면 스크롤(최대 높이 제한).

## 구현
- `AddShoeScreen.rn.tsx`
  - `sortedModels = modelsForBrand(brand).slice().sort((a,b)=>a.localeCompare(b))` — 단일 소스 + localeCompare 정렬.
  - 빈 입력(`q===''`) → 전체 `sortedModels` 노출, 글자 입력 → 기존 부분일치 필터(상위 5개) 유지.
  - 드롭다운 내부를 `ScrollView`(`maxHeight: 264`, `nestedScrollEnabled`,
    `keyboardShouldPersistTaps="handled"`)로 감싸 긴 목록 스크롤.
  - 제안 행에 `accessibilityRole="button"` + `accessibilityLabel={model}` 추가(a11y·테스트성).
  - 색상은 기존 토큰만 사용 — raw hex 0.

## 행동 테스트 (`__tests__/AddShoeScreen.test.tsx`, +3)
1. 포커스+빈입력 → Nike 14개 전체가 알파벳순(첫 항목 `Alphafly 3`, `localeCompare` 정렬과 일치)으로 노출.
2. 글자 입력('Pegasus') → 전체→부분일치로 좁혀짐(<14, 모두 'pegasus' 포함) — 두 방식 병행 확인.
3. 빈 입력 전체 목록에서 `Alphafly 3` 탭 → `model='Alphafly 3'`, `max=400`(per-model 권장) 세팅 + 권장 배지, 저장 시 동일 값 전달.

## 검증
- `npx jest AddShoeScreen` → 7/7 pass.
- `npx tsc --noEmit` → 0 errors.
- 전체 스위트 60 suites / 544 pass (iron law green).
