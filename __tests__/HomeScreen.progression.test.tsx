/**
 * HomeScreen — 진척 홈 노출 행동 테스트.
 *
 * [설계 변경 — MVP 홈 다이어트] 진척 띠(ProgressionStrip: 랭크 칩·챌린지 진행·최근
 * 업적)는 홈에서 제거되었다. 진척의 집은 마이탭/진척 화면이고, 홈에 남는 진척 표면은
 * 인사 옆 '장착 타이틀 pill'(home-equipped-title) 하나뿐이다. 홈은 '오늘 신발 고르고
 * 뛴다' 저니에 집중한다. 이 계약을 회귀 가드한다:
 *  1) progression 을 주입해도 진척 띠/랭크 칩/챌린지 줄/업적 칩은 렌더되지 않는다.
 *  2) 장착 타이틀 pill 은 계속 인사 옆에 렌더된다.
 *  3) shoe-first 히어로(home-hero)는 그대로다(퇴행 없음).
 *  4) progression 미주입 시 pill 도 숨겨 하위호환된다.
 *
 * props-driven · 네트워크 없음 · jest.setup 목 · AsyncStorage.clear() per test.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen, {HomeProgression} from '../HomeScreen.rn';
import {Shoe} from '../theme';

beforeEach(async () => {
  await AsyncStorage.clear();
});

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}
const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);
function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  return node
    .findAll((n: any) => n.type === 'Text')
    .map((t: any) =>
      (Array.isArray(t.props.children) ? t.props.children : [t.props.children])
        .filter((c: any) => typeof c === 'string' || typeof c === 'number')
        .join(''),
    )
    .join(' ');
}

const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 300, max: 700},
];

const PROG: HomeProgression = {
  tier: 'gold',
  score: 62,
  equippedTitle: '꾸준함의 달인',
  challenge: {label: '이번 달 100km', current: 42, target: 100, pct: 0.42, unit: 'km'},
  achievement: {name: '첫 은퇴'},
};

describe('홈 진척 노출 — 다이어트 후 계약', () => {
  test('progression 을 주입해도 진척 띠/랭크 칩/챌린지 줄/업적 칩은 홈에 없다', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    expect(byTestID(root, 'home-progression').length).toBe(0);
    expect(byTestID(root, 'home-rank-chip').length).toBe(0);
    expect(byTestID(root, 'home-challenge').length).toBe(0);
    expect(byTestID(root, 'home-recent-achievement').length).toBe(0);
  });

  test('장착 타이틀 pill 은 인사 옆에 계속 렌더된다', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    const pill = byTestID(root, 'home-equipped-title');
    expect(pill.length).toBeGreaterThanOrEqual(1);
    expect(textOf(pill[0])).toContain('꾸준함의 달인');
  });

  test('shoe-first 히어로(home-hero)가 여전히 렌더된다(퇴행 없음)', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    expect(byTestID(root, 'home-hero').length).toBeGreaterThanOrEqual(1);
    expect(textOf(root)).toContain('Pegasus 41');
  });

  test('progression 미주입 시 장착 타이틀 pill 도 숨겨 하위호환된다', () => {
    const root = render(<HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} />).root;
    expect(byTestID(root, 'home-equipped-title').length).toBe(0);
    expect(byTestID(root, 'home-hero').length).toBeGreaterThanOrEqual(1);
  });
});
