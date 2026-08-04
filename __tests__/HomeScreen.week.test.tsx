/**
 * HomeScreen.rn.tsx — '이번 주 러닝' 원카드(B안, 2026-07-25 민우님 목업 확정) 행동 테스트.
 *
 * 카드 한 장이 말하는 것:
 *   · 히어로 = 거리·목표 한 숫자축('7.0 / 30 km'), 탭하면 주간 목표 스테퍼 시트
 *   · 히어로 우측 = 월~일 스트릭 점 7칸(오늘 표시)
 *   · 하단 3열 = 횟수 · 평균 페이스 · 훈련 부하(탭하면 카드 안 인라인 상세)
 * 폐지 회귀 가드: 주황 진행 바·'주간 목표 N km' 텍스트·'N일 연속' 칩·별도 부하 카드.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import type {Shoe} from '../theme';
import type {TrainingLoadAssessment} from '../lib/trainingLoad';
import {LOAD_MSG} from '../lib/trainingLoad';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r.root;
}

const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);

const SHOE: Shoe = {id: 's1', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 500};

/** 확신 상태의 훈련 부하 — 부하 셀/상세 계약용. */
const LOAD: TrainingLoadAssessment = {
  acwr: 1.4, acuteKm: 24.2, chronicKm: 17.3, acuteLoad: 24.2, chronicLoad: 17.3,
  rampPct: 40, level: 'caution', confident: true, message: LOAD_MSG.caution,
  recentConsecutiveDays: 0,
};

describe('HomeScreen 이번 주 러닝 카드 — 히어로 숫자축', () => {
  test('주입한 week(거리/횟수/평균 페이스)를 카드에 그대로 렌더한다', () => {
    const root = render(
      <HomeScreen
        shoes={[SHOE]}
        activeIdx={0}
        onSelect={jest.fn()}
        week={{km: '23.5', runs: 4, pace: "5'42\""}}
      />,
    );
    expect(byTestID(root, 'home-week').length).toBeGreaterThanOrEqual(1);
    expect(textOf(byTestID(root, 'home-week-km')[0])).toBe('23.5');
    expect(textOf(byTestID(root, 'home-week-runs')[0])).toBe('4');
    expect(textOf(byTestID(root, 'home-week-pace')[0])).toBe("5'42\"");
  });

  test('목표가 있으면 거리 옆에 분모로 붙는다(한 숫자축) — 진행 바·목표 텍스트 행은 폐지', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '15.0', runs: 3, pace: "5'40\""}} weeklyGoalKm={30} />,
    );
    expect(textOf(byTestID(root, 'home-week-goal-target')[0])).toContain('30');
    const t = textOf(root);
    // 폐지 회귀 가드 — 같은 말을 두 번 하던 요소들(B안 확정).
    expect(byTestID(root, 'home-week-goal-bar').length).toBe(0);
    expect(t).not.toContain('주간 목표 30km');
    expect(t).not.toContain('일 연속');
  });

  test('목표 미설정 + 변경 위임 있으면 조용한 초대만 — 분모는 없다', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '5.0', runs: 1, pace: '--'}} onChangeWeeklyGoal={jest.fn()} />,
    );
    expect(byTestID(root, 'home-week-goal-target').length).toBe(0);
    expect(textOf(byTestID(root, 'home-week-goal-set')[0])).toContain('목표 정하기');
  });

  test('변경 위임이 없으면 히어로는 표시 전용 — 초대도 띄우지 않는다', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()} week={{km: '5.0', runs: 1, pace: '--'}} />,
    );
    expect(byTestID(root, 'home-week-goal-set').length).toBe(0);
    expect(byTestID(root, 'home-week-goal')[0].props.disabled).toBe(true);
  });
});

describe('HomeScreen 이번 주 러닝 카드 — 스트릭 점 7칸', () => {
  test('월~일 7칸이 항상 렌더되고, 오늘 칸만 아웃라인 링을 얹는다', () => {
    const week = [true, true, false, true, false, false, false];
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '15.0', runs: 3, pace: "5'40\""}} weekDays={week} weekTodayIdx={3} />,
    );
    expect(byTestID(root, 'home-week-days').length).toBeGreaterThanOrEqual(1);
    const dots = Array.from({length: 7}, (_, i) => byTestID(root, `home-week-day-${i}`)[0]);
    expect(dots.every(Boolean)).toBe(true);
    const styleOf = (n: any) => Object.assign({}, ...[n.props.style].flat().filter(Boolean));
    // 오늘(3) = 링 있음, 나머지는 없음 — 오늘 표시가 한 칸에만.
    expect(styleOf(dots[3]).borderWidth).toBeTruthy();
    expect(styleOf(dots[0]).borderWidth).toBeFalsy();
    // 달린 날(0)과 쉰 날(2)의 채움색은 다르다.
    expect(styleOf(dots[0]).backgroundColor).not.toBe(styleOf(dots[2]).backgroundColor);
  });

  test('weekDays 미주입/부족분은 쉼으로 정규화 — 7칸은 유지된다', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '15.0', runs: 3, pace: "5'40\""}} weekDays={[true]} />,
    );
    expect(byTestID(root, 'home-week-day-6').length).toBeGreaterThanOrEqual(1);
  });
});

