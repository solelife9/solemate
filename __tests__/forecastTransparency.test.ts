/**
 * lib/wearView — 예측 투명성(탑티어 1-1) 헬퍼.
 *
 * forecastBasisKo/forecastConfidenceKo 가 confidence(high/low)·reason 에 따라
 * '왜 N주인지' 근거와 정확도 라벨을 올바르게 만드는지 단언한다. ok 가 아니면
 * 근거 행은 빈 문자열(화면 생략)이어야 한다.
 *
 * @format
 */
import {
  forecastBasisKo,
  forecastConfidenceKo,
  type ReplacementForecast,
} from '../lib/wearView';

const mk = (over: Partial<ReplacementForecast>): ReplacementForecast => ({
  kmRemaining: 200,
  weeksRemaining: 12,
  etaISO: '2026-09-01T00:00:00.000Z',
  confidence: 'high',
  reason: 'ok',
  ...over,
});

describe('forecastConfidenceKo', () => {
  test('high → 정확도 높음', () => {
    expect(forecastConfidenceKo(mk({confidence: 'high'}))).toBe('정확도 높음');
  });
  test('low → 정확도 낮음', () => {
    expect(forecastConfidenceKo(mk({confidence: 'low'}))).toBe('정확도 낮음');
  });
});

describe('forecastBasisKo', () => {
  test('ok + high → 무엇을 반영했는지 설명한다', () => {
    const txt = forecastBasisKo(mk({reason: 'ok', confidence: 'high'}));
    expect(txt).toContain('최근 4주');
    expect(txt).toContain('반영');
  });

  test('ok + low → 정확도가 낮은 이유와 개선법을 안내한다', () => {
    const txt = forecastBasisKo(mk({reason: 'ok', confidence: 'low'}));
    expect(txt).toContain('정확도는 낮아요');
    expect(txt).toContain('더 달리면');
  });

  test('overdue/no_recent → 근거 행은 빈 문자열(생략)', () => {
    expect(forecastBasisKo(mk({reason: 'overdue', weeksRemaining: 0}))).toBe('');
    expect(forecastBasisKo(mk({reason: 'no_recent', weeksRemaining: null}))).toBe('');
  });
});
