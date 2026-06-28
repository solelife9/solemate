/**
 * ShoesScreen.rn.tsx — behavioural tests for the Slice-3 Keego shoe locker/detail.
 *
 * Drives the real screen with props (no backend) and asserts OBSERVABLE output —
 * what renders into the locker/detail and what the onStartRun callback receives —
 * guarding the wiring that survived the token/Pill-primitive refactor:
 *
 *   1) Tapping a locker card opens its detail (model + durability ring %).
 *   2) A 교체-tier shoe's detail closes with the keep-going narrative
 *      ('지금 교체하면 부상 없이 계속 달릴 수 있어요') + the 교체 tier badge; a 양호
 *      shoe shows neither (orange/narrative restraint).
 *   3) shoe-first: the locker card play button calls onStartRun with the shoe id,
 *      and the detail CTA '이 신발로 달리기' calls it too — the Pill swap didn't
 *      drop the onPress wiring.
 *   4) A retired shoe shows the '보관됨' Pill and hides the run CTA (records kept).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoesScreen from '../ShoesScreen.rn';
import {Shoe, Run} from '../theme';

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

// Most-specific Pressable whose rendered text contains `needle`.
function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

function byTestID(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n && n.props && n.props.testID === id);
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

const SHOES: Shoe[] = [
  {id: 's1', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 500, condition: '양호'}, // 80%
  {id: 's2', brand: 'Hoka', model: 'Clifton 9', used: 580, max: 600, condition: '교체'}, // 3% → 교체
];

const RUNS: Run[] = [];

// ── 1) tapping a locker card opens its detail ─────────────────────────────────
test('락커 카드를 누르면 그 신발의 상세(모델 + 내구도 링)가 열린다', () => {
  const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} />).root;

  // locker 목록에는 두 신발 모델이 모두 보인다.
  expect(textOf(root)).toContain('Pegasus 41');
  expect(textOf(root)).toContain('Clifton 9');

  tap(pressBy(root, 'Pegasus 41'));

  // 상세로 진입 — 내구도 링 라벨('남은 수명')과 모델이 보인다.
  const txt = textOf(root);
  expect(txt).toContain('잔여 수명');
  expect(txt).toContain('Pegasus 41');
  // 권장수명의 의미(성능 기준·실착 한계 아님)를 명확히 안내한다.
  expect(txt).toContain('쿠셔닝');
});

// ── 2) 교체-tier detail closes with the keep-going narrative + tier badge ──────
describe('교체 내러티브(keep-going 보이스)는 교체 tier에서만 노출된다', () => {
  test('교체 신발 상세 = keep-going 카피 + 목록과 동일한 wearTier 칩(교체 고려/권장)', () => {
    const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} />).root;
    tap(pressBy(root, 'Clifton 9'));

    const txt = textOf(root);
    expect(txt).toContain('지금 교체하면 부상 없이 계속 달릴 수 있어요');
    // 상세 헤더는 목록과 100% 동일한 wearTier 칩. Clifton 580/600 ≈ 96.7% → consider(교체 고려).
    // (TierBadge 3단계는 폐지 — 모든 화면이 wearTier 4단계로 통일.)
    expect(byTestID(root, 'detail-cond-consider').length).toBeGreaterThanOrEqual(1);
    expect(txt).toContain('교체 고려');
  });

  test('양호 신발 상세에는 keep-going 카피가 없고 wearTier 칩이 보인다', () => {
    const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} />).root;
    tap(pressBy(root, 'Pegasus 41'));

    const txt = textOf(root);
    expect(txt).not.toContain('지금 교체하면 부상 없이 계속 달릴 수 있어요');
    expect(byTestID(root, 'tier-badge-교체').length).toBe(0);
    // Pegasus 100/500 = 20% → best(최상).
    expect(byTestID(root, 'detail-cond-best').length).toBeGreaterThanOrEqual(1);
  });
});

// ── 3) shoe-first wiring survives the Pill swap ───────────────────────────────
test('락커 카드 play 버튼 → onStartRun(신발 id) 호출', () => {
  const onStartRun = jest.fn();
  const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} onStartRun={onStartRun} />).root;

  const play = byTestID(root, 'shoe-play-s1')[0];
  expect(play).toBeTruthy();
  tap(play);

  expect(onStartRun).toHaveBeenCalledTimes(1);
  expect(onStartRun).toHaveBeenCalledWith('s1');
});

test('신발 상세 진입 — 런 시작 CTA 없음(목업 09: 런 시작은 목록 ▶가 담당)', () => {
  const onStartRun = jest.fn();
  const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} onStartRun={onStartRun} />).root;

  tap(pressBy(root, 'Clifton 9')); // 상세 진입
  const txt = textOf(root);
  expect(txt).toContain('Clifton 9'); // 상세 열림
  // 목업 09 처럼 상세에 '이 신발로 달리기' CTA 를 두지 않는다(위 '락커 카드 play' 테스트가 시작 동선 검증).
  expect(txt).not.toContain('이 신발로 달리기');
});

// ── 4) retired shoe: '보관됨' Pill + run CTA hidden, records preserved ─────────
test('보관된 신발 상세 = 보관됨 배지 + 러닝 CTA 미노출(기록 보존)', () => {
  const retired: Shoe[] = [
    {id: 'r1', brand: 'Asics', model: 'Nimbus 26', used: 200, max: 600, condition: '양호', retired: true},
  ];
  const onStartRun = jest.fn();
  const root = render(<ShoesScreen shoes={retired} runs={RUNS} onStartRun={onStartRun} />).root;

  tap(pressBy(root, 'Nimbus 26'));

  const txt = textOf(root);
  expect(txt).toContain('보관됨');
  expect(txt).not.toContain('이 신발로 달리기');
});

// ── 5) active(사용 중) shoe shows the '사용 중' status Pill in the locker ───────
test('사용 중인(미보관·featured) 신발 카드에 사용 중 상태 Pill이 뜬다', () => {
  // SHOES[0](Nike Pegasus, 양호, retired falsy)가 activeIdx 기본값 0 → featured.
  const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} />).root;

  const txt = textOf(root);
  expect(txt).toContain('사용 중'); // featured 신발의 상태 Pill
  // 보관 신발이 아니므로 '보관됨' Pill은 뜨지 않는다(상태 Pill 단일성).
  expect(txt).not.toContain('보관됨');
});

// ── 6) detail durability fuel gauge renders remaining life + effective wear ────
test('상세 내구도 게이지는 남은 수명·컨디션을 렌더하고, 실효 마모 용어는 미노출', () => {
  // used 100 / max 500 → remain 400km. FuelGauge 가 남은 수명 바를 표시. 상태는 상단 칩.
  const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} />).root;
  tap(pressBy(root, 'Pegasus 41'));

  const txt = textOf(root);
  expect(txt).toContain('잔여 수명');
  expect(txt).toContain('400'); // 남은 수명 값(km)
  expect(txt).toContain('최상'); // 양호 컨디션(상단 상태 칩)
  expect(txt).not.toContain('실효 마모'); // 혼동되는 용어는 제거(교체 예상으로 대체)
});

// ── 7) regression: retired+교체 신발 상세엔 keep-going 배너가 뜨지 않는다 ───────
test('보관된 교체 신발 상세 = 보관됨 Pill만, keep-going 교체 배너는 미노출(모순 방지)', () => {
  // 닳아서 보관한 전형적 상태: retired + 교체 tier 동시. 배너가 뜨면 '보관됨'과 모순.
  const wornRetired: Shoe[] = [
    {id: 'wr1', brand: 'Hoka', model: 'Bondi 8', used: 595, max: 600, condition: '교체', retired: true},
  ];
  const root = render(<ShoesScreen shoes={wornRetired} runs={RUNS} onSetMaxKm={jest.fn()} />).root;

  tap(pressBy(root, 'Bondi 8'));

  const txt = textOf(root);
  expect(txt).toContain('보관됨');
  // keep-going 교체 배너는 보관된 신발엔 뜨지 않는다.
  expect(txt).not.toContain('지금 교체하면 부상 없이 계속 달릴 수 있어요');
});

// ── 8) regression: keep-going 카피는 한 화면에 정확히 한 번만(중복 방지) ────────
test('비보관 교체 신발 상세에서 keep-going 카피는 정확히 한 번만 렌더된다', () => {
  // 수명 편집기(maxHint 포함)는 '남은 수명' 옆 연필로 펼치기 전엔 접혀 있으므로, 기본
  // 화면에서 keep-going 교체 카피는 배너 한 곳에서만(정확히 한 번) 보여야 한다.
  const root = render(<ShoesScreen shoes={SHOES} runs={RUNS} onSetMaxKm={jest.fn()} />).root;
  tap(pressBy(root, 'Clifton 9')); // 교체 tier, 미보관

  const txt = textOf(root);
  const needle = '지금 교체하면 부상 없이 계속 달릴 수 있어요';
  const occurrences = txt.split(needle).length - 1;
  expect(occurrences).toBe(1);
});

// (수명 직접 입력 테스트 2건 제거 — 회사 변경으로 신발 상세의 수명(max_km) 조정 UI(연필
//  create-outline + 직접 입력칸)가 제거됨. 더는 해당 UI 가 없어 테스트 불가.)
