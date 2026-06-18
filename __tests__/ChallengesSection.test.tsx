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
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ChallengesSection from '../ChallengesSection';
import {challengeProgress, Challenge} from '../lib/challenges';
import {
  ExtChallenge,
  ExtRun,
  ExtShoe,
  challengeExtProgress,
  generateSmartChallenge,
} from '../lib/progression/challengesExt';

// AsyncStorage 는 컴포넌트가 직접 만지지 않지만(영속은 App 소유), 슬라이스 규약대로
// 테스트 격리를 위해 매 테스트마다 비운다.
beforeEach(async () => {
  await AsyncStorage.clear();
});

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

// ─── 확장 챌린지(Slice C: weekly/shoe/rotation/smart) ─────────────────────────
const NOW = '2026-06-13'; // 토요일 — 주(06-08~06-14)·달(06) 윈도우 기준

const EXT_SHOES: ExtShoe[] = [
  {id: 's1', name: 'Alphafly 3', retired: false, createdAt: '2026-01-01', targetKm: 300},
  {id: 's2', name: 'Novablast 5', retired: false, createdAt: '2026-03-01', targetKm: 800},
  {id: 's3', name: 'Old Trainer', retired: true, createdAt: '2025-01-01', targetKm: 700},
];

describe('ChallengesSection 확장 챌린지 — weekly', () => {
  test('이번 주 거리 합이 진행률(%)·현재/목표로 카드에 반영된다', () => {
    // NOW=2026-06-13(토), 이번 주=06-08(월)~06-14(일)
    const ch: ExtChallenge = {id: 'm1', kind: 'weekly', metric: 'distance', targetKm: 100};
    const extRuns: ExtRun[] = [
      {date: '2026-06-09', dist: 30}, // 이번 주 → 포함
      {date: '2026-06-11', dist: 25}, // 이번 주 → 포함
      {date: '2026-06-07', dist: 99}, // 지난 주 → 제외
    ];
    const root = render({
      challenges: [],
      extChallenges: [ch],
      extRuns,
      shoes: EXT_SHOES,
      now: NOW,
      smartSuggestion: null,
    });

    const expected = challengeExtProgress(ch, extRuns, EXT_SHOES, NOW); // 55/100 → 55%
    expect(expected.current).toBeCloseTo(55, 5);
    const pct = root.find((n: any) => n.props?.testID === 'ext-challenge-pct-m1');
    expect(textOf(pct)).toBe(`${Math.round(expected.pct * 100)}%`);
    expect(textOf(pct)).toBe('55%');

    const prog = root.find((n: any) => n.props?.testID === 'ext-challenge-progress-m1');
    expect(textOf(prog)).toBe('55 / 100km');

    expect(root.findAll((n: any) => n.props?.testID === 'ext-challenge-badge-m1').length).toBe(0);
  });

  test('count 메트릭은 이번 주 달린 횟수를 현재/목표(회)로 보여준다', () => {
    const ch: ExtChallenge = {id: 'm2', kind: 'weekly', metric: 'count', targetRuns: 3};
    const extRuns: ExtRun[] = [
      {date: '2026-06-09', dist: 5}, // 이번 주 → 포함
      {date: '2026-06-11', dist: 8}, // 이번 주 → 포함
      {date: '2026-06-12', dist: 0}, // 거리 0 → 런 아님
      {date: '2026-06-07', dist: 10}, // 지난 주 → 제외
    ];
    const root = render({extChallenges: [ch], extRuns, shoes: EXT_SHOES, now: NOW, smartSuggestion: null});
    const prog = root.find((n: any) => n.props?.testID === 'ext-challenge-progress-m2');
    expect(textOf(prog)).toBe('2 / 3회');
  });
});

