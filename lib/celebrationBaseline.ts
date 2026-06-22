// ============================================================================
// lib/celebrationBaseline.ts — 셀러브레이션 베이스라인 단조 병합
// ============================================================================
// 등급상승/업적 셀러브레이션은 "베이스라인 대비 신규"만 띄운다. 그런데 부팅 직후 데이터
// (shoes/runs)가 아직 안 실린 빈 상태로 감지 effect 가 먼저 돌면 currentAch=[]/tier=최저다.
// 그걸 그대로 저장하면 저장된 baseline 을 비워버려, 곧 데이터가 실릴 때 모든 업적·랭크가
// '신규'로 오인돼 매 실행 셀러브레이션이 재폭주한다.
//
// 해결: baseline 은 절대 축소하지 않는다 — 업적은 union, 랭크는 max(rankXp 기준)로만 키운다.
// 순수 함수(I/O 0)라 단위테스트로 단조성을 검증한다.
// ============================================================================

export interface CelebBaseline {
  ach: string[];
  tier: string;
}

/**
 * 베이스라인을 단조(monotonic)하게 병합한다. prev 가 없으면(첫 시딩) next 를 그대로.
 * 있으면 업적 union + 랭크 max — 빈/낮은 next 가 기존 baseline 을 축소하지 못하게 한다.
 * rankXp: 티어→XP 임계(랭크 대소 비교용). 없는 티어는 -1 로 본다.
 */
export function mergeCelebBaseline(
  prev: CelebBaseline | null | undefined,
  next: CelebBaseline,
  rankXp: Record<string, number>,
): CelebBaseline {
  if (!prev) return next;
  const nextRank = rankXp[next.tier] ?? -1;
  const prevRank = rankXp[prev.tier] ?? -1;
  return {
    ach: Array.from(new Set([...(prev.ach || []), ...(next.ach || [])])),
    tier: nextRank >= prevRank ? next.tier : prev.tier,
  };
}
