/**
 * ProfileScreen 스마트 챌린지 카드 통합 테스트 — 챌린지 탭(진척)에서 마이 탭으로 이관.
 *
 * 회귀 가드: 스마트 챌린지 카드가 실제 마운트되는 ProfileScreen 트리 안에서 '스마트 챌린지'
 * 라벨 + 진행률과 함께 상시 렌더되고('마이' 탭 = App 이 tab===3 으로 띄우는 화면), 수락
 * 단계(누르면 사라지던 동작) 없이 노출됨을 증명한다. 진척에서 마이로 옮겨졌어도 도달
 * 가능(reachable)함을 보장한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ProfileScreen from '../ProfileScreen.rn';
import {
  ExtRun,
  ExtShoe,
  generateSmartChallenge,
} from '../lib/progression/challengesExt';

// 기준일: 2026-06-12(금) — 이 주 월요일 = 06-08. 스마트 추천 윈도우 기준.
const NOW = '2026-06-12';

// 활성 신발 2켤레 — s1 과사용(스마트 추천이 생성되는 조건).
const EXT_SHOES: ExtShoe[] = [
  {id: 's1', name: 'Alphafly 3', retired: false, createdAt: '2026-01-01', targetKm: 300},
  {id: 's2', name: 'Novablast 5', retired: false, createdAt: '2026-03-01', targetKm: 800},
];
const EXT_RUNS: ExtRun[] = [
  {date: '2026-06-02', dist: 20, shoeId: 's1', durationS: 6000},
  {date: '2026-06-05', dist: 20, shoeId: 's1', durationS: 6000},
  {date: '2026-06-10', dist: 18, shoeId: 's1', durationS: 5400},
  {date: '2026-06-08', dist: 3, shoeId: 's2', durationS: 900},
];

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
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  return renderer.root;
}

function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id);
}

describe('ProfileScreen 스마트 챌린지 카드(마이 탭 이관)', () => {
  test("마이 탭 트리에 '스마트 챌린지' 라벨 + 진행 카드가 상시 렌더된다", () => {
    const smart = generateSmartChallenge(EXT_RUNS, EXT_SHOES, NOW)!;
    expect(smart).not.toBeNull();
    const root = render({
      challengeExtRuns: EXT_RUNS,
      challengeExtShoes: EXT_SHOES,
      todayISO: NOW,
    });
    // 섹션 컨테이너 + 스마트 챌린지 카드가 실제 트리에 존재한다.
    expect(byTestId(root, 'smart-challenge-section').length).toBeGreaterThanOrEqual(1);
    expect(byTestId(root, 'smart-challenge').length).toBeGreaterThanOrEqual(1);
    // 주황 라벨 자리에 '스마트 챌린지' 가 적힌다.
    expect(textOf(byTestId(root, 'smart-challenge-tag')[0])).toContain('스마트 챌린지');
    // 진행률·사유가 함께 노출된다.
    expect(textOf(byTestId(root, 'smart-challenge-progress')[0])).toContain('km');
    expect(textOf(byTestId(root, 'smart-challenge-reason')[0])).toContain('km');
  });

  test('수락(이 챌린지 시작) 버튼이 없다 — 누르면 사라지던 동작 폐지', () => {
    const root = render({
      challengeExtRuns: EXT_RUNS,
      challengeExtShoes: EXT_SHOES,
      todayISO: NOW,
    });
    expect(byTestId(root, 'smart-challenge-accept').length).toBe(0);
  });

  test('런이 없어 추천이 없으면 빈 안내만 노출한다', () => {
    const root = render({
      challengeExtRuns: [],
      challengeExtShoes: EXT_SHOES,
      todayISO: NOW,
    });
    expect(byTestId(root, 'smart-challenge-section').length).toBeGreaterThanOrEqual(1);
    expect(byTestId(root, 'smart-challenge').length).toBe(0);
    expect(byTestId(root, 'challenges-empty').length).toBeGreaterThanOrEqual(1);
  });
});