describe('ChallengesSection 확장 챌린지 — shoe', () => {
  test('지정 신발의 누적 거리만 진행률에 반영하고 신발 이름을 제목에 쓴다', () => {
    const ch: ExtChallenge = {id: 'sh1', kind: 'shoe', shoeId: 's2', targetKm: 50};
    const extRuns: ExtRun[] = [
      {date: '2026-06-01', dist: 20, shoeId: 's2'},
      {date: '2026-06-05', dist: 15, shoeId: 's2'},
      {date: '2026-06-06', dist: 99, shoeId: 's1'}, // 다른 신발 → 제외
    ];
    const root = render({extChallenges: [ch], extRuns, shoes: EXT_SHOES, now: NOW, smartSuggestion: null});

    const expected = challengeExtProgress(ch, extRuns, EXT_SHOES, NOW); // 35/50 → 70%
    expect(expected.current).toBeCloseTo(35, 5);
    const pct = root.find((n: any) => n.props?.testID === 'ext-challenge-pct-sh1');
    expect(textOf(pct)).toBe('70%');

    const card = root.find((n: any) => n.props?.testID === 'ext-challenge-sh1');
    expect(textOf(card)).toContain('Novablast 5'); // 신발 이름 노출
    const prog = root.find((n: any) => n.props?.testID === 'ext-challenge-progress-sh1');
    expect(textOf(prog)).toBe('35 / 50km');
  });
});

describe('ChallengesSection 확장 챌린지 — rotation', () => {
  test('distinct: 이번 주 사용한 서로 다른 활성 신발 수를 진행률로 보여주고 달성 시 뱃지', () => {
    const ch: ExtChallenge = {id: 'r1', kind: 'rotation', rotationMode: 'distinct', targetShoes: 2};
    const extRuns: ExtRun[] = [
      {date: '2026-06-09', dist: 10, shoeId: 's1'},
      {date: '2026-06-10', dist: 8, shoeId: 's2'},
      {date: '2026-06-11', dist: 5, shoeId: 's3'}, // 은퇴 → 제외
    ];
    const root = render({extChallenges: [ch], extRuns, shoes: EXT_SHOES, now: NOW, smartSuggestion: null});

    const expected = challengeExtProgress(ch, extRuns, EXT_SHOES, NOW); // 2/2 → 100%, 완료
    expect(expected.current).toBe(2);
    expect(expected.completed).toBe(true);

    const pct = root.find((n: any) => n.props?.testID === 'ext-challenge-pct-r1');
    expect(textOf(pct)).toBe('100%');
    const prog = root.find((n: any) => n.props?.testID === 'ext-challenge-progress-r1');
    expect(textOf(prog)).toBe('2 / 2켤레');
    const badge = root.find((n: any) => n.props?.testID === 'ext-challenge-badge-r1');
    expect(textOf(badge)).toContain('달성');
  });

  test('balance: 한 신발 점유율이 목표 상한을 넘으면 미달로 현재%·목표%를 함께 보여준다', () => {
    const ch: ExtChallenge = {id: 'r2', kind: 'rotation', rotationMode: 'balance', maxSharePct: 60};
    const extRuns: ExtRun[] = [
      {date: '2026-06-09', dist: 16, shoeId: 's1'}, // 80%
      {date: '2026-06-10', dist: 4, shoeId: 's2'}, // 20%
    ];
    const root = render({extChallenges: [ch], extRuns, shoes: EXT_SHOES, now: NOW, smartSuggestion: null});
    const prog = root.find((n: any) => n.props?.testID === 'ext-challenge-progress-r2');
    expect(textOf(prog)).toBe('최대 80% · 목표 60% 이하');
    expect(root.findAll((n: any) => n.props?.testID === 'ext-challenge-badge-r2').length).toBe(0);
  });
});

