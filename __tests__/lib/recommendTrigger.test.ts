/**
 * lib/recommendTrigger.shouldRecommendNextShoe — '다음 러닝화' 추천 노출 트리거 단위.
 *
 * Slice 6 교체 예측(ReplacementForecast)을 입력으로, 추천 카드를 띄울지(true/false)를
 * 결정하는 순수 분기를 검증한다: overdue→true, 임박(weeks≤상수)→true, 여유(weeks 큼)→
 * false, no_recent→false, 경계(정확히 상수)→true.
 *
 * @format
 */
import {
  shouldRecommendNextShoe,
  REPLACE_SOON_WEEKS,
} from '../../lib/recommendTrigger';
import type {ReplacementForecast} from '../../lib/replacementForecast';

const make = (over: Partial<ReplacementForecast>): ReplacementForecast => ({
  kmRemaining: 200,
  weeksRemaining: 5,
  etaISO: '2026-07-15T00:00:00.000Z',
  confidence: 'high',
  reason: 'ok',
  ...over,
});

describe('shouldRecommendNextShoe', () => {
  test('overdue(이미 수명 초과)면 true', () => {
    expect(
      shouldRecommendNextShoe(
        make({reason: 'overdue', kmRemaining: -30, weeksRemaining: 0}),
      ),
    ).toBe(true);
  });

  test('ok + 교체 임박(weeksRemaining ≤ 상수)이면 true', () => {
    expect(
      shouldRecommendNextShoe(make({reason: 'ok', weeksRemaining: 2})),
    ).toBe(true);
  });

  test('ok + 경계(weeksRemaining === 상수)면 true', () => {
    expect(
      shouldRecommendNextShoe(
        make({reason: 'ok', weeksRemaining: REPLACE_SOON_WEEKS}),
      ),
    ).toBe(true);
  });

  test('ok + 여유 충분(weeksRemaining 큼)이면 false', () => {
    expect(
      shouldRecommendNextShoe(
        make({reason: 'ok', weeksRemaining: REPLACE_SOON_WEEKS + 5}),
      ),
    ).toBe(false);
  });

  test('no_recent(기록 없어 추정 불가)면 false', () => {
    expect(
      shouldRecommendNextShoe(
        make({reason: 'no_recent', weeksRemaining: null, etaISO: null}),
      ),
    ).toBe(false);
  });

  test('forecast 결측(null/undefined)이면 false', () => {
    expect(shouldRecommendNextShoe(null)).toBe(false);
    expect(shouldRecommendNextShoe(undefined)).toBe(false);
  });

  test('ok 이지만 weeksRemaining 이 null 이면 false(임박 판정 불가)', () => {
    expect(
      shouldRecommendNextShoe(make({reason: 'ok', weeksRemaining: null})),
    ).toBe(false);
  });
});
