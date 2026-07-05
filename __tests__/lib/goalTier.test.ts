// 주간 목표 난이도 → 색/라벨 검증(10/20/30km 경계).
import {weeklyGoalTier} from '../../lib/goalTier';
import {GOOD, BEST, DANGER, SPORT_VIOLET, TIER_COLORS} from '../../theme';

test('난이도 5단계 — 입문/꾸준/도전/열정/정예', () => {
  expect(weeklyGoalTier(5)).toMatchObject({key: 'start', label: '입문', color: GOOD});
  expect(weeklyGoalTier(14.9)).toMatchObject({key: 'start'});
  expect(weeklyGoalTier(15)).toMatchObject({key: 'steady', label: '꾸준', color: BEST});
  expect(weeklyGoalTier(29)).toMatchObject({key: 'steady'});
  expect(weeklyGoalTier(30)).toMatchObject({key: 'push', label: '도전', color: SPORT_VIOLET});
  expect(weeklyGoalTier(49)).toMatchObject({key: 'push'});
  expect(weeklyGoalTier(50)).toMatchObject({key: 'fire', label: '열정', color: DANGER});
  expect(weeklyGoalTier(79)).toMatchObject({key: 'fire'});
  expect(weeklyGoalTier(80)).toMatchObject({key: 'elite', label: '정예', color: TIER_COLORS.gold});
  expect(weeklyGoalTier(150)).toMatchObject({key: 'elite'});
});

test('비정상 입력은 입문', () => {
  expect(weeklyGoalTier(0).key).toBe('start');
  expect(weeklyGoalTier(NaN).key).toBe('start');
  expect(weeklyGoalTier(-5).key).toBe('start');
});
