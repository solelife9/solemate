// lib/progression/guidance — rankGuidance 파생 안내.
//
// 관찰 가능한 동작: RankResult(점수·티어·필러)로부터 다음 티어·진행도·6필러·최대 지렛대를
// 정확히 파생하고, 누락/비정상/legend 경계에서 throw 없이 안전 기본값을 돌려준다.

import {rankGuidance} from '../../../lib/progression/guidance';
import {TIER_COLORS} from '../../../theme';
import {PillarScores, RankResult, RankTier} from '../../../lib/progression/types';

function pillars(over: Partial<PillarScores> = {}): PillarScores {
  return {
    running: 0,
    consistency: 0,
    shoeManagement: 0,
    ...over,
  };
}
function rank(tier: RankTier, score: number, p: Partial<PillarScores> = {}): RankResult {
  return {tier, score, color: TIER_COLORS[tier], pillars: pillars(p)};
}

describe('rankGuidance', () => {
  test('다음 티어와 밴드 내 진행도(Silver 15~33 의 중간 24 → 0.5)', () => {
    const g = rankGuidance(rank('silver', 24));
    expect(g.tier).toBe('silver');
    expect(g.nextTier).toBe('gold');
    expect(g.progressToNext).toBeCloseTo(0.5, 5);
  });

  test('Bronze(0~15) 하한 0점 → 다음 Silver, 진행 0', () => {
    const g = rankGuidance(rank('bronze', 0));
    expect(g.nextTier).toBe('silver');
    expect(g.progressToNext).toBe(0);
  });

  test('Legend 는 다음 티어 없음(null) · 진행 1 · 지렛대 없음', () => {
    const g = rankGuidance(rank('legend', 99, {running: 0.5}));
    expect(g.nextTier).toBeNull();
    expect(g.progressToNext).toBe(1);
    expect(g.topLever).toBeNull();
  });

  test('3개 평가축을 고정 순서·가중치와 함께 돌려준다(합=1.0)', () => {
    const g = rankGuidance(rank('gold', 50));
    expect(g.pillars.map(p => p.key)).toEqual([
      'running',
      'consistency',
      'shoeManagement',
    ]);
    const wsum = g.pillars.reduce((a, p) => a + p.weight, 0);
    expect(wsum).toBeCloseTo(1, 5);
  });

  test('가장 빠른 길 = 가중 여유(weight×(1-value)) 최대 축', () => {
    // consistency 포화(1) 제외 → running·shoeManagement 둘 다 0, running 이 먼저(동일 가중).
    const g = rankGuidance(rank('silver', 20, {consistency: 1}));
    expect(g.topLever?.key).toBe('running');
  });

  test('포화된 축(value=1)은 지렛대 후보에서 제외', () => {
    // running 만 1.0(여유 0) → shoeManagement(0.35) 가 consistency(0.30)보다 가중 여유 큼.
    const g = rankGuidance(
      rank('silver', 20, {running: 1, consistency: 0, shoeManagement: 0}),
    );
    expect(g.topLever?.key).not.toBe('running');
    expect(g.topLever?.key).toBe('shoeManagement');
  });

  test('null/비정상 입력 → Bronze 안전 기본값, throw 없음', () => {
    const g = rankGuidance(null);
    expect(g.tier).toBe('bronze');
    expect(g.nextTier).toBe('silver');
    expect(g.pillars).toHaveLength(3);
    expect(g.pillars.every(p => p.value === 0)).toBe(true);
  });
});