describe('HomeScreen 이번 주 러닝 카드 — 주간 목표 시트', () => {
  test('히어로 탭 → 시트 열림 → 스테퍼 ＋ → onChangeWeeklyGoal 위임', () => {
    const onChangeWeeklyGoal = jest.fn();
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '15.0', runs: 3, pace: "5'40\""}} weeklyGoalKm={30}
        onChangeWeeklyGoal={onChangeWeeklyGoal} />,
    );
    expect(byTestID(root, 'weekly-goal-stepper').length).toBe(0);
    act(() => byTestID(root, 'home-week-goal')[0].props.onPress());
    expect(byTestID(root, 'weekly-goal-stepper').length).toBeGreaterThanOrEqual(1);
    expect(textOf(byTestID(root, 'weekly-goal-value')[0])).toContain('30');
    const plus = root.findAll((n: any) => n.props?.accessibilityLabel === '목표 거리 늘리기')[0];
    act(() => plus.props.onPress());
    expect(onChangeWeeklyGoal).toHaveBeenCalledWith(31);
  });
});

describe('HomeScreen 이번 주 러닝 카드 — 훈련 부하 셀', () => {
  test('셀은 상태 워드만, 탭하면 카드 안에서 상세가 펼쳐진다(별도 카드 아님)', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '15.0', runs: 3, pace: "5'40\""}} load={LOAD} />,
    );
    const cell = byTestID(root, 'home-week-load')[0];
    expect(textOf(cell)).toContain('늘어남');
    // 접힘 기본 — 상세 메시지·주간 분해는 아직 없다.
    expect(textOf(root)).not.toContain(LOAD_MSG.caution);
    expect(byTestID(root, 'home-week-load-detail').length).toBe(0);
    act(() => cell.props.onPress());
    expect(byTestID(root, 'home-week-load-detail').length).toBeGreaterThanOrEqual(1);
    const t = textOf(root);
    expect(t).toContain(LOAD_MSG.caution);
    expect(t).toContain('최근 7일');
    act(() => cell.props.onPress());
    expect(byTestID(root, 'home-week-load-detail').length).toBe(0);
  });

  test('부하 데이터가 없으면 셀은 "기록 쌓는 중"에서 멈춘다(펼침 불가 — 빈 상세 금지)', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()}
        week={{km: '15.0', runs: 3, pace: "5'40\""}} />,
    );
    const cell = byTestID(root, 'home-week-load')[0];
    expect(textOf(cell)).toContain('기록 쌓는 중');
    expect(cell.props.disabled).toBe(true);
  });
});

describe('HomeScreen 이번 주 러닝 카드 — 빈 주간', () => {
  test('런이 없으면 히어로는 남고 3열 대신 초대 한 줄(노이즈 감사 2026-07-05)', () => {
    const root = render(
      <HomeScreen shoes={[SHOE]} activeIdx={0} onSelect={jest.fn()} week={{km: '0.0', runs: 0, pace: '--'}} />,
    );
    // 0회·-- 그리드는 렌더하지 않는다 — 행동을 못 이끄는 0의 카드 금지.
    expect(byTestID(root, 'home-week-runs').length).toBe(0);
    expect(byTestID(root, 'home-week-pace').length).toBe(0);
    expect(byTestID(root, 'home-week-empty').length).toBeGreaterThanOrEqual(1);
    expect(textOf(byTestID(root, 'home-week-empty')[0])).toContain('첫 러닝');
    // 히어로(숫자축·점 7칸)는 목표축이 곧 초대라 유지된다.
    expect(byTestID(root, 'home-week-km').length).toBeGreaterThanOrEqual(1);
    expect(byTestID(root, 'home-week-days').length).toBeGreaterThanOrEqual(1);
  });
});
