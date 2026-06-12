/**
 * HomeScreen — 진척 홈 노출(Slice D) 행동 테스트.
 *
 * 관찰 가능한 동작만 검증한다(내부 상태/에러 부재 아님):
 *  1) 랭크 칩이 주입한 tier 의 TIER_COLORS 값으로 칠해진다(하드코딩 금지).
 *  2) 장착 타이틀이 인사(닉네임) 옆에 렌더된다.
 *  3) 활성 챌린지 진행이 주입한 current/target 을 그대로 보여주고 막대 폭이 pct 를 반영한다.
 *  4) 가장 최근 달성 업적이 렌더된다.
 *  5) 진척 칩/띠를 탭하면 onOpenProgression 이 호출된다.
 *  6) shoe-first 히어로(home-hero)가 여전히 렌더된다(제거/퇴행 없음).
 *
 * props-driven · 네트워크 없음 · jest.setup 목 · AsyncStorage.clear() per test.
 * @format
 */
import React from 'react';
import {StyleSheet} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen, {HomeProgression} from '../HomeScreen.rn';
import {Shoe, TIER_COLORS, withAlpha} from '../theme';

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
function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (!hits.length) throw new Error(`no pressable labelled "${label}"`);
  return hits[0];
}

const SHOES: Shoe[] = [
  {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'},
  {id: 'b', brand: 'Hoka', model: 'Clifton 10', used: 300, max: 700, condition: '주의'},
];

const PROG: HomeProgression = {
  tier: 'gold',
  score: 62,
  equippedTitle: '꾸준함의 달인',
  challenge: {label: '이번 달 100km', current: 42, target: 100, pct: 0.42, unit: 'km'},
  achievement: {name: '첫 은퇴'},
};

describe('홈 진척 띠 — 표면', () => {
  test('랭크 칩이 주입한 tier 의 TIER_COLORS 값으로 칠해진다', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    const chipText = byTestID(root, 'home-rank-chip-text')[0];
    expect(chipText).toBeTruthy();
    const color = (StyleSheet.flatten(chipText.props.style) as any).color;
    expect(color).toBe(TIER_COLORS.gold);
    // 칩에 티어명/점수가 표시된다.
    expect(textOf(byTestID(root, 'home-rank-chip')[0])).toContain('Gold');
    expect(textOf(byTestID(root, 'home-rank-chip')[0])).toContain('62');
  });

  test('장착 타이틀이 인사(닉네임) 옆에 렌더된다', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    const pill = byTestID(root, 'home-equipped-title');
    expect(pill.length).toBeGreaterThanOrEqual(1);
    expect(textOf(pill[0])).toContain('꾸준함의 달인');
  });

  test('활성 챌린지 진행이 주입한 current/target 을 보여주고 막대 폭이 pct 를 반영한다', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    const ch = byTestID(root, 'home-challenge')[0];
    expect(ch).toBeTruthy();
    expect(textOf(ch)).toContain('이번 달 100km');
    expect(textOf(ch)).toContain('42');
    expect(textOf(ch)).toContain('100km');
    // 막대 폭 = round(pct*100)% = 42%
    const fill = byTestID(root, 'home-challenge-bar')[0];
    const w = (StyleSheet.flatten(fill.props.style) as any).width;
    expect(w).toBe('42%');
  });

  test('가장 최근 달성 업적이 렌더된다', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    const ach = byTestID(root, 'home-recent-achievement');
    expect(ach.length).toBeGreaterThanOrEqual(1);
    expect(textOf(ach[0])).toContain('첫 은퇴');
  });

  test('진척 띠를 탭하면 onOpenProgression 이 호출된다', () => {
    const onOpenProgression = jest.fn();
    const root = render(
      <HomeScreen
        shoes={SHOES}
        activeIdx={0}
        onSelect={jest.fn()}
        progression={PROG}
        onOpenProgression={onOpenProgression}
      />,
    ).root;
    act(() => {
      pressByLabel(root, '진척 보기').props.onPress();
    });
    expect(onOpenProgression).toHaveBeenCalledTimes(1);
  });

  test('shoe-first 히어로(home-hero)가 여전히 렌더된다(퇴행 없음)', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    // 활성 카드 히어로 + 선택 신발 모델명이 그대로 노출된다.
    expect(byTestID(root, 'home-hero').length).toBeGreaterThanOrEqual(1);
    expect(textOf(root)).toContain('Pegasus 41');
  });

  test('progression 미주입 시 진척 띠/타이틀을 숨겨 기존 홈과 하위호환된다', () => {
    const root = render(<HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} />).root;
    expect(byTestID(root, 'home-progression').length).toBe(0);
    expect(byTestID(root, 'home-equipped-title').length).toBe(0);
    // 히어로는 그대로.
    expect(byTestID(root, 'home-hero').length).toBeGreaterThanOrEqual(1);
  });
});

// withAlpha 가 칩 배경/테두리에도 같은 티어색을 파생하는지(토큰 단일출처) 가벼운 확인.
describe('홈 랭크 칩 — 티어색 파생', () => {
  test('칩 배경/테두리가 TIER_COLORS[tier] 파생색이다', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} progression={PROG} />,
    ).root;
    const chip = byTestID(root, 'home-rank-chip')[0];
    const st = StyleSheet.flatten(chip.props.style) as any;
    expect(st.backgroundColor).toBe(withAlpha(TIER_COLORS.gold, 0.16));
    expect(st.borderColor).toBe(withAlpha(TIER_COLORS.gold, 0.5));
  });
});
