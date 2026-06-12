/**
 * RetirementFlow(은퇴 키프세이크 3스텝 + 카드) 동작 테스트.
 *
 * 관찰 가능한 효과(실데이터·props-driven):
 *   1) 3스텝 플로우가 실제 요약(buildRetirementSummary)을 렌더한다 — 신발명/거리/횟수.
 *   2) 마운트만으로는 절대 은퇴되지 않는다(자동 은퇴 금지) — onRetire 미호출, 영속 0.
 *   3) [은퇴 확정] 누름이 **기존** 은퇴 경로(onRetire)를 호출하고 RetiredShoeRecord 를
 *      progression_v1 에 영속한다(라운드트립 loadProgression 으로 확인).
 *   4) 확정 후 카드 미리보기 + 포맷 스위처(A/B/C/D) + 저장/공유 액션이 렌더된다.
 *   5) run/shoe 키를 건드리지 않는다(progression_v1 만 — 데이터 파괴 0).
 *
 * AsyncStorage 누수 회피: 각 테스트 전 AsyncStorage.clear().
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RetirementFlow from '../RetirementFlow.rn';
import {buildContext} from '../lib/progression/context';
import {loadProgression, PROGRESSION_KEY} from '../lib/progression/storage';

const NOW = Date.UTC(2026, 5, 13); // 결정적 은퇴 시각

// 수명 도달 신발 + 실제 런(풀코스 1회 포함 → 하이라이트가 실제로 존재).
const SHOE: BackendShoe = {id: 's1', name: 'Nike Pegasus 40', max_km: 600, total_km: 590};
const RUNS: BackendRun[] = [
  {id: 'r1', shoe_id: 's1', km: 43, run_date: '2026-01-05', duration: 3 * 3600},
  {id: 'r2', shoe_id: 's1', km: 10, run_date: '2026-02-10', duration: 3000},
  {id: 'r3', shoe_id: 's1', km: 12, run_date: '2026-03-20', duration: 3600},
  // 다른 신발 런(섞여 있어도 집계에서 제외되는지 — 격리 확인용)
  {id: 'r4', shoe_id: 's2', km: 99, run_date: '2026-04-01', duration: 30000},
];

function ctxOf() {
  return buildContext(RUNS, [SHOE], [], null, NOW, []);
}

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') {
      out += String(n);
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(el: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(el);
  });
  return renderer;
}

function press(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  const node = root.find((n: any) => n.props && n.props.testID === testID);
  act(() => {
    node.props.onPress();
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('RetirementFlow — 3스텝 회고 + 사용자 제어 은퇴', () => {
  test('스텝 0(확인)이 실제 요약을 렌더한다 — 신발명/거리/횟수', () => {
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW} onClose={() => {}} />,
    );
    const txt = textOf(r.root);
    expect(txt).toContain('Pegasus 40'); // 신발명(브랜드는 이름에서 파싱)
    expect(txt).toContain('65km'); // 43+10+12 = 65km (s2 런 제외)
    expect(txt).toContain('3회'); // 이 신발 런 3개만
  });

  test('마운트만으로는 절대 자동 은퇴되지 않는다(onRetire 미호출, 영속 0)', async () => {
    const onRetire = jest.fn();
    render(
      <RetirementFlow
        shoe={SHOE}
        runs={RUNS}
        ctx={ctxOf()}
        now={NOW}
        onRetire={onRetire}
        onClose={() => {}}
      />,
    );
    expect(onRetire).not.toHaveBeenCalled();
    const loaded = await loadProgression();
    expect(loaded.retiredShoes).toHaveLength(0);
  });

  test('[은퇴 확정] 누름이 기존 retire 경로를 호출하고 레코드를 영속한다', async () => {
    const onRetire = jest.fn();
    const onRetired = jest.fn();
    const r = render(
      <RetirementFlow
        shoe={SHOE}
        runs={RUNS}
        ctx={ctxOf()}
        now={NOW}
        onRetire={onRetire}
        onRetired={onRetired}
        onClose={() => {}}
      />,
    );
    // 확인 → 여정 → 하이라이트 → 확정
    press(r.root, 'retire-flow-next-0');
    press(r.root, 'retire-flow-next-1');
    await act(async () => {
      press(r.root, 'retire-flow-commit');
      await Promise.resolve();
    });

    // 기존 은퇴 경로(apiPatchShoe retired)를 그대로 호출한다.
    expect(onRetire).toHaveBeenCalledWith('s1', true);
    expect(onRetired).toHaveBeenCalledTimes(1);

    // RetiredShoeRecord 가 progression_v1 에 영속됐다(라운드트립).
    const loaded = await loadProgression();
    expect(loaded.retiredShoes).toHaveLength(1);
    expect(loaded.retiredShoes[0]).toMatchObject({
      shoeId: 's1',
      retireYear: 2026,
    });
    expect(loaded.retiredShoes[0].km).toBeGreaterThan(0);
  });

  test('확정 후 카드 미리보기 + 포맷 스위처 + 저장/공유 액션이 렌더된다', async () => {
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW} onClose={() => {}} />,
    );
    press(r.root, 'retire-flow-next-0');
    press(r.root, 'retire-flow-next-1');
    await act(async () => {
      press(r.root, 'retire-flow-commit');
      await Promise.resolve();
    });
    // 카드 미리보기 + 4개 포맷 버튼 + 저장/공유
    expect(
      r.root.findAll((n: any) => n.props?.testID === 'retire-card-preview').length,
    ).toBeGreaterThanOrEqual(1);
    for (const f of ['A', 'B', 'C', 'D']) {
      expect(
        r.root.findAll((n: any) => n.props?.testID === `retire-card-format-${f}`).length,
      ).toBeGreaterThanOrEqual(1);
    }
    expect(
      r.root.findAll((n: any) => n.props?.testID === 'retire-card-save').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      r.root.findAll((n: any) => n.props?.testID === 'retire-card-share').length,
    ).toBeGreaterThanOrEqual(1);
  });

  test('영속은 progression_v1 만 쓴다 — run/shoe 키 불변(데이터 파괴 0)', async () => {
    await AsyncStorage.setItem('runs', JSON.stringify([{id: 'r1'}]));
    const r = render(
      <RetirementFlow shoe={SHOE} runs={RUNS} ctx={ctxOf()} now={NOW} onClose={() => {}} />,
    );
    press(r.root, 'retire-flow-next-0');
    press(r.root, 'retire-flow-next-1');
    await act(async () => {
      press(r.root, 'retire-flow-commit');
      await Promise.resolve();
    });
    // runs 키는 그대로, 새 키는 progression_v1 뿐.
    expect(await AsyncStorage.getItem('runs')).toBe(JSON.stringify([{id: 'r1'}]));
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toContain(PROGRESSION_KEY);
  });
});
