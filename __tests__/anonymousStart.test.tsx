// anonymousStart.test.tsx — 로그인 없이 시작(익명) 경로 (2026-07-30)
//
// 왜: keego 의 핵심(러닝 기록·신발 수명)은 기기 안에서 완결되고 클라우드 동기는 uid 가
// 없으면 조용히 건너뛴다. 그런데 첫 화면이 소셜 로그인 4개를 강제하고 있었다 —
// 이탈의 최대 단일 요인이자 "계정 기반 기능이 핵심이 아니면 로그인 없이 쓸 수 있게
// 하라"는 심사 지침에 걸릴 수 있는 형태였다.
//
// 고정하는 것: 익명 시작 버튼이 존재하고, 누르면 anonymous provider 로 로그인해 게이트가
// 열린다. 그리고 **그게 무엇을 뜻하는지 화면이 정직하게 말한다**(기기에만 저장된다는 고지).

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {LoginScreen} from '../LoginScreen.rn';
import type {CloudPort, CloudProvider} from '../lib/cloudPort';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

const makePort = (signIn: jest.Mock): CloudPort =>
  ({
    signIn,
    signOut: jest.fn(async () => {}),
    deleteAccount: jest.fn(async () => {}),
    pull: jest.fn(async () => null),
    push: jest.fn(async () => {}),
  } as unknown as CloudPort);

describe('로그인 없이 시작(익명)', () => {
  test('버튼이 있고, 누르면 anonymous 로 로그인해 게이트가 열린다', async () => {
    const signIn = jest.fn(async (p: CloudProvider) => ({uid: 'anon-1', email: null, displayName: null}));
    const onSignedIn = jest.fn();
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<LoginScreen cloudPort={makePort(signIn)} onSignedIn={onSignedIn} />);
    });

    const btn = r.root.findAll(
      (n: any) => n?.props?.testID === 'login-anonymous' && typeof n.props.onPress === 'function',
    )[0];
    expect(btn).toBeTruthy();

    await act(async () => {
      btn.props.onPress();
    });

    expect(signIn).toHaveBeenCalledWith('anonymous');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onSignedIn.mock.calls[0][0].uid).toBe('anon-1');

    await act(async () => {
      r.unmount();
    });
  });

  test('기기에만 저장된다는 사실을 화면이 고지한다(과장 금지)', async () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(
        <LoginScreen cloudPort={makePort(jest.fn())} onSignedIn={jest.fn()} />,
      );
    });
    const screen = textOf(r.root);
    // 로그인 없이 쓰면 이 기기에만 남는다는 것과, 나중에 옮길 수 있다는 것 둘 다 말해야 한다.
    expect(screen).toMatch(/이 기기에만/);
    expect(screen).toMatch(/나중에 로그인하면/);
    await act(async () => {
      r.unmount();
    });
  });
});
