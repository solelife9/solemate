/**
 * 은퇴 플로우 — 보관 완료(스텝 4)와 '다음 신발' 초대의 위치.
 *
 * 이 플로우의 설계 계약은 하나다: **작별과 쇼핑을 시간으로 분리한다.**
 * 작별 화면(0~2)과 키프세이크 카드(3)에는 구매 동선이 없고, 보관이 끝난 뒤에야
 * 다음 신발 이야기를 꺼낸다. 이 테스트는 그 경계가 무너지지 않게 지킨다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RetirementFlow from '../RetirementFlow.rn';
import {buildContext} from '../lib/progression/context';

const NOW = Date.UTC(2026, 5, 13);

const SHOE: BackendShoe = {id: 's1', name: 'Nike Pegasus 40', max_km: 600, total_km: 590};
const RUNS: BackendRun[] = [
  {id: 'r1', shoe_id: 's1', km: 43, run_date: '2026-01-05', duration: 3 * 3600},
  {id: 'r2', shoe_id: 's1', km: 10, run_date: '2026-02-10', duration: 3000},
];

function ctxOf() {
  return buildContext(RUNS, [SHOE], [], null, NOW, []);
}

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') { out += String(n); return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(el: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => { renderer = ReactTestRenderer.create(el); });
  return renderer;
}

// testID 는 Pressable 과 그 안쪽 노드에 함께 실릴 수 있어 find(단일 매치 강제) 대신
// findAll 로 받아 onPress 를 가진 첫 노드를 누른다.
function press(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  const nodes = root.findAll(
    (n: any) => n.props && n.props.testID === testID && typeof n.props.onPress === 'function',
  );
  if (!nodes.length) throw new Error(`no pressable with testID "${testID}"`);
  act(() => { nodes[0].props.onPress(); });
}

function has(root: ReactTestRenderer.ReactTestInstance, testID: string): boolean {
  return root.findAll((n: any) => n.props && n.props.testID === testID).length > 0;
}

/** 작별(0~2) → 은퇴 확정 → 카드(3) → 완료 → 보관 완료(4) 까지 진행한다. */
function advanceToArchived(root: ReactTestRenderer.ReactTestInstance) {
  press(root, 'retire-flow-next-0');
  press(root, 'retire-flow-next-1');
  press(root, 'retire-flow-commit');
  press(root, 'retire-flow-done');
}

beforeEach(async () => { await AsyncStorage.clear(); });

describe('작별 구간에는 쇼핑 동선이 없다', () => {
  test('스텝 0~3 어디에도 다음 신발 버튼이 없다', async () => {
    const onFindNextShoe = jest.fn();
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW}
        onFindNextShoe={onFindNextShoe} onClose={jest.fn()} />,
    );
    // 스텝 0 (확인)
    expect(has(r.root, 'retire-flow-next-shoe')).toBe(false);
    press(r.root, 'retire-flow-next-0');       // 1 여정
    expect(has(r.root, 'retire-flow-next-shoe')).toBe(false);
    press(r.root, 'retire-flow-next-1');       // 2 하이라이트
    expect(has(r.root, 'retire-flow-next-shoe')).toBe(false);
    await act(async () => { press(r.root, 'retire-flow-commit'); }); // 3 카드
    expect(has(r.root, 'retire-flow-next-shoe')).toBe(false);
  });
});

describe('보관 완료(스텝 4)', () => {
  test('카드에서 완료를 누르면 보관 완료 화면이 뜬다(닫히지 않는다)', async () => {
    const onClose = jest.fn();
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW}
        onFindNextShoe={jest.fn()} onClose={onClose} />,
    );
    advanceToArchived(r.root);

    expect(has(r.root, 'retire-flow-archived')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    const txt = textOf(r.root.findAll((n: any) => n.props && n.props.testID === 'retire-flow-archived')[0]);
    // 무엇이 어디에 담겼는지 눈으로 확인시킨다 — '담았다'는 말만으로는 안 믿긴다.
    expect(txt).toContain('아카이브');
    expect(txt).toContain('Nike Pegasus 40');
    expect(txt).toContain('590km');
    // 화제 전환을 선으로 알리고, 명령이 아니라 질문으로 초대한다.
    expect(txt).toContain('다음 동행');
    expect(txt).toContain('찾아볼까요?');
  });

  test('여기서야 다음 신발 초대가 나오고, 거절하는 길도 같이 있다', async () => {
    const onFindNextShoe = jest.fn();
    const onClose = jest.fn();
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW}
        onFindNextShoe={onFindNextShoe} onClose={onClose} />,
    );
    advanceToArchived(r.root);

    expect(has(r.root, 'retire-flow-next-shoe')).toBe(true);
    expect(has(r.root, 'retire-flow-home')).toBe(true);

    press(r.root, 'retire-flow-next-shoe');
    expect(onFindNextShoe).toHaveBeenCalledTimes(1);
    // 초대를 눌러도 플로우가 임의로 닫히지 않는다(라우팅은 부모 몫).
    expect(onClose).not.toHaveBeenCalled();
  });

  test('홈으로를 누르면 플로우가 닫힌다', async () => {
    const onClose = jest.fn();
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW}
        onFindNextShoe={jest.fn()} onClose={onClose} />,
    );
    advanceToArchived(r.root);
    press(r.root, 'retire-flow-home');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('onFindNextShoe 가 없으면 초대 버튼을 아예 렌더하지 않는다', async () => {
    const onClose = jest.fn();
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW} onClose={onClose} />,
    );
    advanceToArchived(r.root);

    // 눌러도 안 되는 버튼은 두지 않는다 — 대신 '홈으로'만 남는다.
    expect(has(r.root, 'retire-flow-next-shoe')).toBe(false);
    expect(has(r.root, 'retire-flow-home')).toBe(true);
    press(r.root, 'retire-flow-home');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('진행 표시가 5단계로 늘어난다', () => {
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW} onClose={jest.fn()} />,
    );
    const dots = r.root.findAll(
      (n: any) => n.props && typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.includes('단계 중'),
    )[0];
    expect(dots.props.accessibilityLabel).toBe('5단계 중 1');
  });
});
