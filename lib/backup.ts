// ============================================================================
// lib/backup.ts — 로컬 백업/복원 (Slice 4)
//
// 사용자의 신발·런·설정을 버전드 JSON 한 덩어리로 직렬화(serializeBackup)하고,
// 그 JSON 을 다시 검증·파싱(parseBackup)한다. 두 함수는 네이티브 의존성 0의 순수
// 함수라 단위테스트로 라운드트립을 그대로 검증한다.
//
// 계약(수용 테스트 @slice-4 데이터 백업/복원):
//   - serializeBackup→parseBackup 라운드트립으로 shoes/runs/settings 보존
//   - version 필드(≥1) 포함(향후 마이그레이션)
//   - 손상/미지원 버전 JSON 은 throw — iron law: 검증 실패 시 호출부가 기존 데이터를
//     건드리지 않게 하여 데이터 파괴를 막는다(throw 전에는 절대 부분 복원하지 않는다).
// ============================================================================

import type {ProgressionState} from './progression/types';

export interface BackupPayload {
  shoes: unknown[];
  runs: unknown[];
  settings: Record<string, unknown>;
  /**
   * 진척 상태(progression_v1: 랭크 캐시·타이틀·업적 seen·은퇴 신발·포인트). 클라우드 동기에서
   * 백업/복원·병합해 재설치·기기변경 시 은퇴 신발/진척이 유실되지 않게 한다(선택 — 옛 백업
   * 하위호환). 로컬 파일 백업(serializeBackup)에는 포함하지 않는다(클라우드 경로 전용).
   */
  progression?: ProgressionState;
}

export interface BackupV1 extends BackupPayload {
  version: number;
  exportedAt: string;
}

/** 현재 백업 스키마 버전. 향후 구조가 바뀌면 올리고 SUPPORTED_VERSIONS 에 추가한다. */
export const BACKUP_VERSION = 1;

/** parseBackup 이 받아들이는 버전 집합. 이 밖의 버전(미래/손상)은 throw 한다. */
export const SUPPORTED_VERSIONS: readonly number[] = [1];

/**
 * payload(shoes/runs/settings)를 버전드 JSON 문자열로 직렬화한다. version 과
 * exportedAt(ISO 8601) 메타를 함께 박아 향후 마이그레이션·표시에 쓴다. exportedAt
 * 은 테스트 결정성을 위해 주입 가능하며, 생략하면 현재 시각을 쓴다.
 */
export function serializeBackup(data: BackupPayload, exportedAt?: string): string {
  const backup: BackupV1 = {
    version: BACKUP_VERSION,
    exportedAt: exportedAt ?? new Date().toISOString(),
    // 입력 형태가 어긋나도 항상 배열/객체 형태로 정규화해 라운드트립 후 깨지지 않게 한다.
    shoes: Array.isArray(data?.shoes) ? data.shoes : [],
    runs: Array.isArray(data?.runs) ? data.runs : [],
    settings: data?.settings && typeof data.settings === 'object' ? data.settings : {},
  };
  return JSON.stringify(backup);
}

/**
 * 백업 JSON 을 파싱·검증해 BackupV1 으로 돌려준다. 다음 중 하나라도 어긋나면 throw
 * 한다(부분 결과를 절대 반환하지 않는다 — 호출부가 기존 데이터를 안전하게 보존):
 *   · JSON 파싱 실패(손상)
 *   · 최상위가 객체가 아님
 *   · version 이 숫자가 아니거나 SUPPORTED_VERSIONS 에 없음(미지원/미래 버전)
 *   · shoes/runs 가 배열이 아니거나 settings 가 객체가 아님(스키마 위반)
 */
export function parseBackup(json: string): BackupV1 {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다(손상된 JSON).');
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('백업 형식이 올바르지 않습니다.');
  }
  const o = obj as Record<string, unknown>;

  const version = o.version;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    throw new Error('백업 버전 정보가 없습니다.');
  }
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(`지원하지 않는 백업 버전입니다(version ${version}).`);
  }

  if (!Array.isArray(o.shoes) || !Array.isArray(o.runs)) {
    throw new Error('백업의 신발/런 데이터가 손상되었습니다.');
  }
  if (!o.settings || typeof o.settings !== 'object' || Array.isArray(o.settings)) {
    throw new Error('백업의 설정 데이터가 손상되었습니다.');
  }

  return {
    version,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
    shoes: o.shoes,
    runs: o.runs,
    settings: o.settings as Record<string, unknown>,
  };
}