describe('ChallengesSection 스마트 챌린지(추천)', () => {
  // s1 과사용 → s2 추천. 결정적으로 생성한 추천을 그대로 props 로 주입한다.
  const SMART_RUNS: ExtRun[] = [
    {date: '2026-06-01', dist: 20, shoeId: 's1'},
    {date: '2026-06-05', dist: 20, shoeId: 's1'},
    {date: '2026-06-10', dist: 18, shoeId: 's1'},
    {date: '2026-06-08', dist: 3, shoeId: 's2'},
  ];

  test('투명한 한국어 사유를 카드에 노출한다', () => {
    const smart = generateSmartChallenge(SMART_RUNS, EXT_SHOES, NOW)!;
    expect(smart).not.toBeNull();
    const root = render({extRuns: SMART_RUNS, shoes: EXT_SHOES, now: NOW, smartSuggestion: smart});

    const reason = root.find((n: any) => n.props?.testID === 'smart-challenge-reason');
    expect(textOf(reason)).toBe(smart.reason);
    // 새 로직: 평균 거리 × 3 기반 사유
    expect(textOf(reason)).toContain('기준');
    expect(textOf(reason)).toContain('km');
  });

  test('추천을 명시 주입하지 않아도 데이터에서 자동 생성해 사유를 보여준다', () => {
    const root = render({extRuns: SMART_RUNS, shoes: EXT_SHOES, now: NOW});
    const reason = root.find((n: any) => n.props?.testID === 'smart-challenge-reason');
    expect(textOf(reason).length).toBeGreaterThan(0);
    expect(textOf(reason)).toContain('km');
  });

  test("'이 챌린지 시작'을 누르면 onAcceptChallenge가 추천 챌린지로 호출된다", () => {
    const smart = generateSmartChallenge(SMART_RUNS, EXT_SHOES, NOW)!;
    const onAcceptChallenge = jest.fn();
    const root = render({
      extRuns: SMART_RUNS,
      shoes: EXT_SHOES,
      now: NOW,
      smartSuggestion: smart,
      onAcceptChallenge,
    });
    const accept = root.find((n: any) => n.props?.testID === 'smart-challenge-accept');
    act(() => accept.props.onPress());
    expect(onAcceptChallenge).toHaveBeenCalledTimes(1);
    expect(onAcceptChallenge).toHaveBeenCalledWith(smart);
  });

  test('이미 수락(같은 id가 extChallenges에 있음)했으면 추천 카드를 숨긴다', () => {
    const smart = generateSmartChallenge(SMART_RUNS, EXT_SHOES, NOW)!;
    const root = render({
      extRuns: SMART_RUNS,
      shoes: EXT_SHOES,
      now: NOW,
      smartSuggestion: smart,
      extChallenges: [smart], // 이미 수락됨
    });
    expect(root.findAll((n: any) => n.props?.testID === 'smart-challenge').length).toBe(0);
    // 수락분은 일반 확장 카드로 노출된다(내부 진행률 Text 는 단일 매치).
    expect(root.find((n: any) => n.props?.testID === `ext-challenge-pct-${smart.id}`)).toBeTruthy();
  });

  test('런 기록이 없으면 추천 카드를 노출하지 않는다', () => {
    const root = render({
      extRuns: [],
      shoes: EXT_SHOES,
      now: NOW,
    });
    expect(root.findAll((n: any) => n.props?.testID === 'smart-challenge').length).toBe(0);
  });
});

describe('ChallengesSection 기존 + 확장 공존', () => {
  test('기존 distance/streak 카드와 확장 카드가 함께 렌더된다', () => {
    const ext: ExtChallenge = {id: 'm9', kind: 'weekly', metric: 'distance', targetKm: 100};
    const root = render({
      challenges: [DISTANCE_CH],
      runs: [{date: '2026-06-03', dist: 40}],
      extChallenges: [ext],
      extRuns: [{date: '2026-06-03', dist: 40}],
      shoes: EXT_SHOES,
      now: NOW,
      smartSuggestion: null,
    });
    // 기존 개인 챌린지 카드 보존(내부 진행률 Text 는 단일 매치)
    expect(root.find((n: any) => n.props?.testID === 'challenge-pct-c1')).toBeTruthy();
    // 확장 카드도 함께 노출
    expect(root.find((n: any) => n.props?.testID === 'ext-challenge-pct-m9')).toBeTruthy();
  });
});
