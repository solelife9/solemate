/**
 * ToastHost — 스낵바 호스트 컴포넌트 행동 테스트.
 *
 * 관찰 가능한 렌더/상호작용을 단언한다: showToast 후 메시지가 실제 트리에 렌더되는가,
 * actionLabel 이 있으면 오렌지(ACCENT) 액션 버튼이 그려지는가, 그 버튼을 탭하면 onAction 이
 * 호출되는가, actionLabel 이 없으면 버튼이 없는가, 토스트가 없을 땐 아무것도 렌더하지 않는가.
 *
 * @format
 */

import React from 'react';
import {Text, StyleSheet} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import ToastHost from '../ToastHost';
import {showToast, dismissToast, getCurrentToast, TOAST_UNDO_LABEL} from '../lib/toast';
import {ACCENT} from '../theme';

// 생성한 렌더러를 모아 afterEach 에서 언마운트한다 — 언마운트하지 않으면 입/퇴장 Animated
// 콜백이 테스트 종료 후(환경 teardown 뒤) setToast 를 호출해 비동기 경고를 낸다.
const rendered: ReactTestRenderer.ReactTestRenderer[] = [];
function render(): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(<ToastHost />);
  });
  rendered.push(r);
  return r;
}

// 액션 버튼(접근성 role=button)을 찾는다. RN Pressable 은 타입으로 못 잡으므로 prop 으로 찾는다.
const findActionButton = (root: ReactTestRenderer.ReactTestInstance) =>
  root.find((n: any) => n && n.props && n.props.accessibilityRole === 'button');

const textChildren = (root: ReactTestRenderer.ReactTestInstance): string[] =>
  root.findAllByType(Text).map(t => t.props.children);

afterEach(() => {
  // durationMs:0 으로 자동 dismiss 를 끄고 띄우므로 명시적으로 정리한다(모듈 전역 상태 격리).
  // 렌더러를 모두 언마운트해 입/퇴장 Animated 콜백이 teardown 이후로 새지 않게 한다.
  ReactTestRenderer.act(() => {
    dismissToast();
  });
  while (rendered.length) {
    const r = rendered.pop()!;
    ReactTestRenderer.act(() => r.unmount());
  }
});

describe('렌더', () => {
  test('초기(토스트 없음)에는 아무것도 렌더하지 않는다(null)', () => {
    const r = render();
    expect(r.toJSON()).toBeNull();
  });

  test('showToast 후 메시지가 트리에 렌더된다', () => {
    const r = render();
    ReactTestRenderer.act(() => {
      showToast({message: '러닝 기록이 저장됐어요', durationMs: 0});
    });
    expect(textChildren(r.root)).toContain('러닝 기록이 저장됐어요');
  });

  test('actionLabel 이 없으면 액션 버튼이 그려지지 않는다', () => {
    const r = render();
    ReactTestRenderer.act(() => {
      showToast({message: '저장됨', durationMs: 0});
    });
    const buttons = r.root.findAll(
      (n: any) => n && n.props && n.props.accessibilityRole === 'button',
    );
    expect(buttons).toHaveLength(0);
  });
});

describe('undo 액션', () => {
  test("actionLabel='실행취소' 면 오렌지(ACCENT) 액션 버튼이 라벨과 함께 그려진다", () => {
    const r = render();
    ReactTestRenderer.act(() => {
      showToast({
        message: '신발을 삭제했어요',
        actionLabel: TOAST_UNDO_LABEL,
        onAction: () => {},
        durationMs: 0,
      });
    });
    // 액션 라벨이 렌더된다.
    expect(textChildren(r.root)).toContain(TOAST_UNDO_LABEL);
    // 라벨 색이 ACCENT(오렌지) 토큰이다.
    const labelNode = r.root
      .findAllByType(Text)
      .find(t => t.props.children === TOAST_UNDO_LABEL)!;
    expect(StyleSheet.flatten(labelNode.props.style).color).toBe(ACCENT);
  });

  test('액션 버튼을 탭하면 onAction 이 호출되고 토스트가 사라진다', () => {
    const onAction = jest.fn();
    const r = render();
    ReactTestRenderer.act(() => {
      showToast({
        message: '신발을 삭제했어요',
        actionLabel: TOAST_UNDO_LABEL,
        onAction,
        durationMs: 0,
      });
    });

    const btn = findActionButton(r.root);
    ReactTestRenderer.act(() => {
      btn.props.onPress();
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    // 탭 후 토스트는 닫힌다(store 의 current 가 비워져 호스트가 퇴장 후 제거한다).
    expect(getCurrentToast()).toBeNull();
  });
});
