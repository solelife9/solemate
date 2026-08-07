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
  Platform,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextProps,
  type TextInputProps,
} from 'react-native';

// ── 안드로이드 글자 여백 제거 (2026-08-05) ───────────────────────────────────
// 왜: 안드로이드 Text 는 includeFontPadding 이 기본 true 라, 글꼴의 ascent/descent 만큼
// 글자 위아래에 **보이지 않는 여백**을 덧붙인다. iOS 에는 그런 게 없다. 그래서 같은
// 간격 값을 줘도 안드로이드가 매번 조금씩 더 벌어지고, 그게 화면 전체에 누적돼
// "아이폰이랑 안드로이드랑 느낌이 다르다"가 된다(민우님 2026-08-05).
//
// 이건 스케일로 덮을 수 없다 — rs/rv 는 우리가 준 값을 줄이지만, 이 여백은 우리가 준
// 값이 아니라 OS 가 얹는 값이기 때문이다. 끄는 게 정석이고, 끄면 두 플랫폼의 글자
// 상자가 같은 규칙을 따른다.
//
// 여기 한 곳에서만 끈다 — 앱 전체가 이 래퍼로 Text 를 쓰기 때문(ESLint 로 강제).
// 화면이 명시한 style 이 항상 뒤에 와서 이긴다(개별 화면이 되살릴 수 있다).
const androidText = StyleSheet.create({metrics: {includeFontPadding: false}});
const TEXT_METRICS = Platform.OS === 'android' ? androidText.metrics : undefined;

/** 본문/라벨 시스템 글꼴 배율 상한. */
export const FONT_SCALE_CAP = 1.5;
/** 초대형 숫자(HERO·러닝 지표) 배율 상한 — 소비처에서 명시적으로 사용. */
export const FONT_SCALE_CAP_HERO = 1.2;

export const Text = React.forwardRef<React.ElementRef<typeof RNText>, TextProps>(
  function Text(props, ref) {
    // style 은 {...props} **뒤에** 둔다 — 기본 메트릭 위에 화면 스타일을 얹기 위해서다.
    // 순서를 바꾸면 화면이 준 style 이 통째로 지워진다.
    return (
      <RNText
        ref={ref}
        maxFontSizeMultiplier={FONT_SCALE_CAP}
        {...props}
        style={TEXT_METRICS ? [TEXT_METRICS, props.style] : props.style}
      />
    );
  },
);

export const TextInput = React.forwardRef<React.ElementRef<typeof RNTextInput>, TextInputProps>(
  function TextInput(props, ref) {
    return (
      <RNTextInput
        ref={ref}
        maxFontSizeMultiplier={FONT_SCALE_CAP}
        keyboardAppearance="dark"
        // 안드로이드 입력란도 글꼴 여백을 끈다(2026-08-07). Text 래퍼는 2026-08-05 에
        // 전역으로 껐는데 **TextInput 은 빠져 있었다** — ReactEditText 는 기본이 true 라
        // 신발 검색·직접 추가·메달 입력에서만 위아래 여백이 더 붙어, 같은 화면의 Text 와
        // 줄맞춤이 어긋났다. style 을 먼저 두어 소비처가 필요하면 덮을 수 있게 한다.
        style={[TEXT_METRICS, props.style]}
        {...props}
      />
    );
  },
);

export type {TextProps, TextInputProps};
