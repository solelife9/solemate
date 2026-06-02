// ============================================================================
// lib/rotation.ts — 신발 로테이션 추천 (Slice 4)
// STUB: slice-4-rotation 잡이 실제 로직으로 구현하고
//       tests/acceptance/slice-4-features.test.ts 의 '@slice-4 신발 로테이션 추천' describe.skip → describe 로 활성화한다.
// 계약(수용 테스트):
//   - 활성 신발 <2 → [] (로테이션은 2켤레+에서만 의미)
//   - retired 제외
//   - 같은 조건이면 더 오래 쉰 신발 우선(폼 회복), 각 pick에 reason 문구
//   - runType(easy/tempo/long/recovery/race)→카테고리 매칭(있으면) + 마모 분산
// ============================================================================
export type RunType = 'easy' | 'tempo' | 'long' | 'recovery' | 'race';

export interface RotationShoe {
  id: string;
  brand: string;
  model: string;
  retired?: boolean;
}

export interface RotationRun {
  shoeId: string;
  date: string; // 'YYYY-MM-DD'
}

export interface RotationPick {
  shoe: RotationShoe;
  score: number;
  reason: string;
}

export function recommendRotation(_input: {
  shoes: RotationShoe[];
  runs: RotationRun[];
  runType?: RunType;
}): RotationPick[] {
  // STUB — slice-4-rotation 에서 구현 예정.
  return [];
}
