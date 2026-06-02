/**
 * injury.warning.test.tsx — Slice-4 부상예방 경고의 행동(렌더) 테스트.
 *
 * 순수 등급 로직(assessInjuryRisk)은 tests/acceptance/slice-4-features 가 검증한다.
 * 여기서는 실제 화면(Home 히어로 · Shoes 상세)이 마모도에 따라 경고 배너를
 * 노출/미노출하는 OBSERVABLE 결과를 단언한다:
 *
 *   1) HomeScreen 히어로: 높은 마모(>90%) 신발 → 위험 경고 배너 + keep-going 문구.
 *   2) HomeScreen 히어로: 낮은 마모(<75%) 신발 → 경고 배너 없음(안전 등급 미노출).
 *   3) ShoesScreen 상세: 높은 마모 신발 → 경고 배너 렌더 / 낮은 마모 → 없음.
 *   4) 보관(retired) 신발은 마모가 높아도 경고를 노출하지 않는다(보관됨과 모순 방지).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HomeScreen from '../HomeScreen.rn';
import ShoesScreen from '../ShoesScreen.rn';
import {Shoe, Run} from '../theme';
import {INJURY_HIGH_MSG} from '../lib/injury';

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

// testID 가 prefix 로 시작하는 노드를 모두 찾는다(injury-banner-high|caution).
function byTestIDPrefix(root: ReactTestRenderer.ReactTestInstance, prefix: string) {
  return root.findAll(
    (n: any) => n && n.props && typeof n.props.testID === 'string' && n.props.testID.startsWith(prefix),
  );
}

function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

function tap(node: ReactTestRenderer.ReactTestInstance) {
  act(() => {
    node.props.onPress();
  });
}

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

const HIGH: Shoe = {id: 's-high', brand: 'Hoka', model: 'Clifton 9', used: 580, max: 600, condition: '교체'}; // 96.7% used → high
const LOW: Shoe = {id: 's-low', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 500, condition: '양호'}; // 20% used → safe
const RUNS: Run[] = [];

// ── 1) Home 히어로: 높은 마모 → 위험 경고 배너 + keep-going 문구 ────────────────
test('HomeScreen 히어로: 높은 마모 신발은 위험 경고 배너를 렌더한다', () => {
  const root = render(<HomeScreen shoes={[HIGH]} activeIdx={0} onSelect={jest.fn()} />).root;

  const banners = byTestIDPrefix(root, 'injury-banner');
  expect(banners.length).toBeGreaterThanOrEqual(1);
  expect(byTestIDPrefix(root, 'injury-banner-high').length).toBeGreaterThanOrEqual(1);
  // keep-going 보이스 한국어 안내 문구가 실제로 화면에 보인다.
  expect(textOf(root)).toContain(INJURY_HIGH_MSG);
});

// ── 2) Home 히어로: 낮은 마모 → 경고 배너 없음(안전 등급 미노출) ────────────────
test('HomeScreen 히어로: 낮은 마모 신발은 경고 배너를 노출하지 않는다', () => {
  const root = render(<HomeScreen shoes={[LOW]} activeIdx={0} onSelect={jest.fn()} />).root;

  expect(byTestIDPrefix(root, 'injury-banner').length).toBe(0);
  expect(textOf(root)).not.toContain(INJURY_HIGH_MSG);
});

// ── 3) Shoes 상세: 높은 마모 → 경고 배너, 낮은 마모 → 없음 ─────────────────────
test('ShoesScreen 상세: 높은 마모 신발 상세에 경고 배너가 렌더된다', () => {
  const root = render(<ShoesScreen shoes={[HIGH]} runs={RUNS} />).root;
  tap(pressBy(root, 'Clifton 9')); // 상세 진입

  expect(byTestIDPrefix(root, 'injury-banner-high').length).toBeGreaterThanOrEqual(1);
  expect(textOf(root)).toContain(INJURY_HIGH_MSG);
});

test('ShoesScreen 상세: 낮은 마모 신발 상세에는 경고 배너가 없다', () => {
  const root = render(<ShoesScreen shoes={[LOW]} runs={RUNS} />).root;
  tap(pressBy(root, 'Pegasus 41')); // 상세 진입

  expect(byTestIDPrefix(root, 'injury-banner').length).toBe(0);
});

// ── 4) 보관 신발: 마모가 높아도 경고 미노출(보관됨 상태와 모순 방지) ─────────────
test('보관된 고마모 신발은 경고 배너를 노출하지 않는다', () => {
  const wornRetired: Shoe[] = [
    {id: 'r1', brand: 'Hoka', model: 'Bondi 8', used: 595, max: 600, condition: '교체', retired: true},
  ];
  const root = render(<ShoesScreen shoes={wornRetired} runs={RUNS} />).root;
  tap(pressBy(root, 'Bondi 8'));

  const txt = textOf(root);
  expect(txt).toContain('보관됨');
  expect(byTestIDPrefix(root, 'injury-banner').length).toBe(0);
  expect(txt).not.toContain(INJURY_HIGH_MSG);
});
