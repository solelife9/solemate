/**
 * ShoesScreen 은퇴 키프세이크 트리거 동작 테스트(Slice B · UI 배선).
 *
 * 관찰 가능한 효과:
 *   1) 수명 도달(교체) 신발 상세에 [계속 사용]/[은퇴] 트리거가 뜬다(rawShoe+ctx 주입 시).
 *   2) 수명 도달이어도 마운트만으로는 절대 자동 은퇴되지 않는다 — onRetire 미호출.
 *   3) [계속 사용]을 누르면 트리거가 접힌다(은퇴 안 함 — 사용자 제어).
 *   4) [은퇴]를 누르면 3스텝 회고 플로우가 열린다(아직 은퇴 아님 — 확정 전 onRetire 0).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ShoesScreen from '../ShoesScreen.rn';
import {buildContext} from '../lib/progression/context';
import type {Shoe} from '../theme';

const UI_SHOE: Shoe = {
  id: 's1',
  brand: 'Nike',
  model: 'Pegasus 40',
  used: 590,
  max: 600,
  condition: '교체', // 권장 수명 도달
};
const RAW_SHOE: BackendShoe = {id: 's1', name: 'Nike Pegasus 40', max_km: 600, total_km: 590};

function ctxOf() {
  return buildContext([], [RAW_SHOE], [], null, Date.UTC(2026, 5, 13), []);
}

function render(el: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(el);
  });
  return renderer;
}

function has(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  return root.findAll((n: any) => n.props?.testID === testID).length > 0;
}
function press(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  const node = root.find((n: any) => n.props?.testID === testID);
  act(() => {
    node.props.onPress();
  });
}

function renderDetail(extra: Record<string, unknown> = {}) {
  return render(
    <ShoesScreen
      shoes={[UI_SHOE]}
      runs={[]}
      totals={{0: {totalRuns: 3, totalTime: '3:00:00', avgPace: "5'00\""}}}
      unit="km"
      rawShoes={[RAW_SHOE]}
      rawRuns={[]}
      progressionCtx={ctxOf()}
      now={Date.UTC(2026, 5, 13)}
      detailShoeId="s1"
      onConsumeDetail={() => {}}
      {...extra}
    />,
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('ShoesScreen — 은퇴 키프세이크 트리거(사용자 제어)', () => {
  test('수명 도달 신발 상세에 [계속 사용]/[은퇴] 트리거가 뜬다', () => {
    const r = renderDetail();
    expect(has(r.root, 'retire-keepsake-trigger')).toBe(true);
    expect(has(r.root, 'retire-keep-using')).toBe(true);
    expect(has(r.root, 'retire-open-flow')).toBe(true);
  });

  test('마운트만으로는 절대 자동 은퇴되지 않는다(onRetire 미호출)', () => {
    const onRetire = jest.fn();
    renderDetail({onRetire});
    expect(onRetire).not.toHaveBeenCalled();
  });

  test('[계속 사용]을 누르면 트리거가 접힌다(은퇴 안 함)', () => {
    const onRetire = jest.fn();
    const r = renderDetail({onRetire});
    press(r.root, 'retire-keep-using');
    expect(has(r.root, 'retire-keepsake-trigger')).toBe(false);
    expect(onRetire).not.toHaveBeenCalled();
  });

  test('[은퇴]를 누르면 회고 플로우가 열리되, 확정 전까지 은퇴되지 않는다', () => {
    const onRetire = jest.fn();
    const r = renderDetail({onRetire});
    press(r.root, 'retire-open-flow');
    // 플로우가 열렸다(닫기/다음 버튼 존재) — 아직 확정 아님.
    expect(has(r.root, 'retire-flow-next-0')).toBe(true);
    expect(onRetire).not.toHaveBeenCalled();
  });

  test('정상 수명 신발에는 키프세이크 트리거가 없다', () => {
    const healthy: Shoe = {...UI_SHOE, used: 100, condition: '양호'};
    const r = render(
      <ShoesScreen
        shoes={[healthy]}
        runs={[]}
        totals={{0: {totalRuns: 1, totalTime: '30:00', avgPace: "5'00\""}}}
        unit="km"
        rawShoes={[RAW_SHOE]}
        rawRuns={[]}
        progressionCtx={ctxOf()}
        detailShoeId="s1"
        onConsumeDetail={() => {}}
      />,
    );
    expect(has(r.root, 'retire-keepsake-trigger')).toBe(false);
  });
});
