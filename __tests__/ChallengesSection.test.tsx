/**
 * ChallengesSection 개인 챌린지 행동 테스트.
 *
 * 관찰 가능한 결과(test_critic 요건)를 검증한다:
 *   1) 진행률 반영 — 거리 챌린지 + 런을 주면 진행률(%)이 challengeProgress 와
 *      같은 값으로 카드에 표시된다(70km/100km → 70%).
 *   2) 달성 뱃지 — 목표를 채운 챌린지는 '달성!' 뱃지를 노출하고, 미달성은 노출하지 않는다.
 *   3) 생성 — '새 챌린지'를 열어 목표를 올리고 '챌린지 만들기'를 누르면 onCreate 가
 *      입력한 종류/목표/기간으로 만든 well-formed Challenge 로 호출된다.
 *   4) 삭제 — 삭제 버튼을 누르면 onDelete 가 해당 id 로 호출된다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ChallengesSection from '../ChallengesSection';
import {challengeProgress, Challenge} from '../lib/challenges';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(props: any) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ChallengesSection {...props} />);
  });
  return renderer.root;
}

function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  return root.find(
    (n: any) =>
      n && n.props && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
}

const DISTANCE_CH: Challenge = {
  id: 'c1',
  kind: 'distance',
  targetKm: 100,
  startDate: '2026-06-01',
  endDate: '2026-06-30',
};

const STREAK_CH: Challenge = {
  id: 's1',
  kind: 'streak',
  targetDays: 3,
  startDate: '2026-06-01',
  endDate: '2026-06-30',
};

describe('ChallengesSection 진행률 반영', () => {
  test('기간 내 런 거리 합이 진행률(%)로 카드에 반영된다', () => {
    const runs = [
      {date: '2026-06-03', dist: 40},
      {date: '2026-06-10', dist: 30},
      {date: '2026-05-30', dist: 99}, // 기간 밖 → 무시
    ];
    const root = render({challenges: [DISTANCE_CH], runs});

    const expected = challengeProgress(DISTANCE_CH, runs); // pct 0.7
    const pctNode = root.find((n: any) => n.props?.testID === 'challenge-pct-c1');
    expect(textOf(pctNode)).toBe(`${Math.round(expected.pct * 100)}%`);
    expect(textOf(pctNode)).toBe('70%');
  });

  test('미달성 챌린지는 달성 뱃지를 노출하지 않는다', () => {
    const root = render({
      challenges: [DISTANCE_CH],
      runs: [{date: '2026-06-03', dist: 40}],
    });
    const badges = root.findAll((n: any) => n.props?.testID === 'challenge-badge-c1');
    expect(badges.length).toBe(0);
  });
});

describe('ChallengesSection 달성 뱃지', () => {
  test('목표를 채우면 달성 뱃지를 노출하고 진행률은 100%로 캡된다', () => {
    const runs = [{date: '2026-06-05', dist: 120}]; // 목표 100km 초과
    const root = render({challenges: [DISTANCE_CH], runs});

    const badge = root.find((n: any) => n.props?.testID === 'challenge-badge-c1');
    expect(textOf(badge)).toContain('달성');

    const pctNode = root.find((n: any) => n.props?.testID === 'challenge-pct-c1');
    expect(textOf(pctNode)).toBe('100%');
  });
});

describe('ChallengesSection 스트릭 진행률(distance 렌더와 대칭)', () => {
  test("kind='streak' 챌린지는 연속일 수가 challengeProgress 대로 진행률(%)로 렌더된다", () => {
    // 06-01·06-02·06-03 연속 3일 + 06-05(끊김) → 최대 연속 3일. 목표 3일 → 100%.
    const runs = [
      {date: '2026-06-01', dist: 4},
      {date: '2026-06-02', dist: 3},
      {date: '2026-06-03', dist: 5},
      {date: '2026-06-05', dist: 9},
      {date: '2026-05-20', dist: 9}, // 기간 밖 → 무시
    ];
    const root = render({challenges: [STREAK_CH], runs});

    const expected = challengeProgress(STREAK_CH, runs); // current 3 / target 3 → pct 1
    expect(expected.current).toBe(3);
    const pctNode = root.find((n: any) => n.props?.testID === 'challenge-pct-s1');
    expect(textOf(pctNode)).toBe(`${Math.round(expected.pct * 100)}%`);
    expect(textOf(pctNode)).toBe('100%');

    // 목표를 채웠으므로 달성 뱃지를 노출한다.
    const badge = root.find((n: any) => n.props?.testID === 'challenge-badge-s1');
    expect(textOf(badge)).toContain('달성');
  });

  test('미달성 스트릭은 진행률만 반영하고 달성 뱃지를 노출하지 않는다', () => {
    // 06-01·06-02 연속 2일뿐 → 목표 3일 대비 2/3 → 67%, 미달성.
    const runs = [
      {date: '2026-06-01', dist: 4},
      {date: '2026-06-02', dist: 3},
    ];
    const root = render({challenges: [STREAK_CH], runs});

    const expected = challengeProgress(STREAK_CH, runs); // current 2 / target 3
    expect(expected.current).toBe(2);
    expect(expected.completed).toBe(false);
    const pctNode = root.find((n: any) => n.props?.testID === 'challenge-pct-s1');
    expect(textOf(pctNode)).toBe(`${Math.round(expected.pct * 100)}%`);
    expect(textOf(pctNode)).toBe('67%');

    const badges = root.findAll((n: any) => n.props?.testID === 'challenge-badge-s1');
    expect(badges.length).toBe(0);
  });
});

describe('ChallengesSection 빈 상태', () => {
  test('challenges=[] 면 빈 상태 안내를 렌더하고 챌린지 카드는 없다', () => {
    const root = render({challenges: [], runs: []});
    const empty = root.find((n: any) => n.props?.testID === 'challenges-empty');
    expect(textOf(empty).length).toBeGreaterThan(0);
    // 카드가 하나도 렌더되지 않는다(challenge-<id> testID 부재).
    const cards = root.findAll(
      (n: any) => typeof n.props?.testID === 'string' && /^challenge-[^-]/.test(n.props.testID),
    );
    expect(cards.length).toBe(0);
  });
});

describe('ChallengesSection 생성', () => {
  test('새 챌린지를 열어 목표를 올리고 만들면 onCreate가 well-formed Challenge로 호출된다', () => {
    const onCreate = jest.fn();
    const root = render({challenges: [], onCreate, today: '2026-06-03'});

    // 폼 열기 → 거리 목표 +10(50 → 60) → 만들기
    act(() => pressByLabel(root, '새 챌린지').props.onPress());
    act(() => pressByLabel(root, 'km 늘리기').props.onPress());
    act(() => pressByLabel(root, '챌린지 만들기').props.onPress());

    expect(onCreate).toHaveBeenCalledTimes(1);
    const ch: Challenge = onCreate.mock.calls[0][0];
    expect(ch.kind).toBe('distance');
    expect(ch.targetKm).toBe(60);
    expect(ch.startDate).toBe('2026-06-03');
    // 기본 기간 30일 → 종료일은 시작일 + 29일
    expect(ch.endDate).toBe('2026-07-02');
    expect(typeof ch.id).toBe('string');
    expect(ch.id.length).toBeGreaterThan(0);
  });

  test('스트릭 종류를 골라 만들면 targetDays가 채워진 Challenge로 호출된다', () => {
    const onCreate = jest.fn();
    const root = render({challenges: [], onCreate, today: '2026-06-03'});

    act(() => pressByLabel(root, '새 챌린지').props.onPress());
    act(() => pressByLabel(root, '스트릭 챌린지').props.onPress());
    act(() => pressByLabel(root, '7일 기간').props.onPress());
    act(() => pressByLabel(root, '챌린지 만들기').props.onPress());

    const ch: Challenge = onCreate.mock.calls[0][0];
    expect(ch.kind).toBe('streak');
    expect(ch.targetDays).toBe(5); // 기본값
    expect(ch.targetKm).toBeUndefined();
    expect(ch.startDate).toBe('2026-06-03');
    expect(ch.endDate).toBe('2026-06-09'); // 7일 → 시작 + 6일
  });
});

describe('ChallengesSection 삭제', () => {
  test('삭제 버튼을 누르면 onDelete가 해당 id로 호출된다', () => {
    const onDelete = jest.fn();
    const root = render({challenges: [DISTANCE_CH], runs: [], onDelete});
    act(() => pressByLabel(root, '챌린지 삭제 100km 도전').props.onPress());
    expect(onDelete).toHaveBeenCalledWith('c1');
  });
});
