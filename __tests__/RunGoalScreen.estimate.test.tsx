/**
 * RunGoalScreen 추정치 개인화(심사 P2 #74) — 화면 배선 계약.
 *   1) runs 미전달(미배선) → 기존 기본값 추정 그대로(5km = 25분·320kcal) — 회귀 0.
 *   2) runs 전달 → 개인 이력(거리가중 페이스·km당 칼로리)로 예상 시간·칼로리가 바뀐다.
 *   3) 시간 모드도 같은 프로필로 예상 거리를 낸다.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunGoalScreen from '../RunGoalScreen.rn';
import type {EstimateRunLike} from '../lib/goalEstimate';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r.root;
}
const tab = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  root.findAll(n => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
const textAll = (root: ReactTestRenderer.ReactTestInstance): string =>
  (root.findAll((n: any) => typeof n.type === 'string' && n.type === 'Text') as any[])
    .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' ');
const pressPreset = (root: ReactTestRenderer.ReactTestInstance, label: string) => {
  const p = root.findAll(n => n.props?.accessibilityLabel === `${label} 목표 선택` && typeof n.props?.onPress === 'function')[0];
  act(() => p.props.onPress());
};

// 최근 이력: 10km/60분·700kcal → 페이스 360s/km(6분/km)·70kcal/km.
const RUNS: EstimateRunLike[] = [{km: 10, duration: 3600, calories: 700, run_date: '2026-07-20'}];

test('runs 미전달: 5km 프리셋 → 기본값 추정(25분·320kcal) 그대로', () => {
  const root = render(<RunGoalScreen />);
  act(() => tab(root, '거리 목표').props.onPress());
  pressPreset(root, '5km');
  const txt = textAll(root);
  expect(txt).toContain('예상 시간 약 25분');
  expect(txt).toContain('약 320 kcal');
});

test('runs 전달: 5km 프리셋 → 개인 이력 추정(6분/km → 30분·350kcal)', () => {
  const root = render(<RunGoalScreen runs={RUNS} />);
  act(() => tab(root, '거리 목표').props.onPress());
  pressPreset(root, '5km');
  const txt = textAll(root);
  expect(txt).toContain('예상 시간 약 30분');
  expect(txt).toContain('약 350 kcal');
});

test('시간 모드도 개인 프로필: 30분 기본 → 예상 거리 5.0km·350kcal', () => {
  const root = render(<RunGoalScreen runs={RUNS} />);
  act(() => tab(root, '시간 목표').props.onPress()); // 기본 30분
  const txt = textAll(root);
  expect(txt).toContain('예상 거리 약 5.0km');
  expect(txt).toContain('약 350 kcal');
});

// ── 스피드 탭 기본 평균 페이스 개인화(2026-07-26) ───────────────────────────────
// 거리·시간 탭만 개인화돼 있고 스피드 탭은 6'00" 고정이라, 러너마다 첫 화면부터 손봐야
// 했다. 이력이 있으면 그 페이스로 시작하고, 없으면 종전 기본값을 유지한다(신규 사용자의
// 기본이 조용히 빨라지지 않게 — goalEstimate 폴백 5'00" 을 쓰지 않는다).
test('스피드 탭: runs 미전달이면 기본 평균 페이스 6:00 유지', () => {
  const root = render(<RunGoalScreen />);
  act(() => tab(root, '스피드 목표').props.onPress());
  expect(textAll(root)).toContain("6'00\"");
});

test('스피드 탭: runs 전달이면 최근 이력 페이스로 시작한다', () => {
  // 최근 이력 = 10km/50분 → 300s/km = 5'00"/km. 기본값(6'00")이 아니어야 한다.
  const fast: EstimateRunLike[] = [{km: 10, duration: 3000, run_date: '2026-07-20'}];
  const root = render(<RunGoalScreen runs={fast} />);
  act(() => tab(root, '스피드 목표').props.onPress());
  const txt = textAll(root);
  expect(txt).toContain("5'00\"");
  expect(txt).not.toContain("6'00\"");
});
