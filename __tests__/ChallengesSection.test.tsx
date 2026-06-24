/**
 * ChallengesSection 스마트 챌린지 카드 행동 테스트(상시 진행 카드 — 수락 단계 폐지).
 *
 * 관찰 가능한 결과(test_critic 요건)를 검증한다:
 *   1) 라벨 + 추천 + 진행률 — '스마트 챌린지' 칩과 generateSmartChallenge 가 만든 주간
 *      챌린지, 그리고 challengeExtProgress 로 파생한 진행률(%)·현재/목표를 함께 노출한다.
 *   2) 상시 카드 — '이 챌린지 시작'(수락) 버튼이 없다(누르면 사라지던 옛 동작 폐지).
 *   3) 달성 뱃지 — 이번 주 거리가 목표를 채우면 '달성!' 뱃지를 노출한다.
 *   4) 빈 상태 — 런이 없어 추천이 생성되지 않으면 빈 안내만 노출한다.
 *
 * @format
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ChallengesSection from '../ChallengesSection';
import {
  ExtRun,
  ExtShoe,
  challengeExtProgress,
  generateSmartChallenge,
} from '../lib/progression/challengesExt';

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

function byId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id);
}

// 기준일: 2026-06-13(토) — 이 주 월요일 = 06-08, 일요일 = 06-14.
const NOW = '2026-06-13';

const EXT_SHOES: ExtShoe[] = [
  {id: 's1', name: 'Alphafly 3', retired: false, createdAt: '2026-01-01', targetKm: 300},
  {id: 's2', name: 'Novablast 5', retired: false, createdAt: '2026-03-01', targetKm: 800},
];

// 지난 주들에 쌓인 런(스마트 추천의 평균 거리 기반 생성 조건). 이번 주(06-08~)엔 0.
const PAST_RUNS: ExtRun[] = [
  {date: '2026-06-01', dist: 20, shoeId: 's1', durationS: 6000},
  {date: '2026-05-28', dist: 20, shoeId: 's1', durationS: 6000},
  {date: '2026-05-25', dist: 18, shoeId: 's1', durationS: 5400},
  {date: '2026-05-22', dist: 3, shoeId: 's2', durationS: 900},
];

describe('ChallengesSection 스마트 챌린지 카드(상시 진행)', () => {
  test("'스마트 챌린지' 라벨 + 추천 주간 챌린지 + 진행률을 함께 노출한다", () => {
    const smart = generateSmartChallenge(PAST_RUNS, EXT_SHOES, NOW)!;
    expect(smart).not.toBeNull();
    expect(smart.kind).toBe('weekly');

    const root = render({extRuns: PAST_RUNS, shoes: EXT_SHOES, now: NOW, smartSuggestion: smart});

    expect(byId(root, 'smart-challenge').length).toBeGreaterThanOrEqual(1);
    // 라벨 칩이 '스마트 챌린지' 를 노출한다(주황 자리).
    expect(textOf(byId(root, 'smart-challenge-tag')[0])).toContain('스마트 챌린지');

    // 진행률(%)·현재/목표가 challengeExtProgress 와 일치한다(이번 주 0km → 0%).
    const p = challengeExtProgress(smart, PAST_RUNS, EXT_SHOES, NOW);
    expect(textOf(byId(root, 'smart-challenge-pct')[0])).toBe(`${Math.round(p.pct * 100)}%`);
    expect(textOf(byId(root, 'smart-challenge-progress')[0])).toContain('km');

    // 투명한 한국어 사유.
    expect(textOf(byId(root, 'smart-challenge-reason')[0])).toContain('km');
  });

  test('추천을 명시 주입하지 않아도 데이터에서 자동 생성해 카드를 노출한다', () => {
    const root = render({extRuns: PAST_RUNS, shoes: EXT_SHOES, now: NOW});
    expect(byId(root, 'smart-challenge').length).toBeGreaterThanOrEqual(1);
    expect(textOf(byId(root, 'smart-challenge-progress')[0])).toContain('km');
  });

  test("'이 챌린지 시작'(수락) 버튼이 없다 — 누르면 사라지던 동작 폐지", () => {
    const root = render({extRuns: PAST_RUNS, shoes: EXT_SHOES, now: NOW});
    expect(byId(root, 'smart-challenge-accept').length).toBe(0);
  });

  test('이번 주 거리가 목표를 채우면 달성 뱃지를 노출한다', () => {
    const smart = generateSmartChallenge(PAST_RUNS, EXT_SHOES, NOW)!;
    // 이번 주(06-08~)에 목표 이상을 달리면 진행이 100%·완료가 된다.
    const thisWeek: ExtRun = {date: '2026-06-13', dist: (smart.targetKm ?? 0) + 5, shoeId: 's1', durationS: 6000};
    const runs = [...PAST_RUNS, thisWeek];
    const p = challengeExtProgress(smart, runs, EXT_SHOES, NOW);
    expect(p.completed).toBe(true);

    const root = render({extRuns: runs, shoes: EXT_SHOES, now: NOW, smartSuggestion: smart});
    expect(byId(root, 'smart-challenge-badge').length).toBeGreaterThanOrEqual(1);
    expect(textOf(byId(root, 'smart-challenge-pct')[0])).toBe('100%');
  });
});

describe('ChallengesSection 빈 상태', () => {
  test('런이 없어 추천이 생성되지 않으면 빈 안내만 노출한다', () => {
    const root = render({extRuns: [], shoes: EXT_SHOES, now: NOW, smartSuggestion: null});
    expect(byId(root, 'challenges-empty').length).toBeGreaterThanOrEqual(1);
    expect(byId(root, 'smart-challenge').length).toBe(0);
  });
});

describe('ChallengesSection 목표 거리(km) 수정', () => {
  function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
    return root.find(
      (n: any) => n?.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
    );
  }

  test('onEditSmartTarget 미주입이면 수정 버튼을 숨긴다(읽기 전용)', () => {
    const smart = generateSmartChallenge(PAST_RUNS, EXT_SHOES, NOW)!;
    const root = render({extRuns: PAST_RUNS, shoes: EXT_SHOES, now: NOW, smartSuggestion: smart});
    expect(byId(root, 'smart-challenge-edit').length).toBe(0);
  });

  test('수정 버튼 → 스테퍼 → ＋ 누르면 (id, 목표+1km)로 onEditSmartTarget 호출', () => {
    const smart = generateSmartChallenge(PAST_RUNS, EXT_SHOES, NOW)!;
    const onEditSmartTarget = jest.fn();
    const root = render({
      extRuns: PAST_RUNS,
      shoes: EXT_SHOES,
      now: NOW,
      smartSuggestion: smart,
      onEditSmartTarget,
    });
    // 편집 토글 → 스테퍼가 드러난다(현재 목표 노출).
    act(() => pressByLabel(root, '목표 거리 수정').props.onPress());
    expect(textOf(byId(root, 'smart-challenge-target')[0])).toContain(`${smart.targetKm}`);
    // ＋ → 목표 +1km 로 위임(영속은 App).
    act(() => pressByLabel(root, '목표 거리 늘리기').props.onPress());
    expect(onEditSmartTarget).toHaveBeenCalledWith(smart.id, (smart.targetKm ?? 0) + 1);
    // − → 목표 -1km.
    act(() => pressByLabel(root, '목표 거리 줄이기').props.onPress());
    expect(onEditSmartTarget).toHaveBeenCalledWith(smart.id, (smart.targetKm ?? 0) - 1);
  });

  test('smartTargetById 오버라이드가 표시 목표·진행 분모에 반영된다', () => {
    const smart = generateSmartChallenge(PAST_RUNS, EXT_SHOES, NOW)!;
    const OVERRIDE = (smart.targetKm ?? 0) + 13;
    const root = render({
      extRuns: PAST_RUNS,
      shoes: EXT_SHOES,
      now: NOW,
      smartSuggestion: smart,
      smartTargetById: {[smart.id]: OVERRIDE},
      onEditSmartTarget: jest.fn(),
    });
    // 진행 본문이 오버라이드된 목표(km)를 분모로 쓴다.
    expect(textOf(byId(root, 'smart-challenge-progress')[0])).toContain(`${OVERRIDE}km`);
    // 편집 스테퍼도 오버라이드 값에서 출발한다.
    act(() => pressByLabel(root, '목표 거리 수정').props.onPress());
    expect(textOf(byId(root, 'smart-challenge-target')[0])).toContain(`${OVERRIDE}`);
  });
});
