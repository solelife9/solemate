/**
 * 내 최고 순위(전성기) — 순수 계산.
 *
 * 랭킹은 한 달짜리라 잘 달린 달이 다음 달이면 사라진다. 그 한 달을 붙잡는 값이다.
 *
 * 지키는 것:
 *  · **더 좋을 때만** 갈아 끼운다(순위는 작을수록 좋다)
 *  · 같은 순위를 다시 달성해도 **처음 달성한 달**을 지킨다 — 그게 '전성기'의 뜻이다
 *  · 모르는 값으로 기록을 만들지 않는다
 *
 * @format
 */
import {recordRank, sanitizeRankBests, formatYearMonthKo} from '../../lib/rankHistory';

describe('더 좋을 때만 갈아 끼운다', () => {
  test('처음이면 그대로 기록된다', () => {
    expect(recordRank(null, 'distance', '2026-06', 12))
      .toEqual({distance: {rank: 12, yearMonth: '2026-06'}});
  });

  test('더 높은 순위(작은 수)면 갈아 끼운다', () => {
    const prev = {distance: {rank: 12, yearMonth: '2026-06'}};
    expect(recordRank(prev, 'distance', '2026-07', 3).distance)
      .toEqual({rank: 3, yearMonth: '2026-07'});
  });

  test('더 낮은 순위면 그대로 둔다 — 전성기가 지워지면 안 된다', () => {
    const prev = {distance: {rank: 3, yearMonth: '2026-06'}};
    expect(recordRank(prev, 'distance', '2026-07', 40)).toBe(prev);   // 동일 객체
  });

  test('같은 순위를 다시 달성해도 처음 달을 지킨다', () => {
    const prev = {distance: {rank: 3, yearMonth: '2026-06'}};
    expect(recordRank(prev, 'distance', '2026-09', 3).distance.yearMonth).toBe('2026-06');
  });

  test('카테고리마다 따로 센다 — 거리 1위와 꾸준함 1위는 다른 이야기다', () => {
    const a = recordRank(null, 'distance', '2026-06', 5);
    const b = recordRank(a, 'consistency', '2026-06', 1);
    expect(b).toEqual({
      distance: {rank: 5, yearMonth: '2026-06'},
      consistency: {rank: 1, yearMonth: '2026-06'},
    });
  });
});

describe('모르는 값으로 기록을 만들지 않는다', () => {
  test.each([0, -1, 1.5, NaN, Infinity])('순위 %p 는 무시한다', (bad) => {
    expect(recordRank(null, 'distance', '2026-06', bad as number)).toEqual({});
  });

  test.each(['2026-6', '202606', '', 'x'])('달 표기 %p 는 무시한다', (ym) => {
    expect(recordRank(null, 'distance', ym, 3)).toEqual({});
  });

  test('카테고리가 비면 무시한다', () => {
    expect(recordRank(null, '', '2026-06', 3)).toEqual({});
  });
});

describe('입력을 건드리지 않는다', () => {
  test('원본이 그대로다', () => {
    const prev = {distance: {rank: 12, yearMonth: '2026-06'}};
    const snap = JSON.stringify(prev);
    recordRank(prev, 'distance', '2026-07', 3);
    expect(JSON.stringify(prev)).toBe(snap);
  });

  test('바뀐 게 없으면 같은 객체를 돌려준다 — 호출부가 저장 여부를 이걸로 판단한다', () => {
    const prev = {distance: {rank: 1, yearMonth: '2026-06'}};
    expect(recordRank(prev, 'distance', '2026-07', 9)).toBe(prev);
    expect(recordRank(prev, 'distance', '2026-07', 1)).toBe(prev);
  });
});

describe('저장된 값 정화 — 옛 저장·손상 대비', () => {
  test('아는 모양만 남긴다', () => {
    expect(sanitizeRankBests({
      distance: {rank: 3, yearMonth: '2026-06'},
      broken1: {rank: 0, yearMonth: '2026-06'},
      broken2: {rank: 3, yearMonth: 'nope'},
      broken3: 'string',
      broken4: null,
    })).toEqual({distance: {rank: 3, yearMonth: '2026-06'}});
  });

  test.each([null, undefined, 42, 'x', []])('%p 는 빈 기록으로', (bad) => {
    expect(sanitizeRankBests(bad)).toEqual(bad === null || typeof bad !== 'object' ? {} : {});
  });
});

describe('달 표기', () => {
  test('2026-06 → 2026년 6월', () => {
    expect(formatYearMonthKo('2026-06')).toBe('2026년 6월');
    expect(formatYearMonthKo('2026-12')).toBe('2026년 12월');
  });

  test('형식이 아니면 원문 그대로 — 지어내지 않는다', () => {
    expect(formatYearMonthKo('nope')).toBe('nope');
  });
});
