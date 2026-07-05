// 주간 목표 난이도 라벨 검증(15/30/50/80km 경계). 색은 UI(단일 보라)라 여기선 라벨만.
import {weeklyGoalTier} from '../../lib/goalTier';

test('난이도 5단계 라벨 — 입문/꾸준/도전/열정/정예', () => {
  expect(weeklyGoalTier(5)).toMatchObject({key: 'start', label: '입문'});
  expect(weeklyGoalTier(14.9).key).toBe('start');
  expect(weeklyGoalTier(15)).toMatchObject({key: 'steady', label: '꾸준'});
  expect(weeklyGoalTier(29).key).toBe('steady');
  expect(weeklyGoalTier(30)).toMatchObject({key: 'push', label: '도전'});
  expect(weeklyGoalTier(49).key).toBe('push');
  expect(weeklyGoalTier(50)).toMatchObject({key: 'fire', label: '열정'});
  expect(weeklyGoalTier(79).key).toBe('fire');
  expect(weeklyGoalTier(80)).toMatchObject({key: 'elite', label: '정예'});
  expect(weeklyGoalTier(150).key).toBe('elite');
});

test('비정상 입력은 입문', () => {
  expect(weeklyGoalTier(0).key).toBe('start');
  expect(weeklyGoalTier(NaN).key).toBe('start');
  expect(weeklyGoalTier(-5).key).toBe('start');
});
