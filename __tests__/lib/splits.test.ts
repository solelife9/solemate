import {buildSplits} from '../../lib/splits';
import type {Split} from '../../RunSplits';

// lib/splits.buildSplits(run, route): 레코더가 남긴 run.splits 가 2개 이상이면 그대로
// 쓰고(per-km 구간), 없으면 빈 배열을 반환해 <RunSplits/> 가 자동으로 숨는다.
const SPLITS: Split[] = [
  {km: 1, paceSec: 300, elevM: 5},
  {km: 2, paceSec: 290, elevM: -3},
  {km: 3, paceSec: 310, elevM: 0},
];

describe('buildSplits', () => {
  test('run.splits 가 2개 이상이면 그대로 반환', () => {
    expect(buildSplits({splits: SPLITS}, [])).toEqual(SPLITS);
  });

  test('run.splits 없으면 빈 배열(자동 숨김 — 수동 입력 런 안전)', () => {
    expect(buildSplits({}, [])).toEqual([]);
    expect(buildSplits({splits: undefined}, [])).toEqual([]);
  });

  test('run.splits 가 1개뿐이면 빈 배열(<2 → 숨김)', () => {
    expect(buildSplits({splits: [SPLITS[0]]}, [])).toEqual([]);
  });
});
