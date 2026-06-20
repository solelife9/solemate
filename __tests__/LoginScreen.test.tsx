/**
 * LoginScreen(필수 로그인 게이트) 동작 테스트.
 *
 * 관찰 가능한 효과(props-driven):
 *   1) 4개 소셜 로그인 버튼(카카오/네이버/구글/애플)을 렌더한다.
 *   2) 버튼을 누르면 주입된 cloudPort.signIn(provider) 을 그 provider 로 호출한다.
 *   3) 로그인 성공 시 onSignedIn(user) 을 인증 사용자로 호출한다(게이트 열림).
 *   4) 로그인 실패 시 onSignedIn 을 부르지 않고 에러 메시지를 표시한다.
 *
 * cloudPort 는 메모리 가짜로 주입 — 실제 firebase/네이티브 의존 없음.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {LoginScreen} from '../LoginScreen.rn';
import type {CloudPort, CloudProvider, CloudUser} from '../lib/cloudPort';

function makePort(over: Partial<CloudPort> = {}): CloudPort {
  return {
    signIn: jest.fn(async (p: CloudProvider): Promise<CloudUser> => ({uid: `${p}-uid`, email: null, displayName: null})),
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => {}),
    pull: jest.fn(async () => null),
    push: jest.fn(async () => {}),
    ...over,
  };
}

function press(root: ReactTestRenderer.ReactTestRenderer, testID: string) {
  const node = root.root.findByProps({testID});
  act(() => {
    node.props.onPress();
  });
}

test('4개 소셜 로그인 버튼을 렌더한다', () => {
  const port = makePort();
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<LoginScreen cloudPort={port} onSignedIn={() => {}} />);
  });
  for (const id of ['login-kakao', 'login-naver', 'login-google', 'login-apple']) {
    expect(r.root.findByProps({testID: id})).toBeTruthy();
  }
});

test('카카오 버튼을 누르면 cloudPort.signIn("kakao") 을 호출하고 성공 시 onSignedIn 한다', async () => {
  const port = makePort();
  const onSignedIn = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<LoginScreen cloudPort={port} onSignedIn={onSignedIn} />);
  });
  await act(async () => {
    press(r, 'login-kakao');
  });
  expect(port.signIn).toHaveBeenCalledWith('kakao');
  expect(onSignedIn).toHaveBeenCalledWith({uid: 'kakao-uid', email: null, displayName: null});
});

test('로그인 실패 시 onSignedIn 을 부르지 않고 에러를 표시한다', async () => {
  const port = makePort({
    signIn: jest.fn(async () => {
      throw new Error('네트워크 오류');
    }),
  });
  const onSignedIn = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<LoginScreen cloudPort={port} onSignedIn={onSignedIn} />);
  });
  await act(async () => {
    press(r, 'login-google');
  });
  expect(onSignedIn).not.toHaveBeenCalled();
  const err = r.root.findByProps({testID: 'login-error'});
  expect(err.props.children).toContain('네트워크 오류');
});
