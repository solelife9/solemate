/**
 * HomeScreen.rn.tsx — behavioural tests for the Slice-3 Keego home.
 *
 * Drives the real screen with props (no backend) and asserts OBSERVABLE output —
 * what the onStart callback receives and what the hero subtree actually renders —
 * guarding the interactive wiring that survived the token/primitive refactor:
 *
 *   1) Pressing the '러닝 시작' Button calls onStart with the SELECTED shoe index
 *      (activeIdx) — guards against the Button-primitive swap silently dropping
 *      the onPress wiring.
 *   2) The shoe-first hero reflects the REAL activeIdx (not a hard-coded 0):
 *      changing activeIdx swaps the hero's shoe name + lifespan ring; an
 *      out-of-range activeIdx clamps to the last shoe.
 *   3) The KeegoWordmark renders 'Keego' INSIDE a directly-rendered HomeScreen.
 *   4) (구조) A secondary/label text is bound to the T3 token (orange restraint).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
import HomeScreen from '../HomeScreen.rn';
import {Shoe, T3} from '../theme';

// Flatten all string leaves under a node into one string (render-tree text).
function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

// react-native-svg is mocked to plain Views that keep displayName; the Keego
// wordmark's <Text> (and other svg primitives) are located by that name.
const byName = (root: ReactTestRenderer.ReactTestInstance, name: string) =>
  root.findAll((n: any) => n && n.type && n.type.displayName === name);

// Most-specific Pressable whose rendered text contains `needle`.
function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

// The hero subtree only ever renders the ACTIVE shoe (the picker below renders
// all of them), so isolating it by testID lets us assert which shoe is hero.
const hero = (root: ReactTestRenderer.ReactTestInstance) =>
  root.find((n: any) => n && n.props && n.props.testID === 'home-hero');

const SHOES: Shoe[] = [
  {brand: 'Nike', model: 'Pegasus 41', used: 100, max: 500, condition: '양호'}, // remain 400 → 80%
  {brand: 'Hoka', model: 'Clifton 9', used: 400, max: 500, condition: '주의'}, // remain 100 → 20%
];

// ── 1) CTA → Button wiring preserved: press → onStart(activeIdx) ──────────────
describe("'러닝 시작' Button is wired to onStart with the selected index", () => {
  test('selected activeIdx=1 → onStart called with 1 (not a hard-coded 0)', () => {
    const onStart = jest.fn();
    const onSelect = jest.fn();
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={1} onSelect={onSelect} onStart={onStart} />,
    ).root;

    act(() => {
      pressBy(root, '러닝 시작').props.onPress();
    });

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(1);
  });

  test('selected activeIdx=0 → onStart called with 0', () => {
    const onStart = jest.fn();
    const onSelect = jest.fn();
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={onSelect} onStart={onStart} />,
    ).root;

    act(() => {
      pressBy(root, '러닝 시작').props.onPress();
    });

    expect(onStart).toHaveBeenCalledWith(0);
  });
});

// ── 2) shoe-first hero reflects the real activeIdx (+ clamp) ──────────────────
describe('hero card reflects the real activeIdx, not index 0', () => {
  test('activeIdx=0 → hero shows the first shoe (Pegasus 41 · 80% ring)', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} />,
    ).root;
    const txt = textOf(hero(root));
    expect(txt).toContain('Pegasus 41');
    expect(txt).not.toContain('Clifton 9');
    expect(txt).toContain('80'); // lifespan ring % for shoe 0
    expect(txt).toContain('400'); // remaining km for shoe 0
  });

  test('activeIdx=1 → hero swaps to the second shoe (Clifton 9 · 20% ring)', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={1} onSelect={jest.fn()} />,
    ).root;
    const txt = textOf(hero(root));
    expect(txt).toContain('Clifton 9');
    expect(txt).not.toContain('Pegasus 41');
    expect(txt).toContain('20'); // lifespan ring % for shoe 1
    expect(txt).toContain('100'); // remaining km for shoe 1
  });

  test('out-of-range activeIdx clamps to the last shoe (no crash, hero = Clifton 9)', () => {
    const root = render(
      <HomeScreen shoes={SHOES} activeIdx={99} onSelect={jest.fn()} />,
    ).root;
    const txt = textOf(hero(root));
    expect(txt).toContain('Clifton 9');
    expect(txt).not.toContain('Pegasus 41');
  });
});

// ── 3) KeegoWordmark renders 'Keego' inside a directly-rendered HomeScreen ────
test("KeegoWordmark renders 'Keego' within HomeScreen itself", () => {
  const root = render(<HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} />).root;
  // Direct assertion on the HomeScreen tree (not a sibling-screen substring).
  const wordmarkTexts = byName(root, 'Text').filter(t => t.props.children === 'Keego');
  expect(wordmarkTexts.length).toBeGreaterThanOrEqual(1);
  expect(textOf(root)).toContain('Keego');
});

// ── 4) orange restraint: secondary stat label is bound to the T3 token ────────
test("QuickStats labels are bound to the T3 token (회색 보조 텍스트, 오렌지 절제)", () => {
  const root = render(
    <HomeScreen shoes={SHOES} activeIdx={0} onSelect={jest.fn()} week={{km: '12', runs: 3, pace: "5'10"}} />,
  ).root;
  const label = root.findAll((n: any) => n && n.props && n.props.children === '평균 페이스')[0];
  expect(StyleSheet.flatten(label.props.style).color).toBe(T3);
});
