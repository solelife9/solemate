// ============================================================================
// RunControlButton.tsx — 러닝 중 '일시정지' 그라데이션 원형 버튼 (목업 .cprimary와 1:1)
// 단색 ACCENT 원이 아니라 세로 그라데이션(GRAD_TOP→GRAD_BOT) + 주황 글로우 +
// 상단 1px 광택. App.tsx 의 ctrlPrimary TouchableOpacity 를 이걸로 교체한다.
// 원형 컨트롤이라 사각 CTA(Button 프리미티브)와 모양이 다르지만, 그라데이션/글로우는
// 동일한 theme 토큰(GRAD_TOP/GRAD_BOT·ACCENT)을 공유해 중복 정의를 두지 않는다.
// react-native-svg 만 사용(추가 의존 없음).
// ============================================================================
import React from 'react';
import {TouchableOpacity, View, StyleSheet, StyleProp, ViewStyle} from 'react-native';
import Svg, {Defs, LinearGradient, Stop, Circle} from 'react-native-svg';
import {ACCENT, GRAD_TOP, GRAD_BOT} from './theme';

export function GradientCircleButton({
  size = 74,
  onPress,
  accessibilityLabel,
  children,
  style,
}: {
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const r = size / 2;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: ACCENT,
          shadowOpacity: 0.5,
          shadowRadius: 16,
          shadowOffset: {width: 0, height: 12},
          elevation: 10,
        },
        style,
      ]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ctrlGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GRAD_TOP} />
            <Stop offset="1" stopColor={GRAD_BOT} />
          </LinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#ctrlGrad)" />
      </Svg>
      {/* 상단 안쪽 광택 — 얇은 흰 아크 */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, {borderRadius: 999, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.22)'}]}
      />
      {children}
    </TouchableOpacity>
  );
}

export default GradientCircleButton;
