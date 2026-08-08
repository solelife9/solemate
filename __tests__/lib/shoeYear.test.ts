/**
 * 출시연도 비교 — "모른다"를 "오래됐다"로 읽지 않는다.
 *
 * 2026-08-08: 카탈로그 618켤레 중 **427(69%)** 에 출시연도가 없는데, 레거시 변환이
 * 결손을 0 으로 메우고 정렬은 `b.year - a.year` 였다. 그래서 연도 미상 = 0년 =
 * 가장 오래된 신발이 되어, **카탈로그의 69% 가 '다음 신발' 추천과 제휴 링크에서
 * 구조적으로 맨 뒤로** 밀렸다. 데이터 결손이 아니라 **결손을 값으로 취급한 버그**다.
 * @format
 */
import {compareNewerFirst, isYearKnown, YEAR_UNKNOWN} from '../../lib/shoeYear';

describe('연도를 아는가', () => {
  test.each([
    [2024, true], [1970, true],
    [YEAR_UNKNOWN, false], [0, false], [-1, false],
    [NaN, false], [Infinity, false],
    [null, false], [undefined, false],
  ])('isYearKnown(%p) = %p', (y, expected) => {
    expect(isYearKnown(y as number)).toBe(expected);
  });
});

describe('둘 다 알 때 — 최신이 앞', () => {
  test('내림차순', () => {
    expect(compareNewerFirst(2025, 2023)).toBeLessThan(0);   // 2025 가 앞
    expect(compareNewerFirst(2023, 2025)).toBeGreaterThan(0);
    expect(compareNewerFirst(2024, 2024)).toBe(0);
  });

  test('정렬에 넣으면 최신순이 된다', () => {
    const ys = [2022, 2025, 2023].sort(compareNewerFirst);
    expect(ys).toEqual([2025, 2023, 2022]);
  });
});

describe('한쪽이라도 모를 때 — 연도로 정하지 않는다', () => {
  test.each([
    ['왼쪽 미상', YEAR_UNKNOWN, 2024],
    ['오른쪽 미상', 2024, YEAR_UNKNOWN],
    ['둘 다 미상', YEAR_UNKNOWN, YEAR_UNKNOWN],
    ['null', null, 2024],
    ['undefined', 2024, undefined],
  ])('%s → 0(무승부, 다음 tie-break 로)', (_l, a, b) => {
    expect(compareNewerFirst(a as number, b as number)).toBe(0);
  });

  test('★ 회귀 — 미상이 "1970년"으로 취급돼 맨 뒤로 밀리지 않는다', () => {
    // 예전 코드(b.year - a.year)라면 미상(0)은 2024 에 언제나 졌다.
    const list = [
      {model: 'B-미상', year: YEAR_UNKNOWN},
      {model: 'A-2024', year: 2024},
      {model: 'C-미상', year: YEAR_UNKNOWN},
    ];
    list.sort((a, b) => compareNewerFirst(a.year, b.year) || a.model.localeCompare(b.model));
    // 연도로는 아무도 이기지 못하므로 이름순 그대로 — 미상이 뒤로 몰리지 않는다.
    expect(list.map(x => x.model)).toEqual(['A-2024', 'B-미상', 'C-미상']);
  });

  test('아는 것끼리는 여전히 최신이 이긴다(미상이 섞여 있어도)', () => {
    const list = [
      {model: 'old', year: 2022},
      {model: 'unknown', year: YEAR_UNKNOWN},
      {model: 'new', year: 2025},
    ];
    list.sort((a, b) => compareNewerFirst(a.year, b.year) || a.model.localeCompare(b.model));
    expect(list.map(x => x.model).indexOf('new'))
      .toBeLessThan(list.map(x => x.model).indexOf('old'));
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
// 비교자만 만들고 정렬부가 여전히 뺄셈이면 아무것도 안 바뀐다.
describe('배선 — 최신순 정렬부가 모두 이 비교자를 쓴다', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

  test.each(['lib/nextShoe.ts', 'lib/affiliate.ts'])('%s', file => {
    const src = read(file);
    expect(src).toContain('compareNewerFirst');
    // 날것의 연도 뺄셈이 남아 있으면 그 자리가 여전히 미상을 꼴찌로 만든다.
    expect(src).not.toMatch(/b\.(model\.)?year\s*-\s*a\.(model\.)?year/);
  });
});
