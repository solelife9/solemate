// lib/progression/mergeProgression — 진척 무손실 병합 (클라우드 동기)
//
// 검증: 은퇴 신발/타이틀/seenUnlocks 합집합, points max, 한쪽 없음 처리, local 우선.

import {mergeProgression} from '../../../lib/progression/mergeProgression';
import {ProgressionState} from '../../../lib/progression/types';

const base = (over: Partial<ProgressionState> = {}): ProgressionState => ({
  earnedTitles: [],
  equippedTitleKey: null,
  seenUnlocks: [],
  retiredShoes: [],
  points: 0,
  ...over,
});

const retired = (shoeId: string) =>
  ({shoeId, name: `s-${shoeId}`, km: 100, retiredAt: '2026-01-01', retireYear: 2026, grade: 'gold'} as any);

test('한쪽이 없으면 다른 쪽을 그대로 — 재설치 복원(local 비고 remote 있음)', () => {
  const remote = base({retiredShoes: [retired('a'), retired('b')], points: 120});
  expect(mergeProgression(null, remote)).toBe(remote);
  expect(mergeProgression(undefined, undefined)).toBeUndefined();
  const local = base({points: 5});
  expect(mergeProgression(local, null)).toBe(local);
});

test('은퇴 신발은 shoeId 합집합(어느 기기도 유실 없음)', () => {
  const local = base({retiredShoes: [retired('a'), retired('b')]});
  const remote = base({retiredShoes: [retired('b'), retired('c')]});
  const m = mergeProgression(local, remote)!;
  expect(m.retiredShoes.map(r => r.shoeId).sort()).toEqual(['a', 'b', 'c']);
});

test('seenUnlocks·earnedTitles 합집합, points 는 max', () => {
  const local = base({
    seenUnlocks: ['x', 'y'],
    earnedTitles: [{key: 't1', unlockedAt: '1', isEquipped: false}],
    points: 80,
  });
  const remote = base({
    seenUnlocks: ['y', 'z'],
    earnedTitles: [{key: 't2', unlockedAt: '2', isEquipped: false}],
    points: 150,
  });
  const m = mergeProgression(local, remote)!;
  expect([...m.seenUnlocks].sort()).toEqual(['x', 'y', 'z']);
  expect(m.earnedTitles.map(t => t.key).sort()).toEqual(['t1', 't2']);
  expect(m.points).toBe(150);
});

test('equipped/pinned 은 local(현재 기기) 우선, 없으면 remote', () => {
  const local = base({equippedTitleKey: 'L', pinnedAchievementKeys: ['p1']});
  const remote = base({equippedTitleKey: 'R', pinnedAchievementKeys: ['p2', 'p3']});
  const m = mergeProgression(local, remote)!;
  expect(m.equippedTitleKey).toBe('L');
  expect(m.pinnedAchievementKeys).toEqual(['p1']);
  // local 이 비면 remote 사용.
  const m2 = mergeProgression(base({equippedTitleKey: null}), remote)!;
  expect(m2.equippedTitleKey).toBe('R');
  expect(m2.pinnedAchievementKeys).toEqual(['p2', 'p3']);
});

test('손상/누락 필드 방어(배열 아님 → 빈 배열 취급, NaN points → 0)', () => {
  const local = {retiredShoes: null, seenUnlocks: undefined, earnedTitles: 'x', points: NaN} as any;
  const remote = base({retiredShoes: [retired('a')], points: 10});
  const m = mergeProgression(local, remote)!;
  expect(m.retiredShoes.map(r => r.shoeId)).toEqual(['a']);
  expect(m.points).toBe(10);
});
