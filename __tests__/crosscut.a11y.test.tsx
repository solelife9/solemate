/**
 * crosscut.a11y.test.tsx — behavioural tests for the Slice-3 전 화면 횡단 마감 패스.
 *
 * Asserts OBSERVABLE render output (real react-test-renderer trees), not source
 * strings, for the cross-cutting polish:
 *   1) TabBar exposes an accessible tab per item (role=tab, label, selected state)
 *      — screen-reader users hear which tab is active, not just an orange icon.
 *   2) Button / Pill primitives carry an accessibilityLabel so CTAs and status
 *      badges (color-only tiers) are announced.
 *   3) safeArea: no screen hard-codes paddingTop:60 — top spacing derives from
 *      safe-area insets (mocked to 0 here, so the old 60 must be gone entirely).
 *   4) Empty states speak in the keep-going voice.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {StyleSheet} from 'react-native';
import HomeScreen from '../HomeScreen.rn';
import ShoesScreen from '../ShoesScreen.rn';
import HistoryScreen from '../HistoryScreen.rn';
import ProfileScreen from '../ProfileScreen.rn';
import AddShoeScreen from '../AddShoeScreen.rn';
import {RunStart} from '../RunScreen.rn';
import {Button, Pill, TabBar} from '../primitives';
import {Shoe} from '../theme';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

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

// Flatten a node's style prop, resolving the Pressable style-callback form.
function flatStyle(node: any): any {
  const st = node.props.style;
  const resolved = typeof st === 'function' ? st({pressed: false}) : st;
  return StyleSheet.flatten(resolved) || {};
}

// Every paddingTop value present anywhere in the tree (callback styles resolved).
function paddingTops(root: ReactTestRenderer.ReactTestInstance): number[] {
  return root
    .findAll((n: any) => n && n.props && n.props.style != null)
    .map(flatStyle)
    .map(s => s.paddingTop)
    .filter((v): v is number => typeof v === 'number');
}

const SHOES: Shoe[] = [
  {id: 's1', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 500, condition: '양호'},
];

// ── 1) TabBar: accessible tab per item (role + label + selected) ──────────────
describe('TabBar exposes accessible, color-independent tab state', () => {
  test('renders 4 tabs, each with role=tab and a label', () => {
    const root = render(<TabBar active={0} onTab={() => {}} />).root;
    const tabs = root.findAll(
      (n: any) =>
        n &&
        n.props &&
        n.props.accessibilityRole === 'tab' &&
        typeof n.props.onPress === 'function',
    );
    expect(tabs).toHaveLength(4);
    tabs.forEach(t => expect(typeof t.props.accessibilityLabel).toBe('string'));
    expect(tabs.map(t => t.props.accessibilityLabel)).toEqual([
      '홈',
      '기록',
      '신발',
      '프로필',
    ]);
  });

  test('only the active tab reports accessibilityState.selected=true', () => {
    const root = render(<TabBar active={2} onTab={() => {}} />).root;
    const tabs = root.findAll(
      (n: any) =>
        n &&
        n.props &&
        n.props.accessibilityRole === 'tab' &&
        typeof n.props.onPress === 'function',
    );
    const selected = tabs.map(t => t.props.accessibilityState.selected);
    expect(selected).toEqual([false, false, true, false]);
  });
});

// ── 2) Button / Pill announce themselves ──────────────────────────────────────
describe('primitives carry accessibility labels', () => {
  test('Button exposes its label to assistive tech', () => {
    const root = render(<Button label="러닝 시작" onPress={() => {}} />).root;
    const btn = root.find(
      (n: any) => n && n.props && n.props.accessibilityRole === 'button',
    );
    expect(btn.props.accessibilityLabel).toBe('러닝 시작');
  });

  test('Pill (status badge) is accessible with its label — color is not the only cue', () => {
    const root = render(<Pill tone="danger" label="교체" icon="warning" />).root;
    const pill = root.find(
      (n: any) => n && n.props && n.props.accessibilityLabel === '교체',
    );
    expect(pill.props.accessible).toBe(true);
    // The warning icon gives a non-color shape cue alongside the danger tone.
    expect(textOf(root)).toContain('교체');
  });
});

// ── 3) safeArea: no hard-coded paddingTop:60 anywhere ─────────────────────────
describe('safeArea — top spacing derives from insets, never a hard-coded 60', () => {
  // insets are mocked to {top:0,...} in jest.setup, so any surviving 60 would be
  // a literal hard-code (the bug this pass removes).
  test.each([
    ['Home', <HomeScreen shoes={SHOES} activeIdx={0} onSelect={() => {}} />],
    ['Shoes', <ShoesScreen shoes={SHOES} runs={[]} />],
    ['History', <HistoryScreen shoes={SHOES} runs={[]} />],
    ['Profile', <ProfileScreen />],
    ['AddShoe', <AddShoeScreen />],
    ['RunStart', <RunStart shoe={SHOES[0]} />],
  ])('%s screen has no paddingTop:60', (_name, el) => {
    const root = render(el as React.ReactElement).root;
    expect(paddingTops(root)).not.toContain(60);
  });
});

// ── 4) keep-going voice in empty states ───────────────────────────────────────
describe('empty-state copy speaks in the keep-going voice', () => {
  test('Home empty state encourages continuing the journey', () => {
    const root = render(<HomeScreen shoes={[]} onAddShoe={() => {}} />).root;
    expect(textOf(root)).toContain('계속 달릴 수 있어요');
  });
});
