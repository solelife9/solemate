// ============================================================================
// lib/injury.ts — 부상예방 위험 등급 (Slice 4)
// STUB: slice-4-injury-prevention 잡이 실제 로직으로 구현하고
//       tests/acceptance/slice-4-features.test.ts 의 '@slice-4 부상예방' describe.skip → describe 로 활성화한다.
// 계약(수용 테스트): 마모도(0..1) → {level, percentUsed, message}.
//   <0.75 safe · 0.75~0.9 caution · >0.9 high (입력은 0..1로 클램프).
// ============================================================================
export type InjuryLevel = 'safe' | 'caution' | 'high';

export interface InjuryAssessment {
  level: InjuryLevel;
  percentUsed: number;
  message: string;
}

export function assessInjuryRisk(percentUsed: number): InjuryAssessment {
  // STUB — slice-4-injury-prevention 에서 구현 예정.
  return { level: 'safe', percentUsed, message: '' };
}
