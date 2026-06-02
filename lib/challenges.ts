// ============================================================================
// lib/challenges.ts — 개인 챌린지 진행률 (Slice 4)
// STUB: slice-4-challenges 잡이 실제 로직으로 구현하고
//       tests/acceptance/slice-4-features.test.ts 의 '@slice-4 개인 챌린지' describe.skip → describe 로 활성화한다.
// 계약(수용 테스트):
//   - distance: 기간[startDate,endDate] 내 런 거리 합 → current, pct=min(1,current/target), completed=current>=target
//   - streak: 연속일 수
//   - 런 없으면 current 0 · completed false
// ============================================================================
export type ChallengeKind = 'distance' | 'streak';

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  targetKm?: number;
  targetDays?: number;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
}

export interface ChallengeRun {
  date: string; // 'YYYY-MM-DD'
  dist: number; // km
}

export interface ChallengeProgressResult {
  current: number;
  target: number;
  pct: number;
  completed: boolean;
}

export function challengeProgress(_ch: Challenge, _runs: ChallengeRun[]): ChallengeProgressResult {
  // STUB — slice-4-challenges 에서 구현 예정.
  return { current: 0, target: 0, pct: 0, completed: false };
}
