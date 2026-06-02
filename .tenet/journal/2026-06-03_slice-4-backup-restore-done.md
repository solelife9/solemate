# Slice 4 — 로컬 백업/복원 완료

## 구현
- **lib/backup.ts**: 스텁 → 실제 구현.
  - `serializeBackup(payload, exportedAt?)`: `{version:1, exportedAt(ISO), shoes, runs, settings}` JSON. 입력이 어긋나도 배열/객체로 정규화.
  - `parseBackup(json)`: JSON 파싱 + 스키마/버전 검증. 손상 JSON·미지원 버전(예: 999)·version 누락/비숫자·shoes/runs 비배열·settings 비객체면 **throw**(부분 복원 절대 없음 → 데이터 파괴 금지). `BACKUP_VERSION=1`, `SUPPORTED_VERSIONS=[1]`.
  - 라운드트립으로 shoes/runs/settings 보존.
- **ProfileScreen.rn.tsx**: '데이터' 섹션 신설.
  - 내보내기 → `serializeBackup(backupData)` → RN `Share.share`(reject 조용히 무시, 네이티브 0).
  - 가져오기 → TextInput 붙여넣기 → `parseBackup` 성공 시에만 `onImport(BackupV1)` 호출 + 성공 안내. 실패 시 콜백 미호출 + 에러 안내(기존 데이터 보존).
- **App.tsx**: `backupData={shoes,runs,settings}` 주입, `importBackup`이 검증된 백업만 상태 복원. 원본은 **신규 키 `imported_backup_v1`**에 영속(기존 `settings_*` 키는 changeX→saveX 정상 경로로만 갱신 → 파괴 금지).

## 테스트
- `__tests__/lib/backup.test.ts`: serialize/parse/라운드트립/throw(손상·미지원·스키마위반·최상위 비객체).
- `__tests__/ProfileScreen.backup.test.tsx`: 내보내기 Share 호출·라운드트립, reject 무해, 가져오기 성공(onImport 호출+안내)·실패(미호출+에러).
- 수용 `tests/acceptance/slice-4-features.test.ts`: `@slice-4 데이터 백업/복원` describe `.skip` 제거 후 통과.

## 검증
- `npx jest`: 63 suites, 568 pass / 3 skip(잔여 = 챌린지 잡 소관), 0 fail. iron law green.
- `npx tsc --noEmit`: 0 errors. ESLint: 0 errors(기존 스타일 경고만). 네이티브 변경 0.
