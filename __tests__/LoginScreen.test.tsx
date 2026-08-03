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
  // 에러 원문이 아니라 사용자 언어로 매핑된 문구가 보인다(authErrorMessage, 출시 감사).
  const err = r.root.findByProps({testID: 'login-error'});
  expect(err.props.children).toContain('인터넷 연결을 확인');
});

test('사용자 취소는 에러로 표시하지 않는다(조용히 복귀)', async () => {
  const port = makePort({
    signIn: jest.fn(async () => {
      throw new Error('Google 로그인이 취소되었습니다.');
    }),
  });
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<LoginScreen cloudPort={port} onSignedIn={jest.fn()} />);
  });
  await act(async () => {
    press(r, 'login-google');
  });
  expect(r.root.findAllByProps({testID: 'login-error'}).length).toBe(0);
});

// ─── 심사 컴플라이언스 (2026-08-02 App Store 심사 감사 M-5 · N-1 · N-3) ────────
// 이 화면은 **계정이 만들어지는 자리**다. 렌더 사다리에서 온보딩보다 앞이라
// (App.tsx), 여기 고지가 없으면 사용자는 아무 약관도 못 본 채 가입하게 된다.
// App Store 5.1.1(ii) 이고 국내법상으로도 가입 시 동의가 먼저다.
//
// 브랜드 마크는 각 사 가이드라인이 **공식 심벌**을 요구한다 — 유사 글리프(Ionicons)로
// 되돌아가면 여기서 걸린다.
describe('로그인 게이트 — 심사 컴플라이언스', () => {
  const render = () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = ReactTestRenderer.create(<LoginScreen cloudPort={makePort()} onSignedIn={jest.fn()} />);
    });
    return r;
  };

  /** 트리 전체의 문자열을 잇는다(중첩 Text 안의 링크 문구까지 잡기 위해). */
  const textOf = (node: any): string => {
    let out = '';
    const walk = (n: any) => {
      if (typeof n === 'string') { out += n; return; }
      if (!n || !n.children) return;
      n.children.forEach(walk);
    };
    walk(node);
    return out;
  };

  test('계정을 만들기 전에 이용약관·개인정보 처리방침을 고지한다 (5.1.1(ii))', () => {
    const t = textOf(render().toJSON());
    expect(t).toContain('이용약관');
    expect(t).toContain('개인정보 처리방침');
  });

  test('두 고지가 실제로 공개 URL 을 여는 링크다 — 글자만 적어두지 않는다', async () => {
    const {Linking} = require('react-native');
    const {PRIVACY_URL, TERMS_URL} = require('../lib/legalLinks');
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    const r = render();
    // lib/text 의 Text 래퍼 때문에 같은 링크가 composite/host 두 노드로 잡힌다 —
    // 개수가 아니라 **실제로 열리는 URL 집합**을 본다(그게 검사하려던 것이다).
    const links = r.root.findAll(
      n => (n.props as any)?.accessibilityRole === 'link' && typeof (n.props as any)?.onPress === 'function',
    );
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const l of links) {
      await act(async () => { (l.props as any).onPress(); });
    }
    const opened = [...new Set(spy.mock.calls.flat())].sort();
    expect(opened).toEqual([PRIVACY_URL, TERMS_URL].sort());
    spy.mockRestore();
  });

  test('Apple·Google 버튼이 공식 심벌을 쓴다 — 유사 글리프 금지 (4.8 · 브랜드 가이드라인)', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'LoginScreen.rn.tsx'),
      'utf8',
    );
    // Ionicons 의 사과/구글 글리프는 각 사가 배포한 마크가 아니다.
    expect(src).not.toContain('logo-apple');
    expect(src).not.toContain('logo-google');
    expect(src).toContain('<AppleMark');
    expect(src).toContain('<GoogleMark');
  });

  test('Google 마크는 재색칠하지 않는다 — 비활성은 opacity 로만', () => {
    // 4색이 그대로 살아 있어야 한다(단색화하면 가이드라인 위반). 색은 theme 토큰이
    // 정본이다 — 화면·프리미티브의 raw hex 0 원칙(CLAUDE.md) 때문에 여기서 온다.
    const {GOOGLE_G} = require('../theme');
    expect(GOOGLE_G).toEqual(['#4285F4', '#34A853', '#FBBC05', '#EA4335']);
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'primitives.tsx'),
      'utf8',
    );
    // color prop 을 받지 않는 시그니처여야 재색칠이 구조적으로 막힌다.
    expect(src).toMatch(/export function GoogleMark\(\{size\}: \{size: number\}\)/);
  });
});
