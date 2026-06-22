// lib/celebrationBaseline — 셀러브레이션 베이스라인 단조 병합
//
// 핵심 회귀 가드: 부팅 직후 빈 데이터(currentAch=[]/낮은 랭크)가 저장된 baseline 을
// 축소해 다음 로드에서 매 실행 셀러브레이션이 재폭주하던 버그를 막는다(union/max).

import {mergeCelebBaseline} from '../../lib/celebrationBaseline';

const RANK = {bronze: 0, silver: 100, gold: 300};

test('첫 시딩(prev 없음) → next 그대로', () => {
  expect(mergeCelebBaseline(null, {ach: ['a'], tier: 'silver'}, RANK)).toEqual({ach: ['a'], tier: 'silver'});
});

test('빈 next 는 기존 baseline 을 축소하지 못한다(매-실행 재폭주 가드)', () => {
  const prev = {ach: ['first_shoe', 'first_run'], tier: 'silver'};
  // 데이터 미로드 상태: ach=[], tier=bronze 로 persist 시도 → baseline 유지돼야 한다.
  const merged = mergeCelebBaseline(prev, {ach: [], tier: 'bronze'}, RANK);
  expect(merged.ach.sort()).toEqual(['first_run', 'first_shoe']);
  expect(merged.tier).toBe('silver'); // 랭크는 max — bronze 로 내려가지 않음
});

test('업적은 union, 랭크는 max 로만 키운다', () => {
  const merged = mergeCelebBaseline({ach: ['a'], tier: 'silver'}, {ach: ['a', 'b'], tier: 'gold'}, RANK);
  expect(merged.ach.sort()).toEqual(['a', 'b']);
  expect(merged.tier).toBe('gold'); // 정당한 랭크업은 반영
});

test('알 수 없는 티어는 -1 로 보아 기존 티어 유지', () => {
  expect(mergeCelebBaseline({ach: [], tier: 'gold'}, {ach: [], tier: 'mystery'}, RANK).tier).toBe('gold');
});
