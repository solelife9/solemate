// ============================================================================
// lib/backup.ts — 로컬 백업/복원 (Slice 4)
// STUB: slice-4-backup 잡이 실제 로직으로 구현하고
//       tests/acceptance/slice-4-features.test.ts 의 '@slice-4 데이터 백업/복원' describe.skip → describe 로 활성화한다.
// 계약(수용 테스트):
//   - serializeBackup→parseBackup 라운드트립으로 shoes/runs/settings 보존
//   - version 필드(≥1) 포함(향후 마이그레이션)
//   - 손상/미지원 버전 JSON 은 throw (데이터 파괴 금지)
// ============================================================================
export interface BackupPayload {
  shoes: unknown[];
  runs: unknown[];
  settings: Record<string, unknown>;
}

export interface BackupV1 extends BackupPayload {
  version: number;
  exportedAt: string;
}

export function serializeBackup(_data: BackupPayload): string {
  // STUB — slice-4-backup 에서 구현 예정.
  return '';
}

export function parseBackup(_json: string): BackupV1 {
  // STUB — slice-4-backup 에서 구현 예정.
  throw new Error('not implemented');
}
