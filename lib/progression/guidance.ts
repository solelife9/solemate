// ============================================================================
// lib/progression/guidance.ts — 랭크 "어떻게 오르나" 안내(순수 셀렉터)
// ============================================================================
// 랭크가 3개 평가축의 가중합이라는 사실을 사용자에게 **보여주기 위한** 파생 뷰.
// rank.computeRank 가 만든 RankResult(점수·티어·필러)만 읽어:
//   · 다음 티어와 거기까지의 진행도(현재 티어 밴드 안에서 0..1),
//   · 3개 평가축을 표시 순서·라벨·가중치와 함께,
//   · "가장 빠른 길"(가중 여유 weight×(1-value) 최대인 축)
// 을 돌려준다. 가중치/티어 컷오프의 권위는 rank.ts 한곳(WEIGHTS·TIER_CUTOFFS) — 재정의 금지.
//
// PURE/방어적: 입력 불변, 누락/비정상 → 안전 기본값(Bronze·0), throw 금지.
// ============================================================================
import {TIER_CUTOFFS, WEIGHTS} from './rank';
import {PillarScores, RankResult, RankTier} from './types';

/** 평가축 한 칸(표시용). value/weight 모두 0..1. */
export interface PillarGuide {
  key: keyof PillarScores;
  label: string;
  value: number;
  weight: number;
}

/** 랭크 안내 뷰 — 화면이 그대로 그린다. */
export interface RankGuidance {
  tier: RankTier;
  /** 다음(상위) 티어. 최고(legend)면 null. */
  nextTier: RankTier | null;
  /** 다음 티어까지 진행도(현재 티어 밴드 내 0..1). legend → 1. */
  progressToNext: number;
  /** 3개 평가축(고정 표시 순서). */
  pillars: PillarGuide[];
  /** 가장 효율적으로 점수를 올릴 축(가중 여유 최대). legend/포화면 null. */
  topLever: PillarGuide | null;
}

/** 표시 순서 + 한국어 라벨(프레젠테이션 전용 — 데이터 아님). */
const PILLAR_META: ReadonlyArray<{key: keyof PillarScores; label: string}> = [
  {key: 'running', label: '거리'},
  {key: 'consistency', label: '꾸준함'},
  {key: 'shoeManagement', label: '신발 관리'},
];

/** 티어 오름차순(Bronze→Legend) — TIER_CUTOFFS(내림차순)에서 파생, 단일 출처. */
const TIERS_ASC: ReadonlyArray<readonly [number, RankTier]> = [...TIER_CUTOFFS]
  .slice()
  .sort((a, b) => a[0] - b[0]);

/** 0..1 클램프(NaN/음수 → 0, 1 초과 → 1). */
function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}

/**
 * 랭크 결과 → 안내 뷰. PURE: 입력 불변, 누락/비정상 안전, throw 금지.
 */
export function rankGuidance(rank: RankResult | null | undefined): RankGuidance {
  const tier: RankTier = rank && typeof rank.tier === 'string' ? rank.tier : 'bronze';
  const score = rank && Number.isFinite(rank.score) ? rank.score : 0;
  const pillarScores: Partial<PillarScores> =
    rank && rank.pillars && typeof rank.pillars === 'object' ? rank.pillars : {};

  // 현재 티어의 밴드(하한 cur ~ 다음 티어 하한 next)를 TIERS_ASC 에서 찾는다.
  const idx = TIERS_ASC.findIndex(([, t]) => t === tier);
  const curCut = idx >= 0 ? TIERS_ASC[idx][0] : 0;
  const hasNext = idx >= 0 && idx < TIERS_ASC.length - 1;
  const nextTier: RankTier | null = hasNext ? TIERS_ASC[idx + 1][1] : null;
  const nextCut = hasNext ? TIERS_ASC[idx + 1][0] : curCut;

  const progressToNext = hasNext
    ? clamp01(nextCut > curCut ? (score - curCut) / (nextCut - curCut) : 1)
    : 1;

  const pillars: PillarGuide[] = PILLAR_META.map(({key, label}) => ({
    key,
    label,
    value: clamp01(Number(pillarScores[key])),
    weight: WEIGHTS[key],
  }));

  // 가장 빠른 길: 다음 티어가 있을 때, 여유(1-value)가 있는 축 중 가중 여유 최대.
  let topLever: PillarGuide | null = null;
  if (hasNext) {
    let best = -1;
    for (const p of pillars) {
      const headroom = p.weight * (1 - p.value);
      if (p.value < 1 && headroom > best) {
        best = headroom;
        topLever = p;
      }
    }
  }

  return {tier, nextTier, progressToNext, pillars, topLever};
}
