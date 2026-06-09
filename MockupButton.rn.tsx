// ============================================================================
// MockupButton.rn.tsx — primary "orange" CTA, faithful to the HTML mockup.
//
// 목업의 주황 버튼은 단색(ACCENT)이 아니라:
//   • 세로 그라데이션 (위 #FF7A2E → 아래 #F25E00)
//   • 상단 1px 안쪽 하이라이트 (rgba(255,255,255,0.22)) — 유리 광택
//   • 주황 글로우 그림자 (0 14px 30px -12px rgba(255,101,0,0.6))
//   • 누르면 살짝 작아짐 (scale .97)
// 이 컴포넌트 하나로 앱 전역의 주황 버튼을 목업과 동일하게 통일한다.
// react-native-svg 만 사용(expo-linear-gradient 등 추가 의존 없음).
//
// 사용:
//   <MockupButton label="첫 러닝화 등록하기"
//     iconNode={<MaterialCommunityIcons name="shoe-sneaker" size={18} color={T1} />}
//     onPress={...} />
//   <MockupButton label="브랜드와 모델을 선택하세요" disabled />   // ghost
// ============================================================================
import React, {useId} from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Svg, {Defs, LinearGradient, Stop, Rect} from 'react-native-svg';
import {ACCENT, CARD_HI, T1, T3, FONT} from './theme';

// 목업 CTA 그라데이션 정지점 — ACCENT(#FF6500) 계열의 밝은/짙은 변형.
// 필요하면 theme.ts 로 승격해서 토큰으로 관리해도 된다(CTA_GRAD_TOP/BOTTOM).
const CTA_TOP = '#FF7A2E';
const CTA_BOTTOM = '#F25E00';
const RADIUS = 18;

export function MockupButton({
  label,
  onPress,
  iconNode,
  disabled = false,
  style,
  testID,
}: {
  label: string;
  onPress?: () => void;
  iconNode?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  // useId 로 그라데이션 id 충돌 방지(한 화면에 버튼이 여럿 있어도 안전).
  const gradId = `cta-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      style={({pressed}) => [
        m.shadow,
        disabled && m.shadowOff,
        pressed && !disabled && m.pressed,
        style,
      ]}>
      {/* 안쪽 클립 레이어: 그라데이션과 상단 하이라이트를 모서리에 맞춰 자른다.
          그림자는 바깥 Pressable 에 두어 iOS 에서 overflow 로 잘리지 않게 분리. */}
      <View style={[m.clip, disabled && m.clipDisabled]}>
        {!disabled && (
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={CTA_TOP} />
                <Stop offset="1" stopColor={CTA_BOTTOM} />
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx={RADIUS}
              ry={RADIUS}
              fill={`url(#${gradId})`}
            />
          </Svg>
        )}
        {/* 상단 안쪽 하이라이트(유리 광택) */}
        {!disabled && <View style={m.topHighlight} />}
        <View style={m.row}>
          {iconNode}
          <Text style={[m.label, disabled && m.labelDisabled]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const m = StyleSheet.create({
  // 바깥: 주황 글로우 그림자 전담(클립 없음).
  shadow: {
    borderRadius: RADIUS,
    shadowColor: ACCENT,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 12},
    elevation: 10,
  },
  shadowOff: {shadowOpacity: 0, elevation: 0},
  pressed: {opacity: 0.92, transform: [{scale: 0.97}]},

  // 안쪽: 그라데이션/하이라이트를 라운드로 클립.
  clip: {
    height: 56,
    borderRadius: RADIUS,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipDisabled: {backgroundColor: CARD_HI},

  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  row: {flexDirection: 'row', alignItems: 'center', gap: 9},
  label: {
    color: T1,
    fontFamily: FONT,
    fontSize: 16.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelDisabled: {color: T3},
});

export default MockupButton;
