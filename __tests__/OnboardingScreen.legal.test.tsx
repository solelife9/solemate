/**
 * 온보딩 첫 화면의 약관 동의 고지 계약.
 *
 * 왜 테스트하는가: 이 문구가 **동의를 받는 지점**이다. 위치정보법은 개인위치정보 처리에
 * 일반 이용약관과 구분되는 별도 동의를 요구하므로(2026-07-26 출시 심사 B-04), 위치기반서비스
 * 약관을 이름으로 밝히는 것과 링크가 공개 URL 을 가리키는 것이 회귀로 사라지면 안 된다.
 *
 * 관찰:
 *   1) 동의 고지에 '위치기반서비스 약관'이 이름으로 등장한다.
 *   2) 약관 링크는 TERMS_URL(제1부 이용약관 + 제2부 위치기반서비스 약관)을 연다.
 *   3) 개인정보 처리방침 링크는 PRIVACY_URL 을 연다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Linking} from 'react-native';
import OnboardingScreen from '../OnboardingScreen.rn';
import {PRIVACY_URL, TERMS_URL} from '../lib/legalLinks';

/** 트리 전체의 문자열 children 을 이어붙인다(문구 존재 검증용). */
function allText(root: ReactTestRenderer.ReactTestRenderer): string {
  return root.root
    .findAll(n => typeof n.type === 'string' || typeof n.type === 'function')
    .flatMap(n => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
    .filter((c): c is string => typeof c === 'string')
    .join(' ');
}

function render(): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<OnboardingScreen onDone={() => {}} />);
  });
  return r;
}

/** accessibilityLabel 로 링크를 찾아 누른다. */
function pressLink(r: ReactTestRenderer.ReactTestRenderer, label: string) {
  const node = r.root.findByProps({accessibilityLabel: label, accessibilityRole: 'link'});
  act(() => {
    node.props.onPress();
  });
}

let openSpy: jest.SpyInstance;

beforeEach(() => {
  openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});

afterEach(() => {
  openSpy.mockRestore();
});

test("동의 고지가 '위치기반서비스 약관'을 이름으로 밝힌다", () => {
  const text = allText(render());
  expect(text).toContain('위치기반서비스 약관');
  expect(text).toContain('개인정보 처리방침');
  expect(text).toContain('동의하는 것으로 간주돼요');
});

// 처리방침은 '만 14세 미만을 대상으로 하지 않는다'고 선언하는데 앱은 아무것도 확인하지
// 않았다(2026-07-26 출시 심사 TOP30 #25). 별도 화면을 세우는 대신 **동의를 받는 같은
// 순간**에 연령 확인을 포함시킨다 — 행동을 늘리지 않으면서 선언과 앱을 일치시킨다.
test('동의 고지에 만 14세 이상 확인이 포함된다', () => {
  expect(allText(render())).toContain('만 14세 이상');
});

test('약관 링크는 이용약관 + 위치기반서비스 약관 문서를 연다', () => {
  const r = render();
  pressLink(r, '이용약관 및 위치기반서비스 약관 열기');
  expect(openSpy).toHaveBeenCalledWith(TERMS_URL);
});

test('개인정보 처리방침 링크는 처리방침 문서를 연다', () => {
  const r = render();
  pressLink(r, '개인정보 처리방침 열기');
  expect(openSpy).toHaveBeenCalledWith(PRIVACY_URL);
});
