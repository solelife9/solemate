/**
 * ErrorBoundary 행동 검증: 자식이 렌더 중 throw 하면 백스크린(빈 화면) 대신
 * 한국어 폴백 + 재시도 버튼을 그려야 한다. 재시도 시 에러가 해소되면 다시 자식을
 * 마운트해 정상 화면을 보여준다.
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import ErrorBoundary from '../ErrorBoundary';

// 렌더에서 던지는 자식 — error boundary 가 잡지 못하면 create() 자체가 throw 한다.
function Boom(): React.ReactElement {
  throw new Error('child exploded');
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(n => {
    const c = n.props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  });
}

// React 가 boundary 로 잡은 에러를 console.error 로 보고하므로, 테스트 출력 소음을
// 줄이기 위해 스파이로 가린다(검증 대상은 폴백 렌더이지 로그가 아니다).
let errSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
});

test('자식이 throw 하면 한국어 폴백을 렌더한다 (백스크린 방지)', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
  });

  const all = texts(tree);
  // 관찰 가능한 결과: 폴백 문구 + 재시도 버튼이 실제로 화면에 존재한다.
  expect(all).toContain('문제가 발생했어요');
  expect(all).toContain('다시 시도');
  // 폴백 컨테이너가 마운트됐는지 testID 로 확인.
  expect(tree.root.findByProps({testID: 'error-fallback'})).toBeTruthy();
});

test('정상 자식은 그대로 통과시키고 폴백을 그리지 않는다', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <ErrorBoundary>
        <Text>정상 화면</Text>
      </ErrorBoundary>,
    );
  });

  const all = texts(tree);
  expect(all).toContain('정상 화면');
  expect(all).not.toContain('문제가 발생했어요');
});

test('재시도를 누르면 에러가 해소된 자식을 다시 마운트해 정상 화면을 보여준다', () => {
  // 외부 플래그로 첫 렌더는 throw, 재시도 후 렌더는 성공하게 한다.
  let shouldThrow = true;
  function Maybe(): React.ReactElement {
    if (shouldThrow) {
      throw new Error('temporary failure');
    }
    return <Text>복구된 화면</Text>;
  }

  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    );
  });

  // 먼저 폴백이 떠 있어야 한다.
  expect(texts(tree)).toContain('문제가 발생했어요');

  // 에러 원인을 제거하고 재시도 버튼을 누른다.
  shouldThrow = false;
  act(() => {
    tree.root.findByProps({testID: 'error-retry'}).props.onPress();
  });

  const all = texts(tree);
  expect(all).toContain('복구된 화면');
  expect(all).not.toContain('문제가 발생했어요');
});
