# slice-2-addshoe: shoeModels 단일소스 + 권장 배지 + expo-image-picker 사진 실동작 완료

type: journal
job_name: AddShoeScreen shoeModels 사용 + 권장수명 자동 + 사진 업로드 실동작
created: 2026-06-02

## Background

[[2026-06-01_slice-2-shoe-intel-expo-addshoe]]에서 사진 업로드(image picker 네이티브)를
사용자 부재 중 보류했었다. 이번에 expo 도입(SDK 56)에 맞춰 실제로 동작시켰다.

## Deliverables

- **AddShoeScreen.rn.tsx**:
  - 인라인 MODELS는 이미 제거되어 `data/shoeModels`(BRANDS/modelsForBrand/getRecommendedLifespanKm)
    단일 소스를 사용 중이었음. 이번 작업은 그 위에 권장 수명 UX를 마저 구현.
  - 고정 chip 프리셋(MAX_PRESETS) 제거 → 모델 선택 시 `getRecommendedLifespanKm`으로
    권장 수명(km)을 자동 입력하는 **편집 가능한 숫자 입력칸**으로 대체. 값이 권장값과
    같으면 **'권장' 배지**(sparkles)가 뜨고, 사용자가 직접 바꾸면 배지가 사라진다.
    브랜드 변경 시 모델을 비우고 권장값도 새 브랜드 기준으로 리셋.
  - 사진 자리표시자 → 탭하면 라이브러리에서 사진 선택(미리보기 렌더). 선택 실패 시
    **비차단**: 에러/재시도 안내를 띄우고 사진 없이도 등록 가능.
- **lib/photo.ts** (신규): `pickShoePhoto()` — expo-image-picker 래퍼. 권한 거부/취소→null,
  진짜 실패→throw로 분리해 호출부가 비차단/재시도를 결정.
- **theme.ts**: `Shoe.photoUri?` 추가(옵셔널, 없으면 사진 없음). onSave에 photoUri 동봉.
- **jest.setup.js**: expo-image-picker 전역 목 추가(기본 granted + cancel, 테스트별 override).
- **package.json**: expo-image-picker@~17.0.11 추가.
- **__tests__/AddShoeScreen.test.tsx** (신규 통합 4):
  1. 모델 선택→권장 320km 자동 + '권장' 배지, 저장 시 320 전달
  2. 권장값 수정→배지 사라짐 + 수정값(600) 저장
  3. 사진 실패→에러/재시도 표시 + 사진 없이 onSave 진행(비차단)
  4. 사진 성공→미리보기 렌더 + onSave.photoUri

## Verification

- jest 408/408 passed (신규 4 통합 포함), tsc --noEmit clean, eslint 0 errors
  (기존과 동일한 inline-style 경고만 잔존).
- 스모크: 통합 테스트가 실제 컴포넌트를 마운트해 사진 선택/실패/저장 경로를 렌더 검증.
