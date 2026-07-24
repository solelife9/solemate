// ============================================================================
// lib/text.tsx — 전역 Text/TextInput 정책 래퍼 (Dynamic Type 대응의 단일 지점)
//
// 왜: RN Text 는 기본 allowFontScaling=true 인데 상한이 없어, 시스템 접근성 대형
// 글꼴(AX 배율 최대 ~3.1×)이 자체 rf() 스케일 위에 '곱'으로 얹혀 고정높이 칩·탭바·
// 히어로 숫자가 전부 깨졌다(2026-07-24 HIG 심사 P0 #1 — "안 끔 + 안 대응" 최악 조합).
// RN 0.85(React 19)는 Text.defaultProps 를 지원하지 않으므로, 이 래퍼가 전역 기본값을
// 주는 유일한 정석이다. 앱 코드는 'react-native' 대신 여기서 Text/TextInput 을 import
// 한다(코드모드로 일괄 치환, ESLint no-restricted-imports 로 재발 방지 예정).
//
// 정책(DESIGN.md 접근성 조항, 2026-07-24 신설):
//   · 본문/라벨: 시스템 배율을 1.5× 까지 존중(캡) — 끄지 않는다(HIG).
//   · 초대형 숫자(HERO/러닝 지표): 1.2× 캡 — 레이아웃 불변 유지가 판독성보다 먼저
//     깨지는 영역이라 낮게. 소비처에서 maxFontSizeMultiplier={FONT_SCALE_CAP_HERO} 명시.
//   · TextInput: 같은 캡 + 다크 전용 앱이므로 keyboardAppearance='dark' 기본(P0 #2).
//   · 개별 화면이 명시한 prop 이 항상 이긴다({...props} 가 기본값 뒤에 온다).
// ============================================================================
import React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextProps,
  type TextInputProps,
} from 'react-native';

/** 본문/라벨 시스템 글꼴 배율 상한. */
export const FONT_SCALE_CAP = 1.5;
/** 초대형 숫자(HERO·러닝 지표) 배율 상한 — 소비처에서 명시적으로 사용. */
export const FONT_SCALE_CAP_HERO = 1.2;

export const Text = React.forwardRef<React.ElementRef<typeof RNText>, TextProps>(
  function Text(props, ref) {
    return <RNText ref={ref} maxFontSizeMultiplier={FONT_SCALE_CAP} {...props} />;
  },
);

export const TextInput = React.forwardRef<React.ElementRef<typeof RNTextInput>, TextInputProps>(
  function TextInput(props, ref) {
    return (
      <RNTextInput
        ref={ref}
        maxFontSizeMultiplier={FONT_SCALE_CAP}
        keyboardAppearance="dark"
        {...props}
      />
    );
  },
);

export type {TextProps, TextInputProps};
