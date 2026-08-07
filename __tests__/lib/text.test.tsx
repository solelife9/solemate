import React from 'react';
import ReactTestRenderer from 'react-test-renderer';


// ============================================================================
// 입력란도 글꼴 여백을 끈다 (2026-08-07 감사)
//
// 안드로이드 Text 는 includeFontPadding 이 기본 true 라 글꼴의 ascent/descent 만큼
// 위아래 여백이 더 붙는다. Text 래퍼는 2026-08-05 에 전역으로 껐는데 **TextInput 은
// 빠져 있었다**(ReactEditText 는 별도 컴포넌트라 그 설정을 물려받지 않는다).
// 그래서 신발 검색·직접 추가·메달 입력에서만 여백이 더 붙어, 같은 화면의 Text 와
// 줄맞춤이 어긋났다.
// ============================================================================
describe('TextInput 글꼴 여백', () => {
  const {Platform} = require('react-native');
  const orig = Platform.OS;
  afterEach(() => { Platform.OS = orig; });

  const styleOf = (el: any) => {
    const flat = require('react-native').StyleSheet.flatten(el.props.style);
    return flat || {};
  };

  test('안드로이드에서는 includeFontPadding 을 끈다', () => {
    jest.resetModules();
    const rn = require('react-native');
    rn.Platform.OS = 'android';
    const {TextInput} = require('../../lib/text');
    let r!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => { r = ReactTestRenderer.create(<TextInput value="" />); });
    const input = r.root.findAll((n: any) => n.type === rn.TextInput)[0];
    expect(styleOf(input).includeFontPadding).toBe(false);
  });

  test('소비처 style 이 뒤에 와서 이긴다 — 개별 화면이 되살릴 수 있다', () => {
    jest.resetModules();
    const rn = require('react-native');
    rn.Platform.OS = 'android';
    const {TextInput} = require('../../lib/text');
    let r!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      r = ReactTestRenderer.create(<TextInput value="" style={{includeFontPadding: true}} />);
    });
    const input = r.root.findAll((n: any) => n.type === rn.TextInput)[0];
    expect(styleOf(input).includeFontPadding).toBe(true);
  });
});
